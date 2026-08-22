<script lang="ts">
  import { STORE_CATEGORIES, STORE_ITEMS, DEMOLISH_REFUND_FRACTION } from '@config/store';
  import type { StoreCategory } from '@config/store';
  import { worldObject } from '@config/sprites';
  import { ensureWorldSheets, onIconsReady, worldFrameStyle } from '@ui/lib/atlasIcons';
  import type { PlacedView } from '@app/bridge/hudModel';

  /**
   * The store — what the player buys and puts on the lot themselves.
   *
   * ## Why arming lives up here and not in the placement surface
   *
   * The reported bug was two purchase surfaces sharing one screen: a card grid
   * that bought things and placed them at authored anchors, and a decor strip
   * that armed a prop of its own the moment build mode opened and then owned
   * every world click. Buy a sign, click the world, get the flower the strip
   * had been holding since it opened.
   *
   * So there is exactly one armed thing in this interface now, it starts as
   * nothing, and it is *this* component's state — the same component that
   * shows the player what they picked. `BuildMode` has no catalogue and no
   * default; it paints a ghost for whatever it is handed and reports a click.
   * A placement can no longer disagree with the card that started it, because
   * only one of them is allowed to have an opinion.
   */

  interface Props {
    cash: number;
    stage: number;
    placed: readonly PlacedView[];
    /** The armed item id, or `''`. Owned by the parent so the placement
     *  surface and this panel cannot drift apart. */
    armedItemId: string;
    /** The placed row being repositioned, or -1. */
    movingIndex: number;
    onarm: (itemId: string) => void;
    onmove: (index: number) => void;
    onsell: (index: number) => void;
  }

  const { cash, stage, placed, armedItemId, movingIndex, onarm, onmove, onsell }: Props = $props();

  const CATEGORY_LABELS: Record<StoreCategory, string> = {
    GREENERY: 'Yeşillik',
    SIGNAGE: 'Tabela',
    UTILITY: 'Donanım',
    FURNITURE: 'Mobilya',
  };

  /*
   * The card's picture is the world object itself, out of the same atlas the
   * renderer draws from — so what the card shows and what lands on the lot are
   * the same image by construction, not by a second table of icon keys that
   * can fall out of step with the catalogue.
   */
  let iconRevision = $state(0);
  ensureWorldSheets();
  onIconsReady(() => {
    iconRevision++;
  });

  const pictureOf = (objectId: string): string | null => {
    void iconRevision;
    const spec = worldObject(objectId);
    return spec === undefined ? null : worldFrameStyle(spec.frame, 44);
  };

  const money = (value: number): string => `₡${value.toFixed(2)}`;

  interface CardState {
    readonly status: 'available' | 'locked' | 'short';
    readonly reason: string;
  }

  function stateOf(itemStage: number, cost: number): CardState {
    if (itemStage > stage) return { status: 'locked', reason: `Aşama ${String(itemStage)} gerekir` };
    if (cost > cash) return { status: 'short', reason: `${money(cost - cash)} eksik` };
    return { status: 'available', reason: '' };
  }

  /** Placed rows the player actually bought — the only ones with a sell price. */
  const owned = $derived(
    placed
      .map((row, index) => ({ row, index }))
      .filter((entry) => entry.row.itemId !== '')
      .map((entry) => ({
        ...entry,
        item: STORE_ITEMS.find((candidate) => candidate.id === entry.row.itemId),
      }))
      .filter((entry) => entry.item !== undefined),
  );
</script>

