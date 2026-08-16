<script lang="ts">
  import type { UpgradeView } from '@app/bridge/hudModel';

  /**
   * The world-in-place upgrade card — GAME_DESIGN_DOCUMENT §14.3.
   *
   * "Click an object in the world; a compact contextual card opens beside it
   * showing current level, the exact before/after numbers, and the cost. No
   * modal. The game must never be covered."
   *
   * So this is positioned at the object's projected anchor and sized to a few
   * hundred pixels. It is not centred, it does not dim the world behind it, and
   * closing it is one click anywhere else. The roadmap calls this "the UX
   * decision that keeps the game visually dominant" and asks for it properly
   * rather than as a stopgap.
   *
   * The before/after numbers come from the simulation through the bridge, never
   * from arithmetic here. A second implementation of the combining rules in a
   * component would quote the player a number the world disagrees with, and it
   * would disagree silently.
   */
  interface Props {
    upgrade: UpgradeView;
    onbuy: (id: string) => void;
    onclose: () => void;
  }

  const { upgrade, onbuy, onclose }: Props = $props();

  /**
   * Names for all thirty — Phase 13.
   *
   * A map rather than a field on the upgrade, because `src/config` holds the
   * design and this is presentation: the day there is a second language, the
   * translation lands here and the tree does not move.
   */
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

  const FAMILY_LABELS: Record<string, string> = {
    VISIBILITY_APPEAL: 'Görünürlük & Çekicilik',
    KITCHEN: 'Mutfak',
    CAPACITY: 'Kapasite & Alan',
    DRIVE_THRU: 'Drive-thru',
    STAFF: 'Personel',
  };

  const EFFECT_LABELS: Record<string, string> = {
    visibility: 'Görünürlük',
    nightVisibility: 'Gece görünürlüğü',
    menuAppeal: 'Çekicilik',
    atmosphere: 'Atmosfer',
    orderSpeed: 'Sipariş süresi',
    prepStations: 'Hazırlık istasyonu',
    prepSpeed: 'Hazırlık süresi',
    foodQuality: 'Yemek kalitesi',
    holdToleranceMs: 'Sıcak kalma süresi',
    queueCapacity: 'Kuyruk kapasitesi',
    patienceScale: 'Bekleme toleransı',
    laneCapacity: 'Şerit kapasitesi',
    windowSpeed: 'Pencere hızı',
    orderPostSpeed: 'Sipariş direği hızı',
    staffSpeed: 'Personel hızı',
    staffSkill: 'Personel becerisi',
    decisionPointMetres: 'Karar noktası',
  };

  /** Each kind reads in its own units. A bare number would mean nothing. */
  function format(kind: string, value: number): string {
    switch (kind) {
      case 'visibility':
      case 'nightVisibility':
      case 'menuAppeal':
      case 'orderSpeed':
      case 'prepSpeed':
      case 'windowSpeed':
      case 'orderPostSpeed':
      case 'staffSpeed':
      case 'patienceScale':
        return `${value.toFixed(2)}×`;
      case 'atmosphere':
      case 'foodQuality':
      case 'staffSkill':
        return `${(value * 100).toFixed(0)}%`;
      case 'decisionPointMetres':
        return `+${value.toFixed(0)} m`;
      case 'holdToleranceMs':
        return `+${(value / 1000).toFixed(0)} sn`;
      default:
        return `+${value.toFixed(0)}`;
    }
  }

  const maxed = $derived(upgrade.level >= upgrade.maxLevel);
  const name = $derived(LABELS[upgrade.id] ?? upgrade.id);
  const family = $derived(FAMILY_LABELS[upgrade.family] ?? upgrade.family);
  const money = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
</script>

<div
  class="card"
  data-testid="upgrade-card"
  data-upgrade={upgrade.id}
  style="transform: translate3d({upgrade.screenX}px, {upgrade.screenY}px, 0) translate(12px, -50%)"
