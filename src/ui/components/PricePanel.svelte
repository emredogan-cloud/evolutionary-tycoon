<script lang="ts">
  import { MENU, PRICE_BAND } from '@config/economy/menu';
  import type { PriceView } from '@app/bridge/hudModel';
  import { ensureLoaded, onIconsReady, styleFor } from '../lib/foodIcons';

  /**
   * The menu — every product, what it costs the player to sell, and what they
   * charge for it.
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
   * ## Why the card carries the preparation time
   *
   * Because the price is only half the decision. A drink at two and a half
   * seconds and a burger at nine are different businesses at the same margin,
   * and the number comes from `MenuItem.prepTimeMs` — the same field the
   * kitchen counts down — rather than from anything typed here.
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
  let iconRevision = $state(0);
  $effect(() => onIconsReady(() => (iconRevision += 1)));
  const iconFor = (itemId: string): string | null => {
    void iconRevision;
    return styleFor(itemId, 30);
  };

  const seconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} sn`;

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
</script>

<section class="panel" aria-label="Menü ve fiyatlar" data-testid="price-panel">
  <ul class="cards">
    {#each rows as row (row.item.id)}
      {@const icon = iconFor(row.item.id)}
      {@const live = row.price}
      {@const margin = (live?.price ?? row.item.basePrice) - row.item.baseCost}
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
          <span class="prep" data-testid="product-prep">{seconds(row.item.prepTimeMs)}</span>
        </div>

        {#if live === null}
          <span class="lock" data-testid="product-lock">Aşama {row.item.stage} gerekir</span>
        {:else}
          <div class="numbers">
            <span class="value" data-testid="price-value" data-item={row.item.id}>
              ₡{money.format(live.price)}
            </span>
            <span class="base">liste ₡{money.format(live.base)}</span>
            <span class="margin" class:thin={margin <= 0}>kâr ₡{money.format(margin)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(((live.price - live.min) / (live.max - live.min)) * 100)}
            aria-label="{row.item.label} fiyatı"
            aria-valuetext="₡{money.format(live.price)}"
            data-testid="price-slider"
            data-item={row.item.id}
            data-price={live.price.toFixed(2)}
            oninput={(event) => {
              const share = Number.parseFloat(event.currentTarget.value) / 100;
              onprice(row.item.id, live.min + share * (live.max - live.min));
            }}
          />
          <span class="band">
            ±{Math.round((PRICE_BAND.max - 1) * 100)}% · ₡{money.format(live.min)}–₡{money.format(live.max)}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .panel {
    position: absolute;
    left: var(--sp-4);
    bottom: var(--sp-4);
    width: 13rem;
    padding: var(--sp-3);
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    pointer-events: auto;
    backdrop-filter: blur(6px);
  }

  .cards {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'art head'
      'art numbers'
      'slider slider'
      'band band';
    align-items: center;
    gap: 0.1rem var(--space-2);
    padding: var(--space-2);
    border: var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-raised);
  }

  .card.locked {
    grid-template-areas:
      'art head'
      'art lock';
    opacity: 0.6;
  }

  .art {
    display: grid;
    width: 30px;
    height: 30px;
    grid-area: art;
    place-items: center;
  }

  .head {
    display: flex;
    grid-area: head;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .head strong {
    font-size: var(--text-sm);
  }

  .prep {
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .lock {
    grid-area: lock;
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }

  .numbers {
    display: flex;
    grid-area: numbers;
    align-items: baseline;
    gap: var(--space-2);
    font-variant-numeric: tabular-nums;
  }

  .value {
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .base,
  .margin {
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }

  .margin.thin {
    color: var(--negative);
  }

  input[type='range'] {
    width: 100%;
    grid-area: slider;
    margin-top: 0.2rem;
  }

  .band {
    grid-area: band;
    color: var(--ink-dim);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
</style>
