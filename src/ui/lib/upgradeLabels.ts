/**
 * The Turkish name of every upgrade — one map, read by every panel that shows
 * one.
 *
 * ## Why the names live here and not in the config
 *
 * `src/config` is data and types only, and an upgrade's *identity* is its id.
 * The name is interface text: it belongs to the layer that renders it, and
 * keeping it here is what lets a translation land without touching the tree.
 *
 * ## Why there is exactly one of them
 *
 * There were three, and they had drifted apart in every way three copies can.
 * Cross-checked against `UPGRADES` before this file existed:
 *
 * | copy                    | entries | upgrades with no name | dead keys |
 * | ----------------------- | ------- | --------------------- | --------- |
 * | `UpgradeCard.svelte`    | 30      | 0                     | 0         |
 * | `ContextPanel.svelte`   | 30      | **8**                 | **8**     |
 * | `ObjectivePanel.svelte` | 9       | **21**                | 0         |
 *
 * The eight in the build panel were the same eight upgrades under names they
 * had before a rename — `training-program` for `training-programme`,
 * `register` for `second-register` — so those cards printed a raw id where a
 * name belonged. The objective card, which uses this to headline *what to do
 * next*, could name nine of the thirty and printed `widened-forecourt` at the
 * player for the rest.
 *
 * And five upgrades had two different names at once, depending on which panel
 * you were looking at:
 *
 * ```
 *   staff-room           "Personel odası"  /  "Dinlenme odası"
 *   shift-supervisor     "Vardiya şefi"    /  "Vardiya sorumlusu"
 *   pass-heat-lamp       "Pass ısı lambası" / "Isı lambası"
 *   planter-boxes        "Saksılar ve cephe" / "Saksılar"
 *   second-prep-station  "İkinci hazırlık istasyonu" / "İkinci istasyon"
 * ```
 *
 * The wording below is `UpgradeCard`'s, which was the complete and correct
 * copy. `tests/unit/ui/upgradeLabels.test.ts` holds this map to the tree in
 * both directions, so a rename cannot silently orphan a name again.
 */
import { UPGRADES } from '@config/economy/upgrades';

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

/**
 * The name to show for an upgrade id.
 *
 * Falls back to the id rather than to an empty string: if the map ever does
 * fall behind the tree again, a player sees something ugly instead of a blank
 * card, and a screenshot says which id is missing.
 */
export function upgradeLabel(id: string): string {
  return LABELS[id] ?? id;
}

/** Exported for the test that holds this map to the tree. */
export const UPGRADE_LABEL_IDS: readonly string[] = Object.keys(LABELS);

/** Every upgrade in the tree, for the same test. */
export const UPGRADE_IDS: readonly string[] = UPGRADES.map((item) => item.id);
