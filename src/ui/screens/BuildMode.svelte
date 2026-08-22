<script lang="ts">
  import type { PlacementPreview } from '@app/bridge/hudModel';

  /**
   * Putting things on the lot — GAME_EXECUTION_ROADMAP Phase 11.
   *
   * ## The rule this exists to satisfy
   *
   * _"A placement that would block navigation must be rejected with clear visual
   * feedback, not silently accepted and then break pathfinding."_
   *
   * The clearest feedback is the kind that arrives **before** the click. A red
   * ghost under the cursor tells the player the thing they are about to do will
   * not work while they can still move the mouse; a toast afterwards tells them
   * something already went wrong. So this asks the simulation for a verdict on
   * every pointer move and paints the ghost with it.
   *
   * ## Why the ghost is a div and not a sprite
   *
   * The same reason the rest of the overlay is (TECHNICAL_ARCHITECTURE §7):
   * Playwright cannot look inside a canvas. "The preview turned red over the
   * doorway" is precisely the claim an E2E test should be able to make, and a
   * ghost drawn by Phaser makes it a pixel comparison instead of a query.
   *
   * ## It holds no catalogue, and arms nothing — the stage-1 expansion pass
   *
   * It used to own a palette of three props and arm the first of them the tick
   * build mode opened, behind a pointer surface covering the whole viewport.
   * That is the reported bug in one sentence: the player bought a sign from a
   * *different* surface, clicked the world, and the prop this component had
   * been holding since it opened went down instead. Now the armed item comes
   * in as a prop from the panel that shows it, the surface exists only while
   * something is genuinely armed, and this component's whole opinion about
   * what is being placed is the id it was handed.
   *
   * ## The overlay does no geometry
   *
   * `preview` takes screen coordinates and returns the snapped world cell
   * already projected back. Nothing here converts between the two — a second
   * implementation of the isometric transform living in a component is how the
   * ghost ends up half a metre from the object.
   */

  interface Props {
    /** The catalogue id being placed, or `''` when nothing is armed. */
    armedItemId: string;
    /** Shown in the ghost, so the player can read what they are about to put down. */
    armedLabel: string;
    /** The placed row being repositioned, or -1 for a fresh purchase. */
    movingIndex: number;
    onplace: (itemId: string, worldX: number, worldY: number) => void;
    onmove: (index: number, worldX: number, worldY: number) => void;
    preview: (itemId: string, screenX: number, screenY: number) => PlacementPreview | null;
  }

  const { armedItemId, armedLabel, movingIndex, onplace, onmove, preview }: Props = $props();

  let ghost = $state<PlacementPreview | null>(null);

  const active = $derived(armedItemId !== '');

  const REASONS: Record<PlacementPreview['outcome'], string> = {
    ok: 'Buraya konabilir',
    'outside-lot': 'Arsanın dışında',
    'blocks-navigation': 'Müşterilerin yolunu kapatır',
    occupied: 'Burası dolu',
    full: 'Arsa doldu',
    'wrong-zone': 'Yol kenarına konmalı',
  };

  function track(event: PointerEvent): void {
    if (!active) return;
    ghost = preview(armedItemId, event.clientX, event.clientY);
  }

  function commit(event: PointerEvent): void {
    if (!active) return;
    const verdict = preview(armedItemId, event.clientX, event.clientY);
    ghost = verdict;
    // Refused here as well as shown above. The pointer surface is the whole
    // lot, so "the ghost was red" is not a defence against a click.
    if (verdict?.outcome !== 'ok') return;
    if (movingIndex >= 0) onmove(movingIndex, verdict.worldX, verdict.worldY);
    else onplace(armedItemId, verdict.worldX, verdict.worldY);
  }

  // Disarming clears the ghost so a stale preview cannot linger.
  $effect(() => {
    if (!active) ghost = null;
  });
</script>

<!--
  The pointer surface covers the world only while something is armed, and does
  not exist at all otherwise. A permanently-mounted transparent layer that
  merely stops listening is the kind of thing that swallows a click six months
  later for reasons nobody can find — and a layer that stays armed after a
  purchase from somewhere else is the bug this pass was opened to fix.
-->
{#if active}
  <div
    class="surface"
    data-testid="build-surface"
    data-armed={armedItemId}
    role="application"
    aria-label="Yerleştirme alanı"
    onpointermove={track}
    onpointerdown={commit}
  ></div>

  {#if ghost !== null}
    <div
      class="ghost"
      class:bad={ghost.outcome !== 'ok'}
      data-testid="build-ghost"
      data-outcome={ghost.outcome}
      data-world-x={String(ghost.worldX)}
      data-world-y={String(ghost.worldY)}
      style="left: {ghost.screenX}px; top: {ghost.screenY}px"
    >
      <span class="reason">
        {armedLabel === '' ? REASONS[ghost.outcome] : `${armedLabel} · ${REASONS[ghost.outcome]}`}
      </span>
    </div>
  {/if}
{/if}

<style>
  .surface {
    position: absolute;
    inset: 0;
    /* The overlay is `pointer-events: none` so the camera can be dragged
       through it (GameHud). Every interactive thing in it opts back in. */
    pointer-events: auto;
    /* No background at all: the point of build mode is that the player can see
       what they are building on. */
    cursor: crosshair;
    z-index: 5;
  }

  .ghost {
    position: absolute;
    z-index: 6;
    /* Anchored at the footprint centre, like every other world-anchored thing —
       the object lands where its base is, not where its middle is. */
    transform: translate(-50%, -100%);
    pointer-events: none;
    padding: 0.15rem 0.4rem;
    border: 2px solid var(--ok, #7dd87d);
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--ok, #7dd87d) 25%, transparent);
    font-size: 0.7rem;
    white-space: nowrap;
  }

  .ghost.bad {
    border-color: var(--bad, #ff8080);
    background: color-mix(in srgb, var(--bad, #ff8080) 25%, transparent);
  }

  .reason {
    color: #fff;
    text-shadow: 0 1px 2px rgb(0 0 0 / 80%);
  }
</style>
