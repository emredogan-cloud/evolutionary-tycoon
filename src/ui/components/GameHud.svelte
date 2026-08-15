<script lang="ts">
  import type { HudSource, WorldMarker } from '@app/bridge/hudModel';
  import HudCash from './HudCash.svelte';
  import WorldMarkers from './WorldMarkers.svelte';

  /**
   * The overlay root: everything the DOM draws above the world.
   *
   * It takes a `HudSource` — a subscribe function and nothing else. The
   * simulation is not reachable from here, structurally: `src/ui` cannot import
   * `src/sim`, and what it does import is a plain data type with no methods to
   * call back through. The only way in is a `Command`, dispatched by `src/app`.
   *
   * ## Why the values are copied out instead of held as one object
   *
   * The bridge publishes **the same object every time**, refreshed in place, so
   * that sampling ten times a second allocates nothing. Svelte's reactivity is
   * reference-based: `hud = model` with an unchanged reference invalidates
   * nothing, and a `$derived` that returns the same object does not re-run its
   * dependents. Held that way the HUD renders once at boot and then never
   * updates again — which is indistinguishable from a simulation that has
   * stopped, and is exactly what happened.
   *
   * Copying a dozen primitives per sample is the fix and it is the right trade:
   * the expensive thing was reading the world per *frame*, which the throttle
   * already prevents. Ten small copies a second is nothing.
   */
  interface Props {
    source: HudSource;
  }

  const { source }: Props = $props();

  let cash = $state(0);
  let reputation = $state(0);
  let customersServed = $state(0);
  let customersWaiting = $state(0);
  let gameDay = $state(0);
  let gameHour = $state(0);
  // A fresh array per sample, because `{#each}` needs a new reference to
  // re-key. This is the one allocation the overlay makes, and it is bounded by
  // the number of visible markers rather than by the pool size.
  let markers = $state<WorldMarker[]>([]);

  $effect(() =>
    source.subscribe((model) => {
      cash = model.cash;
      reputation = model.reputation;
      customersServed = model.customersServed;
      customersWaiting = model.customersWaiting;
      gameDay = model.gameDay;
      gameHour = model.gameHour;

      const live: WorldMarker[] = [];
      for (let i = 0; i < model.markerCount; i++) {
        const marker = model.markers[i];
        // Copied, not referenced: the bridge rewrites these records in place on
        // the next sample, so a stored reference would silently change under a
        // component that had already rendered it.
        if (marker?.visible === true) live.push({ ...marker });
      }
      markers = live;
    }),
  );
</script>

<div class="overlay" data-testid="game-hud">
  <WorldMarkers {markers} />
  <HudCash {cash} {reputation} {customersServed} {customersWaiting} {gameDay} {gameHour} />
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    /* Above the canvas, and transparent to the pointer: a click that misses a
       control has to reach the world (TECHNICAL_ARCHITECTURE §7). */
    z-index: 10;
    pointer-events: none;
    font-family: var(--font-ui);
  }
</style>
