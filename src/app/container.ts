import { UiBridge } from '@app/bridge/UiBridge';
import { EVENT_SPECS } from '@config/events';
import { WEATHER_STATES } from '@config/weather';
import type { UiCommands } from '@app/bridge/hudModel';
import type { ScreenProjector, WorldUnprojector } from '@app/bridge/ScreenProjector';
import { NULL_PROJECTOR, NULL_UNPROJECTOR } from '@app/bridge/ScreenProjector';
import { stageScene } from '@app/devScene';
import type { StageNumber } from '@config/progression';
import { navigationIntact } from '@sim/nav/reachability';
import { previewPlacement, snapToGrid } from '@sim/systems/LayoutSystem';
import { FrameMeter } from '@app/FrameMeter';
import { browserScheduler, GameLoop } from '@app/GameLoop';
import { parseRenderMode, prefersReducedMotion } from '@app/renderMode';
import type { RenderMode } from '@app/renderMode';
import { SaveService } from '@app/SaveService';
import { installTestHooks, shouldExposeTestHooks } from '@app/testHooks';
import type { RenderContext } from '@render/RenderContext';
import { debugOverlayEnabled } from '@app/debug/DebugOverlay';
import { buildInfo } from '@platform/buildInfo';
import { Sim } from '@sim/core/Sim';
import { constructionProgress } from '@sim/systems/ConstructionSystem';
import { buyUpgrade, nextUpgradeCost } from '@sim/systems/UpgradeSystem';
import { reserveFor } from '@sim/systems/ProgressionSystem';
import { hire } from '@sim/systems/StaffSystem';
import { EMPLOYEE_ROLES } from '@config/employees';
import { requirementFor } from '@config/progression';
import { IdbAdapter } from '@persistence/idbAdapter';
import { LocalStorageAdapter } from '@persistence/localStorageAdapter';
import { SaveManager } from '@persistence/SaveManager';
import { MemoryStorageAdapter } from '@persistence/StorageAdapter';
import type { StorageAdapter } from '@persistence/StorageAdapter';

/**
 * Composition root wiring.
 *
 * Decides *what* exists and how the pieces find each other. No game rule lives
 * here — the simulation does not import this module, and it never will.
 */

export interface GameContainer {
  readonly sim: Sim;
  readonly loop: GameLoop;
  readonly saves: SaveService;
  readonly renderContext: RenderContext;
  readonly renderMode: RenderMode;
  readonly frames: FrameMeter;
  /**
   * The throttled view model the DOM overlay reads.
   *
   * Built here and handed to both sides, so neither knows about the other: the
   * overlay receives a subscribe function and the loop receives a `sample` call.
   */
  readonly ui: UiBridge;
  /** What the overlay may ask the simulation to do. */
  readonly commands: UiCommands;
  /** Swapped for the real projection once Phaser has a camera. */
  setProjector(project: ScreenProjector): void;
  setUnprojector(unproject: WorldUnprojector): void;
}

/**
 * Seed selection.
 *
 * `?seed=` first, because a reproducible session is worth more than a novel one
 * during development and is required for visual regression. Otherwise the seed
 * is derived from wall-clock time — the one legitimate `Date.now()` in the boot
 * path, and the reason it lives in `src/app` rather than `src/sim`.
 */
export function resolveSeed(search: string, nowMs: number): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw !== null) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  return nowMs >>> 0;
}

/**
 * Storage backend selection: IndexedDB, then localStorage, then memory.
 *
 * Memory last so the game still boots where both are blocked. That session's
 * progress is lost on reload, which is bad — but it is far better than a white
 * screen, and the caller can tell the difference from `saves.backendName`.
 */
export async function selectStorage(win: Window): Promise<StorageAdapter> {
  const idb = await IdbAdapter.open(win.indexedDB);
  if (idb !== null) return idb;

  const local: Storage | undefined = win.localStorage;
  if (LocalStorageAdapter.isAvailable(local)) return new LocalStorageAdapter(local);

  return new MemoryStorageAdapter();
}

/**
 * `?paused=1` boots without advancing time.
 *
 * A test that needs a pristine tick-0 world cannot get one otherwise: the
 * animation-frame loop starts immediately, so by the time a script runs, the
 * world has already moved. Phase 3 extends this into the full visual
 * determinism mode (`?seed=&freezeAt=&noParticles=…`).
 */
function shouldStartPaused(search: string): boolean {
  return new URLSearchParams(search).get('paused') === '1';
}

