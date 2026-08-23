<script lang="ts">
  import { untrack } from 'svelte';
  import { ensureSheet, frameStyle, onIconsReady } from '../lib/atlasIcons';
  import type { PlayerLevelView } from '@app/bridge/hudModel';

  /**
   * The dashboard, top left — UI_REFERENCE_AUDIT
   * §STAGE1_PRODUCT_EXPANSION_REFERENCES, `new-gösterge-desing.png`.
   *
   * Three bands, in the reference's order and for its reason: **money**, then
   * **progress**, then **today**. Each band is a different kind of fact and is
   * given a different surface — the cash sits directly on the panel, the level
   * sits in a sunken rail, and the four day figures sit under a rule in
   * ruled columns. Nothing here is new information; what changed is that the
   * three are no longer three lines of the same grey text.
   *
   * ## Labels are dimmer than their values
   *
   * That is the whole hierarchy in the reference and it was the thing most
   * comprehensively broken: `--ink-dim` named a palette step that does not
   * exist, so it resolved to the guaranteed-invalid value and every label
   * inherited plain white — measured in Chromium, `dt` and `dd` were both
   * `rgb(255,255,255)`. Fixing the token is what makes this component's type
   * scale mean anything, so the two changes belong to one pass.
   *
   * The testids are load-bearing: half the E2E suite reads the till through
   * `data-cash`, and the four day figures are asserted by name.
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

  ensureSheet('ui');
  let iconRevision = $state(0);
  $effect(() => onIconsReady(() => (iconRevision += 1)));
  const icon = (frame: string, px: number): string | null => {
    void iconRevision;
    return frameStyle('ui', `${frame}@2x`, px);
  };

  /* The three fixed frames, resolved once per sheet arrival rather than per
     render — `{@const}` is only legal inside a block, and these sit in plain
     elements. */
  const coinIcon = $derived(icon('ui_icon_coin', 34));
  const infoIcon = $derived(icon('ui_icon_info', 18));
  const starIcon = $derived(icon('ui_icon_star', 22));

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
    /*
     * `untrack`, because reading `shown` bare makes it a dependency of this
     * effect — every animation frame's write then re-entered the effect,
     * cancelled the animation and started a new one from a fresh timestamp.
     * At 60 Hz that self-chase merely wasted work; across the huge frame gaps
     * a backgrounded tab produces it compounded into the runaway figure the
     * correction pass photographed (₡ -2.5e16 painted over a ₡65 world).
     * The counter also snaps across absurd jumps: a fixture that fast-forwards
     * hours should not be watched counting for four hundred milliseconds.
     */
    const from = untrack(() => shown);
    if (!Number.isFinite(from) || Math.abs(target - from) > 100_000) {
      shown = target;
      return;
    }
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

  /*
   * The reference's `i` button, given something true to say. It explains the
   * four figures rather than hiding them — the stats strip stays rendered
   * either way, because a number the player has to open a disclosure to see
   * is not a dashboard, and because the suite reads them.
   */
  let legend = $state(false);

  /**
   * Icon, label and value for the day strip.
   *
   * The reference draws a wrench beside "Servis" and a parcel beside "İtibar",
   * which are decorative there; ours name the thing they count, out of the
   * delivered `ui_icon_*` set — a customer for customers, a star for standing.
   */
  const STATS = $derived([
    {
      key: 'day',
      frame: 'ui_icon_clock',
      label: 'Gün',
      testid: 'hud-day',
      value: String(gameDay),
      suffix: ` · ${clock}`,
      hint: 'Oyun günü ve saati.',
    },
    {
      key: 'served',
      frame: 'ui_icon_customer',
      label: 'Servis',
      testid: 'hud-served',
      value: String(customersServed),
      suffix: '',
      hint: 'Bugüne dek servis edilen müşteri.',
    },
    {
      key: 'waiting',
      frame: 'ui_icon_patience',
      label: 'Bekleyen',
      testid: 'hud-waiting',
      value: String(customersWaiting),
      suffix: '',
      hint: 'Şu an sırada bekleyen müşteri.',
    },
    {
      key: 'reputation',
      frame: 'ui_icon_star',
      label: 'İtibar',
      testid: 'hud-reputation',
      value: String(Math.round(reputation)),
      suffix: '',
      hint: 'İtibar arttıkça daha çok araç durur.',
    },
  ]);
</script>

