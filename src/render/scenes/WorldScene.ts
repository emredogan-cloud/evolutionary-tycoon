import Phaser from 'phaser';
import { ACTOR_KIND_CUSTOMER, ACTOR_KIND_SPECS, ACTOR_KIND_VEHICLE, actorKindSpec } from '@config/actors';
import { UPGRADES } from '@config/economy/upgrades';
import { ConstructionMask } from '../fx/ConstructionMask';
import { layoutForStage } from '@config/layouts';
import type { StageLayout } from '@config/layouts/stage1';
import { sceneFixture } from '@config/scenes';
import { SURFACE_COLORS } from '@config/surfaces';
import { CameraController } from '../camera/CameraController';
import type { CameraBounds } from '../camera/cameraMath';
import { DevOverlays } from '../debug/DevOverlays';
import { worldRectToScreenBounds, worldToScreen } from '../iso/IsoProjection';
import type { Point2 } from '../iso/IsoProjection';
import { placeholderTextures } from '../placeholderTextures';
import { patienceRing } from '../views/CustomerView';
import { createPose, poseIdle, poseWalk } from '../rig/DollRig';
import { WALK_SPEED_METRES_PER_SECOND } from '@config/customer';
import { RenderBridge } from '../RenderBridge';
import { RENDER_CONTEXT_KEY } from '../RenderContext';
import type { RenderContext } from '../RenderContext';
import { SceneGraph } from '../SceneGraph';
import { vehicleBodyMotion } from '../views/VehicleView';
import type { VehicleBodyMotion } from '../views/VehicleView';

export const WORLD_SCENE_KEY = 'world';

/**
 * Placeholder colours for the patience bands.
 *
 * Amber then red, and nothing at all while a wait is going well — a marker over
 * every customer from the moment they arrive is noise, and a player learns to
 * stop seeing it.
 */
const PATIENCE_TINTS = { calm: 0xffffff, restless: 0xffd479, angry: 0xff8080 } as const;

/**
 * The rig's resting torso height, subtracted so the bob is an offset from rest
 * rather than an absolute position.
 */
const REST_TORSO_HEIGHT_METRES = 0.95;

/**
 * How much of the leg swing becomes a body lean on the collapsed sprite.
 *
 * Small. Until the six rig parts have art, the whole pose has to read through
 * one quad, and a figure that leaned as far as its legs swing would look like it
 * was falling over rather than walking.
 */
