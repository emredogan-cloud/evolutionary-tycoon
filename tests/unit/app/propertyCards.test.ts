import { describe, expect, it } from 'vitest';
import { buyBuilt } from '../../helpers/build';
import { PROPERTIES, propertyCost } from '@config/properties';
import { requirementFor } from '@config/progression';
import type { HudModel, PropertyView } from '@app/bridge/hudModel';
import { UiBridge } from '@app/bridge/UiBridge';
import { Sim } from '@sim/core/Sim';
import { advancePendingBuilds } from '@sim/systems/ProgressionSystem';
import { propertyLevel, upgradeProperty } from '@sim/systems/properties';
import { hire } from '@sim/systems/StaffSystem';

/**
 * The property cards, as the bridge derives them.
 *
 * `InspectCard` computes nothing: the price, the duration, the capacity and —
 * above all — **the reason a level cannot be bought** are all worked out here,
 * from the simulation, on the sample that produced them. A component that
 * derived any of those itself would be a second implementation of a rule the
 * purchase then applies differently, which is how a card ends up green over a
 * refusal.
 *
 * So this suite is about the derivation, one lock reason at a time. Each one is
 * a sentence a player reads and acts on; a wrong one sends them to do the wrong
 * thing, and looks exactly like a right one.
 */
interface Harness {
  readonly sim: Sim;
  /** One property's card, resampled. */
  readonly card: (id: string) => PropertyView;
  /** The objective checklist as the panel renders it — rows it would drop are dropped. */
  readonly checklist: () => { label: string; have: number; need: number }[];
}

function bridge(): Harness {
  const sim = new Sim({ seed: 1 });
  const ui = new UiBridge(sim, (x, y, _z, out) => {
    out.x = x;
    out.y = y;
    return true;
  });
  ui.start();
  let model: HudModel | null = null;
  ui.subscribe((published) => {
    model = published;
  });
  const latest = (): HudModel => {
    ui.refresh();
    if (model === null) throw new Error('nothing published');
    return model;
  };
  return {
    sim,
    card: (id) => {
      const view = latest().properties.find((item) => item.id === id);
      if (view === undefined) throw new Error(`no card for ${id}`);
      return view;
    },
    checklist: () =>
      latest()
        .progression.requirements.filter((row) => row.need > 0)
        .map((row) => ({ label: row.label, have: row.have, need: row.need })),
  };
}

describe('what a property card says it is', () => {
  it('carries one row per property, at its own level and anchor', () => {
    const { sim, card } = bridge();
    sim.advance(200);

    for (const spec of PROPERTIES) {
      const view = card(spec.id);
      expect(view.label).toBe(spec.label);
      expect(view.maxLevel).toBe(spec.maxLevel);
      expect(view.level).toBeGreaterThanOrEqual(1);
      expect(view.level).toBeLessThanOrEqual(spec.maxLevel);
      expect(view.visible).toBe(true);
    }
  });

  it('headlines a count where there is one, and a name where there is not', () => {
    /*
     * "5 araç" is a fact the simulation can be asked for; "Genişletilmiş
     * otopark" is a word somebody chose. The card prefers the fact, and falls
     * back to the name only for a property with nothing to count — frontage
     * multiplies a probability.
     */
    const { card } = bridge();
    expect(card('parking').levelLabel).toMatch(/^\d+ araç$/);
    expect(card('frontage').capacity).toBe(-1);
    expect(card('frontage').levelLabel).toBe('El yazısı tabela');
  });
});

