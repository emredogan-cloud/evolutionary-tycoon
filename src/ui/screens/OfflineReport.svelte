<script lang="ts">
  import type { OfflineReportView } from '@app/bridge/offlineModel';

  /**
   * The "Uzaktayken" report — GAME_DESIGN_DOCUMENT §14.5, Phase 14.
   *
   * The design is explicit about what this screen is: not a reward popup but an
   * investment-decision screen. The load-bearing line is the limiter — "seni ne
   * sınırladı" — because "you earned X" teaches nothing and "parking was full,
   * 180 customers turned around" tells the player exactly what to buy next.
   *
   * One primary verb, Topla, and it is the only way out. Detay expands the
   * arithmetic; it never closes the screen, so an unclaimed report cannot be
   * lost to a stray click. Reloading instead re-shows it — the pending report
   * rides in the save until collected.
   */
  interface Props {
    report: OfflineReportView;
    oncollect: () => Promise<void>;
    onclosed: () => void;
  }

  const { report, oncollect, onclosed }: Props = $props();

  const money = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

  const LIMITER_COPY: Record<string, { line: (r: OfflineReportView) => string; hint: string }> = {
    parking: {
      line: (r) =>
        r.turnedAway > 0
          ? `Park alanı %${pct(r.limiterUtilization)} dolulukta çalıştı — ${String(r.turnedAway)} müşteri geri döndü.`
          : `Park alanı %${pct(r.limiterUtilization)} dolulukta çalıştı.`,
      hint: 'Park kapasitesi seni sınırlıyor.',
    },
    kitchen: {
      line: (r) => `Mutfak kapasiten %${pct(r.limiterUtilization)} doluluktaydı.`,
      hint: 'Yeni bir istasyon ya da daha hızlı ekipman düşün.',
    },
    tables: {
      line: (r) => `Masaların %${pct(r.limiterUtilization)} doluluktaydı.`,
      hint: 'Oturacak yer seni sınırlıyor.',
    },
    staff: {
      line: (r) => `Personelin zamanının %${pct(r.limiterUtilization)}'i doluydu.`,
      hint: 'Bir kişi daha işe almak sırayı hızlandırır.',
    },
    queue: {
      line: (r) => `Kuyruk %${pct(r.limiterUtilization)} dolulukta çalıştı.`,
      hint: 'Kuyruk taşması müşteri kaçırıyor.',
    },
    demand: {
      line: (r) =>
        `Kapasiten boş kaldı (en yoğun kaynak %${pct(r.limiterUtilization)}) — seni sınırlayan talepti.`,
      hint: 'Görünürlük ve menü çekiciliği dönüşümü artırır; tabela ailesine bak.',
    },
  };

  function pct(value: number): string {
    return String(Math.round(value * 100));
  }

  function duration(ms: number): string {
    const totalMinutes = Math.floor(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${String(minutes)} dakika`;
    if (minutes === 0) return `${String(hours)} saat`;
    return `${String(hours)} saat ${String(minutes)} dakika`;
  }

  let collecting = $state(false);
  let showDetail = $state(false);

  /**
   * The count-up — the roadmap names it, and names its exception: instant
   * under reduced motion. The *real* value is applied by the simulation when
   * Topla lands; this is presentation only, so skipping it changes nothing.
   */
  let shownNet = $state(0);
  $effect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      shownNet = report.net;
      return;
    }
    const started = performance.now();
    const durationMs = 800;
    let frame = 0;
    const step = (now: number): void => {
      const t = Math.min(1, (now - started) / durationMs);
      shownNet = report.net * (1 - (1 - t) * (1 - t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  });

  const limiter = $derived(LIMITER_COPY[report.limiter] ?? LIMITER_COPY['demand']);

  async function collect(): Promise<void> {
    if (collecting) return;
    collecting = true;
    try {
      await oncollect();
      onclosed();
    } catch {
      // The claim did not persist; leaving the button live lets the player try
      // again, and the pending report is still in the save either way.
      collecting = false;
    }
  }
</script>

<div
  class="scrim"
  role="dialog"
  aria-modal="true"
  aria-label="Uzaktayken raporu"
  data-testid="offline-report"
  data-away-ms={String(report.awayMs)}
  data-credited-ms={String(report.creditedMs)}
  data-cap-halved={String(report.capHalved)}
>
  <section class="card">
    <h2>{duration(report.awayMs)} uzaktaydın</h2>
    {#if report.creditedMs < report.awayMs}
      <p class="cap" data-testid="offline-cap-note">
        {#if report.capHalved}
          Sunucuya ulaşılamadı — bu yüzden en fazla {duration(report.creditedMs)} sayıldı.
        {:else}
          En fazla {duration(report.creditedMs)} sayılır.
        {/if}
      </p>
    {/if}

    <dl class="rows">
      <div>
        <dt>Servis edilen müşteri</dt>
        <dd data-testid="offline-served">{money.format(report.customersServed)}</dd>
      </div>
      <div>
        <dt>Gelir</dt>
        <dd data-testid="offline-gross">₡ {money.format(report.gross)}</dd>
      </div>
      <div>
        <dt>Gider (maaş + malzeme)</dt>
        <dd data-testid="offline-expenses">₡ {money.format(report.expenses)}</dd>
      </div>
      <div class="net" class:negative={report.net < 0}>
        <dt>Net</dt>
        <dd data-testid="offline-net" data-net={String(report.net)}>
          ₡ {money.format(shownNet)}
        </dd>
      </div>
    </dl>

    <p class="limiter" data-testid="offline-limiter" data-limiter={report.limiter}>
      <span class="warn" aria-hidden="true">⚠</span>
      <strong>Seni ne sınırladı:</strong>
      {limiter?.line(report) ?? ''}
      <span class="hint">{limiter?.hint ?? ''}</span>
    </p>

    {#if showDetail}
      <div class="detail" data-testid="offline-detail">
        <p>Sayılan süre: {duration(report.creditedMs)} · verim %40 · 8 saat tavan.</p>
        <p>
          Kazanç, son oynayışında ölçülen servis hızından türetilir — yokluğun simüle edilmez. Giderler sen
          yokken de işler; net eksi olabilir, kasa sıfırın altına inmez.
        </p>
      </div>
    {/if}

    <div class="actions">
      <button
        class="collect"
        type="button"
        data-testid="offline-collect"
        disabled={collecting}
        onclick={collect}
      >
        {report.net >= 0 ? 'Topla' : 'Tamam'}
      </button>
      <button
        class="detail-toggle"
        type="button"
        data-testid="offline-detail-toggle"
        onclick={() => {
          showDetail = !showDetail;
        }}
      >
        Detay
      </button>
    </div>
  </section>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c-bg) 62%, transparent);
    pointer-events: auto;
  }

  .card {
    width: min(26rem, calc(100vw - 2 * var(--sp-4)));
    padding: var(--sp-4);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.45);
  }

  h2 {
    margin: 0 0 var(--sp-2);
    font-size: var(--fs-lg);
  }

  .cap {
    margin: 0 0 var(--sp-3);
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
  }

  .rows {
    margin: 0 0 var(--sp-4);
    display: grid;
    gap: var(--sp-1);
  }

  .rows div {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    font-variant-numeric: tabular-nums;
  }

  .rows dt {
    color: var(--c-text-dim);
  }

  .rows dd {
    margin: 0;
  }

  .net {
    padding-top: var(--sp-2);
    border-top: 1px solid var(--c-border);
    font-weight: 600;
  }

  .net.negative dd {
    color: var(--c-error);
  }

  .limiter {
    margin: 0 0 var(--sp-3);
    padding: var(--sp-3);
    font-size: var(--fs-sm);
    background: color-mix(in srgb, var(--c-warn) 12%, var(--c-surface));
    border: 1px solid color-mix(in srgb, var(--c-warn) 45%, var(--c-border));
    border-radius: var(--radius-sm);
  }

  .limiter .warn {
    margin-right: var(--sp-1);
  }

  .limiter .hint {
    display: block;
    margin-top: var(--sp-1);
    color: var(--c-text-dim);
  }

  .detail {
    margin: 0 0 var(--sp-3);
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
  }

  .detail p {
    margin: 0 0 var(--sp-1);
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
  }

  .collect {
    flex: 1;
    min-height: 44px;
    padding: var(--sp-2) var(--sp-4);
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--c-bg);
    background: var(--c-accent);
    border: 0;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .collect:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .detail-toggle {
    min-height: 44px;
    padding: var(--sp-2) var(--sp-4);
    color: var(--c-text);
    background: transparent;
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
</style>