const WALK_LEAN = 0.25;

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
  /** Last seen upgrade revision, so statics are rebuilt only on a purchase. */
  private upgradeRevision = -1;

  /**
   * The stage whose lot is currently drawn — Phase 11.
   *
   * The renderer was hardwired to Stage 1's layout, which meant the Stage 3
   * dining room and the Stage 4 drive-thru lane existed in the simulation and
   * nowhere on screen. Held here and compared per frame for the same reason as
   * `upgradeRevision`: it changes a handful of times a session, so rebuilding
   * the ground on a change beats diffing a layout sixty times a second.
   */
  private stage = 1;
  private layout: StageLayout = layoutForStage(1);

  /** Bay lines, table pads and the drive-thru lane. Cleared and redrawn per stage. */
  private surfaces: Phaser.GameObjects.Graphics | null = null;
  private construction!: ConstructionMask;
  private graph!: SceneGraph;
  private bridge!: RenderBridge;
  private camera!: CameraController;
  private overlays: DevOverlays | null = null;

  private readonly sprites: Phaser.GameObjects.Image[] = [];
  /** Reused every frame; the body motion helper writes into it. */
  private readonly walkPose = createPose();
  private readonly bodyMotion: VehicleBodyMotion = { bobY: 0, pitch: 0 };
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

    // Before anything is drawn: a scene created at Stage 3 must draw Stage 3's
    // lot, not draw Stage 1's and correct itself on the first frame.
    this.stage = this.context.readView().stage;
    this.layout = layoutForStage(this.stage);

    this.drawGround();
    this.drawRoad();
    this.drawSurfaces();
    // Nothing is owned at scene creation; `update` rebuilds on the first frame
    // and on every purchase after that.
    this.registerStatics([]);

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

    /*
     * The construction reveal. Its bounds are the southern half of the lot,
     * which is where every stage's building actually grows — the northern half
     * is road and car park at every stage.
     */
    this.construction = new ConstructionMask(
      this,
      {
        minX: this.layout.lot.minX,
        minY: this.layout.lot.minY + (this.layout.lot.maxY - this.layout.lot.minY) / 2,
        maxX: this.layout.lot.maxX,
        maxY: this.layout.lot.maxY,
      },
      this.context.reducedMotion,
    );

    // Announced so E2E can wait on a state rather than a timeout.
    document.documentElement.dataset['renderState'] = 'ready';
  }

  override update(_time: number, delta: number): void {
    this.camera.update(delta);

    const view = this.context.readView();
    if (view.stage !== this.stage) {
      this.stage = view.stage;
      this.layout = layoutForStage(this.stage);
      this.drawSurfaces();
      this.registerStatics(view.upgradeLevels);
    }
    if (view.upgradeRevision !== this.upgradeRevision) {
      this.upgradeRevision = view.upgradeRevision;
      this.registerStatics(view.upgradeLevels);
    }

    this.bridge.sync(view, this.context.interpolationAlpha());
    this.syncSprites();
    // Driven by the simulation's own figure, so a paused world holds a still
    // half-built building rather than finishing it on wall-clock time.
    this.construction.update(this.context.constructionProgress?.() ?? 0);
    this.context.onFrame?.();

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

      /*
       * Vehicles get the procedural body motion Phase 5 owes them: a suspension
       * bob driven by distance travelled and a nose dip under braking. Both are
       * pure functions in `VehicleView`, so the maths is unit-tested without a
       * renderer and this is only the application of it.
       *
       * The bob is applied here rather than baked into the world position on
       * purpose — it is presentation, and a vehicle that bobbed in world space
       * would sort against a different depth every frame.
       *
       * The eight-direction sprite is *selected* but cannot yet be *drawn*: no
       * production vehicle art exists (PHASE_4_REPORT §11), so every vehicle
       * still renders the one registered placeholder. `directionFor` is wired
       * and tested so the art drops in without touching this code.
       */
      let offsetY = 0;
      if (view.kind === ACTOR_KIND_VEHICLE) {
        vehicleBodyMotion(view.travelled, view.braking ? -4 : 0, this.bodyMotion);
        offsetY = this.bodyMotion.bobY;
        sprite.setRotation(this.bodyMotion.pitch);
        // Until the brake-light frame exists, braking is shown as a tint. It is
        // deliberately obvious rather than subtle: this is placeholder feedback,
        // and placeholder feedback that looks finished is the dangerous kind.
        sprite.setTint(view.braking ? 0xffb0b0 : 0xffffff);
      } else if (view.kind === ACTOR_KIND_CUSTOMER) {
        /*
         * The patience ring, as a tint — GAME_EXECUTION_ROADMAP Phase 6 asks for
         * "sabır halkası (basit)". A drawn ring needs the character art it is
         * meant to sit above, and none exists yet (PHASE_4_REPORT §11), so this
         * is the same placeholder-feedback approach the brake lights take:
         * deliberately obvious rather than subtle, because placeholder feedback
         * that looks finished is the dangerous kind. `patienceRing` is a pure
         * function and is unit-tested; this is only the application of it.
         */
        const ring = patienceRing(view.patience);
        sprite.setTint(ring.visible ? PATIENCE_TINTS[ring.band] : 0xffffff);

        /*
         * The procedural walk, applied to the one placeholder sprite there is.
         *
         * The rig poses six parts and the art pipeline has produced none of them
         * (PHASE_4_REPORT §11), so what actually reaches the screen is the
         * torso's own bob and lean — which is the part of the pose that survives
         * being collapsed onto a single quad. `poseWalk` is unit-tested in full
         * and the remaining five parts drop in with the art, without this code
         * changing.
         */
        if (view.moving) {
          poseWalk(view.travelled, WALK_SPEED_METRES_PER_SECOND, this.walkPose);
          offsetY = -this.walkPose.torso.offsetY + REST_TORSO_HEIGHT_METRES;
          sprite.setRotation(this.walkPose.legLeft.rotation * WALK_LEAN);
        } else {
          poseIdle(this.walkPose);
          if (sprite.rotation !== 0) sprite.setRotation(0);
        }
      } else if (sprite.rotation !== 0) {
        sprite.setRotation(0);
        sprite.clearTint();
      }

      sprite.setPosition(view.screenX, view.screenY + offsetY);
      sprite.setDepth(i);
      sprite.setVisible(true);
    }

    for (let i = visible.length; i < this.sprites.length; i++) {
      this.sprites[i]?.setVisible(false);
    }
  }

  private cameraBounds(): CameraBounds {
    const margin = this.layout.cameraMarginMetres;
    const lot = this.layout.lot;
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
    const lot = this.layout.lot;
    const ground = this.add.graphics();
    ground.fillStyle(SURFACE_COLORS.ground, 1);
    ground.fillPoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
    ground.lineStyle(2, SURFACE_COLORS.groundGrid, 1);
    ground.strokePoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
    this.graph.layer('ground').add(ground);
  }

  /**
   * The markings that make a stage legible: bays, tables, the drive-thru lane.
   *
   * Drawn rather than modelled, like the ground and the road, until the baked
   * surface art of ASSET_PIPELINE §5 exists. **This is the part of a stage the
   * player reads without being told anything** — four bays became eight, the
   * dining room appeared, there is a lane down the east side now — so leaving it
   * undrawn made the evolution invisible even though the simulation had already
   * changed underneath.
   *
   * One Graphics object, cleared and refilled, because a stage change replaces
   * every marking at once and destroying nine objects to create eleven is churn
   * for nothing.
   */
  private drawSurfaces(): void {
    const surfaces = this.surfaces ?? this.add.graphics();
    if (this.surfaces === null) {
      this.surfaces = surfaces;
      this.graph.layer('ground').add(surfaces);
    }
    surfaces.clear();

    /*
     * The drive-thru lane first, as asphalt from the order post to the window,
     * so the bay outlines below draw on top of it rather than under it. One
     * strip rather than one per lane slot: the slots are where cars stop, not a
     * thing the player is meant to count.
     */
    const driveThru = this.layout.driveThru;
    if (driveThru !== null) {
      const minY = Math.min(driveThru.orderPost.y, driveThru.window.y) - 1.6;
      const maxY = Math.max(driveThru.orderPost.y, driveThru.window.y) + 1.6;
      const centreX = (driveThru.orderPost.x + driveThru.window.x) / 2;
      surfaces.fillStyle(SURFACE_COLORS.road, 1);
      surfaces.fillPoints(this.worldQuad(centreX - 1.5, minY, centreX + 1.5, maxY), true);
      // A dashed edge on the lane, the same language as the road's centre line.
      surfaces.fillStyle(SURFACE_COLORS.roadMarking, 1);
      for (let y = minY; y < maxY; y += 2.4) {
        surfaces.fillPoints(this.worldQuad(centreX - 1.58, y, centreX - 1.42, y + 1.2), true);
      }
    }

    // Parking bays: an outline each, because a filled bay reads as occupied.
    surfaces.lineStyle(2, SURFACE_COLORS.roadMarking, 0.55);
    for (const bay of this.layout.parking) {
      surfaces.strokePoints(this.worldQuad(bay.x - 1.2, bay.y - 2.2, bay.x + 1.2, bay.y + 2.2), true);
    }

    // Tables: a pad under each, so the dining room reads as a room rather than
    // as a scatter of props.
    surfaces.fillStyle(SURFACE_COLORS.groundGrid, 0.8);
    for (const table of this.layout.tables) {
      surfaces.fillPoints(this.worldQuad(table.x - 0.7, table.y - 0.7, table.x + 0.7, table.y + 0.7), true);
    }
  }

  private drawRoad(): void {
    const road = this.add.graphics();
    const lanes = this.layout.road.lanes;
    const first = lanes[0];
    const second = lanes[1];
    if (first === undefined || second === undefined) return;

    const startX = first.points[0]?.x ?? 0;
    const endX = first.points[first.points.length - 1]?.x ?? 0;
    const halfWidth = this.layout.road.widthMetres / 2;
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
   *
   * Called again whenever an upgrade is bought — see `upgradeRevision`. The
   * roadmap's rule for Phase 9 is that every purchase changes the world visibly
   * within a second, and an object that appears in the scene graph is the
   * strongest form of that: it sorts against the crowd, casts into the depth
   * order, and is there when the player looks back.
   */
  private registerStatics(levels: readonly number[]): void {
    const statics = this.layout.statics.map((object, index) => ({
      entityId: -(index + 1),
      x: object.x,
      y: object.y,
      z: object.z,
      kind: kindIndexForTexture(object.objectId),
    }));

    /*
     * One object per owned upgrade, at its card's anchor — the same point the
     * card opens beside, so the thing and the control for it are in one place.
     * Ids continue below the layout's, so an upgrade object can never collide
     * with a layout static or with a real entity.
     */
    for (let i = 0; i < UPGRADES.length; i++) {
      const item = UPGRADES[i];
      if (item === undefined) continue;
      if ((levels[i] ?? 0) <= 0) continue;
      statics.push({
        entityId: -(this.layout.statics.length + i + 1),
        x: item.anchor.x,
        y: item.anchor.y,
        z: 0,
        kind: kindIndexForTexture(item.placeholder),
      });
    }

    this.bridge.setStatics(statics);
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
