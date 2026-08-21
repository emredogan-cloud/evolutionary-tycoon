<script lang="ts">
  /**
   * One target — GAME_EXECUTION_ROADMAP Phase 9, "tek aktif hedef göstergesi".
   *
   * A single goal, deliberately. Six goals is a list, and a list is not
   * something a player aims at; the whole point of the indicator is to answer
   * "what am I saving for" without opening anything.
   *
   * Phase 9's objective is derived rather than authored — the cheapest upgrade
   * not yet owned, and how close the till is to it. Real objectives belong to
   * `ProgressionSystem` in Phase 11, and inventing a persistent one here would
   * be world state that has to be hashed, saved and migrated for something that
   * is about to be replaced.
   */
  interface Props {
    objective: string;
    progress: number;
  }

  const { objective, progress }: Props = $props();

  const LABELS: Record<string, string> = {
    'hand-painted-sign': 'Elle boyanmış tabela',
    'menu-board': 'Menü panosu',
    'second-prep-station': 'İkinci hazırlık istasyonu',
    'bigger-counter': 'Daha büyük tezgâh',
    'roadside-marker': 'Yol kenarı levhası',
    cooler: 'Soğutucu',
  };

  const label = $derived(LABELS[objective] ?? objective);
  const percent = $derived(Math.round(Math.min(1, Math.max(0, progress)) * 100));
</script>

{#if objective !== ''}
  <section class="panel" aria-label="Hedef" data-testid="objective-panel">
    <p class="eyebrow">Sıradaki hedef</p>
    <p class="target" data-testid="objective-target">{label}</p>
    <div
      class="bar"
      role="progressbar"
      aria-label="Hedef ilerlemesi"
      aria-valuenow={percent}
      aria-valuemin="0"
      aria-valuemax="100"
      data-testid="objective-progress"
      data-progress={String(percent)}
    >
      <span style="width: {percent}%"></span>
    </div>
  </section>
{/if}

<style>
  .panel {
    position: absolute;
    top: var(--sp-4);
    right: var(--sp-4);
    width: 12rem;
    padding: var(--sp-3);
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    pointer-events: auto;
    backdrop-filter: blur(6px);
  }

  .eyebrow {
    margin: 0;
    font-size: var(--fs-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--c-text-dim);
  }

  .target {
    margin: var(--sp-1) 0 var(--sp-2);
    font-size: var(--fs-sm);
    font-weight: 700;
    line-height: 1.2;
  }

  .bar {
    height: 4px;
    background: var(--c-surface);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--c-accent);
  }
  @media (max-height: 420px) {
    /* Landscape phones: the objective yields to the world; the goal is one
       tap away on the evolution chip. */
    section {
      display: none;
    }
  }
</style>
