<script lang="ts">
  /**
   * Diagnostics — GDD §22: everything a bug report needs, one copy button.
   * Reads the same public surfaces the player could; no test hook required.
   */
  import { buildInfo } from '@platform/buildInfo';

  interface Props {
    gameDay: number;
    gameHour: number;
    stage: number;
    onclose: () => void;
  }
  const { gameDay, gameHour, stage, onclose }: Props = $props();

  let copied = $state(false);

  function report(): string {
    return [
      `build ${buildInfo.buildSha}`,
      `version ${buildInfo.version}`,
      `stage ${String(stage)}`,
      `day ${String(gameDay)} hour ${gameHour.toFixed(2)}`,
      `url ${window.location.href}`,
      `ua ${navigator.userAgent}`,
    ].join('\n');
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(report());
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<aside class="panel" data-testid="diagnostics-panel" aria-label="Tanılama">
  <header>
    <h2>Tanılama</h2>
    <button type="button" class="close" data-testid="diagnostics-close" onclick={onclose} aria-label="Kapat"
      >×</button
    >
  </header>
  <!--
    axe's scrollable-region-focusable requires keyboard reachability for a
    scrollable report; role="region" + label make it a named focusable
    landmark, the accepted pattern for exactly this case.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <pre data-testid="diagnostics-text" tabindex="0" role="region" aria-label="Tanılama raporu">{report()}</pre>
  <button
    type="button"
    data-testid="diagnostics-copy"
    onclick={() => {
      void copy();
    }}>{copied ? 'Kopyalandı' : 'Raporu kopyala'}</button
  >
</aside>

<style>
  .panel {
    position: absolute;
    top: 56px;
    right: var(--space-3);
    width: min(320px, calc(100vw - 24px));
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
  .close {
    background: none;
    border: none;
    color: var(--ink-secondary);
    font-size: var(--text-xl);
    cursor: pointer;
    min-width: var(--touch-target);
    min-height: var(--touch-target);
  }
  pre {
    background: var(--surface);
    border: var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    overflow-x: auto;
    font-size: var(--text-xs);
  }
  button {
    background: var(--surface);
    border: var(--border);
    color: var(--ink);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    min-height: 36px;
    cursor: pointer;
  }
  button:focus-visible,
  .close:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--radius-sm);
  }
</style>
