import type { SpeedMultiplier } from '@config/simulation';
import { nextStartable, startPrep } from '../systems/KitchenSystem';
import type { World } from './World';

/**
 * Commands — the only way into the simulation.
 *
 * Every player action that can affect the world is a command, stamped with the
 * tick at which it was applied and appended to the log. That single discipline
 * buys, today: deterministic E2E, exactly reproducible bug reports, recorded
 * play sessions as test fixtures, and the Day Replay feature. Later, if a
 * leaderboard ever appears, server-side validation without an architecture change.
 *
 * The union grows one phase at a time. `BUY_UPGRADE`, `HIRE`, `SET_PRICE`,
 * `PLACE` and the rest (TECHNICAL_ARCHITECTURE §5.6) arrive with the systems
 * that give them meaning — a command whose `apply` has nothing to do is not
 * infrastructure, it is a stub pretending to be one. `MANUAL_PREP` arrived in
 * Phase 8 with the kitchen.
 */

interface SetSpeedCommand {
  readonly t: 'SET_SPEED';
  readonly tick: number;
  readonly mult: SpeedMultiplier;
}

interface SetPausedCommand {
  readonly t: 'SET_PAUSED';
  readonly tick: number;
  readonly paused: boolean;
}

/**
 * Start preparing an order — the player being the cook, in Stage 1.
 *
 * `orderSlot` of -1 means "whichever is next", which is what a click on the
 * station means; naming a slot is for tests and for the order-specific UI that
 * arrives with a bigger menu.
 *
 * **Clicking does not make it faster.** The command *starts* preparation and
 * nothing else; the finish time is derived from the start time and the config,
 * so a second click on a cooking order is a no-op. That is exploit E9 in
 * ECONOMY_DESIGN §14, and `tests/unit/sim/service/kitchen.test.ts` proves it
 * rather than trusting the shape of the code.
 */
interface ManualPrepCommand {
  readonly t: 'MANUAL_PREP';
  readonly tick: number;
  readonly orderSlot: number;
}

export type Command = SetSpeedCommand | SetPausedCommand | ManualPrepCommand;

/** A command before the simulation stamps it with the tick it lands on. */
export type CommandInput =
  Omit<SetSpeedCommand, 'tick'> | Omit<SetPausedCommand, 'tick'> | Omit<ManualPrepCommand, 'tick'>;

/**
 * Apply one command to the world.
 *
 * "Pure" in the sense that matters here: the result depends only on `(world,
 * command)`, nothing outside `world` is touched, and no wall clock, RNG source
 * or I/O is consulted. It mutates `world` in place rather than returning a new
 * one — a copy per command would allocate on a path that is budgeted at zero.
 *
 * `switch` is exhaustive (`@typescript-eslint/switch-exhaustiveness-check`), so
 * adding a command without handling it is a compile error rather than a silent
 * no-op that only shows up as a replay divergence months later.
 */
export function apply(world: World, command: Command): void {
  switch (command.t) {
    case 'SET_SPEED': {
      if (world.control.speedMultiplier !== command.mult) {
        world.control.speedMultiplier = command.mult;
        world.eventQueue.emitSpeedChanged(command.mult);
      }
      break;
    }
    case 'SET_PAUSED': {
      if (world.control.paused !== command.paused) {
        world.control.paused = command.paused;
        world.eventQueue.emitPauseChanged(command.paused);
      }
      break;
    }
    case 'MANUAL_PREP': {
      /*
       * The kitchen decides whether this is possible, and refusing is a normal
       * outcome rather than an error: every station of the right type may be
       * busy, or the order may already be cooking. A command that threw on a
       * refusal would make a mistimed click crash the game.
       */
      const target = command.orderSlot >= 0 ? command.orderSlot : nextStartable(world);
      if (target >= 0) startPrep(world, target);
      break;
    }
  }
  world.stats.commandsApplied++;
}

/** Stamp an input with the tick it is being applied on. */
export function stampCommand(input: CommandInput, tick: number): Command {
  switch (input.t) {
    case 'SET_SPEED':
      return { t: 'SET_SPEED', tick, mult: input.mult };
    case 'SET_PAUSED':
      return { t: 'SET_PAUSED', tick, paused: input.paused };
    case 'MANUAL_PREP':
      return { t: 'MANUAL_PREP', tick, orderSlot: input.orderSlot };
  }
}
