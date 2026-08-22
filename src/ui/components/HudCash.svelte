<script lang="ts">
  import type { PlayerLevelView } from '@app/bridge/hudModel';

  /**
   * The economy pill, top left — cash with its derivative, the player level
   * with its bar, and the compact day stats row
   * (UI_REFERENCE_AUDIT §2). The testids are load-bearing: half the E2E
   * suite reads the till through `data-cash`.
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
    level: PlayerLevelView;
    reducedMotion: boolean;
  }

  const {
    cash,
    reputation,
    customersServed,
    customersWaiting,
    gameDay,
    gameHour,
    incomePerMinute,
    level,
    reducedMotion,
  }: Props = $props();

  const money = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /*
   * The shown amount counts toward the real one over ~400 ms — money arriving
   * should be *seen* arriving (§7 of the directive: "cash must update
   * immediately", and a jump cut reads as a glitch, not an income). The real
   * value is always in `data-cash`; only the paint animates. Reduced motion
   * snaps.
   */
  let shown = $state(0);
  let raf = 0;
  $effect(() => {
    const target = cash;
    if (reducedMotion) {
      shown = target;
      return;
    }
    cancelAnimationFrame(raf);
    const from = shown;
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / 400);
      shown = from + (target - from) * (1 - (1 - t) * (1 - t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  });

  const clock = $derived(`${String(Math.floor(gameHour)).padStart(2, '0')}:00`);
  const xpInLevel = $derived(level.xp - level.levelFloor);
  const xpSpan = $derived(Math.max(1, level.nextLevelXp - level.levelFloor));
  const xpPct = $derived(Math.min(100, (xpInLevel / xpSpan) * 100));
</script>

<section class="hud" aria-label="Durum" data-testid="hud">
  <div class="line">
    <span class="chip coin" aria-hidden="true">₡</span>
    <div class="cash" data-testid="hud-cash" data-cash={cash.toFixed(2)}>
      <span class="amount">{money.format(shown)}</span>
      <span
        class="rate"
        class:negative={incomePerMinute < 0}
        data-testid="hud-income"
        data-income={incomePerMinute.toFixed(2)}
      >
        {incomePerMinute >= 0 ? '+' : ''}{money.format(incomePerMinute)}/dk
      </span>
    </div>
  </div>

  <div class="line level" data-testid="hud-level" data-level={String(level.level)}>
    <span class="chip star" aria-hidden="true">★</span>
    <span class="lvl">Seviye {level.level}</span>
    <div
      class="xp"
      role="progressbar"
      aria-label="Deneyim"
      aria-valuenow={Math.round(xpPct)}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span style="width: {xpPct}%"></span>
    </div>
    <span class="xpnum">{xpInLevel} / {xpSpan} XP</span>
  </div>

  <dl class="stats">
    <div>
      <dt>Gün</dt>
      <dd><span data-testid="hud-day">{gameDay}</span> · {clock}</dd>
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
      <dd data-testid="hud-reputation">{Math.round(reputation)}</dd>
    </div>
  </dl>
</section>

<style>
  .hud {
    position: absolute;
    top: var(--space-3);
    left: var(--space-3);
    min-width: 15rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-card);
    pointer-events: auto;
    z-index: var(--z-hud);
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .chip {
    flex: none;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-weight: 800;
    font-size: 0.8rem;
  }
  .coin {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .star {
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.9rem;
  }
  .cash {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex: 1;
  }
  .amount {
    font-size: var(--text-lg);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }
  .rate {
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--ok);
  }
  .rate.negative {
    color: var(--danger);
  }
  .level {
    margin-top: var(--space-1);
  }
  .lvl {
    font-size: var(--text-xs);
    font-weight: 700;
    white-space: nowrap;
  }
  .xp {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-sunken);
    overflow: hidden;
  }
  .xp span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    transition: width 300ms ease-out;
  }
  .xpnum {
    font-size: 0.65rem;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .stats {
    display: flex;
    gap: var(--space-4);
    margin: var(--space-2) 0 0;
    padding-top: var(--space-2);
    border-top: 1px solid var(--surface-sunken);
  }
  .stats dt {
    font-size: 0.65rem;
    color: var(--ink-dim);
  }
  .stats dd {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 700px), (max-height: 480px) {
    .stats,
    .xpnum {
      display: none;
    }
    .hud {
      min-width: 11rem;
    }
  }
  @media (max-width: 380px) {
    .hud {
      min-width: 9.5rem;
      padding: var(--space-1) var(--space-2);
    }
    .amount {
      font-size: var(--text-md);
    }
  }
</style>
