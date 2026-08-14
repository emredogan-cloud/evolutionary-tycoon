import type { SpeedMultiplier } from '@config/simulation';
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
 * infrastructure, it is a stub pretending to be one.
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

export type Command = SetSpeedCommand | SetPausedCommand;

/** A command before the simulation stamps it with the tick it lands on. */
export type CommandInput = Omit<SetSpeedCommand, 'tick'> | Omit<SetPausedCommand, 'tick'>;

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
  }
}
