import Phaser from 'phaser';
import { ACTOR_KIND_SPECS, actorKindSpec } from '@config/actors';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { sceneFixture } from '@config/scenes';
import { SURFACE_COLORS } from '@config/surfaces';
import { CameraController } from '../camera/CameraController';
import type { CameraBounds } from '../camera/cameraMath';
import { DevOverlays } from '../debug/DevOverlays';
import { worldRectToScreenBounds, worldToScreen } from '../iso/IsoProjection';
import type { Point2 } from '../iso/IsoProjection';
import { placeholderTextures } from '../placeholderTextures';
import { RenderBridge } from '../RenderBridge';
import { RENDER_CONTEXT_KEY } from '../RenderContext';
import type { RenderContext } from '../RenderContext';
import { SceneGraph } from '../SceneGraph';

export const WORLD_SCENE_KEY = 'world';

/** Statics are declared by texture key; the render catalogue is indexed by number. */
function kindIndexForTexture(textureKey: string): number {
  const index = ACTOR_KIND_SPECS.findIndex((spec) => spec.textureKey === textureKey);
  if (index < 0) throw new RangeError(`Layout references unknown texture "${textureKey}"`);
  return index;
}

/**
 * The world.
 *
 * Its whole job is to turn the simulation's readonly view into ordered sprites,
 * once per frame. It holds no game state, decides nothing about behaviour, and
 * never writes back — everything it draws is derived from `context.readView()`.
 *
 * The ground is drawn with `Graphics` rather than loaded as art. That is not a
 * shortcut: the ground is a hand-composed *bake* per evolution stage
 * (RESEARCH_NOTES §4 — there is no isometric tilemap in Phaser 4), and Phase 4
 * is where those bakes are produced. Until then, flat shapes at the exact lot
 * dimensions establish the geometry without pretending to be art.
 */
export class WorldScene extends Phaser.Scene {
  private context!: RenderContext;
  private graph!: SceneGraph;
  private bridge!: RenderBridge;
  private camera!: CameraController;
  private overlays: DevOverlays | null = null;

  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly screenScratch: Point2 = { x: 0, y: 0 };
  private readonly originsByKey = new Map<string, { x: number; y: number }>();

  constructor() {
    super({ key: WORLD_SCENE_KEY });
  }

  init(): void {
    const context = this.registry.get(RENDER_CONTEXT_KEY) as RenderContext | undefined;
    if (context === undefined) {
      throw new Error('WorldScene started without a RenderContext in the registry');
    }
    this.context = context;
  }

  create(): void {
    for (const texture of placeholderTextures()) {
      this.originsByKey.set(texture.key, { x: texture.originX, y: texture.originY });
    }

    this.graph = new SceneGraph(this);

    const view = this.context.readView();
    // Sized from the simulation's own capacity, so the pool can never be the
    // thing that runs out first.
    this.bridge = new RenderBridge(Math.max(64, view.actors.length));

    this.drawGround();
    this.drawRoad();
    this.registerStatics();

    const bounds = this.cameraBounds();
    this.camera = new CameraController(this, {
      bounds,
      reducedMotion: this.context.reducedMotion,
      ...(this.context.lockedCamera !== undefined ? { locked: this.context.lockedCamera } : {}),
    });

    const fixture = sceneFixture(this.context.sceneId);
    if (fixture !== null && this.context.lockedCamera === undefined) {
      const focus = worldToScreen(fixture.cameraFocus.x, fixture.cameraFocus.y, 0, this.screenScratch);
      this.camera.centreOn(focus.x, focus.y, fixture.cameraZoom);
    }

    if (this.context.showDevOverlays) {
      this.overlays = new DevOverlays(this, this.graph);
    }

    this.scale.on('resize', () => {
      this.camera.handleResize();
    });

    // Announced so E2E can wait on a state rather than a timeout.
    document.documentElement.dataset['renderState'] = 'ready';
  }

  override update(_time: number, delta: number): void {
    this.camera.update(delta);

    this.bridge.sync(this.context.readView(), this.context.interpolationAlpha());
    this.syncSprites();

    this.overlays?.update(this.bridge.visible.length);
  }

