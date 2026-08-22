<script lang="ts">
  import type { UpgradeView } from '@app/bridge/hudModel';
  import { ensureSheet, frameStyle, onIconsReady } from '../lib/atlasIcons';

  /**
   * The contextual build panel, bottom centre — the reference's structure
   * cards, replacing the "+" hotspot model outright (§8 of the consolidation
   * directive). Every card is an upgrade rung of the real tree: painted icon,
   * name, price — and locked cards stay VISIBLE with the exact reason
   * (stage / prerequisite / player level / cash), which is the anticipation
   * the directive asks for. Selecting a card opens the detailed UpgradeCard;
   * buying happens there, against the simulation's own verdict.
   */
  interface Props {
    upgrades: readonly UpgradeView[];
    stage: number;
    playerLevel: number;
    onselect: (id: string) => void;
  }

  const { upgrades, stage, playerLevel, onselect }: Props = $props();

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
    'staff-room': 'Personel odası',
    'training-program': 'Eğitim programı',
    'comfortable-shoes': 'Rahat ayakkabılar',
    'kitchen-headsets': 'Mutfak kulaklıkları',
    'shift-supervisor': 'Vardiya şefi',
    'order-post': 'Sipariş direği',
    'lane-markings': 'Şerit çizgileri',
    'second-window': 'İkinci pencere',
    'tap-to-pay': 'Temassız ödeme',
    'crate-storage': 'Kasa deposu',
    register: 'Yazar kasa',
  };

  ensureSheet('ui2');
  let revision = $state(0);
  $effect(() => onIconsReady(() => (revision += 1)));
  const iconFor = (item: UpgradeView): string | null => {
    void revision;
    return frameStyle('ui2', iconKeyOf(item.id), 44);
  };
  /** iconKey mirrors the config's canonical `ui_upgrade_<slug>@2x` names. */
  const iconKeyOf = (id: string): string => ICON_KEYS[id] ?? '';
  const ICON_KEYS: Record<string, string> = {
    'hand-painted-sign': 'ui_upgrade_sign-painted@2x',
    'menu-board': 'ui_upgrade_menuboard@2x',
    'planter-boxes': 'ui_upgrade_planter@2x',
    'illuminated-sign': 'ui_upgrade_sign-lit@2x',
    'neon-facade': 'ui_upgrade_neon@2x',
    'roadside-pylon': 'ui_upgrade_pylon@2x',
    'second-prep-station': 'ui_upgrade_prep-station@2x',
    cooler: 'ui_upgrade_cooler@2x',
    'sharper-knives': 'ui_upgrade_knives@2x',
    'pass-heat-lamp': 'ui_upgrade_heatlamp@2x',
    'better-ingredients': 'ui_upgrade_badge@2x',
    'drink-dispenser': 'ui_upgrade_dispenser@2x',
    'prep-automation': 'ui_upgrade_automation@2x',
    'pastry-oven': 'ui_upgrade_oven@2x',
    'bigger-counter': 'ui_upgrade_counter-wide@2x',
    'queue-barriers': 'ui_upgrade_barrier@2x',
    'shade-canopy': 'ui_upgrade_canopy@2x',
    'padded-benches': 'ui_upgrade_bench@2x',
    'widened-forecourt': 'ui_upgrade_forecourt@2x',
    'staff-room': 'ui_upgrade_staffroom@2x',
    'training-program': 'ui_upgrade_badge@2x',
    'comfortable-shoes': 'ui_upgrade_shoes@2x',
    'kitchen-headsets': 'ui_upgrade_headset@2x',
    'shift-supervisor': 'ui_upgrade_supervisor@2x',
    'order-post': 'ui_upgrade_orderpost@2x',
    'lane-markings': 'ui_upgrade_lane@2x',
    'second-window': 'ui_upgrade_window@2x',
    'tap-to-pay': 'ui_upgrade_reader@2x',
    'crate-storage': 'ui_upgrade_crates@2x',
    register: 'ui_upgrade_register@2x',
  };

  const money = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

  const FAMILY_ORDER = ['VISIBILITY_APPEAL', 'KITCHEN', 'CAPACITY', 'STAFF', 'DRIVE_THRU'] as const;
  const FAMILY_LABELS: Record<string, string> = {
    VISIBILITY_APPEAL: 'Görünürlük & Çekicilik',
    KITCHEN: 'Mutfak',
    CAPACITY: 'Kapasite & Alan',
    STAFF: 'Personel',
    DRIVE_THRU: 'Drive-thru',
  };
  /**
   * Every family, every rung — the whole tree, on purpose (§23: locked
   * content is shown with its reason; hiding the future kills anticipation).
   * Maxed rungs stay too, as owned trophies with their level chip.
   */
  const families = $derived(
    FAMILY_ORDER.map((family) => ({
      family,
      items: upgrades.filter((item) => item.family === family),
    })).filter((group) => group.items.length > 0),
  );

  const lockText = (item: UpgradeView): string | null => {
    if (item.stage > stage) return `Aşama ${item.stage}`;
    if (item.missingPrereqs.length > 0)
      return `${LABELS[item.missingPrereqs[0] ?? ''] ?? item.missingPrereqs[0] ?? ''} gerekli`;
    if (item.levelLocked) return `Seviye ${item.requiredLevel}`;
    return null;
  };
