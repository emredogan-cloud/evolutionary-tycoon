<script lang="ts">
  import { BUILDABLES } from '@config/buildables';
  import type { PlacedView, PlacementPreview } from '@app/bridge/hudModel';

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
   * every pointer move and paints the ghost with it, and the button is disabled
   * for exactly the cases the verdict says are impossible.
   *
   * ## Why the ghost is a div and not a sprite
   *
   * The same reason the rest of the overlay is (TECHNICAL_ARCHITECTURE §7):
   * Playwright cannot look inside a canvas. "The preview turned red over the
   * doorway" is precisely the claim an E2E test should be able to make, and a
   * ghost drawn by Phaser makes it a pixel comparison instead of a query.
   *
   * ## The overlay does no geometry
   *
   * `previewPlacement` takes screen coordinates and returns the snapped world
   * cell already projected back. Nothing here converts between the two — a
   * second implementation of the isometric transform living in a component is
   * how the ghost ends up half a metre from the object.
   */

  interface Props {
    /** Driven by the İnşa Et tile — the panel's single door since the
     *  consolidation pass; the strip no longer owns a toggle. */
    active: boolean;
    placed: readonly PlacedView[];
    onplace: (objectId: string, worldX: number, worldY: number) => void;
    onremove: (index: number) => void;
    preview: (objectId: string, screenX: number, screenY: number) => PlacementPreview | null;
  }

  const { active, placed, onplace, onremove, preview }: Props = $props();

  let selected = $state(BUILDABLES[0]?.id ?? '');
  let ghost = $state<PlacementPreview | null>(null);

  const REASONS: Record<PlacementPreview['outcome'], string> = {
    ok: 'Buraya konabilir',
    'outside-lot': 'Arsanın dışında',
    'blocks-navigation': 'Müşterilerin yolunu kapatır',
    occupied: 'Burası dolu',
    full: 'Arsa doldu',
  };

  const objectIdOf = (id: string): string =>
    BUILDABLES.find((entry) => entry.id === id)?.objectId ?? 'ph-prop-short';

  function track(event: PointerEvent): void {
    if (!active) return;
    ghost = preview(objectIdOf(selected), event.clientX, event.clientY);
  }

  function commit(event: PointerEvent): void {
    if (!active) return;
    const verdict = preview(objectIdOf(selected), event.clientX, event.clientY);
    ghost = verdict;
    // Refused here as well as disabled below. The pointer surface is the whole
    // lot, so "the button was disabled" is not a defence against a click.
    if (verdict?.outcome !== 'ok') return;
    onplace(objectIdOf(selected), verdict.worldX, verdict.worldY);
  }

  // Leaving build mode clears the ghost so a stale preview cannot linger.
  $effect(() => {
    if (!active) ghost = null;
  });
</script>

<!--
  The pointer surface covers the world while build mode is open, and does not
  exist at all while it is closed. A permanently-mounted transparent layer that
  merely stops listening is the kind of thing that swallows a click six months
  later for reasons nobody can find.
-->
{#if active}
  <div
    class="surface"
    data-testid="build-surface"
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
      <span class="reason">{REASONS[ghost.outcome]}</span>
    </div>
  {/if}
{/if}

{#if active}
  <section class="panel open" aria-label="Dekor yerleşimi" data-testid="decor-panel">
    <ul class="palette" data-testid="build-palette">
      {#each BUILDABLES as item (item.id)}
        <li>
          <button
            type="button"
            class:chosen={selected === item.id}
            data-testid="build-item"
            data-id={item.id}
            aria-pressed={selected === item.id}
            onclick={() => {
              selected = item.id;
            }}
          >
            {item.label}
          </button>
        </li>
      {/each}
    </ul>

    <ol class="placed" data-testid="build-placed">
      {#each placed as object, index (`${object.objectId}:${String(object.worldX)}:${String(object.worldY)}`)}
        <li>
          <span>{object.worldX.toFixed(1)}, {object.worldY.toFixed(1)}</span>
          <button
            type="button"
            data-testid="build-remove"
            aria-label="Kaldır"
            onclick={() => {
              onremove(index);
            }}
          >
            ×
          </button>
        </li>
      {/each}
    </ol>
  </section>
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

  .panel {
    display: grid;
    gap: 0.4rem;
    padding: var(--space-2);
    pointer-events: auto;
    /* The decor strip rides above the build panel's cards, bottom centre —
       and above its own pointer surface, which covers the whole viewport. */
    position: absolute;
    left: 50%;
    bottom: calc(var(--space-3) + 10.5rem);
    transform: translateX(-50%);
    max-width: min(48rem, calc(100vw - 20rem));
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    z-index: var(--z-panel);
  }

  .palette {
    display: flex;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .palette button.chosen {
    outline: 2px solid currentcolor;
  }

  .placed {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.7rem;
  }

  .placed li {
    display: flex;
    gap: 0.3rem;
    justify-content: space-between;
  }
</style>
