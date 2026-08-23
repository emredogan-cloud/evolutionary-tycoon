<script lang="ts">
  import { BUILDINGS, buildingAsset, buildingCost, stageForLevel } from '@config/buildings';
  import { worldObject } from '@config/sprites';
  import { ensureWorldSheets, onIconsReady, worldFrameStyle } from '@ui/lib/atlasIcons';
  import type { PlacedView } from '@app/bridge/hudModel';

  /**
   * Mutfak & Tesisler — the functional buildings.
   *
   * The second door of the İnşa Et panel, beside the upgrade tree. The
   * distinction the directive asks for is made on the card itself: a building
   * has a **level**, the restaurant has a **stage**, and the player has a
   * **level**, and the three are never run together into one number.
   *
   * Every card offers something the simulation genuinely does. Only two of the
   * four buildings the directive named are here, and `src/config/buildings.ts`
   * carries the measurement that says why the other two would have been an
   * upgrade that reports success and changes nothing.
   */

  interface Props {
    cash: number;
    stage: number;
    playerLevel: number;
    placed: readonly PlacedView[];
    armedItemId: string;
    onarm: (itemId: string) => void;
    onupgrade: (index: number) => void;
  }

  const { cash, stage, playerLevel, placed, armedItemId, onarm, onupgrade }: Props = $props();

  let iconRevision = $state(0);
  ensureWorldSheets();
  onIconsReady(() => {
    iconRevision++;
  });

  const pictureOf = (objectId: string, px: number): string | null => {
    void iconRevision;
    const spec = worldObject(objectId);
    return spec === undefined ? null : worldFrameStyle(spec.frame, px);
  };

  const money = (value: number): string => `₡${value.toFixed(2)}`;

  /** Where each building stands, if it has been built at all. */
  const ownedOf = (id: string): { row: PlacedView; index: number } | null => {
    for (let index = 0; index < placed.length; index++) {
      const row = placed[index];
      if (row?.itemId === id) return { row, index };
    }
    return null;
  };
</script>

<section class="buildings" aria-label="Mutfak ve tesisler" data-testid="building-panel">
  <ul class="cards">
    {#each BUILDINGS as item (item.id)}
      {@const owned = ownedOf(item.id)}
      {@const level = owned?.row.level ?? 0}
      {@const nextLevel = level + 1}
      {@const maxed = level >= item.maxLevel}
      {@const needStage = stageForLevel(nextLevel)}
      {@const price = buildingCost(item, nextLevel) ?? 0}
      {@const stageLocked = !maxed && stage < Math.max(item.stageRequired, needStage)}
      {@const short = !maxed && !stageLocked && price > cash}
      {@const picture = pictureOf(buildingAsset(item, Math.max(1, level)), 46)}
      <li
        class="card"
        class:armed={armedItemId === item.id}
        data-testid="building-card"
        data-building={item.id}
        data-level={String(level)}
        data-status={maxed ? 'maxed' : stageLocked ? 'locked' : short ? 'short' : 'available'}
      >
        <span class="art" aria-hidden="true">
          {#if picture !== null}<i style={picture}></i>{/if}
        </span>

        <div class="head">
          <strong>{item.label}</strong>
          {#if level > 0}
            <span class="level" data-testid="building-level">Sv. {level}</span>
          {/if}
        </div>

        <p class="desc">{item.description}</p>

        {#if maxed}
          <span class="note">Azami seviye · Aşama {stage} · Oyuncu sv. {playerLevel}</span>
        {:else}
          <span class="note">
            {level === 0 ? 'Kur' : `Sv. ${nextLevel}`} · {money(price)}
            {#if stageLocked}
              · <span class="lock" data-testid="building-lock">Aşama {needStage} gerekir</span>
            {:else if short}
              · <span class="lock" data-testid="building-lock">{money(price - cash)} eksik</span>
            {/if}
          </span>
        {/if}

        {#if level === 0}
          <button
            type="button"
            class="action"
            data-testid="building-build"
            data-building={item.id}
            disabled={stageLocked || short}
            aria-pressed={armedItemId === item.id}
            onclick={() => {
              onarm(item.id);
            }}
          >
            {armedItemId === item.id ? 'Yer seç…' : 'Kur'}
          </button>
        {:else if !maxed}
          <button
            type="button"
            class="action"
            data-testid="building-upgrade"
            data-building={item.id}
            disabled={stageLocked || short}
            onclick={() => {
              if (owned !== null) onupgrade(owned.index);
            }}
          >
            Seviye {nextLevel}
          </button>
        {/if}
      </li>
    {/each}
  </ul>

  <p class="legend">
    Aşama {stage} · Oyuncu seviyesi {playerLevel} · bina seviyeleri ayrı ilerler.
  </p>
</section>

<style>
  .buildings {
    display: grid;
    gap: var(--space-2);
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    width: 13rem;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'art head'
      'art desc'
      'note note'
      'action action';
    align-items: center;
    gap: 0.15rem var(--space-2);
    padding: var(--space-2);
    border: var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-raised);
  }

  .card.armed {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .art {
    display: grid;
    width: 46px;
    height: 46px;
    grid-area: art;
    place-items: center;
  }

  .head {
    display: flex;
    grid-area: head;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .head strong {
    font-size: var(--text-sm);
  }

  .level {
    padding: 0 0.4rem;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--ink);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .desc {
    margin: 0;
    grid-area: desc;
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    line-height: 1.25;
  }

  .note {
    grid-area: note;
    padding-top: 0.2rem;
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }

  .lock {
    color: var(--ink-dim);
  }

  .action {
    min-height: var(--touch-target);
    grid-area: action;
    margin-top: 0.3rem;
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    color: var(--ink);
    cursor: pointer;
    font-size: var(--text-sm);
  }

  .action:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .legend {
    margin: 0;
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }
</style>
