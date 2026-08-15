<script lang="ts">
  /**
   * What a customer asked for, over their head.
   *
   * **Placeholder art.** The food icons are Phase 4 assets that do not exist
   * yet, so this draws the item's name in a magenta-outlined bubble instead. It
   * is registered in docs/PLACEHOLDER_REGISTER.md and it is deliberately ugly:
   * a placeholder that looks acceptable is the dangerous kind, because it ships.
   */
  interface Props {
    itemId: string;
    x: number;
    y: number;
  }

  const { itemId, x, y }: Props = $props();

  // Short labels, because the bubble sits over somebody's head and a wide one
  // covers the customer behind them.
  const LABELS: Record<string, string> = {
    lemonade: 'LİMONATA',
    hotdog: 'SOSİSLİ',
    chips: 'CİPS',
  };

  const label = $derived(LABELS[itemId] ?? itemId.toUpperCase());
</script>

<div
  class="bubble"
  data-testid="order-bubble"
  data-item={itemId}
  style="transform: translate3d({x}px, {y}px, 0) translate(-50%, -100%)"
>
  {label}
</div>

<style>
  .bubble {
    position: absolute;
    top: 0;
    left: 0;
    padding: 2px 6px;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.2;
    color: #ff00ff;
    background: #16121a;
    /* Magenta, dashed, unmistakably provisional. */
    border: 1px dashed #ff00ff;
    border-radius: var(--radius-sm);
    will-change: transform;
  }

  .bubble::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    width: 0;
    height: 0;
    margin-left: -3px;
    border-left: 3px solid transparent;
    border-right: 3px solid transparent;
    border-top: 4px solid #ff00ff;
  }
</style>
