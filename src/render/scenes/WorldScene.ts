import Phaser from 'phaser';
import {
  ACTOR_KIND_CUSTOMER,
  ACTOR_KIND_EMPLOYEE,
  ACTOR_KIND_PROP_SHORT,
  ACTOR_KIND_PROP_TALL,
  ACTOR_KIND_SPECS,
  ACTOR_KIND_VEHICLE,
  actorKindSpec,
} from '@config/actors';
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
import { EnvironmentLayer } from '../environment/EnvironmentLayer';
import type { Point2 } from '../iso/IsoProjection';
import { placeholderTextures } from '../placeholderTextures';
import { patienceRing } from '../views/CustomerView';
import { createPose, poseIdle, poseWalk } from '../rig/DollRig';
import type { RigPose } from '../rig/DollRig';
import type { AssetRegistry } from '../AssetRegistry';
import {
  EMPLOYEE_TINT,
  GROUND_FRAMES,
  ROAD_FRAME,
  RIG_DIRECTION_FOR,
  RIG_DRAW_ORDER,
  RIG_PIVOTS,
  rigFrame,
  unpackAppearance,
  vehicleFrame,
  worldObjectAt,
  worldObjectIndexOf,
} from '@config/sprites';
import type { ActorView } from '../ActorView';
import { ART_SCALE, TILE_Z } from '@config/world';
import { directionFor } from '../views/VehicleView';
import { WALK_SPEED_METRES_PER_SECOND } from '@config/customer';
import { RenderBridge } from '../RenderBridge';
import { ASSET_REGISTRY_KEY, RENDER_CONTEXT_KEY } from '../RenderContext';
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
 * How far a chair sits from its table's centre, in metres.
 *
 * A metre, from a 1.2 m table with 0.5 m chairs. Closer and the chair vanishes
 * under the table top, because a square footprint projects to a diamond 2.4 m
 * across and the round table's art fills it — the table draws wider than the
 * circle it depicts, which is the one place `isoSpriteMetrics` cannot help: it
 * projects a box, and a box is the wrong shape for a round table.
 */
const CHAIR_RADIUS_METRES = 1.0;

/** Chairs drawn around a round table, whatever the seat count says. */
const MAX_SEATS = 4;

/**
 * Where furniture entity ids start, counting **down**.
 *
 * Layout statics take -1 downward and upgrades continue below them, so furniture
 * starts far enough below both that no arithmetic can collide — the depth
 * sorter's tie-break is the entity id, and two objects sharing one would swap
 * order between frames.
 */
const TABLE_ID_BASE = -10_000;

/**
 * The rig's resting torso height, subtracted so the bob is an offset from rest
 * rather than an absolute position.
 */
const REST_TORSO_HEIGHT_METRES = 0.95;

/** Statics are declared by texture key; the render catalogue is indexed by number. */
function kindIndexForTexture(textureKey: string): number {
  const index = ACTOR_KIND_SPECS.findIndex((spec) => spec.textureKey === textureKey);
  if (index < 0) throw new RangeError(`Layout references unknown texture "${textureKey}"`);
  return index;
}

/**
 * A layout's `objectId` as an index into the production catalogue.
 *
 * Layouts used to name a placeholder — `ph-prop-tall` — with a comment saying
 * what it stood for. The id is now the object itself (`sign`, `tree-conifer-01`)
 * and this resolves it. `-1` means the id names a placeholder rather than a
 * world object, which is the state a layout is in before it has been authored
 * against the real art; the scene falls back to the placeholder texture and the
 * placeholder-zero test fails, which is the point.
 */
function worldObjectIndex(objectId: string): number {
  return worldObjectIndexOf(objectId);
}

/**
 * Which physical catalogue entry a world object sorts as.
 *
 * The depth sorter needs a footprint and a height, and `ACTOR_KIND_SPECS` is
 * where those live. Everything under 1.5 m sorts as a short prop and everything
 * above it as a tall one, which is the same split the placeholders had — the art
 * changed, the physics did not.
 */
