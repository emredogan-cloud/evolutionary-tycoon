<script lang="ts">
  /**
   * A finished plate on the pass, with how hot it still is.
   *
   * The freshness bar is the visible half of the hold-temperature mechanic. It
   * is what makes "too many cooks, not enough waiters" a thing the player can
   * *see* going wrong rather than a number they discover afterwards in the
   * satisfaction breakdown — which is the difference between a mechanic and a
   * penalty.
   *
   * **Placeholder art**, like the order bubble: the plate is a magenta dashed
   * box with the item's name in it until Phase 4's food icons exist.
   */
  interface Props {
    itemId: string;
    freshness: number;
    x: number;
    y: number;
  }

  const { itemId, freshness, x, y }: Props = $props();

  const LABELS: Record<string, string> = {
    lemonade: 'LİMONATA',
    hotdog: 'SOSİSLİ',
    chips: 'CİPS',
  };

  const label = $derived(LABELS[itemId] ?? itemId.toUpperCase());
  const clamped = $derived(Math.min(1, Math.max(0, freshness)));

  // Green while it is worth serving, amber as it slips, red once the customer
  // will notice. The thresholds are read off the decay curve: `holdTemperature`
  // bottoms out at 40% of base, so 0.6 is genuinely bad rather than merely late.
  const tone = $derived(clamped > 0.9 ? 'hot' : clamped > 0.6 ? 'warm' : 'cold');
</script>

<div
  class="plate"
  data-testid="pass-plate"
  data-item={itemId}
  data-freshness={clamped.toFixed(2)}
  style="transform: translate3d({x}px, {y}px, 0) translate(-50%, -100%)"
>
  <span class="name">{label}</span>
  <span class="heat {tone}" style="--fill: {(clamped * 100).toFixed(1)}%"></span>
</div>

<style>
  .plate {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px 4px;
    white-space: nowrap;
    background: #16121a;
    border: 1px dashed #ff00ff;
    border-radius: var(--radius-sm);
    will-change: transform;
  }

  .name {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1;
    color: #ff00ff;
  }

  .heat {
    display: block;
    height: 3px;
    background: rgba(255, 255, 255, 0.14);
    border-radius: 2px;
    overflow: hidden;
  }

  .heat::before {
    content: '';
    display: block;
    height: 100%;
    width: var(--fill);
  }

  .heat.hot::before {
    background: var(--c-ok);
  }

  .heat.warm::before {
    background: var(--c-warn);
  }

  .heat.cold::before {
    background: var(--c-error);
  }
</style>
