<script lang="ts">
  import type { ProgressionView } from '@app/bridge/hudModel';

  /**
   * The objective card, top right — "what am I trying to accomplish next",
   * always answerable at a glance (§7 of the consolidation directive; the
   * reference's AŞAMA 1 · YOL KENARI checklist). The rows ARE the next
   * stage's real requirements from the progression system, live counters and
   * all; the headline objective keeps Phase 9's derived "cheapest missing
   * upgrade" as the actionable micro-goal.
   */
  interface Props {
    objective: string;
    progress: number;
    progression: ProgressionView;
  }

  const { objective, progress, progression }: Props = $props();

  const STAGE_NAMES: Record<number, string> = {
    1: 'YOL KENARI',
    2: 'YEMEK KAMYONU',
    3: 'KÜÇÜK LOKANTA',
    4: 'BÜYÜK RESTORAN',
  };
  const ROW_LABELS: Record<string, string> = {
    cash: 'Nakit biriktir',
    served: 'Servis yap',
    upgrades: 'Yükseltme al',
    staff: 'Personel çalıştır',
    reputation: 'İtibar kazan',
  };
  const LABELS: Record<string, string> = {
    'hand-painted-sign': 'Elle boyanmış tabela',
    'menu-board': 'Menü panosu',
    'planter-boxes': 'Saksılar',
    cooler: 'Soğutucu',
    'sharper-knives': 'Keskin bıçaklar',
    'illuminated-sign': 'Işıklı tabela',
    'pass-heat-lamp': 'Isı lambası',
    'better-ingredients': 'İyi malzeme',
    'second-prep-station': 'İkinci istasyon',
  };

  const rows = $derived(progression.requirements.filter((row) => row.need > 0));
  const compact = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const headline = $derived(LABELS[objective] ?? objective);
</script>

<section class="card" aria-label="Hedefler" data-testid="objective-panel">
  <p class="stage">AŞAMA {progression.stage} · {STAGE_NAMES[progression.stage] ?? ''}</p>

  {#if objective !== ''}
    <div class="goal" data-testid="objective-target">
      <span class="dot" class:done={progress >= 1} aria-hidden="true"></span>
      <span class="label">{headline}</span>
    </div>
    <div
      class="bar"
      role="progressbar"
      aria-label="Hedef ilerlemesi"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin="0"
      aria-valuemax="100"
      data-testid="objective-progress"
    >
      <span style="width: {Math.min(100, progress * 100)}%"></span>
    </div>
  {/if}

  {#if rows.length > 0}
    <ul class="reqs">
      {#each rows as row (row.label)}
        <li class:done={row.met} data-testid="objective-req" data-key={row.label}>
          <span class="tick" aria-hidden="true">
            {#if row.met}
              <svg viewBox="0 0 24 24"
                ><path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" /></svg
              >
            {/if}
          </span>
          <span class="label">{ROW_LABELS[row.label] ?? row.label}</span>
          <span class="count">{compact.format(row.have)} / {compact.format(row.need)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .card {
    position: absolute;
    top: calc(var(--space-3) + var(--touch-target) + var(--space-3));
    right: var(--space-3);
    width: 14rem;
    padding: var(--space-3);
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    pointer-events: auto;
    z-index: var(--z-hud);
  }
  .stage {
    margin: 0 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--accent);
  }
  .goal {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  .dot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 2px solid var(--ink-dim);
  }
  .dot.done {
    background: var(--ok);
    border-color: var(--ok);
  }
  .bar {
    margin-top: var(--space-2);
    height: 4px;
    border-radius: 2px;
    background: var(--surface-sunken);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .reqs {
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: var(--space-1);
  }
  .reqs li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-muted);
  }
  .reqs li.done {
    color: var(--ink-dim);
  }
  .reqs li.done .count {
    color: var(--ok);
  }
  .tick {
    flex: none;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    border: 1.5px solid var(--ink-dim);
    display: grid;
    place-items: center;
  }
  li.done .tick {
    border-color: var(--ok);
    color: var(--ok);
  }
  .tick svg {
    width: 9px;
    height: 9px;
  }
  .label {
    flex: 1;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 900px), (max-height: 500px) {
    .card {
      width: 11.5rem;
      padding: var(--space-2);
    }
    .reqs {
      display: none;
    }
  }
</style>