<section class="store" aria-label="Dekor ve tabela mağazası" data-testid="store-panel">
  {#each STORE_CATEGORIES as category (category)}
    {@const items = STORE_ITEMS.filter((item) => item.category === category)}
    {#if items.length > 0}
      <div class="group">
        <h3>{CATEGORY_LABELS[category]}</h3>
        <ul class="cards">
          {#each items as item (item.id)}
            {@const card = stateOf(item.stage, item.cost)}
            {@const picture = pictureOf(item.objectId)}
            <li>
              <button
                type="button"
                class="card"
                class:armed={armedItemId === item.id}
                class:blocked={card.status !== 'available'}
                data-testid="store-card"
                data-item={item.id}
                data-status={card.status}
                aria-pressed={armedItemId === item.id}
                disabled={card.status === 'locked'}
                onclick={() => {
                  onarm(item.id);
                }}
              >
                <span class="art" aria-hidden="true">
                  {#if picture !== null}
                    <i style={picture}></i>
                  {/if}
                </span>
                <span class="name">{item.label}</span>
                <span class="price">{money(item.cost)}</span>
                <span class="desc">{item.description}</span>
                {#if card.reason !== ''}
                  <span class="reason" data-testid="store-lock">{card.reason}</span>
                {:else if armedItemId === item.id}
                  <span class="reason armed-hint">Yerleştirmek için tıkla</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/each}

  {#if owned.length > 0}
    <div class="group">
      <h3>Arsadakiler</h3>
      <ul class="owned" data-testid="store-owned">
        {#each owned as entry (`${entry.row.itemId}:${String(entry.row.worldX)}:${String(entry.row.worldY)}`)}
          <li class:moving={movingIndex === entry.index}>
            <span class="owned-name">{entry.item?.label}</span>
            <span class="owned-at">
              {entry.row.worldX.toFixed(1)}, {entry.row.worldY.toFixed(1)}
            </span>
            <button
              type="button"
              data-testid="store-move"
              data-index={String(entry.index)}
              aria-pressed={movingIndex === entry.index}
              onclick={() => {
                onmove(entry.index);
              }}
            >
              {movingIndex === entry.index ? 'Vazgeç' : 'Taşı'}
            </button>
            <button
              type="button"
              class="sell"
              data-testid="store-sell"
              data-index={String(entry.index)}
              onclick={() => {
                onsell(entry.index);
              }}
            >
              Sat {money((entry.item?.cost ?? 0) * DEMOLISH_REFUND_FRACTION)}
            </button>
          </li>
        {/each}
      </ul>
      <p class="note">Satışta kurulum bedelinin %30'u geri döner.</p>
    </div>
  {/if}
</section>

<style>
  .store {
    display: grid;
    gap: var(--space-3);
    max-height: 17rem;
    overflow-y: auto;
    padding-right: var(--space-1);
  }

  h3 {
    margin: 0 0 var(--space-1);
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    width: 9.5rem;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'art name'
      'art price'
      'desc desc'
      'reason reason';
    align-items: center;
    gap: 0.1rem var(--space-2);
    padding: var(--space-2);
    border: var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-raised);
    color: var(--ink);
    cursor: pointer;
    text-align: left;
  }

  .card:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .card.armed {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .art {
    display: grid;
    width: 44px;
    height: 44px;
    grid-area: art;
    place-items: center;
  }

  .art i {
    display: block;
  }

  .name {
    grid-area: name;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .price {
    grid-area: price;
    color: var(--accent);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .desc {
    grid-area: desc;
    padding-top: 0.2rem;
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    line-height: 1.25;
  }

  .reason {
    grid-area: reason;
    padding-top: 0.2rem;
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }

  .reason.armed-hint {
    color: var(--accent);
  }

  .owned {
    display: grid;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .owned li {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: var(--space-2);
    padding: 0.2rem var(--space-2);
    border-radius: var(--radius-tile);
    background: var(--surface-sunken);
    font-size: var(--text-xs);
  }

  .owned li.moving {
    outline: 2px solid var(--accent);
  }

  .owned-at {
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
  }

  .owned button {
    min-height: 1.6rem;
    padding: 0.1rem var(--space-2);
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    color: var(--ink);
    cursor: pointer;
    font-size: var(--text-xs);
  }

  .owned button.sell {
    color: var(--negative);
  }

  .note {
    margin: var(--space-1) 0 0;
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }
</style>
