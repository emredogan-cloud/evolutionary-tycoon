import { describe, expect, it } from 'vitest';
import { DEMOLISH_REFUND_FRACTION, STORE_ITEMS, storeItem } from '@config/store';
import { worldObject, worldObjectIndexOf } from '@config/sprites';
import { Sim } from '@sim/core/Sim';
import { buyPlace, movePlaced, refundFor, sellPlaced } from '@sim/systems/StoreSystem';
import { zoneAllows } from '@sim/systems/LayoutSystem';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';

/**
 * The reported bug, pinned so it cannot come back.
 *
 * > "buys hand-painted sign · pays · places it · but trash can / flower appears"
 *
 * The cause was never a drifting id — the simulation stores what it is handed.
 * It was two purchase surfaces on one screen, one of them holding its own
 * armed prop. These tests assert the property that makes that class of bug
 * impossible rather than the specific pairing that happened to surface it:
 * **whatever the player buys is what stands on the lot, for every entry in the
 * catalogue, with nothing in between allowed to reinterpret it.**
 */

/** A spot inside the item's zone at Stage 4, where every stage gate is open. */
function spotFor(itemId: string, index: number): { x: number; y: number } {
  const item = storeItem(itemId);
  if (item === undefined) throw new Error(`no catalogue entry ${itemId}`);
  // Roadside items go by the road; everything else goes on open ground well
  // clear of the counter, spread out so no two share a cell.
  const y = item.zone === 'roadside' ? 9 : 16.5;
  return { x: 1 + index * 1.5, y };
}

function stage4(seed = 7): Sim {
  const sim = new Sim({ seed });
  sim.world.progression.stage = 4;
  sim.world.economy.cash = 10_000;
  return sim;
}

describe('what the player buys is what appears', () => {
  it('places every catalogue item as itself, and never as another', () => {
    const sim = stage4();

    STORE_ITEMS.forEach((item, index) => {
      const spot = spotFor(item.id, index);
      expect(buyPlace(sim.world, item.id, spot.x, spot.y), `buying ${item.id}`).toBe('ok');

      const row = sim.world.layout.placed.at(-1);
      expect(row, `${item.id} placed nothing`).toBeDefined();
      // The identity the player bought…
      expect(row?.itemId, `${item.id} lost its identity`).toBe(item.id);
      // …and the thing the renderer will actually draw for it.
      expect(row?.objectId, `${item.id} drew the wrong object`).toBe(item.objectId);
      expect(
        worldObjectIndexOf(row?.objectId ?? ''),
        `${item.id} resolves to no catalogue sprite`,
      ).toBeGreaterThanOrEqual(0);
    });

    expect(sim.world.layout.placed).toHaveLength(STORE_ITEMS.length);
  });

  it('gives every catalogue entry real art to be drawn as', () => {
    // A card for an asset that does not exist is the placeholder problem
    // wearing a price tag.
    for (const item of STORE_ITEMS) {
      expect(worldObject(item.objectId), `${item.id} names a missing object`).toBeDefined();
    }
  });

  it('carries every identity through a save and a reload, then refunds correctly', () => {
    /*
     * The one leg of the directive's buy → place → move → save → reload →
     * remove → refund chain that nothing asserted end to end.
     *
     * Identity is the whole point. A save writes `itemId` and a reload reads
     * it back, and every later answer — what this refunds, whether it may
     * stand here, what the player actually owns — is derived from that field.
     * If a round-trip dropped it, the object would still be *drawn* correctly
     * (`objectId` is stored beside it) and would silently refund nothing: a
     * sign that became a flower on the only axis the player can measure.
     */
    const before = stage4();
    const spots = STORE_ITEMS.map((item, index) => spotFor(item.id, index));
    STORE_ITEMS.forEach((item, index) => {
      expect(buyPlace(before.world, item.id, spots[index]?.x ?? 0, spots[index]?.y ?? 0)).toBe('ok');
    });

    const snapshot = snapshotWorld(before.world);
    const after = new Sim({ seed: 7 });
    restoreWorld(after.world, snapshot);

    expect(after.world.layout.placed).toHaveLength(STORE_ITEMS.length);
    STORE_ITEMS.forEach((item, index) => {
      const row = after.world.layout.placed[index];
      expect(row?.itemId, `${item.id} lost its identity across a reload`).toBe(item.id);
      expect(row?.objectId, `${item.id} came back as something else`).toBe(item.objectId);
      expect(row?.x, `${item.id} moved across a reload`).toBeCloseTo(spots[index]?.x ?? 0, 6);
    });

    /*
     * And the refund still knows what each row cost — which is only true
     * because it is read from the reloaded `itemId` rather than guessed from
     * whatever the row happens to be drawn as.
     */
    after.world.economy.cash = 0;
    for (let index = after.world.layout.placed.length - 1; index >= 0; index--) {
      const item = storeItem(after.world.layout.placed[index]?.itemId ?? '');
      const expected = refundFor(after.world, index);
      expect(expected).toBeCloseTo((item?.cost ?? 0) * DEMOLISH_REFUND_FRACTION, 6);
      expect(sellPlaced(after.world, index)).toBe(true);
    }

    expect(after.world.layout.placed, 'something survived being sold back').toHaveLength(0);
    const total = STORE_ITEMS.reduce((sum, item) => sum + item.cost, 0);
    expect(after.world.economy.cash).toBeCloseTo(total * DEMOLISH_REFUND_FRACTION, 6);
  });

  it('keeps ids unique, so no two cards can claim one identity', () => {
    const ids = new Set(STORE_ITEMS.map((item) => item.id));
    expect(ids.size).toBe(STORE_ITEMS.length);
  });

  it('carries the identity through a move, unchanged', () => {
    const sim = stage4();
    expect(buyPlace(sim.world, 'roadside-sign', 6, 9)).toBe('ok');
    const before = { ...sim.world.layout.placed[0] };

    expect(movePlaced(sim.world, 0, 14, 9)).toBe('ok');

    const after = sim.world.layout.placed[0];
    expect(sim.world.layout.placed, 'a move duplicated the object').toHaveLength(1);
    expect(after?.itemId, 'a move re-identified the object').toBe(before.itemId);
    expect(after?.objectId).toBe(before.objectId);
    expect(after?.x, 'the object did not actually move').not.toBe(before.x);
  });

  it('does not refund, re-site or re-charge a move', () => {
    const sim = stage4();
    const item = storeItem('lamp-post');
    const start = sim.world.economy.cash;
    expect(buyPlace(sim.world, 'lamp-post', 4, 16.5)).toBe('ok');
    const afterBuy = sim.world.economy.cash;
    expect(start - afterBuy).toBeCloseTo(item?.cost ?? 0, 6);

    // Let the purchase's own construction site finish before moving it.
    sim.advance(600);
    expect(sim.world.layout.pendingBuilds).toHaveLength(0);

    expect(movePlaced(sim.world, 0, 8, 16.5)).toBe('ok');
    expect(sim.world.economy.cash, 'a move touched the till').toBeCloseTo(afterBuy, 6);
    expect(sim.world.layout.pendingBuilds, 'a move raised new scaffolding').toHaveLength(0);
  });
});

