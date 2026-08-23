import { z } from 'zod';

/**
 * The property level system — `docs/RESTAURANT_EVOLUTION_ROADMAP.md`.
 *
 * ## A property is a named view over what the player owns
 *
 * The audit that produced this file (`docs/LEVEL1_WORLD_INVENTORY.md`) found
 * that almost every capacity dial in the game **already has an owner**: the
 * thirty-rung upgrade tree moves queue capacity, station count, hold tolerance,
 * visibility, atmosphere, prep speed and every drive-thru number, and the two
 * machines move per-type station speed. Exactly one major ceiling had nobody
 * selling it: **parking bays**.
 *
 * So a property here is not a second economy. It is a *name*, a *world anchor*
 * and a *level*, where the level is derived from ladders that already exist —
 * except parking, which gets the one new ladder the gap justifies. That is the
 * difference between this system and the Prep Counter that `buildings.ts`
 * refused to ship: a second door to one effect is two prices for one mechanic,
 * and the two compound into a stat nobody designed.
 *
 * ## Five properties, one of them the stage itself
 *
 * The main building's level **is** `progression.stage`. There is one counter;
 * evolution moves it from a stand to a truck to a diner to a restaurant on the
 * same plot, with the same camera, and the original stand survives in a corner
 * (GAME_DESIGN_DOCUMENT §7). Modelling a "main building level" beside the stage
 * would be two names for one number, and the directive's own example —
 * "Restaurant Stage 2, Main Building Lv2" — says they are the same fact.
 *
 * ## The ceiling
 *
 * `maxPropertyLevel(stage) = min(4, stage + 1)`. One tier of headroom, because
 * a Stage-2 requirement of "parking >= 2" is only reachable if level 2 can be
 * bought *during* Stage 1. At Stage 4 it clamps.
 */

const PROPERTY_IDS = ['main', 'parking', 'kitchen', 'service', 'frontage'] as const;
type PropertyId = (typeof PROPERTY_IDS)[number];

/**
 * How a property's level is obtained.
 *
 * - `stage`   — it *is* the restaurant stage; upgrading means evolving.
 * - `own`     — its own ladder, bought with `UPGRADE_PROPERTY`.
 * - `derived` — read from an effect the upgrade tree already produces;
 *               upgrading means buying the rung named by `viaByLevel`.
 */
const LADDERS = ['stage', 'own', 'derived'] as const;

const propertySchema = z.object({
  id: z.enum(PROPERTY_IDS),
  label: z.string().min(1),
  /** One line, on the Bilgi card, saying what the property is for. */
  description: z.string().min(1),
  ladder: z.enum(LADDERS),
  maxLevel: z.number().int().min(1).max(4),
  /**
   * Cost of reaching each level past the first — index 0 is level 2.
   *
   * `own` ladders only. A derived property's price is whatever its underlying
   * rung costs, looked up from `UPGRADES` at the moment it is offered, so the
   * card can never quote a price the purchase does not charge.
   */
  costByLevel: z.array(z.number().positive()).default([]),
  /** Construction time per level past the first, in simulation milliseconds. */
  buildMsByLevel: z.array(z.number().int().positive()).default([]),
  /**
   * Which upgrade rung produces each level past the first — index 0 is level 2.
   *
   * `derived` ladders only. The card's İnşa Et button buys *that* rung through
   * the ordinary `BUY_UPGRADE` path, so every existing gate — stage,
   * prerequisite, player level, cash — still applies and none of it is
   * reimplemented here.
   */
  viaByLevel: z.array(z.string().min(1)).default([]),
});

export type PropertySpec = z.infer<typeof propertySchema>;

/**
 * Every ladder is exactly as long as it claims to be.
 *
 * The same check `buildings.ts` runs on its price lists, for the same reason: a
 * ladder shorter than its level count fails silently at whatever level runs off
 * the end, which is an upgrade the player pays for and does not receive.
 */
const propertyLadders = propertySchema.superRefine((item, ctx) => {
  const rungs = item.maxLevel - 1;
  const expected: [string, number][] =
    item.ladder === 'own'
      ? [
          ['costByLevel', item.costByLevel.length],
          ['buildMsByLevel', item.buildMsByLevel.length],
        ]
      : item.ladder === 'derived'
        ? [['viaByLevel', item.viaByLevel.length]]
        : [];
  for (const [field, length] of expected) {
    if (length === rungs) continue;
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: `${item.id}: ${field} has ${String(length)} entries for ${String(rungs)} rungs`,
    });
  }
});

/** Exported so a test can hand it a broken table and watch the rule fire. */
export const parseProperties = (input: unknown): PropertySpec[] => z.array(propertyLadders).parse(input);