<section class="hud" class:expanded={legend} aria-label="Durum" data-testid="hud">
  <div class="money">
    <span class="coin" aria-hidden="true">
      {#if coinIcon !== null}<i style={coinIcon}></i>{:else}₡{/if}
    </span>

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

    <button
      type="button"
      class="info"
      class:on={legend}
      data-testid="hud-legend-toggle"
      aria-expanded={legend}
      aria-label="Gösterge açıklamaları"
      onclick={() => {
        legend = !legend;
      }}
    >
      {#if infoIcon !== null}<i style={infoIcon} aria-hidden="true"></i>{:else}i{/if}
    </button>
  </div>

  <div class="rail" data-testid="hud-level" data-level={String(level.level)}>
    <span class="star" aria-hidden="true">
      {#if starIcon !== null}<i style={starIcon}></i>{:else}★{/if}
    </span>
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
    <span class="xpnum">{xpInLevel} / {xpSpan} <b>XP</b></span>
  </div>

  <dl class="stats">
    {#each STATS as stat (stat.key)}
      {@const glyph = icon(stat.frame, 20)}
      <div>
        <span class="glyph {stat.key}" aria-hidden="true">
          {#if glyph !== null}<i style={glyph}></i>{/if}
        </span>
        <dt>{stat.label}</dt>
        <dd>
          <span data-testid={stat.testid}>{stat.value}</span>{stat.suffix}
        </dd>
      </div>
    {/each}
  </dl>

  {#if legend}
    <ul class="legend" data-testid="hud-legend">
      <li><b>Kasa</b> · anlık nakit, yanında son bir dakikanın net geliri.</li>
      {#each STATS as stat (stat.key)}
        <li><b>{stat.label}</b> · {stat.hint}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .hud {
    position: absolute;
    top: var(--space-3);
    left: var(--space-3);
    z-index: var(--z-hud);
    display: grid;
    width: 20rem;
    max-width: calc(100vw - 2 * var(--space-3));
    padding: var(--space-3);
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-glass);
    box-shadow: var(--shadow-panel);
    gap: var(--space-2);
    pointer-events: auto;
  }

  /* ---- band 1: money ---- */

  .money {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .coin {
    display: grid;
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 1rem;
    font-weight: 800;
    place-items: center;
  }

  .cash {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: baseline;
    gap: var(--space-2);
  }

  .amount {
    font-size: var(--text-xl);
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .rate {
    color: var(--ok);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
  }

  .rate.negative {
    color: var(--danger);
  }

  .info {
    display: grid;
    width: 30px;
    height: 30px;
    flex: none;
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    color: var(--ink-secondary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 700;
    place-items: center;
  }

  .info.on {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* ---- band 2: the level rail ---- */

  .rail {
    display: flex;
    align-items: center;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    gap: var(--space-2);
  }

  .star {
    display: grid;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.8rem;
    place-items: center;
  }

  .lvl {
    font-size: var(--text-sm);
    font-weight: 700;
    white-space: nowrap;
  }

  .xp {
    overflow: hidden;
    height: 8px;
    flex: 1;
    border-radius: 4px;
    background: color-mix(in srgb, var(--neutral-900) 70%, transparent);
  }

  .xp span {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    transition: width var(--motion-normal);
  }

  .xpnum {
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .xpnum b {
    color: var(--info);
    font-weight: 700;
  }

  /* ---- band 3: today ---- */

  .stats {
    display: grid;
    margin: 0;
    padding-top: var(--space-2);
    border-top: var(--border);
    grid-template-columns: repeat(4, 1fr);
  }

  .stats > div {
    display: grid;
    justify-items: center;
    gap: 1px;
  }

  /* The reference rules the columns apart rather than spacing them apart, so
     the strip reads as one instrument with four dials. */
  .stats > div + div {
    border-left: var(--border);
  }

  .glyph {
    display: grid;
    width: 20px;
    height: 20px;
    place-items: center;
  }

  .stats dt {
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }

  .stats dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .legend {
    display: grid;
    margin: 0;
    padding: var(--space-2) 0 0;
    border-top: var(--border);
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    gap: 2px;
    line-height: 1.35;
    list-style: none;
  }

  .legend b {
    color: var(--ink);
  }

  /* ---- narrow ---- */

  /*
   * ---- narrow ----
   *
   * The reference is a desktop composition and the viewport budget is not a
   * preference: GDD §14.1 gives the chrome 22% of the screen and 28% on a
   * phone, and `tests/e2e/responsive.spec.ts` measures the union of everything
   * that paints. The full three-band dashboard measured **32.5%** at 360×640,
   * with this panel alone at 16.3% — so on a phone the third band folds behind
   * the `i` that was already there to explain it.
   *
   * Money and progress stay, because they are what the player is watching;
   * the day's four figures are one tap away rather than gone. Measured back
   * down to 24.3% at 360×640 (from 32.5%) and 24.7% at 667×375 (from 29.3%).
   */
  /* Between a laptop and a phone the panel narrows before it sheds anything:
     at 1024×768 the whole chrome measured 21.6% against a 22% cap, which is
     margin too thin to survive a different font metric. 16rem takes it to
     20.1% with all three bands still shown. */
  @media (max-width: 1100px) {
    .hud {
      width: 16rem;
    }
  }

  @media (max-width: 700px), (max-height: 480px) {
    .hud {
      width: 15rem;
      padding: var(--space-2);
    }
    .amount {
      font-size: var(--text-lg);
    }
    .xpnum,
    .glyph {
      display: none;
    }
    .stats {
      display: none;
    }
    .hud.expanded .stats {
      display: grid;
    }
  }

  @media (max-width: 380px) {
    .hud {
      width: 12.5rem;
    }
    .amount {
      font-size: var(--text-base);
    }
    .rate {
      font-size: var(--text-xs);
    }
    .stats dd {
      font-size: var(--text-sm);
    }
  }
</style>
