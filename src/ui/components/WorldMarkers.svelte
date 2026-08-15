<script lang="ts">
  import {
    MARKER_COIN,
    MARKER_ORDER,
    MARKER_PASS,
    MARKER_PREP,
    type WorldMarker,
  } from '@app/bridge/hudModel';
  import CoinPopup from './CoinPopup.svelte';
  import OrderBubble from './OrderBubble.svelte';
  import PassPlate from './PassPlate.svelte';
  import ProgressRing from './ProgressRing.svelte';

  /**
   * Everything anchored to a place in the world, in one absolutely-positioned
   * layer.
   *
   * ## Why the DOM and not the canvas
   *
   * Because Playwright cannot query inside a canvas, and "the customer is asking
   * for a hot dog" is exactly the sort of claim an E2E test should be able to
   * check without reading pixels. The same reasoning put the whole overlay in
   * the DOM (TECHNICAL_ARCHITECTURE §7); this is that decision applied to the
   * things that happen to sit over the world rather than in a corner of it.
   *
   * ## Already filtered
   *
   * The list arrives holding only visible markers, copied out of the bridge's
   * reused buffer by `GameHud`. It has to be copied somewhere — the bridge
   * rewrites its records in place every sample — and doing it once at the
   * boundary beats every component defending itself against it.
   */
  interface Props {
    markers: readonly WorldMarker[];
  }

  const { markers }: Props = $props();
</script>

<div class="layer" aria-hidden="true" data-testid="world-markers">
  {#each markers as marker (marker.key)}
    {#if marker.kind === MARKER_ORDER}
      <OrderBubble itemId={marker.itemId} x={marker.screenX} y={marker.screenY} />
    {:else if marker.kind === MARKER_PREP}
      <ProgressRing progress={marker.progress} x={marker.screenX} y={marker.screenY} />
    {:else if marker.kind === MARKER_PASS}
      <PassPlate itemId={marker.itemId} freshness={marker.progress} x={marker.screenX} y={marker.screenY} />
    {:else if marker.kind === MARKER_COIN}
      <CoinPopup amount={marker.amount} age={marker.age} x={marker.screenX} y={marker.screenY} />
    {/if}
  {/each}
</div>

<style>
  .layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
