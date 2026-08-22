import { z } from 'zod';

/**
 * The store catalogue — what the player buys and puts on the lot themselves.
 *
 * ## Why this exists at all, when `BUILDABLES` already did
 *
 * `buildables.ts` was three free props behind a quick-strip, and it says so:
 * "a priced catalogue with every price at zero reads as an economy that has
 * been designed and set to nothing". This is the phase that gives placement a
 * price, so the catalogue grows the fields that decision needs — a cost, a
 * stage gate, a zone, a description — and the strip that armed a prop the
 * moment build mode opened goes away with it.
 *
 * That strip is not a stylistic casualty. It is the reported bug: the player
 * bought a hand-painted sign, paid for it, clicked the world, and a flower
 * appeared. Nothing drifted an id — the sim stores what it is handed. The
 * strip simply held its own armed prop (`planter`, by default, from the tick
 * build mode opened) behind a click surface covering the whole viewport,
 * while the upgrade card the player had actually bought placed itself at its
 * own authored anchor and never asked the cursor anything. Two purchase
 * surfaces, one screen, one of them invisible. Here every placement carries
 * the id of the thing that was bought, from the card to the command to the
 * saved row, and `tests/unit/sim/layout/storeIdentity.test.ts` buys every
 * entry in this file and asserts the world got that entry and no other.
 *
 * ## Only what the art already covers
 *
 * Every `objectId` here resolves in `WORLD_OBJECTS`, and a unit test proves
 * it. The directive's roadside billboard and directional sign have no
 * delivered art, so they are **not** listed as cards nobody can render —
 * they are prompt rows (ASSET_PIPELINE), and they join this file when the
 * images land. A card for an asset that does not exist is the placeholder
 * problem wearing a price tag.
 */

/**
 * Where an item is allowed to stand.
 *
 * Two rules, because two are what the lot actually distinguishes today:
 * anywhere legal, and "close enough to the road to be read from it". The
 * second is what makes a roadside sign a roadside sign rather than a sign in
 * a field, and it is the rule GAME_DESIGN_DOCUMENT §7's "Yol kenarı" items
 * are named for. Everything else placement already enforces and should not be
 * duplicated here: the lot rectangle, the occupancy scan and the navigation
 * trial all live in `LayoutSystem` and apply to every item whatever its zone.
 */
const PLACEMENT_ZONES = ['lot', 'roadside'] as const;
export type PlacementZone = (typeof PLACEMENT_ZONES)[number];

/**
 * How far from the carriageway edge the roadside band reaches, metres.
 *
 * Six metres: far enough to hold the verge and the near apron so a sign has
 * somewhere legal to stand, short enough that "roadside" still excludes the
 * back of the lot. Measured against Stage 1, where the carriageway ends at
 * y 8.5 and the layby's parked cars end at 10.5 — so the band covers the
 * verge, the layby fringe and the walkway's road edge, and stops before the
 * counter at 12.6.
 */
export const ROADSIDE_BAND_METRES = 6;

export const STORE_CATEGORIES = ['GREENERY', 'SIGNAGE', 'UTILITY', 'FURNITURE'] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

const storeItemSchema = z.object({
  /**
   * Stable id, hashed through the command log and written into every saved
   * row. Never renumber, never rename: a save from yesterday names these.
   */
  id: z.string().min(1),
  category: z.enum(STORE_CATEGORIES),
  /** Turkish, like the rest of the interface. */
  label: z.string().min(1),
  /** One line telling the player what it is for. Shown on the card. */
  description: z.string().min(1),
  /** Cash price. Demolition returns `DEMOLISH_REFUND_FRACTION` of it. */
  cost: z.number().positive(),
  /** First restaurant stage that may buy it. */
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  zone: z.enum(PLACEMENT_ZONES),
  /** A production id from `WORLD_OBJECTS`. Proven to resolve, by test. */
  objectId: z.string().min(1),
});

export type StoreItem = z.infer<typeof storeItemSchema>;