export const PROPERTIES: readonly PropertySpec[] = parseProperties([
  {
    id: 'main',
    label: 'Ana bina',
    description: 'İşletmenin kendisi. Seviyesi restoranın aşamasıdır.',
    ladder: 'stage',
    maxLevel: 4,
  },
  {
    id: 'parking',
    label: 'Otopark',
    description: 'Müşteri araçlarının çekebileceği yer sayısı.',
    ladder: 'own',
    maxLevel: 3,
    /*
     * Two rungs, and the ceiling is three rather than four on purpose.
     *
     * Stage 4's answer to "more cars than the car park holds" is the
     * **drive-thru**, not more tarmac — `stage4.ts` says so at length: the west
     * block holds two columns and three rows, and the east half of the lot is
     * the dining room, so a fourth rung would be bays inside the restaurant.
     * A level that adds nothing but a price is the fake benefit §39 forbids
     * (directive §7: "Not every item must reach Lv4").
     */
    costByLevel: [5, 40],
    // Eight and eighteen game-minutes — a car park is groundwork, so it takes
    // longer than a sign and less than a stage.
    buildMsByLevel: [8_000, 18_000],
  },
  {
    id: 'kitchen',
    label: 'Mutfak',
    description: 'Aynı anda kaç siparişin hazırlanabileceği.',
    ladder: 'derived',
    /*
     * Three, not four, and the ceiling is a **measurement**: `STATIONS` has
     * exactly two benches behind the `prepStations` effect — `prep-2` at 1 and
     * `prep-3` at 2 — so the third point of that effect unlocks nothing. A
     * fourth kitchen level would be a card whose number goes up and whose
     * kitchen does not, which is the fake benefit §39 forbids.
     *
     * `drink-dispenser` still sells its third point, and it is still worth
     * buying for the `prepSpeed` it carries — it simply is not a *kitchen
     * level*, because a level has to mean a kitchen that can do more.
     */
    maxLevel: 3,
    // prepStations 0 -> Lv1, 1 -> Lv2, 2 -> Lv3.
    viaByLevel: ['second-prep-station', 'second-prep-station'],
  },
  {
    id: 'service',
    label: 'Servis alanı',
    description: 'Tezgâhın önünde kaç kişinin sıraya girebileceği.',
    ladder: 'derived',
    maxLevel: 4,
    // queueCapacity +2 per level: bigger-counter, then the barrier's two rungs.
    viaByLevel: ['bigger-counter', 'queue-barriers', 'queue-barriers'],
  },
  {
    id: 'frontage',
    label: 'Cephe',
    description: 'Yoldan geçenin işletmeyi fark etme ihtimali.',
    ladder: 'derived',
    maxLevel: 4,
    viaByLevel: ['hand-painted-sign', 'hand-painted-sign', 'hand-painted-sign'],
  },
]);

const BY_ID = new Map(PROPERTIES.map((item) => [item.id, item]));

export function property(id: string): PropertySpec | undefined {
  return BY_ID.get(id as PropertyId);
}

/**
 * How many bays each parking level opens.
 *
 * **These are the existing stage layouts, not new numbers.** Stage 1 authors
 * four bays, Stage 2 five, Stage 3 eight and Stage 4 the same eight — and each
 * list is literally a prefix of the next (`stage2.ts` spreads Stage 1's array
 * and appends `p5`; `stage3.ts` spreads Stage 2's and appends three). So a
 * parking level can say *how much of the master list is live* without inventing
 * a single coordinate, and therefore without a single new navigation risk.
 */
const PARKING_BAYS_BY_LEVEL: readonly number[] = [4, 5, 8];

/**
 * How a level's picture exists — the directive's §23 classification, in data.
 *
 * - `sprite`     a **verified asset** of this level's own. The preview draws it.
 * - `prompted`   the level is real and its art is not made yet; a prompt for it
 *                is filed in `docs/LEVEL_ASSET_EVOLUTION_LIBRARY.md`. `asset`
 *                may still name what the world currently draws — the level
 *                below's frame — and the preview refuses to show it.
 * - `procedural` there is **no sprite by design**: a car park is painted from
 *                the layout (`WorldScene.drawSurfaces` outlines each bay in
 *                palette colours), so waiting for art would be waiting for
 *                something nobody is making.
 *
 * The three are not interchangeable, and the reason is §17. A boolean was tried
 * first and got the car park wrong in both directions at once: it had no sprite
 * and claimed verified art, so the card rendered "Görsel üretimde" over a
 * `data-art="real"` — telling the player to wait for a picture that will never
 * be drawn. The browser test caught it; the type now makes it unsayable.
 */
export type LevelArtKind = 'sprite' | 'prompted' | 'procedural';