>
  <header>
    <h2>{name}</h2>
    <button class="close" type="button" onclick={onclose} aria-label="Kapat">×</button>
  </header>

  <p class="family" data-testid="upgrade-family" data-family={upgrade.family}>{family}</p>

  <p class="level" data-testid="upgrade-level">
    Seviye {upgrade.level} / {upgrade.maxLevel}
  </p>

  {#if maxed}
    <p class="maxed">Bu yükseltme tamamlandı.</p>
  {:else}
    <dl class="effects">
      {#each upgrade.effects as effect (effect.kind)}
        <div>
          <dt>{EFFECT_LABELS[effect.kind] ?? effect.kind}</dt>
          <dd>
            <span class="before">{format(effect.kind, effect.before)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span class="after">{format(effect.kind, effect.after)}</span>
          </dd>
        </div>
      {/each}
    </dl>

    <p class="consequence">{upgrade.consequence}</p>

    <button
      class="buy"
      type="button"
      data-testid="upgrade-buy"
      disabled={!upgrade.affordable || !upgrade.unlocked}
      onclick={() => {
        onbuy(upgrade.id);
      }}
    >
      <span>Satın al</span>
      <span class="cost">₡{money.format(upgrade.cost)}</span>
    </button>

    <!--
      Two refusals, kept apart on purpose — Phase 13. "You have not unlocked
      this" and "you cannot afford this" are different problems with different
      answers, and a card that collapsed them into one greyed-out button would
      leave the player guessing which.

      The locked message wins when both are true, because it is the one they can
      act on: no amount of waiting for money helps if the prerequisite is not
      bought.
    -->
    {#if !upgrade.unlocked}
      <p class="locked" data-testid="upgrade-locked">
        {#if upgrade.missingPrereqs.length > 0}
          Önce gerekli: {upgrade.missingPrereqs.map((id) => LABELS[id] ?? id).join(', ')}
        {:else}
          Aşama {upgrade.stage} gerekiyor
        {/if}
      </p>
    {:else if !upgrade.affordable}
      <p class="short" data-testid="upgrade-short" data-short-by={String(Math.ceil(upgrade.shortBy))}>
        ₡{money.format(Math.ceil(upgrade.shortBy))} eksik
      </p>
    {/if}
  {/if}
</div>

<style>
  .card {
    position: absolute;
    top: 0;
    left: 0;
    /*
     * Above the HUD's own panels — Phase 13.
     *
     * The card is anchored in the *world*, so where it lands depends on the
     * camera, and Phase 11's build panel and Phase 13's upgrade list both sit in
     * the overlay's flow. A card that opened underneath one of them was visible,
     * enabled and unclickable: measured in Firefox as a two-minute timeout on a
     * button the test could see the whole time.
     */
    z-index: 20;
    width: 15rem;
    padding: var(--sp-3);
    background: color-mix(in srgb, var(--c-surface-raised) 94%, transparent);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    pointer-events: auto;
    backdrop-filter: blur(8px);
  }

  .family {
    margin: 0;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .locked {
    margin: var(--sp-1) 0 0;
    font-size: 0.75rem;
    color: var(--c-warning, #ffd479);
  }

  header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  h2 {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 700;
    line-height: 1.2;
  }

  .close {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    background: none;
    border: none;
    color: var(--c-text-dim);
    font-size: var(--fs-base);
    line-height: 1;
    cursor: pointer;
  }

  .close:hover {
    color: var(--c-text);
  }

  .level {
    margin: var(--sp-1) 0 var(--sp-2);
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
  }

  .effects {
    margin: 0 0 var(--sp-2);
    display: grid;
    gap: var(--sp-1);
  }

  .effects div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .effects dt {
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
  }

  .effects dd {
    margin: 0;
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .before {
    color: var(--c-text-dim);
  }

  .arrow {
    margin: 0 2px;
    color: var(--c-text-dim);
  }

  .after {
    color: var(--c-ok);
    font-weight: 700;
  }

  .consequence {
    margin: 0 0 var(--sp-3);
    font-size: var(--fs-xs);
    line-height: 1.35;
    color: var(--c-text-muted);
  }

  .maxed {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--c-ok);
  }

  .buy {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    background: var(--c-accent);
    border: none;
    border-radius: var(--radius-sm);
    color: #12161d;
    font-size: var(--fs-sm);
    font-weight: 700;
    cursor: pointer;
  }

  .buy:disabled {
    background: var(--c-surface);
    color: var(--c-text-dim);
    cursor: not-allowed;
  }

  .cost {
    font-variant-numeric: tabular-nums;
  }

  .short {
    margin: var(--sp-1) 0 0;
    font-size: var(--fs-xs);
    color: var(--c-error);
  }
</style>