describe('why a property card refuses', () => {
  it('names the money, to the cent', () => {
    const { sim, card } = bridge();
    const spec = PROPERTIES.find((item) => item.id === 'parking');
    if (spec === undefined) throw new Error('no parking');
    const price = propertyCost(spec, 2) ?? 0;

    sim.world.economy.cash = price - 1.25;
    expect(card('parking').lockReason).toBe('₡1.25 eksik');

    sim.world.economy.cash = price;
    expect(card('parking').lockReason).toBe('');
    expect(card('parking').nextCost).toBe(price);
  });

  it('says a site is up, rather than quoting a price twice', () => {
    const { sim, card } = bridge();
    sim.world.economy.cash = 1_000;
    expect(upgradeProperty(sim.world, 'parking')).toBe('ok');

    const view = card('parking');
    expect(view.building).toBe(true);
    expect(view.lockReason).toBe('İnşa ediliyor');
    expect(view.buildRemainingMs).toBeGreaterThan(0);
    expect(view.buildProgress).toBeGreaterThanOrEqual(0);
    expect(view.buildProgress).toBeLessThanOrEqual(1);
  });

  it('names the stage a level needs, not just that it is locked', () => {
    /*
     * The ceiling is `min(4, stage + 1)`, so at Stage 1 the third car park is
     * out of reach however rich the player is. The card says which stage —
     * a greyed-out button with no reason is a puzzle, not an instruction.
     */
    const { sim, card } = bridge();
    sim.world.economy.cash = 100_000;
    expect(upgradeProperty(sim.world, 'parking')).toBe('ok');
    advancePendingBuilds(sim.world, Number.MAX_SAFE_INTEGER);

    expect(card('parking').level).toBe(2);
    expect(card('parking').lockReason).toBe('Aşama 2 gerekli');
  });

  it('says azami seviye at the top of a ladder, with no price at all', () => {
    const { sim, card } = bridge();
    sim.world.economy.cash = 100_000;
    for (let i = 0; i < 6; i++) buyBuilt(sim.world, 'hand-painted-sign');

    const view = card('frontage');
    expect(view.level).toBe(4);
    expect(view.nextLabel).toBe('');
    expect(view.lockReason).toBe('Azami seviye');
    expect(view.nextCost).toBe(-1);
  });

  it('passes a derived rung its own gate, rather than inventing one', () => {
    /*
     * The kitchen's level-2 rung requires player level 5. The card asks the
     * same `upgradeLevelRequirement` the purchase asks — if it guessed, the
     * button would be green over a refusal the player cannot see coming.
     */
    const { sim, card } = bridge();
    sim.world.progression.stage = 2;
    sim.world.economy.cash = 100_000;

    const view = card('kitchen');
    expect(view.lockReason).toBe('Oyuncu sv. 5 gerekli');
    expect(view.nextCost).toBeGreaterThan(0);
    expect(view.nextBuildMs).toBeGreaterThan(0);

    // Serve enough people to clear the level gate, and the reason goes away.
    sim.world.stats.customersServed = 400;
    expect(card('kitchen').lockReason).toBe('');
  });

  it('names the stage a derived rung waits for', () => {
    // `queue-barriers` is a Stage-2 rung, so service Lv3 is stage-locked at
    // Stage 1 even with the counter bought and the money in hand.
    const { sim, card } = bridge();
    sim.world.economy.cash = 100_000;
    expect(buyBuilt(sim.world, 'bigger-counter')).toBe('ok');

    const view = card('service');
    expect(view.level).toBe(2);
    expect(view.lockReason).toBe('Aşama 2 gerekli');
  });
});

describe('the objective checklist names every clause the gate enforces', () => {
  /**
   * **The gap this closes.** The property floor replaced Stage 2's
   * `upgradesBought` milestone, and for one revision the checklist did not know
   * about it: a player who met the cash and the customer count saw two ticked
   * rows, no third row, and no evolve button — with the only explanation
   * hidden behind clicking the right object in the world.
   *
   * Found by looking at a visual golden diff, of all things: the objective
   * panel had lost a row, showing through the translucent settings panel
   * behind it.
   */
  it('lists the properties the next stage requires, and only those', () => {
    const { sim, checklist } = bridge();
    const requirement = requirementFor(1);
    if (requirement === null) return;

    const rows = checklist();
    const properties = rows.filter((row) => row.label.startsWith('property:'));
    expect(properties.map((row) => row.label).sort()).toEqual(
      Object.keys(requirement.requiredProperties)
        .map((id) => `property:${id}`)
        .sort(),
    );
    for (const row of properties) {
      const id = row.label.slice('property:'.length);
      expect(row.need).toBe(requirement.requiredProperties[id]);
      expect(row.have).toBe(propertyLevel(sim.world, id));
    }

    // And a row ticks off when the level actually lands — not when it is paid
    // for, which is the whole point of the construction queue.
    sim.world.economy.cash = 100_000;
    expect(upgradeProperty(sim.world, 'parking')).toBe('ok');
    const building = checklist().find((row) => row.label === 'property:parking');
    expect(building?.have).toBe(1);

    advancePendingBuilds(sim.world, Number.MAX_SAFE_INTEGER);
    const done = checklist().find((row) => row.label === 'property:parking');
    expect(done?.have).toBe(2);
  });
});

