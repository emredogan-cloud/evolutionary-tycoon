<script lang="ts">
  import type { UpgradeView } from '@app/bridge/hudModel';

  /**
   * The clickable objects — the "click an object in the world" half of
   * GAME_DESIGN_DOCUMENT §14.3.
   *
   * A small button at each upgrade's anchor, over the object it belongs to. The
   * overlay is `pointer-events: none` so clicks fall through to the world; these
   * take them back, and only over the few dozen pixels where an upgradeable
   * thing is. Everything else still reaches the canvas.
   *
   * Owned upgrades keep their hotspot rather than losing it: levels 2 and 3 are
   * bought from the same place as level 1, and an object that stopped responding
   * once bought would teach the player that upgrading is a one-time thing.
   */
  interface Props {
    upgrades: readonly UpgradeView[];
    open: string | null;
    ontoggle: (id: string) => void;
  }

  const { upgrades, open, ontoggle }: Props = $props();

  const LABELS: Record<string, string> = {
    'hand-painted-sign': 'Elle boyanmış tabela',
    'menu-board': 'Menü panosu',
    'second-prep-station': 'İkinci hazırlık istasyonu',
    'bigger-counter': 'Daha büyük tezgâh',
    'roadside-marker': 'Yol kenarı levhası',
    cooler: 'Soğutucu',
  };
</script>

<div class="layer">
  {#each upgrades as upgrade (upgrade.id)}
    {#if upgrade.visible}
      <button
        class="spot"
        class:owned={upgrade.level > 0}
        class:affordable={upgrade.affordable}
        class:open={upgrade.id === open}
        type="button"
        data-testid="upgrade-hotspot"
        data-upgrade={upgrade.id}
        data-level={String(upgrade.level)}
        aria-label={LABELS[upgrade.id] ?? upgrade.id}
        style="transform: translate3d({upgrade.screenX}px, {upgrade.screenY}px, 0) translate(-50%, -50%)"
        onclick={() => {
          ontoggle(upgrade.id);
        }}
      >
        {upgrade.level > 0 ? upgrade.level : '+'}
      </button>
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

  .spot {
    position: absolute;
    top: 0;
    left: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c-surface-raised) 85%, transparent);
    border: 1px solid var(--c-border);
    border-radius: 50%;
    color: var(--c-text-dim);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
  }

  /* Affordable is the only state that draws the eye. A stand where every
     hotspot glowed would be a stand where none of them meant anything. */
  .spot.affordable {
    border-color: var(--c-accent);
    color: var(--c-accent);
    box-shadow: 0 0 0 3px rgba(255, 182, 72, 0.18);
  }

  .spot.owned {
    color: var(--c-ok);
  }

  .spot.open {
    background: var(--c-accent);
    border-color: var(--c-accent);
    color: #12161d;
  }
</style>
