<script lang="ts">
  import type { CapabilityReport } from '@platform/capability';
  import { buildInfo } from '@platform/buildInfo';

  interface Props {
    capabilities: CapabilityReport;
  }

  const { capabilities }: Props = $props();

  // Phase 2 has a running simulation but nothing to draw yet — the renderer
  // arrives in Phase 3. This screen proves the whole chain works: build ->
  // bundle -> deploy -> CDN -> browser -> capability probe -> DOM -> kernel.
  // It is deliberately honest about being a foundation, not a teaser.
  //
  // It shows no simulation state on purpose. `src/ui` may not import `src/sim`
  // (dependency-cruiser enforces it), and the throttled view-model bridge that
  // would carry it belongs to Phase 3. Until then the debug overlay and the E2E
  // hook are how simulation state is observed.
</script>

<main class="screen" aria-labelledby="shell-title">
  <div class="stack">
    <p class="eyebrow">Phase 2 — Simulation core</p>

    <h1 id="shell-title">Evolutionary&nbsp;Tycoon</h1>

    <p class="tagline">
      Yol kenarındaki minicik bir tezgâh. Önünden akan trafik. Ve onları durdurmanın yolu.
    </p>

    <div class="status" role="status">
      <span class="dot" aria-hidden="true"></span>
      <span>Deterministik simülasyon çekirdeği 20 Hz'de çalışıyor — dünya Faz 3'te çizilecek.</span>
    </div>

    <dl class="facts" data-testid="build-facts">
      <div>
        <dt>Sürüm</dt>
        <dd data-testid="fact-version">{buildInfo.version}</dd>
      </div>
      <div>
        <dt>Build</dt>
        <dd data-testid="fact-sha"><code>{buildInfo.buildShaShort}</code></dd>
      </div>
      <div>
        <dt>WebGL2</dt>
        <dd data-testid="fact-webgl2">Destekleniyor</dd>
      </div>
      <div>
        <dt>Maks. texture</dt>
        <dd data-testid="fact-maxtex">
          {capabilities.maxTextureSize !== null ? `${capabilities.maxTextureSize}px` : 'bilinmiyor'}
        </dd>
      </div>
    </dl>

    {#if capabilities.renderer !== null}
      <p class="diag">GPU: <code>{capabilities.renderer}</code></p>
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
    /* A faint warm glow from the top-left, matching the fixed light direction
       the whole art style will use (docs/ASSET_PIPELINE.md §1.1). */
    background: radial-gradient(120% 90% at 12% 0%, rgba(255, 182, 72, 0.08), transparent 55%), var(--c-bg);
  }

  .stack {
    max-width: 40rem;
    width: 100%;
  }

  .eyebrow {
    margin: 0 0 var(--sp-2);
    font-size: var(--fs-xs);
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--c-accent-dim);
  }

  h1 {
    margin: 0 0 var(--sp-3);
    font-size: clamp(2rem, 7vw, 3.25rem);
    line-height: 1.05;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .tagline {
    margin: 0 0 var(--sp-8);
    max-width: 32rem;
    font-size: var(--fs-lg);
    color: var(--c-text-muted);
    text-wrap: balance;
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    margin-bottom: var(--sp-6);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    color: var(--c-text-muted);
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-ok);
    box-shadow: 0 0 0 4px rgba(95, 212, 138, 0.15);
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--sp-3);
    margin: 0;
  }

  .facts div {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-md);
    padding: var(--sp-3) var(--sp-4);
  }

  .facts dt {
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
  }

  .facts dd {
    margin: var(--sp-1) 0 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .diag {
    margin: var(--sp-6) 0 0;
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
    overflow-wrap: anywhere;
  }

  code {
    font-family: var(--font-mono);
  }
</style>
