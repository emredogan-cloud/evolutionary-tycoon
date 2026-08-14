<script lang="ts">
  import type { CapabilityFailure } from '@platform/capability';

  interface Props {
    failure: CapabilityFailure;
    renderer: string | null;
  }

  const { failure, renderer }: Props = $props();

  // Phaser 4 dropped the Canvas renderer, so there is no degraded mode to offer.
  // The honest thing is to say exactly what is missing and what would fix it,
  // rather than showing a black screen or a vague error.
  const reason = $derived(
    failure === 'no-webgl2'
      ? 'Tarayıcınız WebGL2 desteklemiyor veya donanım hızlandırma kapalı.'
      : 'Tarayıcınız canvas elemanı oluşturamıyor.',
  );
</script>

<main class="screen" aria-labelledby="unsupported-title">
  <div class="card">
    <div class="mark" aria-hidden="true">⚠</div>

    <h1 id="unsupported-title">Bu tarayıcıda çalıştırılamıyor</h1>

    <p class="reason">{reason}</p>

    <section class="fix">
      <h2>Deneyebilecekleriniz</h2>
      <ul>
        <li>Tarayıcı ayarlarından <strong>donanım hızlandırmayı</strong> açın.</li>
        <li>Tarayıcınızı güncel sürüme yükseltin.</li>
        <li>Güncel bir Chrome, Edge, Firefox veya Safari kullanın.</li>
      </ul>
    </section>

    <section class="matrix">
      <h2>Desteklenen sürümler</h2>
      <dl>
        <div>
          <dt>Chrome / Edge</dt>
          <dd>120+</dd>
        </div>
        <div>
          <dt>Firefox</dt>
          <dd>128+</dd>
        </div>
        <div>
          <dt>Safari</dt>
          <dd>17+</dd>
        </div>
      </dl>
    </section>

    {#if renderer !== null}
      <p class="diag">Algılanan GPU: <code>{renderer}</code></p>
    {/if}
  </div>
</main>

<style>
  .screen {
    display: grid;
    place-items: center;
    height: 100%;
    padding: var(--sp-6);
    overflow-y: auto;
  }

  .card {
    max-width: 34rem;
    width: 100%;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    padding: var(--sp-8);
  }

  .mark {
    font-size: var(--fs-2xl);
    line-height: 1;
    color: var(--c-warn);
    margin-bottom: var(--sp-4);
  }

  h1 {
    margin: 0 0 var(--sp-3);
    font-size: var(--fs-xl);
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  h2 {
    margin: 0 0 var(--sp-2);
    font-size: var(--fs-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--c-text-dim);
  }

  .reason {
    margin: 0 0 var(--sp-6);
    color: var(--c-text-muted);
  }

  .fix {
    margin-bottom: var(--sp-6);
  }

  .fix ul {
    margin: 0;
    padding-left: var(--sp-6);
    color: var(--c-text-muted);
  }

  .fix li + li {
    margin-top: var(--sp-1);
  }

  .matrix dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: var(--sp-3);
    margin: 0;
  }

  .matrix div {
    background: var(--c-surface-raised);
    border-radius: var(--radius-md);
    padding: var(--sp-3);
  }

  .matrix dt {
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
  }

  .matrix dd {
    margin: var(--sp-1) 0 0;
    font-weight: 600;
  }

  .diag {
    margin: var(--sp-6) 0 0;
    padding-top: var(--sp-4);
    border-top: 1px solid var(--c-border);
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
    overflow-wrap: anywhere;
  }

  code {
    font-family: var(--font-mono);
  }
</style>
