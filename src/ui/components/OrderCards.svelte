<script lang="ts">
  import { MENU } from '@config/economy/menu';
  import type { OrderCardView } from '@app/bridge/hudModel';
  import { ensureLoaded, onIconsReady, styleFor } from '../lib/foodIcons';

  /**
   * The live orders, as cards — the manual loop's whole interface (§9 of the
   * consolidation directive). One card per order, oldest first; the states
   * are the simulation's own five and nothing here invents a sixth:
   *
   *   PLACED   → the Hazırla button (enabled when the kitchen says startable)
   *   COOKING  → a progress bar driven by the kitchen's own finish derivation
   *   ON_PASS  → "tezgâhta" — the customer collects it themselves
   *   DELIVERED→ eating; payment follows on the simulation's clock
   *
   * PAID orders leave the list in the bridge. Patience is the customer's real
   * meter; under 30% the ring turns urgent.
   */
  interface Props {
    orders: readonly OrderCardView[];
    onprep: (slot: number) => void;
  }

  const { orders, onprep }: Props = $props();

  /*
   * Names from the menu, not from a map kept here. This component and the
   * price panel each had their own; they drifted, and the price panel's had
   * three of thirteen items in it.
   */
  const labelOf = (itemId: string): string => MENU.find((item) => item.id === itemId)?.label ?? itemId;

  const STATE_LABELS: Record<string, string> = {
    PLACED: 'Bekliyor',
    COOKING: 'Hazırlanıyor',
    ON_PASS: 'Hazır',
    DELIVERED: 'Teslim edildi',
    PAID: 'Ödendi',
  };

  const money = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /** Whole seconds, rounded up: a countdown that shows 0 while still cooking reads as stuck. */
  const countdown = (ms: number): string => `${String(Math.ceil(ms / 1000))} sn`;

  ensureLoaded();
  let revision = $state(0);
  $effect(() => onIconsReady(() => (revision += 1)));
  const iconFor = (itemId: string): string | null => {
    void revision;
    return styleFor(itemId, 26);
  };
</script>

{#if orders.length > 0}
  <section class="stack" aria-label="Siparişler" data-testid="order-cards">
    {#each orders as order (order.slot)}
      <article class="card" data-testid="order-card" data-state={order.state} data-slot={String(order.slot)}>
        <div class="row">
          {#if iconFor(order.itemId) !== null}
            <span class="icon" style={iconFor(order.itemId)} aria-hidden="true"></span>
          {/if}
          <div class="meta">
            <strong>{labelOf(order.itemId)}</strong>
            <span class="state">{STATE_LABELS[order.state] ?? order.state}</span>
          </div>
          {#if order.patience01 >= 0}
            <div
              class="patience"
              class:urgent={order.patience01 < 0.3}
              role="meter"
              aria-label="Sabır"
              aria-valuenow={Math.round(order.patience01 * 100)}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span style="height: {order.patience01 * 100}%"></span>
            </div>
          {/if}
        </div>
        {#if order.state === 'PLACED'}
          <button
            type="button"
            class="prep"
            data-testid="order-prep"
            disabled={!order.startable}
            onclick={() => {
              onprep(order.slot);
            }}
          >
            {order.startable ? 'Hazırla' : 'Mutfak dolu'}
          </button>
        {:else if order.state === 'COOKING'}
          <div class="cooking">
            <div
              class="bar"
              role="progressbar"
              aria-label="Pişirme"
              aria-valuenow={Math.round(order.cook01 * 100)}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span style="width: {order.cook01 * 100}%"></span>
            </div>
            <span class="remaining" data-testid="order-remaining">
              {countdown(order.cookRemainingMs)}
            </span>
          </div>
        {:else if order.state === 'ON_PASS' || order.state === 'DELIVERED'}
          <!--
            What the order is worth, on the card, from the moment the food is
            actually ready. The directive asks for payment to stop being a
            silent background event; the world's coin popup shows it at the
            till, and this shows the player which order it came from.
          -->
          <span class="takings" data-testid="order-takings">+₡{money.format(order.price)}</span>
        {/if}
      </article>
    {/each}
  </section>
{/if}

<style>
  .stack {
    position: absolute;
    left: var(--space-3);
    top: 20%;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 12.5rem;
    pointer-events: auto;
    z-index: var(--z-hud);
  }
  .cooking {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .cooking .bar {
    flex: 1;
  }

  .remaining {
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .takings {
    display: inline-block;
    margin-top: 0.15rem;
    color: var(--positive, #7dd87d);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .card {
    padding: var(--space-2) var(--space-3);
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .meta {
    display: grid;
    flex: 1;
  }
  .meta strong {
    font-size: var(--text-sm);
  }
  .state {
    font-size: var(--text-xs);
    color: var(--ink-muted);
  }
  .patience {
    width: 6px;
    height: 30px;
    border-radius: 3px;
    background: var(--surface-sunken);
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .patience span {
    display: block;
    width: 100%;
    background: var(--ok);
    transition: height 200ms ease-out;
  }
  .patience.urgent span {
    background: var(--danger);
  }
  .prep {
    margin-top: var(--space-2);
    width: 100%;
    min-height: 34px;
    background: var(--accent);
    border: none;
    border-radius: var(--radius-sm);
    color: #12161d;
    font-weight: 700;
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .prep:disabled {
    background: var(--surface-sunken);
    color: var(--ink-dim);
    cursor: default;
  }
  .prep:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .bar {
    margin-top: var(--space-2);
    height: 5px;
    border-radius: 3px;
    background: var(--surface-sunken);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 150ms linear;
  }
  @media (max-width: 700px), (max-height: 480px) {
    .stack {
      width: 9rem;
      top: 22%;
    }
    /* One card at a time on a phone: the oldest is the actionable one, and
       the count of the rest is not worth a third of the screen. */
    .card:nth-child(n + 2) {
      display: none;
    }
  }
  @media (max-width: 380px) {
    .stack {
      width: 8rem;
    }
  }
</style>
