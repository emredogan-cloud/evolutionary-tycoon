import Phaser from 'phaser';
import type { SpriteDirectionName } from '@config/sprites';
import type { SimEvent } from '@sim/core/events';
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
import { createPose } from '../rig/DollRig';
import { DollRigRuntime } from '../rig/DollRigRuntime';
import { ParticleLibrary } from '../fx/ParticleLibrary';
import { AudioDirector } from '../audio/AudioDirector';
import { wireFx } from '../fx/FxWiring';
import { FX_FRAMES } from '@config/sprites';
import type { RigPose } from '../rig/DollRig';
import type { AssetRegistry } from '../AssetRegistry';
import {
  EMPLOYEE_TINT,
  GROUND_FRAMES,
  RIG_DIRECTION_FOR,
  RIG_DRAW_ORDER,
  RIG_PIVOTS,
  rigFrame,
  unpackAppearance,
  vehicleBrakeFrame,
  vehicleFacingFix,
  vehicleFixFrame,
  vehicleFrame,
  worldObjectAt,
  worldObjectIndexOf,
} from '@config/sprites';
import type { ActorView } from '../ActorView';
import { ART_SCALE, CAMERA, TILE_H, TILE_W, TILE_Z } from '@config/world';
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

/** Placed decor ids live below the furniture range; sites below those. */
const PLACED_ID_BASE = -30_000;
const SITE_ID_BASE = -40_000;

/**
 * The rig's resting torso height, subtracted so the bob is an offset from rest
 * rather than an absolute position.
 */
const REST_TORSO_HEIGHT_METRES = 0.95;

/**
 * Painted bay geometry, in metres. Half-dimensions because everything that
 * consumes them measures from the authored bay centre. 5.0 x 2.6 m per bay —
 * the approved 5 m spacing, with the width a parked 1.9 m car plus door room.
 */
const BAY_HALF_LENGTH = 2.5;
const BAY_HALF_WIDTH = 1.3;

/**
 * Deterministic scatter for painted ground detail — grass dabs, asphalt tone.
 *
 * The same integer-hash family the environment layer uses for precipitation:
 * a pure function of the index, so the composition is identical on every
 * machine and every reload (the goldens depend on it), and no RNG stream is
 * consumed outside the simulation.
 */
/** West-side facings resolve through their eastern mirror — see drawVehicle. */
const VEHICLE_MIRROR: Readonly<Partial<Record<SpriteDirectionName, SpriteDirectionName>>> = {
  w: 'e',
  nw: 'ne',
  sw: 'se',
};

