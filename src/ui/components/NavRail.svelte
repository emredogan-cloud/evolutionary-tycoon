<script lang="ts">
  /**
   * Primary navigation, top right — square glass tiles with vector glyphs
   * (interface chrome is procedural by design; the painted icon set belongs
   * to cards and world art). One panel at a time; the pressed tile says which.
   */
  interface Props {
    open: string | null;
    ontoggle: (panel: 'analytics' | 'settings' | 'diagnostics') => void;
  }

  const { open, ontoggle }: Props = $props();
</script>

<nav class="nav" aria-label="Ana gezinme">
  <button
    type="button"
    class="tile"
    data-testid="dock-analytics"
    aria-pressed={open === 'analytics'}
    aria-label="Analiz"
    title="Analiz"
    onclick={() => {
      ontoggle('analytics');
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M4 20V10h3v10H4zm6.5 0V4h3v16h-3zM17 20v-7h3v7h-3z" fill="currentColor" /></svg
    >
  </button>
  <button
    type="button"
    class="tile"
    data-testid="settings-gear"
    aria-pressed={open === 'settings'}
    aria-label="Ayarlar"
    title="Ayarlar"
    onclick={() => {
      ontoggle('settings');
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm8.6 3.5c0-.5 0-1-.1-1.4l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.4-1.4L15.3 2h-4l-.4 2.6a8 8 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.6a8.6 8.6 0 0 0 0 2.8l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.4 1.4l.4 2.6h4l.4-2.6a8 8 0 0 0 2.4-1.4l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.4z"
        fill="currentColor"
      /></svg
    >
  </button>
  <button
    type="button"
    class="tile"
    data-testid="dock-diagnostics"
    aria-pressed={open === 'diagnostics'}
    aria-label="Menü"
    title="Menü"
    onclick={() => {
      ontoggle('diagnostics');
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M4 6h16v2.2H4zm0 4.9h16v2.2H4zm0 4.9h16V18H4z" fill="currentColor" /></svg
    >
  </button>
</nav>

<style>
  .nav {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    display: flex;
    gap: var(--space-2);
    pointer-events: auto;
    z-index: var(--z-hud);
  }
  .tile {
    width: var(--touch-target);
    height: var(--touch-target);
    display: grid;
    place-items: center;
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-tile);
    color: var(--ink);
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }
  .tile svg {
    width: 22px;
    height: 22px;
  }
  .tile[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }
  .tile:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