describe('what a purchase costs, and what selling it back returns', () => {
  it('charges the catalogue price, once', () => {
    const sim = stage4();
    const start = sim.world.economy.cash;
    const item = storeItem('sapling');
    expect(buyPlace(sim.world, 'sapling', 3, 16.5)).toBe('ok');
    expect(start - sim.world.economy.cash).toBeCloseTo(item?.cost ?? 0, 6);
  });

  it('refuses, and charges nothing, when the money is not there', () => {
    const sim = stage4();
    sim.world.economy.cash = 1;
    expect(buyPlace(sim.world, 'lamp-post', 3, 16.5)).toBe('unaffordable');
    expect(sim.world.economy.cash).toBe(1);
    expect(sim.world.layout.placed).toHaveLength(0);
  });

  it('charges nothing for a placement the lot refuses', () => {
    const sim = stage4();
    const start = sim.world.economy.cash;
    // Far outside the lot rectangle.
    expect(buyPlace(sim.world, 'sapling', 500, 500)).toBe('outside-lot');
    expect(sim.world.economy.cash, 'a refused placement still took the money').toBe(start);
    expect(sim.world.layout.placed).toHaveLength(0);
  });

  it('returns exactly thirty percent — ECONOMY_DESIGN E5, and never a profit', () => {
    const sim = stage4();
    const item = storeItem('patio-table');
    const start = sim.world.economy.cash;

    expect(buyPlace(sim.world, 'patio-table', 5, 16.5)).toBe('ok');
    expect(refundFor(sim.world, 0)).toBeCloseTo((item?.cost ?? 0) * DEMOLISH_REFUND_FRACTION, 6);

    expect(sellPlaced(sim.world, 0)).toBe(true);
    const net = start - sim.world.economy.cash;
    expect(net, 'buy-place-remove was free or profitable').toBeGreaterThan(0);
    expect(net).toBeCloseTo((item?.cost ?? 0) * (1 - DEMOLISH_REFUND_FRACTION), 6);
    expect(sim.world.layout.placed).toHaveLength(0);
  });

  it('pays nothing for something the player never bought', () => {
    const sim = stage4();
    // A decor row with no `itemId` — what every pre-store save carries.
    sim.world.layout.placed.push({ objectId: 'bin', x: 5, y: 16.5, z: 0 });
    const start = sim.world.economy.cash;

    expect(refundFor(sim.world, 0)).toBe(0);
    expect(sellPlaced(sim.world, 0)).toBe(true);
    expect(sim.world.economy.cash, 'refunded a purchase that never happened').toBe(start);
  });
});

