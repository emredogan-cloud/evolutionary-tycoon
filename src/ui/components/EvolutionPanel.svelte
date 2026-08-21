<script lang="ts">
  import type { ProgressionView } from '@app/bridge/hudModel';

  /**
   * The next stage — its requirements, its offer, and its construction.
   *
   * Three states in one panel, because they are three moments of one thing and
   * splitting them would make the player look in a different place at each:
   *
   * 1. **Working toward it** — every requirement, with what is missing.
   * 2. **Offered** — the requirements are met and the button is live.
   * 3. **Building** — a progress bar over the twelve to thirty seconds the
   *    stand is disrupted.
   *
   * The offer waits for the player (GAME_DESIGN_DOCUMENT §25.2, decided in
   * Phase 11 from pacing data: in five runs out of five the requirements were
   * met with customers mid-transaction). So this panel is the *only* way a stage
   * transition ever starts, and it says what it will cost before it does.
   */
  interface Props {
    progression: ProgressionView;
    /** Phase 18 — collapsed to one line until the offer is live (GDD §14.1). */
    compact?: boolean;
    onevolve: () => void;
  }

  const { progression, compact = false, onevolve }: Props = $props();
  let expanded = $state(false);

  const STAGE_NAMES: Record<number, string> = {
    1: 'Yol kenarı tezgâhı',
    2: 'Yemek kamyonu',
    3: 'Küçük lokanta',
    4: 'Büyük restoran',
  };

  const LABELS: Record<string, string> = {
    cash: 'Nakit',
    served: 'Servis',
    upgrades: 'Yükseltme',
    staff: 'Personel',
    reputation: 'İtibar',
  };

  const money = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

  const next = $derived(progression.stage + 1);
  // Requirements of zero are not requirements. Stage 1 asks for no staff and no
  // reputation, and a row reading "0 / 0" is noise the player has to read past.
  const rows = $derived(progression.requirements.filter((row) => row.need > 0));
  const percent = $derived(Math.round(progression.constructionProgress * 100));
  // Rounded up, so a build in its last fraction of a second reads "1 sn" rather
  // than "0 sn" while it is visibly still going.
  const secondsLeft = $derived(Math.ceil(progression.constructionRemainingMs / 1000));
</script>

<section class="panel" aria-label="Evrim" data-testid="evolution-panel">
  <p class="eyebrow">Aşama {progression.stage} · {STAGE_NAMES[progression.stage] ?? ''}</p>

  {#if progression.constructing}
    <p class="building" data-testid="construction-status">
      İnşaat sürüyor — {STAGE_NAMES[next] ?? ''}
      <span class="left" data-testid="construction-remaining" data-seconds={String(secondsLeft)}>
        {secondsLeft} sn
      </span>
    </p>
    <div
      class="bar"
      role="progressbar"
      aria-label="Evrim ilerlemesi"
      aria-valuenow={percent}
      aria-valuemin="0"
      aria-valuemax="100"
      data-testid="construction-progress"
      data-progress={String(percent)}
    >
      <span style="width: {percent}%"></span>
    </div>
  {:else if progression.pendingStage > 0}
    <p class="ready" data-testid="evolution-ready">
      {STAGE_NAMES[progression.pendingStage] ?? ''} hazır.
    </p>
    <!-- The stand keeps trading while this sits here unanswered; the offer does
         not expire. That is the whole point of asking. -->
    <button class="evolve" type="button" data-testid="evolve-button" onclick={onevolve}> Büyüt </button>
  {:else if rows.length > 0 && compact && !expanded}
    <button
      type="button"
      class="peek"
      data-testid="evolution-peek"
      aria-expanded="false"
      onclick={() => {
        expanded = true;
      }}>Sıradaki: {STAGE_NAMES[next] ?? '—'} ▸</button
    >
  {:else if rows.length > 0}
    {#if compact}
      <button
        type="button"
        class="peek"
        data-testid="evolution-peek"
        aria-expanded="true"
        onclick={() => {
          expanded = false;
        }}>Sıradaki: {STAGE_NAMES[next] ?? '—'} ▾</button
      >
    {:else}
      <p class="eyebrow">Sıradaki: {STAGE_NAMES[next] ?? '—'}</p>
    {/if}
    <dl class="reqs">
      {#each rows as row (row.label)}
        <div class:met={row.met} data-testid="requirement" data-key={row.label}>
          <dt>{LABELS[row.label] ?? row.label}</dt>
          <dd>
            {row.label === 'cash' ? `₡${money.format(row.have)}` : money.format(row.have)}
            <span class="sep">/</span>
            {row.label === 'cash' ? `₡${money.format(row.need)}` : money.format(row.need)}
          </dd>
        </div>
      {/each}
    </dl>
  {:else}
    <p class="ready">Son aşamadasın.</p>
  {/if}
</section>

<style>
  .panel {
    position: absolute;
    top: var(--sp-4);
    right: 13.5rem;
    width: 11rem;
    padding: var(--sp-3);
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    pointer-events: auto;
    backdrop-filter: blur(6px);
  }

  .eyebrow {
    margin: 0 0 var(--sp-2);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-text-dim);
  }

  .reqs {
    margin: 0;
    display: grid;
    gap: 2px;
  }

  .reqs div {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
  }

  .reqs div.met dd {
    color: var(--c-ok);
  }

  .reqs dt {
    color: var(--c-text-dim);
  }

  .reqs dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    color: var(--c-text-dim);
  }

  .ready,
  .building {
    margin: 0 0 var(--sp-2);
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--c-accent);
  }

  .left {
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }

  .evolve {
    width: 100%;
    padding: var(--sp-2);
    background: var(--c-accent);
    border: none;
    border-radius: var(--radius-sm);
    color: #12161d;
    font-size: var(--fs-sm);
    font-weight: 700;
    cursor: pointer;
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
  .peek {
    background: none;
    border: none;
    color: var(--c-text-muted);
    font-size: var(--fs-xs);
    cursor: pointer;
    padding: var(--sp-1) 0;
    min-height: 32px;
  }
  .peek:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--radius-sm);
  }
</style>