/**
 * What each level is called, and what it is drawn as.
 *
 * The **name** is what the card headlines when a property has no countable
 * capacity; where it does have one, the card shows the count instead, because
 * "5 araç" is a fact the simulation can be asked for and "Genişletilmiş
 * otopark" is a word somebody chose.
 *
 * `asset` is the `WORLD_OBJECTS` id drawn at that level — the truth about the
 * world, including when it repeats the level below. `cells` is how many things
 * a *procedural* level paints, which is that level's entire visual content and
 * is what its preview shows instead of a sprite.
 */
export interface PropertyLevelArt {
  readonly name: string;
  readonly asset: string;
  readonly kind: LevelArtKind;
  readonly cells: number;
}

const PARKING_LEVEL_NAMES: readonly string[] = ['Yol kenarı cebi', 'İşaretli otopark', 'Geniş otopark'];

const PROPERTY_LEVEL_ART: Readonly<Record<string, readonly PropertyLevelArt[]>> = {
  main: [
    { name: 'Yol kenarı tezgâhı', asset: 'counter-lv1', kind: 'sprite', cells: 0 },
    { name: 'Yemek kamyonu', asset: 'truck', kind: 'sprite', cells: 0 },
    { name: 'Küçük lokanta', asset: 'counter-lv2', kind: 'sprite', cells: 0 },
    // Stage 4 keeps Stage 3's building and adds the drive-thru; the expanded
    // frontage §7 describes has no delivered art, so the world still draws
    // `counter-lv2` and the preview still refuses to call it Stage 4's.
    { name: 'Büyük restoran', asset: 'counter-lv2', kind: 'prompted', cells: 0 },
  ],
  // Derived from the bay table rather than restated: the car park's picture at
  // a level *is* the bays it opens, and two lists would drift.
  parking: PARKING_BAYS_BY_LEVEL.map((bays, index) => ({
    name: PARKING_LEVEL_NAMES[index] ?? '',
    asset: '',
    kind: 'procedural' as const,
    cells: bays,
  })),
  kitchen: [
    { name: 'Tek tezgâh', asset: 'grill-lv1', kind: 'sprite', cells: 0 },
    { name: 'İkinci tezgâh', asset: 'grill-lv2', kind: 'sprite', cells: 0 },
    { name: 'Üçüncü tezgâh', asset: 'grill-lv2', kind: 'prompted', cells: 0 },
  ],
  service: [
    { name: 'Dar tezgâh önü', asset: 'counter-lv1', kind: 'sprite', cells: 0 },
    { name: 'Geniş tezgâh', asset: 'counter-lv1', kind: 'prompted', cells: 0 },
    { name: 'Sıra bariyerleri', asset: 'barrier', kind: 'sprite', cells: 0 },
    { name: 'Düzenlenmiş ön alan', asset: 'barrier', kind: 'prompted', cells: 0 },
  ],
  frontage: [
    { name: 'El yazısı tabela', asset: 'sign', kind: 'sprite', cells: 0 },
    { name: 'Boyalı tabela', asset: 'sign', kind: 'prompted', cells: 0 },
    { name: 'Işıklı tabela', asset: 'sign', kind: 'prompted', cells: 0 },
    { name: 'Aydınlatmalı cephe', asset: 'sign', kind: 'prompted', cells: 0 },
  ],
};

const NO_ART: PropertyLevelArt = { name: '', asset: '', kind: 'prompted', cells: 0 };

/** The art for one level of one property, clamped to its ladder. */
export function propertyLevelArt(id: string, level: number): PropertyLevelArt {
  const list = PROPERTY_LEVEL_ART[id] ?? [];
  const index = Math.max(0, Math.min(list.length - 1, Math.trunc(level) - 1));
  return list[index] ?? NO_ART;
}

/** Bays live at this level, clamped to the ladder. */
export function parkingBays(level: number): number {
  const index = Math.max(0, Math.min(PARKING_BAYS_BY_LEVEL.length - 1, Math.trunc(level) - 1));
  return PARKING_BAYS_BY_LEVEL[index] ?? 4;
}

/**
 * The highest property level this stage allows — the Town Hall rule.
 *
 * One tier of headroom, so the next stage's floor is always reachable from
 * inside the current one. See the module note.
 */
export function maxPropertyLevel(stage: number): number {
  return Math.min(4, Math.max(1, Math.trunc(stage)) + 1);
}

/** What reaching `level` costs on an `own` ladder, or `undefined`. */
export function propertyCost(item: PropertySpec, level: number): number | undefined {
  return item.costByLevel[level - 2];
}

/** How long reaching `level` takes on an `own` ladder, in simulation ms. */
export function propertyBuildMs(item: PropertySpec, level: number): number | undefined {
  return item.buildMsByLevel[level - 2];
}

/** Which upgrade rung produces `level` on a `derived` ladder, or `undefined`. */
export function propertyVia(item: PropertySpec, level: number): string | undefined {
  return item.viaByLevel[level - 2];
}
