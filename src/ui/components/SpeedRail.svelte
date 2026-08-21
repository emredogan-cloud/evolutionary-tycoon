<script lang="ts">
  /**
   * Simulation speed, on the left edge — compact, vertical, out of the
   * traffic's way (UI_REFERENCE_AUDIT §2). Pause is the top slot because it
   * is the one a player reaches for under pressure.
   */
  interface Props {
    paused: boolean;
    speed: number;
    onpause: () => void;
    onspeed: (mult: 1 | 2 | 4) => void;
  }

  const { paused, speed, onpause, onspeed }: Props = $props();
  const SPEEDS = [1, 2, 4] as const;
</script>

<nav class="rail" aria-label="Simülasyon hızı">
  <button
    type="button"
    class="slot"
    data-testid="speed-pause"
    aria-pressed={paused}
    aria-label={paused ? 'Devam et' : 'Duraklat'}
    onclick={onpause}
  >
    {#if paused}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" /></svg
      >
    {/if}
  </button>
  {#each SPEEDS as mult (mult)}
    <button
      type="button"
      class="slot label"
      data-testid={`speed-${String(mult)}x`}
      aria-pressed={!paused && speed === mult}
      onclick={() => {
        onspeed(mult);
      }}>{mult}×</button
    >
  {/each}
</nav>

<style>
  .rail {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-card);
    pointer-events: auto;
    z-index: var(--z-hud);
  }
  .slot {
    width: var(--touch-target);
    height: var(--touch-target);
    display: grid;
    place-items: center;
    background: none;
    border: none;
    border-radius: 50%;
    color: var(--ink-muted);
    font-size: var(--text-sm);
    font-weight: 700;
    cursor: pointer;
  }
  .slot svg {
    width: 20px;
    height: 20px;
  }
  .slot[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .slot:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-height: 480px) {
    .rail {
      top: auto;
      bottom: calc(var(--touch-target) + var(--space-6));
      transform: none;
    }
  }
  @media (max-width: 700px), (max-height: 480px) {
    /* Pause stays; the multipliers wait for a bigger screen. */
    .slot.label:not([aria-pressed='true']) {
      display: none;
    }
  }
</style>