  /**
   * Reconcile sprites with the sorted visible set.
   *
   * Sprites are created lazily up to the pool ceiling and then reused: index `i`
   * always draws visible actor `i`. Depth is the *index*, not the computed
   * value — the bridge has already ordered them, and handing Phaser a strictly
   * increasing integer makes its own sort trivial instead of a second full
   * comparison pass over floats.
   */
  private syncSprites(): void {
    const visible = this.bridge.visible;

    for (let i = 0; i < visible.length; i++) {
      const view = visible[i];
      if (view === undefined) continue;

      let sprite = this.sprites[i];
      if (sprite === undefined) {
        sprite = this.add.image(0, 0, actorKindSpec(view.kind).textureKey);
        this.graph.actorLayer.add(sprite);
        this.sprites[i] = sprite;
      }

      const spec = actorKindSpec(view.kind);
      if (sprite.texture.key !== spec.textureKey) sprite.setTexture(spec.textureKey);

      const origin = this.originsByKey.get(spec.textureKey);
      if (origin !== undefined) sprite.setOrigin(origin.x, origin.y);

      // Art is authored at 2x and drawn at 1x.
      sprite.setScale(0.5);
      sprite.setPosition(view.screenX, view.screenY);
      sprite.setDepth(i);
      sprite.setVisible(true);
    }

    for (let i = visible.length; i < this.sprites.length; i++) {
      this.sprites[i]?.setVisible(false);
    }
  }

  private cameraBounds(): CameraBounds {
    const margin = STAGE1_LAYOUT.cameraMarginMetres;
    const lot = STAGE1_LAYOUT.lot;
    const bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    return worldRectToScreenBounds(
      lot.minX - margin,
      lot.minY - margin,
      lot.maxX + margin,
      lot.maxY + margin,
      bounds,
    );
  }

  /** The lot, as a projected quadrilateral. */
  private drawGround(): void {
    const lot = STAGE1_LAYOUT.lot;
    const ground = this.add.graphics();
    ground.fillStyle(SURFACE_COLORS.ground, 1);
    ground.fillPoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
    ground.lineStyle(2, SURFACE_COLORS.groundGrid, 1);
    ground.strokePoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
    this.graph.layer('ground').add(ground);
  }

  private drawRoad(): void {
    const road = this.add.graphics();
    const lanes = STAGE1_LAYOUT.road.lanes;
    const first = lanes[0];
    const second = lanes[1];
    if (first === undefined || second === undefined) return;

    const startX = first.points[0]?.x ?? 0;
    const endX = first.points[first.points.length - 1]?.x ?? 0;
    const halfWidth = STAGE1_LAYOUT.road.widthMetres / 2;
    const centreY = ((first.points[0]?.y ?? 0) + (second.points[0]?.y ?? 0)) / 2;

    road.fillStyle(SURFACE_COLORS.road, 1);
    road.fillPoints(this.worldQuad(startX, centreY - halfWidth, endX, centreY + halfWidth), true);

    // Dashed centre line: a solid one would read as a barrier, and Stage 4 adds
    // a left turn across it.
    road.fillStyle(SURFACE_COLORS.roadMarking, 1);
    for (let x = startX; x < endX; x += 4) {
      road.fillPoints(this.worldQuad(x, centreY - 0.08, x + 2, centreY + 0.08), true);
    }

    this.graph.layer('road').add(road);
  }

  /**
   * Hand the statics to the bridge so they sort against moving actors.
   *
   * Negative entity ids: real entities start at 1 and count up, so a static can
   * never collide with one, and the tie-break stays stable across a reload.
   */
  private registerStatics(): void {
    this.bridge.setStatics(
      STAGE1_LAYOUT.statics.map((object, index) => ({
        entityId: -(index + 1),
        x: object.x,
        y: object.y,
        z: object.z,
        kind: kindIndexForTexture(object.objectId),
      })),
    );
  }

  /**
   * The four corners of a world rectangle, projected.
   *
   * `Phaser.Math.Vector2` rather than `Geom.Point`: Phaser 4's `fillPoints`
   * takes vectors. Setup-time only, so the allocation here is not on any budget.
   */
  private worldQuad(minX: number, minY: number, maxX: number, maxY: number): Phaser.Math.Vector2[] {
    const corners: [number, number][] = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
    return corners.map(([x, y]) => {
      const screen = worldToScreen(x, y, 0, { x: 0, y: 0 });
      return new Phaser.Math.Vector2(screen.x, screen.y);
    });
  }
}
