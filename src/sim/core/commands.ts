import { MENU, PRICE_BAND } from '@config/economy/menu';
import type { SpeedMultiplier } from '@config/simulation';
import { nextStartable, startPrep } from '../systems/KitchenSystem';
import { buyUpgrade } from '../systems/UpgradeSystem';
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

/**
 * Buy one level of an upgrade — Phase 9.
 *
 * Carries only the id. Not the cost: a command that named its own price would
 * be a command the UI could lie about, and this one is replayed from logs and
 * loaded from saves written by builds this one has never seen. The price is
 * looked up from config at the tick it lands on, which is also what makes a
 * replay of a session survive a balance change intact — it re-derives.
 */
interface BuyUpgradeCommand {
  readonly t: 'BUY_UPGRADE';
  readonly tick: number;
  readonly upgradeId: string;
}

/**
 * Move an item's price inside the ±50% band — ECONOMY_DESIGN §4.
 *
 * Clamped here rather than trusted, for the same reason `priceOf` clamps at the
 * point of sale: the band is exploit E2's only defence, and a command arriving
 * from a log written by a build with a wider band must not be able to carry a
 * price through this one.
 */
interface SetPriceCommand {
  readonly t: 'SET_PRICE';
  readonly tick: number;
  readonly itemId: string;
  readonly price: number;
}

export type Command =
  SetSpeedCommand | SetPausedCommand | ManualPrepCommand | BuyUpgradeCommand | SetPriceCommand;

/** A command before the simulation stamps it with the tick it lands on. */
export type CommandInput =
  | Omit<SetSpeedCommand, 'tick'>
  | Omit<SetPausedCommand, 'tick'>
  | Omit<ManualPrepCommand, 'tick'>
  | Omit<BuyUpgradeCommand, 'tick'>
  | Omit<SetPriceCommand, 'tick'>;

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
    case 'BUY_UPGRADE': {
      /*
       * The simulation decides, and refusing is a normal outcome. `buyUpgrade`
       * returns why — unknown id, already maxed, or not enough money — and the
       * command discards it: a command cannot report back, by construction.
       * The player learns from the card, which reads the same world state.
       */
      buyUpgrade(world, command.upgradeId);
      break;
    }
    case 'SET_PRICE': {
      /*
       * Searched rather than looked up through `menuIndexOf`, which throws. An
       * unknown item is a normal outcome here — a replayed log written when the
       * menu had an item this build does not — and exception control flow for a
       * normal outcome is how a command handler ends up able to kill a tick.
       */
      const item = MENU.find((entry) => entry.id === command.itemId);
      if (item === undefined) break;
      const clamped = Math.min(
        item.basePrice * PRICE_BAND.max,
        Math.max(item.basePrice * PRICE_BAND.min, command.price),
      );
      if (world.economy.prices.get(item.id) === clamped) break;
      world.economy.prices.set(item.id, clamped);
      world.eventQueue.emitPriceChanged(item.id, clamped);
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
    case 'BUY_UPGRADE':
      return { t: 'BUY_UPGRADE', tick, upgradeId: input.upgradeId };
    case 'SET_PRICE':
      return { t: 'SET_PRICE', tick, itemId: input.itemId, price: input.price };
  }
}
