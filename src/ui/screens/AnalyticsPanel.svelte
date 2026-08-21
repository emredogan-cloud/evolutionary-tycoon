<script lang="ts">
  /**
   * Conversion Analytics — the signature screen (GDD §14.4).
   *
   * The last hundred vehicles' decisions as a ranked bar list, then one line:
   * the biggest available gain. It states what happened; the decision stays
   * the player's. Every row is text + number + bar — never colour alone.
   */
  import { CONVERSION_REASONS } from '@config/conversion';

  interface Analytics {
    readonly sampleSize: number;
    readonly converted: number;
    readonly reasonCounts: number[];
  }
  interface Props {
    analytics: Analytics;
    onclose: () => void;
  }
  const { analytics, onclose }: Props = $props();

  const LABELS: Record<string, string> = {
    JUST_PASSING: 'Sadece geçiyorlardı',
    QUEUE_TOO_LONG: 'Kuyruk çok uzundu',
    NOT_VISIBLE: 'Tabela görünmedi',
    NO_DESIRED_ITEM: 'Menüde istedikleri yoktu',
    PRICE_TOO_HIGH: 'Fiyat yüksek geldi',
    REPUTATION_LOW: 'İtibar yetmedi',
    WRONG_TIME: 'Saati değildi',
    WEATHER: 'Hava caydırdı',
    NO_PARKING: 'Park yeri yoktu',
  };

  /** Which failure, fixed, buys the most — the one advisory line. */
  const GAIN: Record<string, string> = {
    QUEUE_TOO_LONG: 'kuyruk kapasitesi',
    NOT_VISIBLE: 'görünürlük',
    NO_DESIRED_ITEM: 'menü çeşitliliği',
    PRICE_TOO_HIGH: 'fiyat dengesi',
    REPUTATION_LOW: 'itibar',
    WRONG_TIME: 'saat dışı menü',
    WEATHER: 'hava direnci',
    NO_PARKING: 'park kapasitesi',
  };

  const rows = $derived(
    CONVERSION_REASONS.map((reason, index) => ({
      reason,
      label: LABELS[reason] ?? reason,
      count: analytics.reasonCounts[index] ?? 0,
    }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count),
  );
  const failed = $derived(rows.reduce((total, row) => total + row.count, 0));
  const top = $derived(rows.find((row) => GAIN[row.reason] !== undefined));
  const max = $derived(rows[0]?.count ?? 1);
</script>

<aside class="panel" data-testid="analytics-panel" aria-label="Dönüşüm analizi">
  <header>
    <h2>Dönüşüm Analizi</h2>
    <button type="button" class="close" data-testid="analytics-close" onclick={onclose} aria-label="Kapat"
      >×</button
    >
  </header>

  {#if analytics.sampleSize === 0}
    <p class="empty" data-testid="analytics-empty">
      Henüz karar verilmiş bir araç yok — yol biraz aksın, tablo dolacak.
    </p>
  {:else}
    <p class="summary" data-testid="analytics-summary">
      Son {analytics.sampleSize} araç · {analytics.converted} durdu ({Math.round(
        (analytics.converted / Math.max(1, analytics.sampleSize)) * 100,
      )}%)
    </p>

    {#if failed > 0}
      <h3>Neden durmadılar?</h3>
      <ul>
        {#each rows as row (row.reason)}
          <li>
            <span class="label">{row.label}</span>
            <span class="bar-track" aria-hidden="true">
              <span class="bar" style={`width:${String(Math.round((row.count / max) * 100))}%`}></span>
            </span>
            <span class="count">{row.count}</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if top !== undefined}
      <p class="gain" data-testid="analytics-gain">→ En büyük kazanç: <b>{GAIN[top.reason]}</b></p>
    {/if}
  {/if}
</aside>

<style>
  .panel {
    position: absolute;
    top: 56px;
    right: var(--space-3);
    width: min(320px, calc(100vw - 24px));
    max-height: min(60vh, 420px);
    overflow-y: auto;
    padding: var(--space-4);
    background: var(--surface-raised);
    border: var(--border);
    border-radius: var(--radius-md);
    color: var(--ink);
    box-shadow: var(--shadow-panel);
    pointer-events: auto;
    z-index: var(--z-panel);
    font-size: var(--text-sm);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
  }
  h3 {
    margin: var(--space-3) 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-secondary);
  }
  .close {
    background: none;
    border: none;
    color: var(--ink-secondary);
    font-size: var(--text-xl);
    cursor: pointer;
    min-width: var(--touch-target);
    min-height: var(--touch-target);
  }
  .close:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--radius-sm);
  }
  .summary {
    margin: var(--space-2) 0 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }
  li {
    display: grid;
    grid-template-columns: 1fr 90px 28px;
    gap: var(--space-2);
    align-items: center;
  }
  .bar-track {
    height: 8px;
    background: var(--pavement-900);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
  }
  .count {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .gain {
    margin: var(--space-4) 0 0;
    padding-top: var(--space-3);
    border-top: var(--border);
  }
  .empty {
    color: var(--ink-secondary);
  }
</style>