export function createContainer(win: Window, seed: number, storage: StorageAdapter): GameContainer {
  const search = win.location.search;
  const renderMode = parseRenderMode(search);

  // A frozen clock starts paused: the loop must not advance a single tick past
  // the target before the screenshot is taken.
  const startPaused = shouldStartPaused(search) || renderMode.freezeAt !== null;

  const sim = new Sim({ seed, startPaused });
  const loop = new GameLoop(sim, browserScheduler(win));
  const saves = new SaveService(sim, new SaveManager(storage), buildInfo.buildSha, () => Date.now());

  /*
   * Built before anything runs, and that ordering is load-bearing. The bridge
   * turns `PAYMENT` events into coin popups by *listening*, so a bridge
   * constructed after the fast-forward below would have missed every payment
   * that happened during it — and the frozen golden of a busy stand would show
   * no money changing hands at all.
   *
   * The projector is indirected for the mirror-image reason: the camera does not
   * exist until Phaser has booted a scene, which is later still. Rather than
   * defer the whole bridge — leaving the HUD blank for the first few frames — it
   * starts projecting nothing and is given the real transform when there is one.
   */
  let projector: ScreenProjector = NULL_PROJECTOR;
  /*
   * The inverse, installed by the same hand-off. Indirected for the same reason:
   * the camera does not exist when the container is built, and capturing it here
   * would freeze build mode at the boot camera.
   */
  let unprojector: WorldUnprojector = NULL_UNPROJECTOR;
  const unproject = (x: number, y: number): { x: number; y: number } | null => unprojector(x, y);
  const ui = new UiBridge(sim, (x, y, z, out) => projector(x, y, z, out), startPaused);
  ui.start();

  /*
   * The evolution stage, before anything runs. Visual regression only: a golden
   * of the Stage 4 restaurant that had to play its way there would take minutes
   * to regenerate and would photograph whatever the economy happened to do.
   *
   * The jump also seeds what a *legal* arrival now carries. ADR-014 made it
   * impossible to enter a stage without its required staff being affordable, so
   * a fixture that jumps to Stage 4 with ₡0 and no waiter creates a world no
   * player can reach — and it behaves like one: tables that cannot be served
   * clog the pass, the drive-thru starves behind it, and a test that trades in
   * that world measures the clog rather than its own subject. The hires use the
   * same paths a player does (`HIRE` through the gate would, but the world has
   * not ticked yet), funded exactly like `?buy=` above: grant the cost, spend
   * it, leave the reserve's wage runway in the till.
   */
  if (renderMode.stage > 1) {
    sim.world.progression.stage = renderMode.stage as StageNumber;
    const requirement = requirementFor(renderMode.stage - 1);
    for (const roleId of requirement?.requiredRoles ?? []) {
      const spec = EMPLOYEE_ROLES.find((role) => role.id === roleId);
      if (spec === undefined) continue;
      sim.world.economy.cash += spec.hireCost;
      hire(sim.world, roleId, 0.5);
    }
    if (requirement !== null) {
      sim.world.economy.cash += reserveFor(sim.world, requirement);
    }
  }

  /*
   * The calendar pins — Phase 15 fixture instruments, applied before the first
   * tick exactly like the stage jump above. `forceHour` moves the clock;
   * `forceWeather` writes the whole of day 0 as one state; `forceEvent`
   * schedules its event across the day. Planning is marked done for day 0 so
   * the first tick draws nothing from the events stream — the golden's world
   * is a function of the URL alone.
   */
  if (renderMode.forceHour !== null || renderMode.forceWeather !== null || renderMode.forceEvent !== null) {
    const env = sim.world.environment;
    env.plannedDay = 0;
    env.eventTypes.fill(-1);
    if (renderMode.forceHour !== null) {
      sim.world.clock.setState({ simTimeMs: (renderMode.forceHour / 24) * sim.world.clock.msPerGameDay });
    }
    if (renderMode.forceWeather !== null) {
      const index = WEATHER_STATES.findIndex(
        (state) => state.id.toLowerCase() === renderMode.forceWeather?.toLowerCase(),
      );
      if (index >= 0) env.weatherSegments.fill(index);
    }
    if (renderMode.forceEvent !== null) {
      const kind = EVENT_SPECS.findIndex(
        (spec) => spec.id.toLowerCase() === renderMode.forceEvent?.toLowerCase(),
      );
      if (kind >= 0) {
        env.eventTypes[kind] = kind;
        env.eventStartMs[kind] = 0;
        env.eventEndMs[kind] = sim.world.clock.msPerGameDay;
      }
    }
  }

  // Staged before the first tick, so the world hash of a staged scene is a
  // function of the scene alone.
  stageScene(sim, renderMode.sceneId);
  /*
   * Granted before the fast-forward, so the world runs the whole way with them
   * in place. Buying at the end would photograph a stand that had just acquired
   * a sign rather than one that had been trading with it.
   */
  for (const id of renderMode.buy) {
    const cost = nextUpgradeCost(sim.world, id);
    if (cost < 0) continue;
    sim.world.economy.cash += cost;
    buyUpgrade(sim.world, id);
  }

  if (renderMode.freezeAt !== null && renderMode.freezeAt > 0) {
    if (renderMode.cook) {
      // Ticked one at a time so a command can be queued before each. `advance`
      // would run the whole fast-forward with an empty queue, and the stand
      // would arrive at the target tick having never cooked anything.
      for (let i = 0; i < renderMode.freezeAt; i++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();
      }
    } else {
      sim.advance(renderMode.freezeAt);
    }
  }

  const renderContext: RenderContext = {
    readView: () => sim.readView(),
    interpolationAlpha: () => (renderMode.freezeAt !== null ? 0 : loop.interpolationAlpha),
    reducedMotion: prefersReducedMotion(win),
    noParticles: renderMode.noParticles,
    subscribeEvents: (listener) => sim.events.subscribe(listener),
    sceneId: renderMode.sceneId,
    showDevOverlays: debugOverlayEnabled() && !renderMode.visualDeterminism,
    onFrame: () => {
      ui.sample(win.performance.now());
    },
    constructionProgress: () => constructionProgress(sim.world),
    // The camera E2E hook rides the same gate as the simulation hook.
    exposeCameraHook: shouldExposeTestHooks(win.location.search),
    ...(renderMode.lockedCamera !== null ? { lockedCamera: renderMode.lockedCamera } : {}),
  };

  // Always constructed, only recorded into when asked for: an always-on
  // observer would add a call to the hottest path in the program for a number
  // nobody is reading.
  const frames = new FrameMeter();
  const benchmarking = new URLSearchParams(search).get('bench') === '1';

  if (shouldExposeTestHooks(search)) {
    installTestHooks(win, sim, loop, saves, frames, storage);
  }

  if (benchmarking) {
    loop.observeFrames((deltaMs) => {
      frames.record(deltaMs);
    });
  }

  /*
   * Sampling hangs off the *rendered* frame — `renderContext.onFrame` above —
   * rather than off a timer or the simulation loop. A `setInterval` would keep
   * firing in a backgrounded tab, publishing identical models forever; the
   * simulation loop stops entirely on a frozen scene, which still draws.
   *
   * One push here regardless, so the HUD has numbers before the renderer's first
   * frame instead of a tenth of a second of zeroes.
   */
  ui.refresh();

  return {
    sim,
    loop,
    saves,
    renderContext,
    renderMode,
    frames,
    ui,
    /*
     * Intents in, commands out. The overlay never builds a `Command`; it says
     * what the player did and this turns it into one, which is also the single
     * place a click becomes something the command log will replay.
     */
    commands: {
      /*
       * No refresh after dispatching. It would publish *before* the command
       * applies — commands land at the start of the next tick, deliberately, so
       * that wall-clock arrival time cannot change an outcome — and the card
       * would redraw with the state it already had. The next sample carries it,
       * within one tick plus one sample: 150 ms at worst.
       */
      prep: (orderSlot: number) => {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot });
      },
      setSpeed: (mult: 1 | 2 | 4) => {
        sim.dispatch({ t: 'SET_SPEED', mult });
      },
      buyUpgrade: (id: string) => {
        sim.dispatch({ t: 'BUY_UPGRADE', upgradeId: id });
      },
      setPrice: (itemId: string, price: number) => {
        sim.dispatch({ t: 'SET_PRICE', itemId, price });
      },
      setAudio: (channel: 'master' | 'music' | 'sfx' | 'ambience', value: number) => {
        sim.dispatch({ t: 'SET_AUDIO', channel, value });
      },
      setMuted: (muted: boolean) => {
        sim.dispatch({ t: 'SET_MUTED', muted });
      },
      setReducedMotion: (on: boolean) => {
        sim.dispatch({ t: 'SET_REDUCED_MOTION', on });
      },
      setPaused: (paused: boolean) => {
        sim.dispatch({ t: 'SET_PAUSED', paused });
      },
      setHighContrast: (on: boolean) => {
        sim.dispatch({ t: 'SET_HIGH_CONTRAST', on });
      },
      evolve: () => {
        sim.dispatch({ t: 'EVOLVE' });
      },
      place: (objectId: string, x: number, y: number) => {
        sim.dispatch({ t: 'PLACE', objectId, x, y });
      },
      removePlaced: (index: number) => {
        sim.dispatch({ t: 'REMOVE', index });
      },
      /*
       * A *query*, not an intent, and the only one on this interface.
       *
       * Build mode's ghost has to answer "would this work" before the click, and
       * the answer is the simulation's — a second opinion computed in the
       * overlay would be a second implementation of the navigation check, which
       * is precisely the class of bug where the ghost is green and the result is
       * red. It reads the world and does not change it; `previewPlacement` puts
       * the object back and restores the layout revision so no flow field is
       * invalidated by a mouse move.
       */
      previewPlacement: (objectId: string, screenX: number, screenY: number) => {
        const point = unproject(screenX, screenY);
        if (point === null) return null;

        const worldX = snapToGrid(point.x);
        const worldY = snapToGrid(point.y);
        const outcome = previewPlacement(sim.world, objectId, worldX, worldY, navigationIntact);

        const projected = { x: 0, y: 0 };
        projector(worldX, worldY, 0, projected);
        return { outcome, worldX, worldY, screenX: projected.x, screenY: projected.y };
      },
      hire: (roleId: string, skill: number) => {
        sim.dispatch({ t: 'HIRE', roleId, skill });
      },
      fire: (entityId: number) => {
        sim.dispatch({ t: 'FIRE', entityId });
      },
    },
    setProjector(next: ScreenProjector): void {
      projector = next;
      ui.refresh();
    },
    setUnprojector(next: WorldUnprojector): void {
      unprojector = next;
    },
  };
}
