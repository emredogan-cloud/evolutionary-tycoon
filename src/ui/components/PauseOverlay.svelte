<script lang="ts">
  /**
   * Pause — a dimmed veil, not a modal wall (the world stays visible under
   * it, GDD §14.2). Space toggles it; the button is for touch.
   */
  interface Props {
    paused: boolean;
    ontoggle: () => void;
  }
  const { paused, ontoggle }: Props = $props();
</script>

{#if paused}
  <div class="veil" data-testid="pause-overlay">
    <div class="card" role="status">
      <span class="icon" aria-hidden="true">⏸</span>
      <p>Duraklatıldı</p>
      <button type="button" data-testid="resume" onclick={ontoggle}>Devam et (Boşluk)</button>
    </div>
  </div>
{/if}

<style>
  .veil {
    position: absolute;
    inset: 0;
    background: var(--surface-overlay);
    display: grid;
    place-items: center;
    z-index: var(--z-pause);
    pointer-events: auto;
  }
  .card {
    text-align: center;
    color: var(--ink);
    background: var(--surface-raised);
    border: var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-6);
    box-shadow: var(--shadow-panel);
  }
  .icon {
    font-size: 28px;
  }
  p {
    margin: var(--space-2) 0 var(--space-4);
    font-size: var(--text-lg);
  }
  button {
    background: var(--accent);
    color: var(--ink-inverse);
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    min-height: var(--touch-target);
    font-size: var(--text-base);
    cursor: pointer;
  }
  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