describe('the main building is the stage, and its card says why not yet', () => {
  it('quotes the stage price and the first missing property', () => {
    const { sim, card } = bridge();
    sim.world.economy.cash = 100_000;

    const requirement = requirementFor(1);
    expect(requirement).not.toBeNull();
    if (requirement === null) return;

    const view = card('main');
    expect(view.nextCost).toBe(requirement.cashRequired);
    expect(view.nextBuildMs).toBe(requirement.constructionMs);
    // The property floor is short, and the card names which one — the exact
    // string a player reads before deciding what to buy next.
    expect(view.lockReason).toMatch(/Sv\. \d gerekli$/);
  });

  it('falls through the requirements in order once the lot is ready', () => {
    /*
     * Each clause in turn, because each is a different instruction: buy
     * something, serve more people, hire somebody, raise reputation. A single
     * "requirements not met" would collapse four different next actions into
     * one shrug.
     */
    const { sim, card } = bridge();
    const requirement = requirementFor(1);
    if (requirement === null) return;

    sim.world.economy.cash = 100_000;
    // Meet the property floor the way a player would.
    expect(upgradeProperty(sim.world, 'parking')).toBe('ok');
    advancePendingBuilds(sim.world, Number.MAX_SAFE_INTEGER);
    expect(buyBuilt(sim.world, 'bigger-counter')).toBe('ok');
    expect(buyBuilt(sim.world, 'hand-painted-sign')).toBe('ok');
    sim.world.stats.customersServed = requirement.customersServed;
    expect(card('main').lockReason).toBe('');

    // Now walk the other clauses by taking each one away in turn.
    sim.world.economy.cash = 0;
    expect(card('main').lockReason).toMatch(/^₡[\d.]+ eksik$/);

    sim.world.economy.cash = 100_000;
    sim.world.stats.customersServed = 0;
    expect(card('main').lockReason).toBe(`${String(requirement.customersServed)} müşteri daha`);
  });

  it('reports the last two clauses on a stage that asks for them', () => {
    // Stage 3 wants staff and reputation; Stage 2 wants neither, so the two
    // branches only exist on a world that has already evolved.
    const { sim, card } = bridge();
    sim.world.progression.stage = 2;
    sim.world.economy.cash = 100_000;
    sim.world.stats.customersServed = 100_000;
    sim.world.progression.propertyLevels.set('parking', 3);
    for (let i = 0; i < 8; i++) buyBuilt(sim.world, 'hand-painted-sign');
    expect(buyBuilt(sim.world, 'bigger-counter')).toBe('ok'); // queue-barriers' prereq
    for (let i = 0; i < 4; i++) buyBuilt(sim.world, 'queue-barriers');
    buyBuilt(sim.world, 'second-prep-station');

    expect(card('main').lockReason).toBe('Personel gerekli');
    hire(sim.world, 'cook', 0.5);
    sim.world.economy.reputation = 0;
    expect(card('main').lockReason).toBe('İtibar yetersiz');
  });

  it('says azami seviye at the last stage', () => {
    const { sim, card } = bridge();
    sim.world.progression.stage = 4;
    expect(card('main').lockReason).toBe('Azami seviye');
  });

  it('says a stage under construction is under construction', () => {
    const { sim, card } = bridge();
    sim.world.construction.targetStage = 2;
    sim.world.construction.elapsedMs = 1_000;
    sim.world.construction.totalMs = 12_000;
    expect(card('main').lockReason).toBe('İnşa ediliyor');
  });
});
