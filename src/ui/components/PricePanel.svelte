<script lang="ts">
  import type { PriceView } from '@app/bridge/hudModel';

  /**
   * The price slider — ECONOMY_DESIGN §4, ±50%.
   *
   * "Tek düğmeyle stratejik derinlik": one control that trades margin against
   * conversion. The band is drawn as the slider's own range, so the limit is
   * something the player can see rather than something they discover by being
   * refused — and the simulation clamps it again anyway, because this panel is
   * not a control (exploit E2).
   *
   * `oninput` rather than `onchange`, so dragging updates as it moves. The
   * simulation only announces a `PRICE_CHANGED` when the value actually changes,
   * so a drag across ten pixels does not produce ten events.
   */
  interface Props {
    prices: readonly PriceView[];
    onprice: (itemId: string, price: number) => void;
  }

  const { prices, onprice }: Props = $props();

  const LABELS: Record<string, string> = {
    lemonade: 'Limonata',
    hotdog: 'Sosisli',
    chips: 'Cips',
  };

  const money = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
</script>

<section class="panel" aria-label="Fiyatlar" data-testid="price-panel">
  <h2>Fiyatlar</h2>
  {#each prices as item (item.itemId)}
    <label>
      <span class="name">{LABELS[item.itemId] ?? item.itemId}</span>
      <span class="value" data-testid="price-value" data-item={item.itemId}>
        ₡{money.format(item.price)}
      </span>
      <input
        type="range"
        min={item.min}
        max={item.max}
        step="0.05"
        value={item.price}
        data-testid="price-slider"
        data-item={item.itemId}
        oninput={(event) => {
          onprice(item.itemId, Number.parseFloat(event.currentTarget.value));
        }}
      />
    </label>
  {/each}
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

  h2 {
    margin: 0 0 var(--sp-2);
    font-size: var(--fs-xs);
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--c-text-dim);
  }

  label {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 0 var(--sp-2);
    margin-bottom: var(--sp-2);
  }

  .name {
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
  }

  .value {
    font-size: var(--fs-xs);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--c-accent);
  }

  input {
    grid-column: 1 / -1;
    width: 100%;
    margin-top: 2px;
    accent-color: var(--c-accent);
  }
</style>
