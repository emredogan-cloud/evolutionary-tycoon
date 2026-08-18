<script lang="ts">
  /**
   * What a customer asked for, over their head.
   *
   * The icon comes out of the `ui` atlas as a CSS sprite (`$lib` foodIcons) —
   * production art, replacing the magenta placeholder bubble that was
   * registered in docs/PLACEHOLDER_REGISTER.md for thirteen phases. Items the
   * six-icon food set cannot truthfully depict keep a text label: the icon set
   * was planned before Phase 13 grew the menu, and a wrong icon would be the
   * placeholder problem wearing a costume. The gap is recorded in the asset
   * integration report.
   */
  import { ensureLoaded, onIconsReady, styleFor } from '../lib/foodIcons';

  interface Props {
    itemId: string;
    x: number;
    y: number;
  }

  const { itemId, x, y }: Props = $props();

  // Short labels for the items the icon set cannot depict — the bubble sits
  // over somebody's head and a wide one covers the customer behind them.
  const LABELS: Record<string, string> = {
    lemonade: 'LİMONATA',
    hotdog: 'SOSİSLİ',
    chips: 'CİPS',
    hamburger: 'BURGER',
    fries: 'PATATES',
    cola: 'KOLA',
    'breakfast-set': 'KAHVALTI',
    'chicken-meal': 'TAVUK',
    coffee: 'KAHVE',
    dessert: 'TATLI',
    salad: 'SALATA',
    'premium-burger': 'BURGER+',
    'family-meal': 'AİLE',
  };

  ensureLoaded();
  let revision = $state(0);
  $effect(() => onIconsReady(() => (revision += 1)));

  const icon = $derived.by(() => {
    void revision;
    return styleFor(itemId, 22);
  });
  const label = $derived(LABELS[itemId] ?? itemId.toUpperCase());
</script>

<div
  class="bubble"
  class:iconic={icon !== null}
  data-testid="order-bubble"
  data-item={itemId}
  style="transform: translate3d({x}px, {y}px, 0) translate(-50%, -100%)"
>
  {#if icon !== null}
    <span class="icon" style={icon} aria-label={label}></span>
  {:else}
    {label}
  {/if}
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
    color: var(--color-ink, #f2f0ea);
    background: #fdfbf6;
    border: 1px solid #43324a33;
    border-radius: var(--radius-sm);
    box-shadow: 0 1px 3px rgba(20, 22, 28, 0.35);
    color: #14161c;
    will-change: transform;
  }

  .bubble.iconic {
    padding: 3px;
    border-radius: 999px;
  }

  .icon {
    display: block;
    background-repeat: no-repeat;
  }

  .bubble::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -4px;
    width: 8px;
    height: 8px;
    transform: translateX(-50%) rotate(45deg);
    background: #fdfbf6;
    border-right: 1px solid #43324a33;
    border-bottom: 1px solid #43324a33;
  }
</style>