describe('the gates a purchase has to pass', () => {
  it('refuses an item the stage has not reached', () => {
    const sim = new Sim({ seed: 3 });
    sim.world.economy.cash = 10_000;
    // Stage 1 by default; the terrace furniture opens at 3.
    expect(buyPlace(sim.world, 'patio-table', 5, 16.5)).toBe('locked');
    expect(sim.world.layout.placed).toHaveLength(0);
  });

  it('refuses an id no catalogue entry claims', () => {
    const sim = stage4();
    expect(buyPlace(sim.world, 'not-a-real-item', 5, 16.5)).toBe('unknown');
  });

  it('keeps a roadside item by the road, on purchase and on move', () => {
    const sim = stage4();
    const item = storeItem('roadside-sign');
    expect(item?.zone).toBe('roadside');

    // The back of the lot is not the roadside.
    expect(buyPlace(sim.world, 'roadside-sign', 6, 17.5)).toBe('wrong-zone');
    expect(sim.world.layout.placed).toHaveLength(0);

    expect(buyPlace(sim.world, 'roadside-sign', 6, 9)).toBe('ok');
    expect(movePlaced(sim.world, 0, 6, 17.5), 'the zone rule did not follow the object').toBe('wrong-zone');
  });

  it('lets anything zoned to the lot stand anywhere the lot allows', () => {
    const sim = stage4();
    expect(zoneAllows(sim.world, 'lot', 1, 17.5)).toBe(true);
    expect(zoneAllows(sim.world, 'roadside', 1, 17.5)).toBe(false);
  });
});

describe('the edges of the store, where indexes do not exist', () => {
  it('sells nothing, and pays nothing, for a row that is not there', () => {
    const sim = stage4();
    const start = sim.world.economy.cash;
    expect(sellPlaced(sim.world, 0)).toBe(false);
    expect(sellPlaced(sim.world, -1)).toBe(false);
    expect(refundFor(sim.world, 7)).toBe(0);
    expect(sim.world.economy.cash).toBe(start);
  });

  it('refuses to move a row that is not there', () => {
    const sim = stage4();
    expect(movePlaced(sim.world, 3, 5, 16.5)).toBe('outside-lot');
    expect(movePlaced(sim.world, -1, 5, 16.5)).toBe('outside-lot');
  });

  it('refuses a second object in a taken cell, and charges nothing for it', () => {
    const sim = stage4();
    expect(buyPlace(sim.world, 'shrub', 5, 16.5)).toBe('ok');
    const afterFirst = sim.world.economy.cash;

    expect(buyPlace(sim.world, 'shrub-wide', 5, 16.5)).toBe('occupied');
    expect(sim.world.economy.cash, 'a refused placement still took the money').toBe(afterFirst);
    expect(sim.world.layout.placed).toHaveLength(1);
  });

  it('refuses to move an object onto another one', () => {
    const sim = stage4();
    expect(buyPlace(sim.world, 'shrub', 5, 16.5)).toBe('ok');
    expect(buyPlace(sim.world, 'shrub-wide', 7, 16.5)).toBe('ok');

    // The refused move must leave both objects exactly where they were.
    expect(movePlaced(sim.world, 1, 5, 16.5)).toBe('occupied');
    expect(sim.world.layout.placed).toHaveLength(2);
    expect(sim.world.layout.placed[1]?.x).toBe(7);
    expect(sim.world.layout.placed[1]?.itemId).toBe('shrub-wide');
  });

  it('moves an anonymous object without asking it for a zone it has none of', () => {
    const sim = stage4();
    // No `itemId`, so no catalogue entry and no zone rule — it is just an
    // object, and moving it is pure geometry.
    sim.world.layout.placed.push({ objectId: 'bin', x: 5, y: 16.5, z: 0 });
    expect(movePlaced(sim.world, 0, 9, 16.5)).toBe('ok');
    expect(sim.world.layout.placed[0]?.x).toBe(9);
    expect(sim.world.layout.placed[0]?.itemId).toBeUndefined();
  });
});