export const STORE_ITEMS: readonly StoreItem[] = z.array(storeItemSchema).parse([
  /*
   * Greenery — the answer to the directive's "meaningless flat green strips".
   * The verge stops being a painted band and becomes somewhere the player
   * spends money to make the frontage look cared for.
   */
  {
    id: 'flower-bed',
    category: 'GREENERY',
    label: 'Çiçek tarhı',
    description: 'Cepheyi renklendiren çiçekli tarh.',
    cost: 6,
    stage: 1,
    zone: 'lot',
    objectId: 'bush-flowering-01',
  },
  {
    id: 'shrub',
    category: 'GREENERY',
    label: 'Yuvarlak çalı',
    description: 'Boşlukları dolduran bakımlı çalı.',
    cost: 4,
    stage: 1,
    zone: 'lot',
    objectId: 'bush-round-01',
  },
  {
    id: 'shrub-wide',
    category: 'GREENERY',
    label: 'Geniş çalı',
    description: 'Daha geniş gövdeli, kenar boşluklarına.',
    cost: 5,
    stage: 1,
    zone: 'lot',
    objectId: 'bush-round-02',
  },
  {
    id: 'sapling',
    category: 'GREENERY',
    label: 'Genç ağaç',
    description: 'Arsaya gölge ve yükseklik katar.',
    cost: 14,
    stage: 1,
    zone: 'lot',
    objectId: 'tree-broadleaf-02',
  },
  {
    id: 'conifer',
    category: 'GREENERY',
    label: 'Çam',
    description: 'Kışın da yeşil kalan iğne yapraklı.',
    cost: 16,
    stage: 2,
    zone: 'lot',
    objectId: 'tree-conifer-01',
  },

  /* Signage — the only zone-restricted family, and the reason zones exist. */
  {
    id: 'roadside-sign',
    category: 'SIGNAGE',
    label: 'Yol kenarı tabelası',
    description: 'Yoldan okunacak kadar yakına dikilir.',
    cost: 12,
    stage: 1,
    zone: 'roadside',
    objectId: 'sign',
  },

  /* Utility — props that read as a maintained forecourt. */
  {
    id: 'lamp-post',
    category: 'UTILITY',
    label: 'Sokak lambası',
    description: 'Karanlık bastığında cepheyi aydınlatır.',
    cost: 18,
    stage: 1,
    zone: 'lot',
    objectId: 'lamp',
  },
  {
    id: 'waste-bin',
    category: 'UTILITY',
    label: 'Çöp kutusu',
    description: 'Tezgâhın önünü temiz tutar.',
    cost: 5,
    stage: 1,
    zone: 'lot',
    objectId: 'bin',
  },
  {
    id: 'queue-barrier',
    category: 'UTILITY',
    label: 'Sıra bariyeri',
    description: 'Kuyruğu düzenli bir hatta tutar.',
    cost: 9,
    stage: 2,
    zone: 'lot',
    objectId: 'barrier',
  },

  /* Furniture — the terrace, once there is a terrace to furnish. */
  {
    id: 'patio-table',
    category: 'FURNITURE',
    label: 'Yuvarlak masa',
    description: 'Dışarıda oturmak isteyenler için.',
    cost: 22,
    stage: 3,
    zone: 'lot',
    objectId: 'table-round',
  },
  {
    id: 'patio-chair',
    category: 'FURNITURE',
    label: 'Plastik sandalye',
    description: 'Masaların yanına, tek tek yerleştirilir.',
    cost: 7,
    stage: 3,
    zone: 'lot',
    objectId: 'chair-plastic',
  },
]);

/**
 * What demolition gives back.
 *
 * ECONOMY_DESIGN §8 E5, verbatim: "İade yok. Yıkım ise maliyetin %30'unu iade
 * eder, kâr edilemez." The directive proposed 50% "unless the GDD explicitly
 * contains another approved rule" — it does, and this is it. Thirty percent
 * is what makes buy-place-remove a *cost* rather than a free undo, which is
 * the arbitrage that clause exists to close.
 */
export const DEMOLISH_REFUND_FRACTION = 0.3;

const BY_ID = new Map(STORE_ITEMS.map((item) => [item.id, item]));

/** The item, or `undefined` for an id no catalogue entry claims. */
export function storeItem(id: string): StoreItem | undefined {
  return BY_ID.get(id);
}
