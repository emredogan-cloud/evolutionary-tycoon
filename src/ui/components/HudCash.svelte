<script lang="ts">
  /**
   * The cash panel — the first real connection between the simulation and the
   * DOM.
   *
   * It receives numbers, never a store and never a simulation handle. That is
   * what makes `src/ui` testable without booting a world, and it is why the
   * throttle upstream cannot be bypassed from in here: there is nothing to poll.
   *
   * Money is formatted to two decimals because Stage 1 sells things for ₡2 and
   * tips are fractions of that. Rounding to whole units would make a good tip
   * and no tip look identical, which is the one number the player is watching.
   */
  interface Props {
    cash: number;
    reputation: number;
    customersServed: number;
    customersWaiting: number;
    gameDay: number;
    gameHour: number;
    /** Net, over the last sixty seconds. Phase 9. */
    incomePerMinute: number;
  }

  const { cash, reputation, customersServed, customersWaiting, gameDay, gameHour, incomePerMinute }: Props =
    $props();

  // `tr-TR` to match the interface language. Fixed digits either side so the
  // panel does not resize every time the total crosses a power of ten — a HUD
  // that reflows while you read it is worse than one that is slightly too wide.
  const money = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /*
   * Floored, because `gameHour` is a fraction of a game day and arrives as
   * 13.799999999999999. Printed raw it read "1 · 13.799999999999999:00", which
   * is both wrong and a good demonstration of why a clock is formatted rather
   * than concatenated.
   */
  const clock = $derived(`${String(Math.floor(gameHour)).padStart(2, '0')}:00`);
</script>

<section class="hud" aria-label="Durum" data-testid="hud">
  <div class="cash" data-testid="hud-cash" data-cash={cash.toFixed(2)}>
    <span class="symbol" aria-hidden="true">₡</span>
    <span class="amount">{money.format(cash)}</span>
    <!-- The rate, beside the total. A tycoon player reads the derivative, not
         the value: "am I earning" is the question, and a total answers it only
         by being watched. -->
    <span
      class="rate"
      class:negative={incomePerMinute < 0}
      data-testid="hud-income"
      data-income={incomePerMinute.toFixed(2)}
    >
      {incomePerMinute >= 0 ? '+' : '−'}₡{money.format(Math.abs(incomePerMinute))}/dk
    </span>
  </div>

  <dl class="stats">
    <div>
      <dt>Gün</dt>
      <dd data-testid="hud-day">{gameDay + 1} · {clock}</dd>
    </div>
    <div>
      <dt>Servis</dt>
      <dd data-testid="hud-served">{customersServed}</dd>
    </div>
    <div>
      <dt>Bekleyen</dt>
      <dd data-testid="hud-waiting">{customersWaiting}</dd>
    </div>
    <div>
      <dt>İtibar</dt>
      <dd data-testid="hud-reputation">{reputation.toFixed(0)}</dd>
    </div>
  </dl>
</section>

<style>
  .hud {
    position: absolute;
    top: var(--sp-4);
    left: var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    /* The overlay is pointer-events: none so clicks reach the world; the panel
       itself takes them back because Phase 9 puts controls in here. */
    pointer-events: auto;
    backdrop-filter: blur(6px);
  }

  .cash {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    font-variant-numeric: tabular-nums;
  }

  .symbol {
    font-size: var(--fs-lg);
    color: var(--c-accent-dim);
  }

  .amount {
    font-size: var(--fs-xl);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--c-accent);
  }

  .rate {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--c-ok);
  }

  .rate.negative {
    color: var(--c-error);
  }

  .stats {
    display: flex;
    gap: var(--sp-4);
    margin: 0;
    padding-top: var(--sp-2);
    border-top: 1px solid var(--c-border);
  }

  .stats dt {
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
  }

  .stats dd {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--c-text);
  }
  @media (max-width: 700px), (max-height: 420px) {
    /* Minimum HUD (GDD §14.8): one compact line, the stat grid folds away. */
    .stats {
      display: none;
    }
  }
</style>
