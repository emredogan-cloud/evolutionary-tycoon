<script lang="ts">
  import { MENU, PRICE_BAND } from '@config/economy/menu';
  import type { PriceView } from '@app/bridge/hudModel';
  import { ensureLoaded, onIconsReady, styleFor } from '../lib/foodIcons';
  import { ensureSheet, frameStyle } from '../lib/atlasIcons';

  /**
   * The menu — every product, what it costs the player to sell, and what they
   * charge for it. UI_REFERENCE_AUDIT §STAGE1_PRODUCT_EXPANSION_REFERENCES,
   * `new-menü-design.png`.
   *
   * ## The card answers five questions in the reference's order
   *
   * *What is it* (art + name), *what am I charging* (the amber figure, the
   * largest thing on the card), *how does that compare* (the markup badge,
   * against the list price), *what do I keep* (the Liste/Kâr pair), and *how
   * long does it tie up the kitchen* (the preparation time). They are laid out
   * as the reference lays them out because that is the order a pricing
   * decision is actually made in — the number you are moving, then the two
   * numbers it moves.
   *
   * The markup badge is computed, never decorative: the reference's cards all
   * read `+50%` because they are all at the top of their band, and ours reads
   * whatever the price actually is against its list — negative and red below
   * it, which the reference has no example of and the game certainly does.
   *
   * ## The band is the control, and it is visible
   *
   * ECONOMY_DESIGN §4, ±50%: "tek düğmeyle stratejik derinlik", one control
   * that trades margin against conversion. The band is drawn as the slider's
   * own range, so the limit is something the player can see rather than
   * something they discover by being refused — and the simulation clamps it
   * again anyway, because this panel is not a control (exploit E2). Every
   * price shown here is a *real* price: `SET_PRICE` moves the number the
   * conversion model reads, so there is no cosmetic slider anywhere in it.
   *
   * `oninput` rather than `onchange`, so dragging updates as it moves. The
   * simulation only announces a `PRICE_CHANGED` when the value actually
   * changes, so a drag across ten pixels does not produce ten events.
   *
   * The slider runs 0–100 and the handler converts, rather than sliding over
   * the prices themselves. A slider whose domain *is* the band lays a step
   * lattice from `min` that `max` is not on — lemonade's band is 2.025–6.075
   * and no whole number of five-kuruş steps from 2.025 lands on 6.075, so the
   * player could see the top of their own band and never reach it. Worse, the
   * band's ends are not exact binary fractions, so even a step computed from
   * the band misses them. A hundred integer notches has neither problem, and
   * the price it converts to is exact at both ends.
   *
   * The −/+ buttons the reference draws beside the slider step those same
   * notches. They exist because a slider is a poor instrument for a five-kuruş
   * decision, and on a touch screen it is a poor instrument for any decision.
   *
   * ## Why the card carries the preparation time
   *
   * Because the price is only half the decision. A drink at five seconds and a
   * burger at thirty are different businesses at the same margin, and the
   * number comes from `MenuItem.prepTimeMs` — the same field the kitchen
   * counts down — rather than from anything typed here.
   */
  interface Props {
    prices: readonly PriceView[];
    /** The restaurant stage, which decides what is on the menu at all. */
    stage: number;
    onprice: (itemId: string, price: number) => void;
  }

  const { prices, stage, onprice }: Props = $props();

  const money = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  ensureLoaded();
  ensureSheet('ui');
  let iconRevision = $state(0);
  $effect(() => onIconsReady(() => (iconRevision += 1)));
  const iconFor = (itemId: string): string | null => {
    void iconRevision;
    return styleFor(itemId, 44);
  };
  /* Resolved once per sheet arrival: `{@const}` is only legal inside a block
     and this one sits in a plain element. */
  const clockIcon = $derived.by(() => {
    void iconRevision;
    return frameStyle('ui', 'ui_icon_clock@2x', 14);
  });

  const seconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} sn`;

  /** Where a price sits in its own band, as the slider's 0–100 notches. */
  const notch = (row: PriceView): number => Math.round(((row.price - row.min) / (row.max - row.min)) * 100);

  const atNotch = (row: PriceView, value: number): number =>
    row.min + (Math.max(0, Math.min(100, value)) / 100) * (row.max - row.min);

  /**
   * Every product, sellable or not, with the row the bridge sent for it.
   *
   * Items the stage has not opened are shown rather than hidden: a menu that
   * only lists what is already available cannot tell the player what growing
   * would give them, and "Aşama 3" is exactly the kind of answer the directive
   * asks a locked card to give.
   */
  const rows = $derived(
    MENU.map((item) => ({
      item,
      /*
       * The bridge publishes a row for every item at every stage — the prices
       * exist whether or not the kitchen can make the thing yet. What decides
       * whether the player may *sell* it is the item's own stage, so that is
       * what the card asks.
       */
      price: item.stage > stage ? null : (prices.find((row) => row.itemId === item.id) ?? null),
    })),
  );

  /** Whether any sellable price has been moved off its list price at all. */
  const dirty = $derived(
    rows.some((row) => row.price !== null && Math.abs(row.price.price - row.price.base) > 0.005),
  );
</script>

<section class="panel" aria-label="Menü ve fiyatlar" data-testid="price-panel">
  <ul class="cards">
    {#each rows as row (row.item.id)}
      {@const icon = iconFor(row.item.id)}
      {@const live = row.price}
      {@const margin = (live?.price ?? row.item.basePrice) - row.item.baseCost}
      {@const markup = live === null ? 0 : Math.round((live.price / live.base - 1) * 100)}
      <li
        class="card"
        class:locked={live === null}
        data-testid="product-card"
        data-item={row.item.id}
        data-status={live === null ? 'locked' : 'available'}
      >
        <span class="art" aria-hidden="true">
          {#if icon !== null}<i style={icon}></i>{/if}
        </span>

        <div class="head">
          <strong>{row.item.label}</strong>
          {#if live !== null}
            <span class="value" data-testid="price-value" data-item={row.item.id}>
              ₡{money.format(live.price)}
            </span>
          {/if}
        </div>

        {#if live === null}
          <span class="lock" data-testid="product-lock">Aşama {row.item.stage} gerekir</span>
        {:else}
          <!-- Green means "above list", so exactly-at-list is neutral rather
               than a gain of nothing painted as a gain. -->
          <span
            class="markup"
            class:down={markup < 0}
            class:flat={markup === 0}
            data-testid="price-markup"
            data-markup={String(markup)}
          >
            {#if markup !== 0}{markup > 0 ? '▲' : '▼'}{/if}
            {markup > 0 ? '+' : ''}{markup}%
          </span>

          <dl class="pair">
            <div>
              <dt>Liste</dt>
              <dd>₡{money.format(live.base)}</dd>
            </div>
            <div>
              <dt>Kâr</dt>
              <dd class:thin={margin <= 0}>₡{money.format(margin)}</dd>
            </div>
          </dl>

          <div class="stepper">
            <button
              type="button"
              class="step"
              data-testid="price-down"
              data-item={row.item.id}
              disabled={notch(live) <= 0}
              aria-label="{row.item.label} fiyatını azalt"
              onclick={() => {
                onprice(row.item.id, atNotch(live, notch(live) - 5));
              }}>−</button
            >
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={notch(live)}
              aria-label="{row.item.label} fiyatı"
              aria-valuetext="₡{money.format(live.price)}"
              data-testid="price-slider"
              data-item={row.item.id}
              data-price={live.price.toFixed(2)}
              oninput={(event) => {
                onprice(row.item.id, atNotch(live, Number.parseFloat(event.currentTarget.value)));
              }}
            />
            <button
              type="button"
              class="step"
              data-testid="price-up"
              data-item={row.item.id}
              disabled={notch(live) >= 100}
              aria-label="{row.item.label} fiyatını artır"
              onclick={() => {
                onprice(row.item.id, atNotch(live, notch(live) + 5));
              }}>+</button
            >
          </div>

          <span class="band">
            ₡{money.format(live.min)} – ₡{money.format(live.max)} aralığında (±{Math.round(
              (PRICE_BAND.max - 1) * 100,
            )}%)
          </span>
        {/if}

        <span class="prep" data-testid="product-prep">
          {#if clockIcon !== null}<i style={clockIcon} aria-hidden="true"></i>{/if}
          {seconds(row.item.prepTimeMs)}
        </span>
      </li>
    {/each}
  </ul>

  <footer>
    <button
      type="button"
      class="reset"
      data-testid="price-reset"
      disabled={!dirty}
      onclick={() => {
        for (const row of rows) {
          if (row.price !== null) onprice(row.item.id, row.price.base);
        }
      }}
    >
      ↻ Varsayılana dön
    </button>
  </footer>
</section>

<style>
  .panel {
    position: absolute;
    bottom: var(--space-4);
    left: var(--space-4);
    display: grid;
    width: 13rem;
    padding: var(--space-3);
    border: var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-glass);
    backdrop-filter: blur(6px);
    gap: var(--space-2);
    pointer-events: auto;
  }

  .cards {
    display: grid;
    margin: 0;
    padding: 0;
    gap: var(--space-2);
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    list-style: none;
  }

  .card {
    display: grid;
    align-content: start;
    padding: var(--space-2);
    border: var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-sunken);
    gap: var(--space-1) var(--space-2);
    grid-template-areas:
      'art head markup'
      'art pair pair'
      'stepper stepper stepper'
      'band band band'
      'prep prep prep';
    grid-template-columns: auto 1fr auto;
  }

  .card.locked {
    grid-template-areas:
      'art head head'
      'art lock lock'
      'prep prep prep';
    opacity: 0.55;
  }

  .art {
    display: grid;
    width: 44px;
    height: 44px;
    grid-area: art;
    place-items: center;
  }

  .head {
    display: grid;
    align-content: center;
    grid-area: head;
  }

  .head strong {
    font-size: var(--text-sm);
    line-height: 1.2;
  }

  /* The price is the largest thing on the card, as it is in the reference:
     it is the number the player came here to move. */
  .value {
    color: var(--accent);
    font-size: var(--text-lg);
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .markup {
    height: fit-content;
    padding: 1px var(--space-1);
    border: 1px solid var(--ok);
    border-radius: var(--radius-pill);
    color: var(--ok);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    grid-area: markup;
    white-space: nowrap;
  }

  .markup.down {
    border-color: var(--danger);
    color: var(--danger);
  }

  .markup.flat {
    border-color: var(--edge);
    color: var(--ink-dim);
  }

  .lock {
    color: var(--ink-dim);
    font-size: var(--text-xs);
    grid-area: lock;
  }

  .pair {
    display: flex;
    margin: 0;
    gap: var(--space-4);
    grid-area: pair;
  }

  .pair dt {
    color: var(--ink-dim);
    font-size: var(--text-xs);
    line-height: 1.2;
  }

  .pair dd {
    margin: 0;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .pair dd.thin {
    color: var(--danger);
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    grid-area: stepper;
  }

  .step {
    width: 26px;
    height: 26px;
    flex: none;
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink);
    cursor: pointer;
    font-size: var(--text-base);
    line-height: 1;
  }

  .step:disabled {
    color: var(--ink-dim);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .stepper input[type='range'] {
    width: 100%;
    min-width: 0;
    flex: 1;
    accent-color: var(--info);
  }

  .band {
    color: var(--ink-dim);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    grid-area: band;
  }

  .prep {
    display: flex;
    align-items: center;
    color: var(--info);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    gap: var(--space-1);
    grid-area: prep;
  }

  footer {
    display: flex;
    justify-content: center;
  }

  .reset {
    min-height: 30px;
    padding: 0 var(--space-3);
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    color: var(--info);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .reset:disabled {
    color: var(--ink-dim);
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
