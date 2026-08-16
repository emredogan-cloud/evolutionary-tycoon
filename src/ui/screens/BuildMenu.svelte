<script lang="ts">
  import type { UpgradeView } from '@app/bridge/hudModel';

  /**
   * The whole tree, for **discovery** — GAME_EXECUTION_ROADMAP Phase 13.
   *
   * _"İnşa menüsü tam liste (keşif için) ama karar hâlâ dünyada."_ The full list,
   * so a player can see what the game contains; the decision still happens in the
   * world, on the card beside the object.
   *
   * ## Why this does not have a buy button
   *
   * Because GAME_DESIGN_DOCUMENT §14.3 puts the purchase beside the thing being
   * changed, and a second place to buy would quietly become the first place — a
   * list is faster to click through than a world is to look at. So a row here
   * *points* at the object: selecting it asks the world to open that card, which
   * is the same interaction the player would have found by clicking the sign.
   *
   * ## Grouped by family, not sorted by price
   *
   * Thirty rows sorted by cost is a spreadsheet. Grouped by the five families of
   * §13.2 it is a map of the game: five things you can invest in, each with a
   * story that runs from Stage 1 to Stage 4. The families are also what a player
   * reasons in — "I have been putting everything into the kitchen" — which is the
   * sentence this screen exists to let them say.
   */

  interface Props {
    upgrades: readonly UpgradeView[];
    stage: number;
    onselect: (id: string) => void;
  }

  const { upgrades, stage, onselect }: Props = $props();

  let open = $state(false);

  const FAMILY_ORDER = ['VISIBILITY_APPEAL', 'KITCHEN', 'CAPACITY', 'DRIVE_THRU', 'STAFF'] as const;

  const FAMILY_LABELS: Record<string, string> = {
    VISIBILITY_APPEAL: 'Görünürlük & Çekicilik',
    KITCHEN: 'Mutfak',
    CAPACITY: 'Kapasite & Alan',
    DRIVE_THRU: 'Drive-thru',
    STAFF: 'Personel',
  };

  const LABELS: Record<string, string> = {
    'hand-painted-sign': 'Elle boyanmış tabela',
    'menu-board': 'Menü panosu',
    'planter-boxes': 'Saksılar ve cephe',
    'illuminated-sign': 'Işıklı tabela',
    'neon-facade': 'Neon cephe',
    'roadside-pylon': 'Yol kenarı totem',
    'second-prep-station': 'İkinci hazırlık istasyonu',
    cooler: 'Soğutucu',
    'sharper-knives': 'Keskin bıçaklar',
    'pass-heat-lamp': 'Pass ısı lambası',
    'better-ingredients': 'İyi malzeme',
    'drink-dispenser': 'İçecek dispenseri',
    'prep-automation': 'Mutfak otomasyonu',
    'pastry-oven': 'Fırın',
    'bigger-counter': 'Daha büyük tezgâh',
    'queue-barriers': 'Kuyruk bariyerleri',
    'shade-canopy': 'Gölgelik',
    'padded-benches': 'Yastıklı banklar',
    'widened-forecourt': 'Genişletilmiş ön alan',
    'covered-terrace': 'Kapalı teras',
    'second-register': 'İkinci kasa',
    'lane-extension': 'Şerit uzatma',
    'second-order-post': 'İkinci sipariş direği',
    'express-window': 'Hızlı pencere',
    'tap-to-pay': 'Temassız ödeme',
    'non-slip-shoes': 'Kaymaz ayakkabı',
    'training-programme': 'Eğitim programı',
    headsets: 'Kulaklıklar',
    'staff-room': 'Dinlenme odası',
    'shift-supervisor': 'Vardiya sorumlusu',
  };

  const money = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

  const grouped = $derived(
    FAMILY_ORDER.map((family) => ({
      family,
      /*
       * Ordered by the stage that introduces them, so a family reads top to
       * bottom as the story it is: a painted sign, then a lit one, then neon,
       * then a pylon on the roadline.
       */
      items: upgrades
        .filter((item) => item.family === family)
        .slice()
        // Explicit rather than `||`, which would also swallow a zero difference
        // and fall through to the id comparison by accident rather than by
        // intent — the same reading the type-aware lint asks for.
        .sort((a, b) => (a.stage === b.stage ? a.id.localeCompare(b.id) : a.stage - b.stage)),
    })).filter((group) => group.items.length > 0),
  );

  /** What to say about a row that cannot be bought right now. */
  function status(item: UpgradeView): string {
    if (item.level >= item.maxLevel) return 'Tamamlandı';
    if (item.stage > stage) return `Aşama ${String(item.stage)}`;
    if (item.missingPrereqs.length > 0) return 'Kilitli';
    if (!item.affordable) return `₡${money.format(Math.ceil(item.shortBy))} eksik`;
    return `₡${money.format(item.cost)}`;
  }
</script>

<section class="menu" class:open aria-label="Yükseltmeler" data-testid="build-menu">
  <button
    type="button"
    class="toggle"
    data-testid="build-menu-toggle"
    aria-expanded={open}
    onclick={() => {
      open = !open;
    }}
  >
    {open ? 'Yükseltmeleri kapat' : 'Yükseltmeler'}
  </button>

  {#if open}
    <div class="list" data-testid="build-menu-list">
      {#each grouped as group (group.family)}
        <section class="family" data-testid="build-menu-family" data-family={group.family}>
          <h3>{FAMILY_LABELS[group.family] ?? group.family}</h3>
          <ul>
            {#each group.items as item (item.id)}
              <li>
                <button
                  type="button"
                  data-testid="build-menu-item"
                  data-id={item.id}
                  data-stage={String(item.stage)}
                  data-owned={String(item.level)}
                  class:locked={item.stage > stage || item.missingPrereqs.length > 0}
                  class:owned={item.level > 0}
                  onclick={() => {
                    onselect(item.id);
                  }}
                >
                  <span class="name">{LABELS[item.id] ?? item.id}</span>
                  {#if item.level > 0}
                    <span class="level">{item.level}/{item.maxLevel}</span>
                  {/if}
                  <span class="status">{status(item)}</span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</section>

<style>
  .menu {
    display: grid;
    gap: 0.4rem;
    padding: 0.5rem;
    pointer-events: auto;
  }

  .list {
    display: grid;
    gap: 0.6rem;
    max-height: 22rem;
    overflow-y: auto;
  }

  .family h3 {
    margin: 0 0 0.2rem;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .family ul {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .family button {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
    justify-content: space-between;
    width: 100%;
    font-size: 0.75rem;
    text-align: left;
  }

  /* Dimmed rather than hidden: seeing what is coming is the point of the list. */
  .family button.locked {
    opacity: 0.45;
  }

  .family button.owned .name {
    font-weight: 600;
  }

  .level {
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }

  .status {
    opacity: 0.75;
    white-space: nowrap;
  }
</style>
