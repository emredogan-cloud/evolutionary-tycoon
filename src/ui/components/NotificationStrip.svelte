<script lang="ts">
  /**
   * The right-edge strip — GDD §14.2. Thin, self-dismissing, stackable,
   * never modal; each line carries kind + icon + text so no state is
   * colour-only (GDD §14.9). `aria-live` is on the container and the bridge
   * already throttles what earns a line, so the reader is informed, not
   * firehosed.
   */
  interface Notice {
    readonly id: number;
    readonly kind: string;
    readonly text: string;
  }
  interface Props {
    notices: readonly Notice[];
  }
  const { notices }: Props = $props();

  const ICONS: Record<string, string> = { progress: '▲', warning: '⚠', info: 'ℹ' };
</script>

<div class="strip" aria-live="polite" data-testid="notification-strip">
  {#each notices as notice (notice.id)}
    <div class={`line ${notice.kind}`} data-kind={notice.kind}>
      <span class="icon" aria-hidden="true">{ICONS[notice.kind] ?? 'ℹ'}</span>
      <span>{notice.text}</span>
    </div>
  {/each}
</div>

<style>
  .strip {
    position: absolute;
    top: 64px;
    right: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    z-index: var(--z-notification);
    pointer-events: none;
    max-width: 280px;
  }
  .line {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-raised);
    border: var(--border);
    border-left-width: 3px;
    border-radius: var(--radius-sm);
    color: var(--ink);
    font-size: var(--text-sm);
    box-shadow: var(--shadow-card);
    animation: slide-in var(--motion-slide);
  }
  .line.warning {
    border-left-color: var(--warning);
  }
  .line.progress {
    border-left-color: var(--positive);
  }
  .line.info {
    border-left-color: var(--info);
  }
  .icon {
    flex: none;
  }
  @keyframes slide-in {
    from {
      transform: translateX(16px);
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
</style>
