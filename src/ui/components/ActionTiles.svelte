<script lang="ts">
  /**
   * The three primary actions, bottom left — big labelled tiles, the
   * reference's İNŞA ET / DÜKKAN / PERSONEL row. Selection opens the
   * matching panel; the pressed state is the gold ring of the reference's
   * selected card.
   */
  interface Props {
    open: string | null;
    ontoggle: (panel: 'build' | 'menu' | 'staff') => void;
  }

  const { open, ontoggle }: Props = $props();
</script>

<nav class="tiles" aria-label="Birincil eylemler">
  <button
    type="button"
    class="tile"
    data-testid="dock-build"
    aria-pressed={open === 'build'}
    onclick={() => {
      ontoggle('build');
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M14.7 3.6l5.7 5.7-2.1 2.1-1.4-1.4-8.1 8.1H4v-4.8l8.1-8.1-1.4-1.4 2.1-2.1.9.9.1-.1a2 2 0 0 1 2.9 0z"
        fill="currentColor"
      /></svg
    >
    <span>İnşa Et</span>
  </button>
  <button
    type="button"
    class="tile"
    data-testid="dock-menu"
    aria-pressed={open === 'menu'}
    onclick={() => {
      ontoggle('menu');
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7.2 14.5h9.9a2 2 0 0 0 1.9-1.4L21.6 5H6.2L5.6 2.5H2v2.2h1.9l2.6 9.1a2 2 0 0 0 .7.7z"
        fill="currentColor"
      /></svg
    >
    <span>Dükkan</span>
  </button>
  <button
    type="button"
    class="tile"
    data-testid="dock-staff"
    aria-pressed={open === 'staff'}
    onclick={() => {
      ontoggle('staff');
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 5v3h16v-3c0-3.3-4.7-5-8-5z"
        fill="currentColor"
      /></svg
    >
    <span>Personel</span>
  </button>
</nav>

<style>
  .tiles {
    position: absolute;
    left: var(--space-3);
    bottom: var(--space-3);
    display: flex;
    gap: var(--space-2);
    pointer-events: auto;
    z-index: var(--z-hud);
  }
  .tile {
    min-width: 72px;
    padding: var(--space-2) var(--space-3);
    display: grid;
    justify-items: center;
    gap: 2px;
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-tile);
    color: var(--ink);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }
  .tile svg {
    width: 24px;
    height: 24px;
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
  @media (max-width: 700px) {
    .tiles {
      bottom: max(var(--space-2), env(safe-area-inset-bottom));
    }
    .tile {
      min-width: var(--touch-target);
      min-height: var(--touch-target);
      padding: var(--space-1);
    }
    .tile span {
      display: none;
    }
  }
</style>