</script>

<section class="panel" aria-label="İnşa" data-testid="build-panel">
  <div class="scroller">
    {#each families as group (group.family)}
      <div class="family" data-testid="build-family" data-family={group.family}>
        <p class="famname">{FAMILY_LABELS[group.family] ?? group.family}</p>
        <div class="famrow">
          {#each group.items as item (item.id)}
            {@const lock = lockText(item)}
            <button
              type="button"
              class="card"
              class:locked={lock !== null}
              data-testid="build-card"
              data-upgrade={item.id}
              data-stage={String(item.stage)}
              data-level={String(item.level)}
              data-owned={item.level > 0 ? '1' : '0'}
              onclick={() => {
                onselect(item.id);
              }}
            >
              {#if iconFor(item) !== null}
                <span class="art" style={iconFor(item)} aria-hidden="true"></span>
              {:else}
                <span class="art fallback" aria-hidden="true"></span>
              {/if}
              <span class="name">{LABELS[item.id] ?? item.id}</span>
              {#if item.level > 0}
                <span class="lvl">Sv. {item.level}</span>
              {/if}
              {#if lock !== null}
                <span class="lock">
                  <svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path
                      d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z"
                      fill="currentColor"
                    /></svg
                  >
                  {lock}
                </span>
              {:else if item.building}
                <!-- Game minutes; one game minute is 500 sim-ms. No emoji —
                     the reference interface carries painted icons or text. -->
                <span class="price">İnşa · {Math.max(1, Math.ceil(item.buildRemainingMs / 500))} dk</span>
              {:else if item.level >= item.maxLevel}
                <span class="price">Tam</span>
              {:else}
                <span class="price" class:short={!item.affordable}>₡{money.format(item.cost)}</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  <p class="hint">Seviye {playerLevel} · kart seç, ayrıntıda satın al</p>
</section>

<style>
  .panel {
    position: absolute;
    left: 50%;
    bottom: var(--space-3);
    transform: translateX(-50%);
    max-width: min(56rem, calc(100vw - 22rem));
    padding: var(--space-2);
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    pointer-events: auto;
    z-index: var(--z-panel);
  }
  .scroller {
    display: flex;
    gap: var(--space-4);
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: thin;
  }
  .family {
    flex: none;
  }
  .famname {
    margin: 0 0 var(--space-1);
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .famrow {
    display: flex;
    gap: var(--space-2);
  }
  .card {
    flex: none;
    width: 104px;
    display: grid;
    justify-items: center;
    gap: 3px;
    padding: var(--space-2);
    background: var(--surface-raised);
    border: 1.5px solid transparent;
    border-radius: var(--radius-tile);
    color: var(--ink);
    cursor: pointer;
    position: relative;
  }
  .card:hover {
    border-color: var(--accent);
  }
  .card:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .card.locked {
    opacity: 0.75;
  }
  .art {
    width: 44px;
    height: 44px;
  }
  .art.fallback {
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
  }
  .name {
    font-size: 0.65rem;
    font-weight: 600;
    text-align: center;
    line-height: 1.15;
    min-height: 2.2em;
  }
  .lvl {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.6rem;
    font-weight: 800;
    color: var(--accent);
  }
  .price {
    font-size: var(--text-xs);
    font-weight: 800;
    padding: 1px 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--ok) 18%, transparent);
    color: var(--ok);
    font-variant-numeric: tabular-nums;
  }
  .price.short {
    background: var(--surface-sunken);
    color: var(--ink-dim);
  }
  .lock {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--ink-dim);
  }
  .lock svg {
    width: 11px;
    height: 11px;
  }
  .hint {
    margin: var(--space-1) 0 0;
    text-align: center;
    font-size: 0.62rem;
    color: var(--ink-dim);
  }
  @media (max-width: 900px) {
    .panel {
      max-width: calc(100vw - var(--space-3) * 2);
      bottom: calc(var(--touch-target) + var(--space-5));
    }
  }
</style>