function hash01(index: number, salt: number): number {
  const n = Math.imul(index + 1, 2654435761) ^ Math.imul(salt, 40503);
  return ((n >>> 8) & 0xffff) / 0x10000;
}

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
  /** Last seen layout revision — placed decor and construction sites. */
  private layoutRevision = -1;
  /**
   * Static entity id → row in the view's pending-build list, rebuilt with the
   * statics. `drawStatic` looks a quad up here to decide whether it is a
   * finished thing or a construction silhouette, and the per-frame site bars
   * read their progress through the same rows.
   */
  private readonly pendingSiteByEntity = new Map<number, number>();
  /** The construction sites' progress bars, cleared and redrawn per frame. */
  private siteBars: Phaser.GameObjects.Graphics | null = null;

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

  /** Table pads and the drive-thru lane. Cleared and redrawn per stage. */
  private surfaces: Phaser.GameObjects.Graphics | null = null;
  /**
   * Parking bay markings. Their own graphics on the **road** layer: the bays
   * are painted on the asphalt, and drawing them on the ground layer put them
   * underneath the road surface — which is why the first consolidation's bay
   * outlines were invisible in every capture.
   */
  private baySurfaces: Phaser.GameObjects.Graphics | null = null;
  /** Everything drawGround created, so a stage change can rebuild it. */
  private readonly groundObjects: Phaser.GameObjects.GameObject[] = [];
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
  /** Phase 17 — clips, blending and the procedural layer, per actor. */
  private readonly rig = new DollRigRuntime();
  private animNowMs = 0;
  /** Phase 17 — the twelve effects. Null in noParticles mode by construction. */
  private particles: ParticleLibrary | null = null;
  private audio: AudioDirector | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private currentMusic: string | null = null;
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

    /*
     * Phase 17 — effects and audio. Particles are simply never constructed in
     * noParticles mode: the goldens were captured without them and the
     * roadmap's own instruction is that a moving golden means a leak. Audio
     * needs a user gesture to unlock; Phaser handles that, and with no files
     * shipped the director is a complete, silent instrument.
     */
    if (!this.context.noParticles) {
      const fxAtlas = this.assets?.atlasOf(FX_FRAMES.steam);
      if (fxAtlas !== undefined) {
        this.particles = ParticleLibrary.forScene(this, fxAtlas, this.context.reducedMotion);
      }
      this.audio = new AudioDirector(this.sound);
      /*
       * Lazy, after the first playable frame — the roadmap's own requirement.
       * `public/audio/manifest.json` lists the files that actually exist; with
       * none shipped the fetch 404s and the director simply stays silent.
       * Dropping files plus a manifest into public/audio wakes the whole
       * system with no code change (docs/AUDIO_ASSET_REQUIREMENTS.md).
       */
      void fetch('audio/manifest.json')
        .then(async (response) => (response.ok ? ((await response.json()) as { files: string[] }) : null))
        .then((manifest) => {
          if (manifest === null || manifest.files.length === 0) return;
          for (const key of manifest.files) {
            this.load.audio(key, [`audio/${key}.ogg`, `audio/${key}.m4a`]);
          }
          this.load.once('complete', () => {
            this.audio?.markLoaded(manifest.files);
          });
          this.load.start();
        })
        .catch(() => undefined);
      this.unsubscribeEvents =
        this.context.subscribeEvents?.((event) => {
          this.onSimEvent(event);
        }) ?? null;
      this.events.once('shutdown', () => {
        this.unsubscribeEvents?.();
        this.audio?.stopAll();
      });
    }

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
      this.layoutVignette();
    });
    this.layoutVignette();

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

    /*
     * The camera's own E2E door — see `RenderContext.exposeCameraHook`. It
     * speaks world metres, and everything routes through the controller's own
     * clamped `centreOn`, so the hook can request nothing a player could not.
     */
    if (this.context.exposeCameraHook === true) {
      const scratch: Point2 = { x: 0, y: 0 };
      (window as unknown as Record<string, unknown>)['__EVOTYCOON_CAMERA__'] = {
        set: (worldX: number, worldY: number, zoom: number) => {
          const focus = worldToScreen(worldX, worldY, 0, scratch);
          this.camera.centreOn(focus.x, focus.y, zoom);
        },
        state: () => ({ ...this.camera.current }),
      };
    }

    // Announced so E2E can wait on a state rather than a timeout.
    document.documentElement.dataset['renderState'] = 'ready';
  }

  override update(_time: number, delta: number): void {
    this.camera.update(delta);
    // Tracks pan and zoom, not just resize — see the field's comment.
    this.layoutVignette();

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
    if (view.upgradeRevision !== this.upgradeRevision || view.layoutRevision !== this.layoutRevision) {
      this.upgradeRevision = view.upgradeRevision;
      this.layoutRevision = view.layoutRevision;
      this.registerStatics(view.upgradeLevels);
    }

    this.animNowMs = view.simTimeMs;
    this.rig.prune(this.animNowMs);
    /*
     * GDD §16's three music variants follow the game hour. With no files
     * shipped this selects silently; the day a music_* file lands it starts
     * honouring the clock with no code change.
     */
    if (this.audio !== null) {
      const desired =
        view.gameHour >= 6 && view.gameHour < 17
          ? 'music_day'
          : view.gameHour < 22
            ? 'music_evening'
            : 'music_night';
      if (desired !== this.currentMusic) {
        this.currentMusic = desired;
        this.audio.play(desired, this.animNowMs, view.audioSettings);
      }
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
    this.drawSiteBars(view);
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
    sprite.setAlpha(1);
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
  private place(
    sprite: Phaser.GameObjects.Image,
    frame: string,
    x: number,
    y: number,
    mirrored = false,
  ): void {
    const info = this.assets?.info(frame);
    // A mirrored draw mirrors the anchor too: feet at 30% from the left are
    // at 30% from the right once the pixels flip.
    const originX = info?.originX ?? 0.5;
    sprite.setOrigin(mirrored ? 1 - originX : originX, info?.originY ?? 1);
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
    /*
     * Frame resolution, in trust order:
     *
     *  1. The brake-lit frame while braking — the 2026-08-21 delivery has a
     *     `_brake` view wherever the lights are visible, mirrored for `nw`.
     *  2. The facing-fix table (`VEHICLE_FACING_FIXES`): where the delivered
     *     default does not show the facing its filename promises, the
     *     truthful substitute — a receding car must never wear a forward
     *     view, which is the "vehicles drive sideways" capture in one line.
     *  3. The default frame as named — unless the fix table declares it
     *     untruthful, in which case an absent substitute falls through to
     *     the mirror rather than resurrecting the bad art.
     *  4. The lateral mirror of the opposite side, exactly as the doll rig
     *     mirrors (P17): a vehicle is laterally symmetric, so `sw` is `se`
     *     flipped — zero shipped bytes instead of a second copy.
     */
    const partner = VEHICLE_MIRROR[direction];
    let flip = false;
    let frame: string | null = null;

    if (view.braking) {
      const brake = vehicleBrakeFrame(view.variant, direction);
      frame = brake !== null ? this.frameOf(brake) : null;
      if (frame === null && partner !== undefined) {
        const brakePartner = vehicleBrakeFrame(view.variant, partner);
        frame = brakePartner !== null ? this.frameOf(brakePartner) : null;
        flip = frame !== null;
      }
    }

    const fix = vehicleFacingFix(view.variant, direction);
    if (frame === null && fix !== undefined) {
      frame = this.frameOf(vehicleFixFrame(view.variant, fix));
      flip = frame !== null && fix.flip === true;
    }
    if (frame === null && fix === undefined) {
      frame = this.frameOf(vehicleFrame(view.variant, direction));
    }
    if (frame === null && partner !== undefined) {
      const partnerFix = vehicleFacingFix(view.variant, partner);
      const name =
        partnerFix !== undefined
          ? vehicleFixFrame(view.variant, partnerFix)
          : vehicleFrame(view.variant, partner);
      const resolved = this.frameOf(name);
      if (resolved !== null) {
        frame = resolved;
        // Mirroring a substitute that was itself mirrored lands back on the
        // original side, so the two flips cancel.
        flip = partnerFix?.flip !== true;
      }
    }
    if (frame === null) {
      /*
       * The reserve fleet's atlas (`vehicles2`) is a deferred tier: a live
       * session streams it in behind the first frame. A bus whose texture has
       * not arrived is *skipped*, never placeholdered — an unmistakably-wrong
       * box on the road would violate the production-placeholder zero, and
       * the vehicle simply becomes visible at the road edge a moment later,
       * which reads as a spawn.
       */
      if (this.assets?.hasAtlas('vehicles2') !== true) return index;
      return this.drawPlaceholder(view, index);
    }

    const atlas = this.assets?.atlasOf(frame);
    if (atlas === undefined) return this.drawPlaceholder(view, index);

    const sprite = this.quadFor(index, atlas, frame);
    if (flip) sprite.setFlipX(true);
    vehicleBodyMotion(view.travelled, view.braking ? -4 : 0, this.bodyMotion);
    sprite.setRotation(this.bodyMotion.pitch);
    this.place(sprite, frame, view.screenX, view.screenY + this.bodyMotion.bobY, flip);
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
  /** Phase 17 — one world moment becomes one flash and one noise. */
  private onSimEvent(event: SimEvent): void {
    const settings = this.context.readView();
    wireFx(event, {
      spawnAtWorld: (effectId, worldX, worldY) => {
        const screen = worldToScreen(worldX, worldY, 0, this.screenScratch);
        this.particles?.spawn(effectId, screen.x, screen.y - 24);
      },
      play: (key, worldX, worldY) => {
        const lot = this.layout.lot;
        const focusX = (lot.minX + lot.maxX) / 2;
        const focusY = (lot.minY + lot.maxY) / 2;
        const distance =
          worldX === undefined || worldY === undefined ? 0 : Math.hypot(worldX - focusX, worldY - focusY);
        this.audio?.play(key, this.animNowMs, settings.audioSettings, distance);
      },
      positionOf: (entityId) => {
        for (const view of this.bridge.visible) {
          if (view.entityId === entityId) return { x: view.worldX, y: view.worldY };
        }
        return null;
      },
      lotCentre: () => ({
        x: (this.layout.lot.minX + this.layout.lot.maxX) / 2,
        y: (this.layout.lot.minY + this.layout.lot.maxY) / 2,
      }),
    });
  }

  private drawPerson(view: ActorView, index: number): number {
    const appearance = unpackAppearance(view.variant);
    const facing = RIG_DIRECTION_FOR[directionFor(view.headingX, view.headingY)];

    /*
     * Sim time drives the clips, not the wall clock: a frozen world holds a
     * frozen pose (visual determinism gets this for free), and a 4x world
     * cooks four times as fast, which is what 4x means.
     */
    // Rig facings collapse to four; sw/nw are the mirrored pair (sprites.ts).
    const mirrored = facing === 'sw' || facing === 'nw';
    const pose: RigPose = this.rig.pose(
      view.entityId,
      view.activity,
      view.moving,
      view.travelled,
      WALK_SPEED_METRES_PER_SECOND,
      mirrored,
      this.animNowMs,
      this.walkPose,
    );

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
    /*
     * A construction site draws as a dark translucent silhouette of the thing
     * being built — the shape says what is coming, the treatment says it is
     * not here yet, and the reveal at completion is the untinted sprite
     * simply taking its place. Reduced-motion safe: nothing animates but the
     * bar, which moves at the speed of the build itself.
     */
    const site = this.pendingSiteByEntity.get(view.entityId);
    if (site !== undefined) {
      sprite.setTint(0x2b323d);
      sprite.setAlpha(0.62);
    } else {
      sprite.setAlpha(1);
    }
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
      if (site !== undefined) {
        upperSprite.setTint(0x2b323d);
        upperSprite.setAlpha(0.62);
      } else {
        upperSprite.setAlpha(1);
      }
      quad++;
    }

    return quad;
  }

  /**
   * The screen-space vignette — the premium falloff of the reference scenes.
   *
   * Four bands, one per edge, repositioned to the camera's visible world rect
   * every frame. They used to be viewport-sized rectangles at scroll factor
   * zero — which is the classic Phaser trap this correction pass closes in
   * three places at once: scroll factor exempts an object from *scroll*, not
   * from *zoom*, so at 0.6x the "full-screen" bands shrank to 60% and drew as
   * a dark picture-frame floating in the middle of the world (the hard-edged
   * rectangles in the user's zoomed-out capture). The visible world rect is
   * arithmetic on scroll and zoom directly, so it is correct at every zoom by
   * construction.
   */
  private vignette: Phaser.GameObjects.Rectangle[] = [];

  private layoutVignette(): void {
    if (this.vignette.length === 0) {
      for (let i = 0; i < 4; i++) {
        const band = this.add.rectangle(0, 0, 1, 1, 0x05070b, 0.1).setOrigin(0, 0);
        band.setDepth(1_000_000);
        this.vignette.push(band);
      }
    }

    const camera = this.cameras.main;
    const viewW = camera.width / camera.zoom;
    const viewH = camera.height / camera.zoom;
    const left = camera.scrollX + (camera.width - viewW) / 2;
    const top = camera.scrollY + (camera.height - viewH) / 2;
    // One quiet 6% band per edge at 0.10 — measured against the goldens as
    // the strongest falloff that never reads as a frame.
    const bandH = viewH * 0.06;
    const bandW = viewW * 0.06;

    const [north, south, west, east] = this.vignette;
    north?.setPosition(left, top).setSize(viewW, bandH);
    south?.setPosition(left, top + viewH - bandH).setSize(viewW, bandH);
    west?.setPosition(left, top).setSize(bandW, viewH);
    east?.setPosition(left + viewW - bandW, top).setSize(bandW, viewH);
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
   * The screen-space rectangle the camera can ever show, at any zoom, on any
   * monitor this game supports.
   *
   * Two constraints add up. The camera clamps to the lot-plus-margin bounding
   * box, so that box is reachable edge to edge; and when the viewport at
   * minimum zoom is *larger* than the box, `clampToBounds` centres the view
   * and the visible area overhangs the bounds on every side. The overhang is
   * `viewport / minZoom` against a worst-case monitor — 3840x2160 is the
   * ceiling the responsive matrix supports — so the cover rect is the bounds
   * grown to at least that half-extent. Everything inside this rect must be
   * painted world; this is the geometric statement of "the player never sees
   * the outside of the world".
   */
  private groundCoverRect(): { left: number; top: number; right: number; bottom: number } {
    const bounds = this.cameraBounds();
    const centreX = (bounds.left + bounds.right) / 2;
    const centreY = (bounds.top + bounds.bottom) / 2;
    const MAX_VIEWPORT_W = 3840;
    const MAX_VIEWPORT_H = 2160;
    const halfW = Math.max((bounds.right - bounds.left) / 2, MAX_VIEWPORT_W / (2 * CAMERA.minZoom)) + 64;
    const halfH = Math.max((bounds.bottom - bounds.top) / 2, MAX_VIEWPORT_H / (2 * CAMERA.minZoom)) + 64;
    return {
      left: centreX - halfW,
      top: centreY - halfH,
      right: centreX + halfW,
      bottom: centreY + halfH,
    };
  }

  /**
   * The ground: the baked dirt, tiled across everything the camera can reach.
   *
   * `RESEARCH_NOTES` §4 rules out an isometric tilemap in Phaser 4, so the
   * ground is a bake (ASSET_PIPELINE §5) — and it is drawn in **screen
   * space**, axis-aligned, because a projected quad of a pre-projected texture
   * would apply the isometric skew twice.
   *
   * ## Why it tiles over the whole cover rect, not the lot
   *
   * The first consolidation stretched one slice over the lot rectangle and
   * left a flat-colour skirt around it. Two things were wrong with that in
   * every capture: the geometry mask that was meant to trim the slice to the
   * lot's diamond is silently inert on this Phaser 4 build (the same probe
   * that moved the road off `setMask`), so the bake ended on four hard
   * screen-space edges; and the skirt read as void — the directive's exact
   * complaint — because flat paint is not ground. Now the same earth runs
   * from one edge of the reachable world to the other, so there is no lot
   * boundary to see and no skirt to read as the outside.
   *
   * ## Why mirror-tiling
   *
   * The slice is seamless in intent and not in fact — plainly repeating it
   * showed its joints in the first Phase 4 capture. Mirroring every other
   * column and every other row makes each edge meet a reflection of itself,
   * which is continuous by construction; on organic dirt the local symmetry
   * is invisible at gameplay zoom.
   *
   * The flat fill underneath stays: it is what draws at all if the bake is
   * the one file that failed to fetch, and it backstops sub-pixel cracks
   * between tiles at fractional zooms.
   */
  private drawGround(): void {
    const lot = this.layout.lot;
    const layer = this.graph.layer('ground');

    for (const object of this.groundObjects) object.destroy();
    this.groundObjects.length = 0;

    const cover = this.groundCoverRect();

    const skirt = this.add.graphics();
    // The bake's own border dirt, sampled — the backstop must read as more of
    // the same earth, not as a different material.
    skirt.fillStyle(0x8f6f49, 1);
    skirt.fillRect(cover.left, cover.top, cover.right - cover.left, cover.bottom - cover.top);
    layer.add(skirt);
    this.groundObjects.push(skirt);

    const key = GROUND_FRAMES[this.stage];
    if (key === undefined || !this.textures.exists(key)) {
      // An unbaked lot keeps its outline so the extent stays readable in dev
      // bootstraps with no asset manifest, rather than becoming flat colour.
      const ground = this.add.graphics();
      ground.fillStyle(SURFACE_COLORS.ground, 1);
      ground.fillPoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
      ground.lineStyle(2, SURFACE_COLORS.groundGrid, 1);
      ground.strokePoints(this.worldQuad(lot.minX, lot.minY, lot.maxX, lot.maxY), true);
      layer.add(ground);
      this.groundObjects.push(ground);
      return;
    }

    const source = this.textures.get(key).getSourceImage();
    const tileW = source.width / ART_SCALE;
    const tileH = source.height / ART_SCALE;
    const firstColumn = Math.floor(cover.left / tileW);
    const lastColumn = Math.ceil(cover.right / tileW);
    const firstRow = Math.floor(cover.top / tileH);
    const lastRow = Math.ceil(cover.bottom / tileH);

    for (let row = firstRow; row < lastRow; row++) {
      for (let column = firstColumn; column < lastColumn; column++) {
        const tile = this.add
          .image(column * tileW, row * tileH, key)
          .setOrigin(0, 0)
          .setDisplaySize(tileW, tileH)
          // The mirror alternation. `& 1` on a possibly negative index — the
          // parity, not the sign, is what decides the flip.
          .setFlipX((column & 1) === 1 || (column & 1) === -1)
          .setFlipY((row & 1) === 1 || (row & 1) === -1);
        layer.add(tile);
        this.groundObjects.push(tile);
      }
    }

    /*
     * Large, faint tone patches over the tiling.
     *
     * Mirror-tiling guarantees seamless joints and pays for it with
     * kaleidoscope symmetry — at minimum zoom the bake's tyre tracks read as
     * repeating chevrons. These low-alpha washes sit above the tiles and
     * below the road, big enough to span several tiles, hash-scattered so
     * they are identical on every machine. They break the wallpaper without
     * introducing a single new edge. The proper long-term fix is variation
     * slices (prompt NEW_UI_WORLD_FIX-002); this is what makes the tiling
     * honest until that art exists.
     */
    const wash = this.add.graphics();
    const coverW = cover.right - cover.left;
    const coverH = cover.bottom - cover.top;
    const patches = Math.min(160, Math.floor((coverW * coverH) / 350_000));
    for (let i = 0; i < patches; i++) {
      const x = cover.left + hash01(i, 101) * coverW;
      const y = cover.top + hash01(i, 103) * coverH;
      const tone = hash01(i, 107);
      wash.fillStyle(tone < 0.45 ? 0x6a3e1c : tone < 0.8 ? 0xc99a5f : 0x35441a, 0.05 + hash01(i, 109) * 0.06);
      wash.fillEllipse(x, y, 320 + hash01(i, 113) * 640, 160 + hash01(i, 127) * 320);
    }
    layer.add(wash);
    this.groundObjects.push(wash);
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

    /*
     * Parking bays — painted on the layby asphalt, on the **road** layer.
     *
     * Two mistakes are being corrected at once here. The old outline lived on
     * the ground layer, underneath the road surface, so it never appeared in
     * a single capture; and it was drawn 2.4 x 4.4 m *across* the road — the
     * long axis perpendicular to the authored heading — so even had it been
     * visible it would not have matched the car parked in it. These bays are
     * the car's own geometry: 5 m along the road, marked the way a real layby
     * is — an outline, dividers, and a wheel-stop strip.
     */
    const bays = this.baySurfaces ?? this.add.graphics();
    if (this.baySurfaces === null) {
      this.baySurfaces = bays;
      this.graph.layer('road').add(bays);
    }
    bays.clear();
    const LINE = 0.09;
    const lanes = this.layout.road.lanes;
    const roadCentreY = ((lanes[0]?.points[0]?.y ?? 0) + (lanes[1]?.points[0]?.y ?? 0)) / 2;
    const carriagewayEdge = roadCentreY + this.layout.road.widthMetres / 2;
    for (const bay of this.layout.parking) {
      const x0 = bay.x - BAY_HALF_LENGTH;
      const x1 = bay.x + BAY_HALF_LENGTH;
      // The painted box never crosses onto the carriageway, whatever the
      // authored centre: the outline is road marking, not car geometry.
      const y0 = Math.max(bay.y - BAY_HALF_WIDTH, carriagewayEdge + 0.08);
      const y1 = bay.y + BAY_HALF_WIDTH;
      // A faint concrete wash inside, so an empty bay reads as a place.
      bays.fillStyle(SURFACE_COLORS.asphaltWorn, 0.14);
      bays.fillPoints(this.worldQuad(x0 + LINE, y0 + LINE, x1 - LINE, y1 - LINE), true);
      // The outline. White, as the reference scenes paint them.
      bays.fillStyle(SURFACE_COLORS.roadMarking, 0.85);
      bays.fillPoints(this.worldQuad(x0, y0, x1, y0 + LINE), true);
      bays.fillPoints(this.worldQuad(x0, y1 - LINE, x1, y1), true);
      bays.fillPoints(this.worldQuad(x0, y0, x0 + LINE, y1), true);
      bays.fillPoints(this.worldQuad(x1 - LINE, y0, x1, y1), true);
      // The wheel-stop, against the kerb side.
      bays.fillStyle(SURFACE_COLORS.asphaltShadow, 0.9);
      bays.fillPoints(this.worldQuad(bay.x - 0.8, y1 - 0.34, bay.x + 0.8, y1 - 0.16), true);
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

  /**
   * The road: one continuous band, composed in world space.
   *
   * ## Why it is drawn rather than tiled from the delivered slice
   *
   * `road_segment_tile-a` is a self-contained diorama tile: its grass verge
   * wraps around its own ends and its sides carry a painted dirt cliff. Butting
   * copies of it produces exactly what every capture showed — a verge strip
   * crossing the carriageway at each joint and a staircase of floating slabs.
   * No placement can fix that; it is a property of the art. So the band is
   * composed from the locked palette in world space (the same technique the
   * drive-thru lane and the bay markings already use), which is continuous by
   * construction, follows the projection exactly, and has no seam to see. The
   * slice remains the reference for the seamless-strip regeneration prompt in
   * the catalogue (NEW_UI_WORLD_FIX-001); when that art lands this composition
   * is its fallback.
   *
   * ## The layby
   *
   * The stand's parking is a marked layby cut into the south verge along the
   * lot frontage: the apron asphalt continues from the carriageway edge to
   * `LAYBY_DEPTH`, and the bays are painted on it (`drawSurfaces`). That is
   * what puts parked cars visually *off* the through lanes — the first
   * consolidation parked them against the carriageway edge with no painted
   * bay, which read as cars abandoned on the road.
   */
  private drawRoad(): void {
    const lanes = this.layout.road.lanes;
    const first = lanes[0];
    const second = lanes[1];
    if (first === undefined || second === undefined) return;

    const halfWidth = this.layout.road.widthMetres / 2;
    const centreY = ((first.points[0]?.y ?? 0) + (second.points[0]?.y ?? 0)) / 2;
    const roadNorth = centreY - halfWidth;
    const roadSouth = centreY + halfWidth;

    /*
     * The band spans everything the ground cover can show. World X at a screen
     * point is screenX/64 + screenY/32 (the projection inverted along z = 0),
     * so the extremes over the cover rectangle are its two opposite corners.
     */
    const cover = this.groundCoverRect();
    const startX = Math.floor(cover.left / (TILE_W / 2) / 2 + cover.top / TILE_H / 2) - 2;
    const endX = Math.ceil(cover.right / (TILE_W / 2) / 2 + cover.bottom / TILE_H / 2) + 2;

    const road = this.add.graphics();

    // ── Verges: grass shoulders either side, with the layby cut out ────────
    const VERGE_DEPTH = 1.1;
    const CURB_DEPTH = 0.42;
    const layby = this.laybyRect();
    road.fillStyle(SURFACE_COLORS.vergeShadow, 1);
    road.fillPoints(
      this.worldQuad(startX, roadNorth - CURB_DEPTH - VERGE_DEPTH, endX, roadNorth - CURB_DEPTH),
      true,
    );
    // South verge runs the whole way except across the layby mouth.
    road.fillPoints(
      this.worldQuad(startX, roadSouth + CURB_DEPTH, layby.minX, roadSouth + CURB_DEPTH + VERGE_DEPTH),
      true,
    );
    road.fillPoints(
      this.worldQuad(layby.maxX, roadSouth + CURB_DEPTH, endX, roadSouth + CURB_DEPTH + VERGE_DEPTH),
      true,
    );
    road.fillStyle(SURFACE_COLORS.verge, 0.8);
    road.fillPoints(
      this.worldQuad(startX, roadNorth - CURB_DEPTH - VERGE_DEPTH + 0.1, endX, roadNorth - CURB_DEPTH - 0.06),
      true,
    );
    road.fillPoints(
      this.worldQuad(
        startX,
        roadSouth + CURB_DEPTH + 0.06,
        layby.minX,
        roadSouth + CURB_DEPTH + VERGE_DEPTH - 0.1,
      ),
      true,
    );
    road.fillPoints(
      this.worldQuad(
        layby.maxX,
        roadSouth + CURB_DEPTH + 0.06,
        endX,
        roadSouth + CURB_DEPTH + VERGE_DEPTH - 0.1,
      ),
      true,
    );

    /*
     * Grass texture: layered deterministic dabs — the base green almost fully
     * covered by lit, dry and shadow tones, with sparse flower dots on top,
     * the way the delivered slice paints its verge. Hash-scattered so goldens
     * are stable and no RNG stream is touched. Two passes per side: broad
     * tone dabs, then small bright blades and flowers.
     */
    const span = endX - startX;
    const drawVergeTexture = (seed: number, y0: number, y1: number, skipLayby: boolean): void => {
      const tones = Math.min(4200, Math.floor(span * 9));
      for (let i = 0; i < tones; i++) {
        const index = seed + i;
        const x = startX + hash01(index, 11) * span;
        if (skipLayby && x > layby.minX && x < layby.maxX) continue;
        const y = y0 + 0.08 + hash01(index, 23) * (y1 - y0 - 0.16);
        const tone = hash01(index, 37);
        road.fillStyle(
          tone < 0.3
            ? SURFACE_COLORS.vergeLit
            : tone < 0.52
              ? SURFACE_COLORS.vergeDry
              : tone < 0.62
                ? SURFACE_COLORS.groundGrid
                : SURFACE_COLORS.vergeShadow,
          0.42 + hash01(index, 29) * 0.3,
        );
        const screen = worldToScreen(x, y, 0, this.screenScratch);
        road.fillEllipse(screen.x, screen.y, 6 + hash01(index, 41) * 13, 3 + hash01(index, 43) * 5);
      }
      const sparks = Math.min(900, Math.floor(span * 1.8));
      for (let i = 0; i < sparks; i++) {
        const index = seed + 500_000 + i;
        const x = startX + hash01(index, 13) * span;
        if (skipLayby && x > layby.minX && x < layby.maxX) continue;
        const y = y0 + 0.1 + hash01(index, 17) * (y1 - y0 - 0.2);
        const kind = hash01(index, 19);
        road.fillStyle(
          kind < 0.42
            ? SURFACE_COLORS.vergeLit
            : kind < 0.8
              ? SURFACE_COLORS.roadMarking
              : SURFACE_COLORS.laneYellow,
          kind < 0.42 ? 0.85 : 0.75,
        );
        const screen = worldToScreen(x, y, 0, this.screenScratch);
        const size = kind < 0.42 ? 2.6 : 1.7;
        road.fillEllipse(screen.x, screen.y, size, size * 0.7);
      }
    };
    drawVergeTexture(0, roadNorth - CURB_DEPTH - VERGE_DEPTH, roadNorth - CURB_DEPTH, false);
    drawVergeTexture(1_000_000, roadSouth + CURB_DEPTH, roadSouth + CURB_DEPTH + VERGE_DEPTH, true);

    // ── Curbs: lit top, shadowed face, stone joints ────────────────────────
    road.fillStyle(SURFACE_COLORS.curbTop, 1);
    road.fillPoints(this.worldQuad(startX, roadNorth - CURB_DEPTH, endX, roadNorth), true);
    road.fillPoints(this.worldQuad(startX, roadSouth, layby.minX, roadSouth + CURB_DEPTH), true);
    road.fillPoints(this.worldQuad(layby.maxX, roadSouth, endX, roadSouth + CURB_DEPTH), true);
    // The layby's own back curb, where apron meets the lot dirt — dropped
    // across the pedestrian corridor between the middle bays, the way a real
    // layby drops its kerb at a walkway.
    const corridor = this.bayCorridor();
    road.fillPoints(this.worldQuad(layby.minX, layby.maxY, corridor.minX, layby.maxY + CURB_DEPTH), true);
    road.fillPoints(this.worldQuad(corridor.maxX, layby.maxY, layby.maxX, layby.maxY + CURB_DEPTH), true);
    road.fillStyle(SURFACE_COLORS.curbLit, 1);
    road.fillPoints(
      this.worldQuad(startX, roadNorth - CURB_DEPTH, endX, roadNorth - CURB_DEPTH + 0.12),
      true,
    );
    // Stone joints every 1.6 m, so the curb reads as kerbstones, not a stripe.
    road.fillStyle(SURFACE_COLORS.asphaltWorn, 0.9);
    for (let x = Math.ceil(startX / 1.6) * 1.6; x < endX; x += 1.6) {
      road.fillPoints(this.worldQuad(x, roadNorth - CURB_DEPTH, x + 0.07, roadNorth), true);
      if (x <= layby.minX - 0.1 || x >= layby.maxX + 0.1) {
        road.fillPoints(this.worldQuad(x, roadSouth, x + 0.07, roadSouth + CURB_DEPTH), true);
      } else if (x > layby.minX && x < layby.maxX && (x < corridor.minX || x > corridor.maxX)) {
        road.fillPoints(this.worldQuad(x, layby.maxY, x + 0.07, layby.maxY + CURB_DEPTH), true);
      }
    }

    // ── The carriageway ────────────────────────────────────────────────────
    road.fillStyle(SURFACE_COLORS.road, 1);
    road.fillPoints(this.worldQuad(startX, roadNorth, endX, roadSouth), true);

    // The layby apron: same asphalt, then a wash one step darker so the
    // parking reads as its own surface without a seam.
    road.fillPoints(this.worldQuad(layby.minX, roadSouth, layby.maxX, layby.maxY), true);
    road.fillStyle(SURFACE_COLORS.asphaltShadow, 0.22);
    road.fillPoints(this.worldQuad(layby.minX, roadSouth + 0.15, layby.maxX, layby.maxY), true);

    // Asphalt texture: sparse tone patches, then the wheel-wear bands each
    // lane carries. All deterministic, all low-alpha.
    for (let i = 0; i < Math.min(700, span); i++) {
      const u = hash01(i, 53);
      const v = hash01(i, 59);
      const x = startX + u * span;
      const y = roadNorth + 0.4 + v * (halfWidth * 2 - 0.8);
      const light = hash01(i, 61) < 0.5;
      road.fillStyle(light ? SURFACE_COLORS.asphaltWorn : SURFACE_COLORS.asphaltShadow, 0.1);
      const screen = worldToScreen(x, y, 0, this.screenScratch);
      road.fillEllipse(screen.x, screen.y, 26 + hash01(i, 67) * 60, 9 + hash01(i, 71) * 14);
    }
    road.fillStyle(SURFACE_COLORS.asphaltShadow, 0.13);
    for (const lane of [first, second]) {
      const laneY = lane.points[0]?.y ?? centreY;
      road.fillPoints(this.worldQuad(startX, laneY - 0.95, endX, laneY - 0.55), true);
      road.fillPoints(this.worldQuad(startX, laneY + 0.55, endX, laneY + 0.95), true);
    }

    // ── Markings ───────────────────────────────────────────────────────────
    // Solid yellow edge lines, as the delivered slice paints them.
    road.fillStyle(SURFACE_COLORS.laneYellow, 0.95);
    road.fillPoints(this.worldQuad(startX, roadNorth + 0.18, endX, roadNorth + 0.32), true);
    road.fillPoints(this.worldQuad(startX, roadSouth - 0.32, endX, roadSouth - 0.18), true);
    // Dashed white centre line: 2 m dash, 2 m gap.
    road.fillStyle(SURFACE_COLORS.roadMarking, 0.92);
    for (let x = Math.ceil(startX / 4) * 4; x < endX; x += 4) {
      road.fillPoints(this.worldQuad(x, centreY - 0.09, x + 2, centreY + 0.09), true);
    }

    // ── Storm drains against each curb, as in the slice ────────────────────
    for (let x = Math.ceil(startX / 22) * 22; x < endX; x += 22) {
      const north = (Math.round(x / 22) & 1) === 0;
      const y = north ? roadNorth + 0.42 : roadSouth - 0.42;
      this.drawDrain(road, x, y);
    }

    this.graph.layer('road').add(road);
  }

  /** The parking layby's world rectangle, from the authored bays. */
  private laybyRect(): { minX: number; maxX: number; maxY: number } {
    const bays = this.layout.parking;
    if (bays.length === 0) {
      const lot = this.layout.lot;
      return { minX: lot.minX, maxX: lot.maxX, maxY: this.layout.road.widthMetres };
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const bay of bays) {
      minX = Math.min(minX, bay.x - BAY_HALF_LENGTH - 0.5);
      maxX = Math.max(maxX, bay.x + BAY_HALF_LENGTH + 0.5);
      maxY = Math.max(maxY, bay.y + BAY_HALF_WIDTH + 0.25);
    }
    return { minX, maxX, maxY };
  }

  /**
   * The widest gap between adjacent bays — the pedestrian mouth of the layby.
   * Falls back to the layby centre when a stage authors fewer than two bays.
   */
  private bayCorridor(): { minX: number; maxX: number } {
    const bays = [...this.layout.parking].sort((a, b) => a.x - b.x);
    let best: { minX: number; maxX: number } | null = null;
    for (let i = 1; i < bays.length; i++) {
      const previous = bays[i - 1];
      const next = bays[i];
      if (previous === undefined || next === undefined) continue;
      // Only roadside-row neighbours form the corridor; deeper rows differ in y.
      if (Math.abs(previous.y - next.y) > 0.5) continue;
      const gapStart = previous.x + BAY_HALF_LENGTH;
      const gapEnd = next.x - BAY_HALF_LENGTH;
      if (gapEnd - gapStart > (best === null ? 0.6 : best.maxX - best.minX)) {
        best = { minX: gapStart, maxX: gapEnd };
      }
    }
    if (best !== null) return best;
    const layby = this.laybyRect();
    const centre = (layby.minX + layby.maxX) / 2;
    return { minX: centre - 1, maxX: centre + 1 };
  }

  /** One storm-drain grate, flush against a curb. */
  private drawDrain(road: Phaser.GameObjects.Graphics, x: number, y: number): void {
    road.fillStyle(SURFACE_COLORS.asphaltShadow, 1);
    road.fillPoints(this.worldQuad(x - 0.75, y - 0.28, x + 0.75, y + 0.28), true);
    road.fillStyle(SURFACE_COLORS.asphaltWorn, 1);
    road.fillPoints(this.worldQuad(x - 0.68, y - 0.2, x + 0.68, y + 0.2), true);
    road.fillStyle(SURFACE_COLORS.asphaltShadow, 1);
    for (let i = 0; i < 5; i++) {
      const gx = x - 0.52 + i * 0.26;
      road.fillPoints(this.worldQuad(gx, y - 0.16, gx + 0.1, y + 0.16), true);
    }
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

    /*
     * Placed decor — the correction pass. `world.layout.placed` never reached
     * the renderer at all: the build panel said "built" over a world with no
     * sprite, which is the 2026-08-22 captures' invisible-purchase bug at its
     * root. Rows come from the same view the frame is drawing.
     */
    this.pendingSiteByEntity.clear();
    const view = this.context.readView();
    for (let i = 0; i < view.placedCount; i++) {
      const object = view.placed[i];
      if (object === undefined) continue;
      const variant = worldObjectIndex(object.objectId);
      const entityId = PLACED_ID_BASE - i;
      statics.push({
        entityId,
        x: object.x,
        y: object.y,
        z: object.z,
        kind: variant < 0 ? kindIndexForTexture(object.objectId) : kindForWorldObject(variant),
        variant,
      });
      // Still going up? The scaffold pass will draw this quad as a site.
      for (let p = 0; p < view.pendingBuildCount; p++) {
        const build = view.pendingBuilds[p];
        if (
          build?.upgradeId === '' &&
          build.objectId === object.objectId &&
          Math.abs(build.x - object.x) < 1e-6 &&
          Math.abs(build.y - object.y) < 1e-6
        ) {
          this.pendingSiteByEntity.set(entityId, p);
          break;
        }
      }
    }

    /*
     * Upgrade construction sites: the bought thing, drawn as its own
     * silhouette at its anchor until the timer lands the level (at which
     * point the ordinary owned-upgrade pass above takes over). A site with
     * nothing to place — a process upgrade — shows only on its card.
     */
    for (let p = 0; p < view.pendingBuildCount; p++) {
      const build = view.pendingBuilds[p];
      if (build === undefined || build.upgradeId === '' || build.objectId === '') continue;
      const variant = worldObjectIndex(build.objectId);
      if (variant < 0) continue;
      const entityId = SITE_ID_BASE - p;
      statics.push({
        entityId,
        x: build.x,
        y: build.y,
        z: 0,
        kind: kindForWorldObject(variant),
        variant,
      });
      this.pendingSiteByEntity.set(entityId, p);
    }

    this.bridge.setStatics(statics);
  }

  /**
   * Progress bars over the construction sites, one Graphics for all of them.
   *
   * World-space UI (the `worldUi` layer), driven by the simulation's own
   * progress — the same figure the countdown cards show, so the two can
   * never disagree. Cleared and redrawn per frame; a handful of sites is a
   * handful of rectangles.
   */
  private drawSiteBars(view: Readonly<ReturnType<RenderContext['readView']>>): void {
    if (this.siteBars === null) {
      this.siteBars = this.add.graphics();
      this.graph.layer('worldUi').add(this.siteBars);
    }
    const bars = this.siteBars;
    bars.clear();
    if (view.pendingBuildCount === 0) return;

    for (let i = 0; i < view.pendingBuildCount; i++) {
      const build = view.pendingBuilds[i];
      if (build === undefined) continue;
      // A process upgrade has no site in the world; its bar is on its card.
      if (build.upgradeId !== '' && build.objectId === '') continue;
      const screen = worldToScreen(build.x, build.y, 0, this.screenScratch);
      const width = 46;
      const height = 7;
      const left = screen.x - width / 2;
      const top = screen.y - 58;
      bars.fillStyle(0x0c1017, 0.85);
      bars.fillRect(left - 1, top - 1, width + 2, height + 2);
      bars.fillStyle(0x2b323d, 1);
      bars.fillRect(left, top, width, height);
      bars.fillStyle(0xf4bc55, 1);
      bars.fillRect(left, top, width * Math.min(1, Math.max(0, build.progress)), height);
    }
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