function kindForWorldObject(index: number): number {
  const spec = worldObjectAt(index);
  if (spec === undefined) return ACTOR_KIND_PROP_SHORT;
  return spec.heightMetres >= 1.5 ? ACTOR_KIND_PROP_TALL : ACTOR_KIND_PROP_SHORT;
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
  /** The stretched ground bake, replaced whenever the stage changes. */
  private groundTile: Phaser.GameObjects.Image | null = null;
  /** The baked road tiles, replaced whenever the stage redraws the band. */
  private readonly roadTiles: Phaser.GameObjects.Image[] = [];
  private construction!: ConstructionMask;
  private graph!: SceneGraph;
  private bridge!: RenderBridge;
  private camera!: CameraController;
  private overlays: DevOverlays | null = null;
  private environment: EnvironmentLayer | null = null;

  /**
   * The frames that actually loaded, and where each one's feet are.
   *
   * `null` when the load scene found no manifest, which is the placeholder path
   * — every draw below falls back and `placeholderQuads` counts it.
   */
  private assets: AssetRegistry | null = null;

  /**
   * Quads drawn from a placeholder this frame.
   *
   * Published to `data-asset-placeholders` so the production assertion can read
   * it. WORKING_DISCIPLINE §7 makes hiding a placeholder the offence, not using
   * one; this is what makes hiding it impossible.
   */
  private placeholderQuads = 0;

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

    this.assets = (this.registry.get(ASSET_REGISTRY_KEY) as AssetRegistry | undefined) ?? null;

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

    /*
     * The lighting-and-weather pass — Phase 15, on the layer Phase 3 reserved
     * for it. Created after the graph so its quads land above the world and
     * beneath the world-space UI.
     */
    this.environment = new EnvironmentLayer(this, this.graph, {
      reducedMotion: this.context.reducedMotion,
      noParticles: this.context.noParticles,
    });

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
      // The lot grows with the stage, so its bake has to be re-laid at the new
      // extent — Phase 11's bug was the layout changing and the drawing not.
      this.drawGround();
      this.drawSurfaces();
      this.registerStatics(view.upgradeLevels);
    }
    if (view.upgradeRevision !== this.upgradeRevision) {
      this.upgradeRevision = view.upgradeRevision;
      this.registerStatics(view.upgradeLevels);
    }

    this.bridge.sync(view, this.context.interpolationAlpha());
    this.environment?.update(view, this.bridge.visible);
    this.placeholderQuads = 0;
    this.syncSprites();
    /*
     * Published every frame rather than once, because a placeholder can appear
     * at a stage transition that never existed on the first frame — which is
     * exactly the case a one-shot count would miss.
     */
    document.documentElement.dataset['assetPlaceholders'] = String(this.placeholderQuads);
    // Driven by the simulation's own figure, so a paused world holds a still
    // half-built building rather than finishing it on wall-clock time.
    this.construction.update(this.context.constructionProgress?.() ?? 0);
    this.context.onFrame?.();

    this.overlays?.update(this.bridge.visible.length);
  }

  /**
   * Reconcile sprites with the sorted visible set.
   *
   * One actor is not one quad any more. A person is seven — the doll rig's parts
   * arrived as separate art, which is what lets a walk cycle exist at all — and a
   * tall object is two, because ASSET_PIPELINE §1.4 splits anything over 2.5 m so
   * the depth sort cannot form a cycle. So the pool is indexed by **quad**, and
   * each actor takes as many consecutive slots as it needs.
   *
   * Depth is still the slot index. The bridge has already ordered the actors, and
   * emitting their quads in order keeps that ordering while giving the parts
   * within one actor a stacking order of their own for free.
   */
  private syncSprites(): void {
    const visible = this.bridge.visible;
    let quad = 0;

    /*
     * Indexed rather than `for-of`: this runs every frame over every visible
     * actor, and `for-of` allocates an iterator each pass (WORKING_DISCIPLINE
     * §2.3). The same reasoning as `RenderBridge.sync`.
     */
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < visible.length; i++) {
      const view = visible[i];
      if (view === undefined) continue;

      if (view.kind === ACTOR_KIND_CUSTOMER || view.kind === ACTOR_KIND_EMPLOYEE) {
        quad = this.drawPerson(view, quad);
        continue;
      }
      if (view.kind === ACTOR_KIND_VEHICLE) {
        quad = this.drawVehicle(view, quad);
        continue;
      }
      quad = this.drawStatic(view, quad);
    }

    for (let i = quad; i < this.sprites.length; i++) {
      this.sprites[i]?.setVisible(false);
    }
  }

  /**
   * Take the next quad, creating it on first use.
   *
   * Every caller goes through here so the reset is in one place: a slot reused by
   * a different thing this frame must not keep the last thing's tint, rotation or
   * flip. Leaking a tint is how every customer turned amber the frame after an
   * employee walked off screen.
   */
  private quadFor(index: number, texture: string, frame?: string): Phaser.GameObjects.Image {
    let sprite = this.sprites[index];
    if (sprite === undefined) {
      sprite = this.add.image(0, 0, texture, frame);
      this.graph.actorLayer.add(sprite);
      this.sprites[index] = sprite;
    } else if (sprite.texture.key !== texture || (frame !== undefined && sprite.frame.name !== frame)) {
      sprite.setTexture(texture, frame);
    }
    sprite.setDepth(index);
    sprite.setVisible(true);
    sprite.setRotation(0);
    sprite.clearTint();
    sprite.setFlipX(false);
    sprite.setScale(1 / ART_SCALE);
    return sprite;
  }

  /** The frame a view should draw, or null when the art is not loaded. */
  private frameOf(name: string): string | null {
    return this.assets?.has(name) === true ? name : null;
  }

  /**
   * Fall back to the registered placeholder for a kind.
   *
   * Reached when an atlas failed to load or a layout still names a placeholder.
   * It draws *something* rather than nothing, and `data-asset-placeholders`
   * counts every time it happens so the production assertion can fail on it
   * instead of a person noticing a grey box in a screenshot.
   */
  private drawPlaceholder(view: ActorView, index: number): number {
    const spec = actorKindSpec(view.kind);
    const sprite = this.quadFor(index, spec.textureKey);
    const origin = this.originsByKey.get(spec.textureKey);
    if (origin !== undefined) sprite.setOrigin(origin.x, origin.y);
    sprite.setPosition(view.screenX, view.screenY);
    this.placeholderQuads++;
    return index + 1;
  }

  /** Position a sprite by its footprint anchor, which is where it meets the ground. */
  private place(sprite: Phaser.GameObjects.Image, frame: string, x: number, y: number): void {
    const info = this.assets?.info(frame);
    sprite.setOrigin(info?.originX ?? 0.5, info?.originY ?? 1);
    sprite.setPosition(x, y);
  }

  /**
   * A vehicle: one of eight facings, plus the body motion Phase 5 owes it.
   *
   * The eight are not eight pictures — `docs/assets/DIRECTION_AUDIT.json` records
   * that the delivered set has six distinct views and which slot each one fills,
   * and `assets:import` has already resolved that. By the time a frame is asked
   * for here, `veh_sedan_default_nw@2x.png` is a car heading north-west.
   */
  private drawVehicle(view: ActorView, index: number): number {
    const direction = directionFor(view.headingX, view.headingY);
    const frame = this.frameOf(vehicleFrame(view.variant, direction));
    if (frame === null) return this.drawPlaceholder(view, index);

    const atlas = this.assets?.atlasOf(frame);
    if (atlas === undefined) return this.drawPlaceholder(view, index);

    const sprite = this.quadFor(index, atlas, frame);
    vehicleBodyMotion(view.travelled, view.braking ? -4 : 0, this.bodyMotion);
    sprite.setRotation(this.bodyMotion.pitch);
    /*
     * Braking is still a tint, because the art has no `_brake` frame: the batch
     * list asks for one per side-on direction and the delivered set contains
     * none. A red wash over a white car reads as brake lights at this size, and
     * it is registered as an art gap rather than left to look intentional.
     */
    /*
     * No tint at all — and that is a recorded gap, not an oversight.
     *
     * The placeholder era showed braking as a loud `0xffb0b0` wash, deliberately
     * obvious against a grey quad. On the delivered near-white bodies every
     * strength of that wash reads as *paint*: the first golden with real art
     * froze what looks like a rose-pink sedan, which misleads harder than a
     * missing indicator does. Deceleration still reads through the nose-dip
     * `vehicleBodyMotion` applies; the honest fix is the `_brake` frames the
     * batch list asked for and the drop did not contain — listed with the other
     * regeneration work in docs/ASSET_INTEGRATION_REPORT.md.
     */

    this.place(sprite, frame, view.screenX, view.screenY + this.bodyMotion.bobY);
    return index + 1;
  }

  /**
   * A person, as the doll rig's seven parts.
   *
   * `DollRig` supplies the pose in metres above the feet; this turns that into
   * screen pixels and hangs each part off its own joint. The parts are drawn in
   * `RIG_DRAW_ORDER` — back arm behind the torso, hair over the head — and take
   * consecutive depths, so a person never interleaves with the person behind them.
   */
  private drawPerson(view: ActorView, index: number): number {
    const appearance = unpackAppearance(view.variant);
    const facing = RIG_DIRECTION_FOR[directionFor(view.headingX, view.headingY)];

    const pose: RigPose = view.moving
      ? poseWalk(view.travelled, WALK_SPEED_METRES_PER_SECOND, this.walkPose)
      : poseIdle(this.walkPose);

    // The whole figure rises and falls with the stride; the parts' own offsets
    // are relative to their rest heights, so the bob is read once from the torso.
    const bobMetres = pose.torso.offsetY - REST_TORSO_HEIGHT_METRES;

    const ring = view.kind === ACTOR_KIND_CUSTOMER ? patienceRing(view.patience) : null;
    let quad = index;
    let drewAnything = false;

    for (const part of RIG_DRAW_ORDER) {
      const name = rigFrame(part, appearance, facing);
      const frame = this.frameOf(name);
      const atlas = frame === null ? undefined : this.assets?.atlasOf(frame);
      if (frame === null || atlas === undefined) continue;

      const pivot = RIG_PIVOTS[part];
      const sprite = this.quadFor(quad, atlas, frame);
      sprite.setOrigin(pivot.originX, pivot.originY);
      sprite.setFlipX(pivot.flip === true);
      sprite.setPosition(view.screenX + pivot.x * TILE_Z, view.screenY - (pivot.y + bobMetres) * TILE_Z);

      // Only the limbs swing. Rotating the torso would rotate the head with it,
      // because they are separate quads rather than a parented rig.
      /*
       * Only the arms swing, because only the arms are separate art: the
       * delivered `body` sprite has the legs painted on (`RIG_DRAW_ORDER`). A
       * stride is therefore a bob and a counter-swing, which is what survives
       * being read at fifty-six pixels regardless.
       */
      const swing =
        part === 'armBack' ? pose.armLeft.rotation : part === 'armFront' ? pose.armRight.rotation : 0;
      if (swing !== 0) sprite.setRotation(swing);

      /*
       * Two tints, and they are about different things. An employee's torso
       * carries the uniform colour the art does not have; a customer's whole
       * figure carries how close they are to leaving. They never apply to the
       * same person, so they cannot fight.
       */
      if (view.kind === ACTOR_KIND_EMPLOYEE && part === 'torso') sprite.setTint(EMPLOYEE_TINT);
      else if (ring?.visible === true) sprite.setTint(PATIENCE_TINTS[ring.band]);

      quad++;
      drewAnything = true;
    }

    return drewAnything ? quad : this.drawPlaceholder(view, index);
  }

  /**
   * A world object: one quad, or two when it is split.
   *
   * The upper half stacks on the lower one's top edge and takes the next depth,
   * which is exactly the arrangement §1.4's split exists to produce — two
   * footprints, two depths, and no cycle for the painter's algorithm to fail on.
   */
  private drawStatic(view: ActorView, index: number): number {
    const spec = worldObjectAt(view.variant);
    if (spec === undefined) return this.drawPlaceholder(view, index);

    const lower = this.frameOf(spec.frame);
    const atlas = lower === null ? undefined : this.assets?.atlasOf(lower);
    if (lower === null || atlas === undefined) return this.drawPlaceholder(view, index);

    const sprite = this.quadFor(index, atlas, lower);
    this.place(sprite, lower, view.screenX, view.screenY);
    let quad = index + 1;

    const upperName = spec.upperFrame;
    const upper = upperName === undefined ? null : this.frameOf(upperName);
    const upperAtlas = upper === null ? undefined : this.assets?.atlasOf(upper);
    if (upper !== null && upperAtlas !== undefined) {
      const lowerInfo = this.assets?.info(lower);
      const top = view.screenY - ((lowerInfo?.height ?? 0) / ART_SCALE) * (lowerInfo?.originY ?? 1);
      const upperSprite = this.quadFor(quad, upperAtlas, upper);
      // The upper half's anchor is its own bottom centre (`assets:import`), so
      // putting that on the lower half's top edge is what makes the two meet.
      upperSprite.setOrigin(0.5, 1);
      upperSprite.setPosition(view.screenX, top);
      quad++;
    }

    return quad;
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

  /**
   * The lot: the baked surface art, tiled across it.
   *
   * `RESEARCH_NOTES` §4 rules out an isometric tilemap in Phaser 4, so the
   * ground is a bake (ASSET_PIPELINE §5) laid down as a handful of large
   * statics. The bake is a seamless 2048x1024 slice; the lot is bigger than one
   * slice, so it repeats — and it is drawn in **screen space**, axis-aligned,
   * because a projected quad of a pre-projected texture would apply the
   * isometric skew twice.
   *
   * The flat quad underneath stays. It is not decoration: it covers the corners
   * a rectangular tiling leaves outside the lot's diamond, and it is what draws
   * at all if the ground bake is the one file that failed to load.
   */
  private drawGround(): void {
    const lot = this.layout.lot;
    const layer = this.graph.layer('ground');

    const ground = this.add.graphics();
    ground.fillStyle(SURFACE_COLORS.ground, 1);
    ground.fillPoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
    layer.add(ground);

    const key = GROUND_FRAMES[this.stage];
    if (key === undefined || !this.textures.exists(key)) {
      // Said in the same place the geometry is: an unbaked lot keeps the grid so
      // the extent is still readable, rather than becoming a flat colour field.
      ground.lineStyle(2, SURFACE_COLORS.groundGrid, 1);
      ground.strokePoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
      this.groundTile?.destroy();
      this.groundTile = null;
      return;
    }

    const bounds = worldRectToScreenBounds(lot.minX, lot.minY, lot.maxX, lot.maxY, {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });

    /*
     * One stretched slice, not a tiled one.
     *
     * §5 calls these "bake"s and §2 sizes them as 2048x1024 *slices* — one image
     * covering the lot, not a repeating texture. Tiling it was the first thing
     * tried and the seams were visible in the first screenshot: the slice is
     * seamless in intent and not in fact, and no tile scale hides that. Stretched
     * to the lot's screen extent there is exactly one of it and no seam to see.
     */
    this.groundTile?.destroy();
    const bake = this.add
      .image(bounds.left, bounds.top, key)
      .setOrigin(0, 0)
      .setDisplaySize(bounds.right - bounds.left, bounds.bottom - bounds.top);

    /*
     * Masked to the lot's own diamond.
     *
     * The bake is a rectangle and the lot is a diamond, so without this the
     * ground ends on a hard horizontal line that belongs to no isometric object
     * — visible in the first capture as a straight edge cutting across the verge.
     * The mask is the same quad the flat fill uses, so the two cannot disagree.
     */
    const shape = this.add.graphics();
    shape.fillStyle(0xffffff, 1);
    shape.fillPoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
    bake.setMask(shape.createGeometryMask());
    // The graphics object is the mask, not something drawn: leaving it visible
    // would paint a white diamond over the lot.
    shape.setVisible(false);

    layer.add(bake);
    this.groundTile = bake;
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

    /*
     * Tables: a pad under each, so the dining room reads as a room rather than
     * as a scatter of props. Quarter strength now that the tables are real art:
     * at 0.8 the pads read as painted parking bays under the furniture — the
     * first golden with production tables showed a terrace that looked like a
     * car park — and at 0.2 they are a terrace shadow that groups the room
     * without competing with it.
     */
    surfaces.fillStyle(SURFACE_COLORS.groundGrid, 0.2);
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

    /*
     * The baked surface — Phase 16, the first regeneration item to get real
     * art. The delivered slice is an isometric tile with the carriageway
     * through its middle, laid along the band at the scale that puts the
     * painted asphalt on `widthMetres`. The flat fill stays underneath for
     * the same reason the ground keeps its quad: it is what draws at all if
     * this one file fails to fetch — and the dashes below are the fallback's
     * markings, skipped when the bake paints its own.
     */
    let baked = false;
    if (this.textures.exists(ROAD_FRAME)) {
      baked = true;
      for (const tile of this.roadTiles) tile.destroy();
      this.roadTiles.length = 0;

      /*
       * 12 m, not the slice's native 16: the art's carriageway spans ~60% of
       * its diamond, and at native scale that is a 9.5 m road on a 7 m
       * right-of-way — kerbs across the stand's own apron. Scaled so the
       * painted asphalt lands on `widthMetres`, the kerb and verge finish on
       * their own edges and the lanes sit centred in each half.
       */
      const TILE_METRES = 12;
      /*
       * No mask — measured, not assumed. `setMask` warns "not supported in
       * WebGL" on this Phaser 4 build and silently does nothing (the ground
       * bake's diamond mask has been inert for the same reason; its diamond
       * comes from the art's own alpha). What bounds the road visually is the
       * slice's transparent edges, which at this scale land the kerb and
       * verge where they belong. The one blemish that a working mask would
       * have trimmed — near-side verge under the drive-thru's on-road spill —
       * is recorded as polish debt in PHASE_16_REPORT.
       */
      for (let x = startX; x < endX + TILE_METRES; x += TILE_METRES) {
        const bounds = worldRectToScreenBounds(
          x - TILE_METRES / 2,
          centreY - TILE_METRES / 2,
          x + TILE_METRES / 2,
          centreY + TILE_METRES / 2,
          { left: 0, top: 0, right: 0, bottom: 0 },
        );
        /*
         * Mirrored: the slice was authored with its carriageway along the
         * other isometric axis, and flipping X is the projection-level swap
         * of the two diagonals. A laterally symmetric surface mirrors
         * truthfully — the same rule DIRECTION_AUDIT applies to cars.
         */
        const tile = this.add
          .image(bounds.left, bounds.top, ROAD_FRAME)
          .setOrigin(0, 0)
          .setFlipX(true)
          .setDisplaySize(bounds.right - bounds.left, bounds.bottom - bounds.top);
        this.graph.layer('road').add(tile);
        this.roadTiles.push(tile);
      }
    }

    if (!baked) {
      // Dashed centre line: a solid one would read as a barrier, and Stage 4
      // adds a left turn across it.
      road.fillStyle(SURFACE_COLORS.roadMarking, 1);
      for (let x = startX; x < endX; x += 4) {
        road.fillPoints(this.worldQuad(x, centreY - 0.08, x + 2, centreY + 0.08), true);
      }
    }

    this.graph.layer('road').add(road);
    // The fill goes beneath the tiles it backstops.
    this.graph.layer('road').sendToBack(road);
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
    const statics = this.layout.statics.map((object, index) => {
      const variant = worldObjectIndex(object.objectId);
      return {
        entityId: -(index + 1),
        x: object.x,
        y: object.y,
        z: object.z,
        // A layout that still names a placeholder resolves to -1, draws the
        // placeholder, and is counted. It is not silently skipped.
        kind: variant < 0 ? kindIndexForTexture(object.objectId) : kindForWorldObject(variant),
        variant,
      };
    });

    /*
     * Furniture, from the seating plan rather than from a second list.
     *
     * `layout.tables` already says where a table is and how many it seats — it
     * is what the simulation sits customers at — so the dining room is drawn
     * from it. Authoring the same six positions again as statics would be two
     * lists to keep in step, and the one that drifted would be the one nobody
     * was looking at.
     *
     * Only the round table gets chairs. `prop_table_square_2seat` arrived with
     * four chairs and a potted plant already painted on it — the two table
     * assets are not the same kind of asset — so adding chairs around it drew
     * eight chairs at a two-top, which is what the first Stage 3 capture showed.
     */
    for (let i = 0; i < this.layout.tables.length; i++) {
      const table = this.layout.tables[i];
      if (table === undefined) continue;
      const round = table.seats > 2;
      statics.push({
        entityId: TABLE_ID_BASE - i * (MAX_SEATS + 1),
        x: table.x,
        y: table.y,
        z: 0,
        kind: ACTOR_KIND_PROP_SHORT,
        variant: worldObjectIndex(round ? 'table-round' : 'table-square'),
      });

      if (!round) continue;

      const chair = worldObjectIndex('chair-wooden');
      for (let seat = 0; seat < MAX_SEATS; seat++) {
        const angle = (seat / MAX_SEATS) * Math.PI * 2 + Math.PI / 4;
        statics.push({
          entityId: TABLE_ID_BASE - i * (MAX_SEATS + 1) - (seat + 1),
          x: table.x + Math.cos(angle) * CHAIR_RADIUS_METRES,
          y: table.y + Math.sin(angle) * CHAIR_RADIUS_METRES,
          z: 0,
          kind: ACTOR_KIND_PROP_SHORT,
          variant: chair,
        });
      }
    }

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
      // The empty id is an upgrade that is a process, not a thing — nothing to
      // place, and nothing counted as missing. Its visible change is the burst.
      if (item.placeholder === '') continue;
      const variant = worldObjectIndex(item.placeholder);
      statics.push({
        entityId: -(this.layout.statics.length + i + 1),
        x: item.anchor.x,
        y: item.anchor.y,
        z: 0,
        kind: variant < 0 ? kindIndexForTexture(item.placeholder) : kindForWorldObject(variant),
        variant,
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
