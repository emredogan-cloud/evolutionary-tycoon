import { describe, expect, it } from 'vitest';
import { wireFx, type FxSinks } from '@render/fx/FxWiring';
import type { SimEvent } from '@sim/core/events';

function recorder(havePosition = true): {
  sinks: FxSinks;
  spawned: { id: string; x: number; y: number }[];
  played: { key: string; x: number | undefined }[];
} {
  const spawned: { id: string; x: number; y: number }[] = [];
  const played: { key: string; x: number | undefined }[] = [];
  return {
    spawned,
    played,
    sinks: {
      spawnAtWorld: (id, x, y) => {
        spawned.push({ id, x, y });
      },
      play: (key, x) => {
        played.push({ key, x });
      },
      positionOf: () => (havePosition ? { x: 3, y: 4 } : null),
      lotCentre: () => ({ x: 11, y: 12 }),
    },
  };
}

describe('the event → effect wiring', () => {
  it('payment: coins at the customer, tip sparkle only when tipped', () => {
    const { sinks, spawned, played } = recorder();
    wireFx({ t: 'PAYMENT', customerId: 1, amount: 5, tip: 1, satisfaction: 0.9 }, sinks);
    expect(spawned.map((entry) => entry.id)).toEqual(['coin_burst', 'tip_sparkle']);
    expect(played[0]?.key).toBe('coin');

    const second = recorder();
    wireFx({ t: 'PAYMENT', customerId: 1, amount: 5, tip: 0, satisfaction: 0.5 }, second.sinks);
    expect(second.spawned.map((entry) => entry.id)).toEqual(['coin_burst']);
  });

  it('an off-screen entity spawns nothing but the sound still plays', () => {
    const { sinks, spawned, played } = recorder(false);
    wireFx({ t: 'PAYMENT', customerId: 9, amount: 5, tip: 2, satisfaction: 1 }, sinks);
    expect(spawned).toHaveLength(0);
    expect(played[0]?.key).toBe('coin');
  });

  it('kitchen moments: bell on ready, sizzle on prep, plate on delivery', () => {
    const { sinks, played, spawned } = recorder();
    wireFx({ t: 'ORDER_READY', entityId: 1 } as SimEvent, sinks);
    wireFx({ t: 'PREP_STARTED', entityId: 1 } as SimEvent, sinks);
    wireFx({ t: 'ORDER_DELIVERED', entityId: 1, customerId: 2 }, sinks);
    expect(played.map((entry) => entry.key)).toEqual(['bell_ready', 'sizzle', 'plate']);
    expect(spawned.map((entry) => entry.id)).toEqual(['steam_puff']);
  });

  it('an angry exit puffs at the person and sounds upset', () => {
    const { sinks, spawned, played } = recorder();
    wireFx({ t: 'CUSTOMER_LEFT_ANGRY', entityId: 5, reason: 1, dwellMs: 1000 }, sinks);
    expect(spawned[0]?.id).toBe('angry_puff');
    expect(played[0]?.key).toBe('chatter_upset');
  });

  it('an upgrade bursts at its own anchor', () => {
    const { sinks, spawned, played } = recorder();
    wireFx({ t: 'UPGRADE_APPLIED', upgradeId: 'hand-painted-sign', level: 1 } as SimEvent, sinks);
    expect(spawned[0]?.id).toBe('upgrade_burst');
    expect(spawned[0]?.x).toBeCloseTo(16.4, 6);
    expect(played[0]?.key).toBe('upgrade_bought');
  });

  it('an unknown upgrade id still sounds but cannot burst anywhere', () => {
    const { sinks, spawned, played } = recorder();
    wireFx({ t: 'UPGRADE_APPLIED', upgradeId: 'not-a-thing', level: 1 } as SimEvent, sinks);
    expect(spawned).toHaveLength(0);
    expect(played[0]?.key).toBe('upgrade_bought');
  });

  it('evolution celebrates at the lot centre; construction dusts it', () => {
    const { sinks, spawned, played } = recorder();
    wireFx({ t: 'STAGE_CHANGED', from: 1, to: 2 }, sinks);
    wireFx({ t: 'CONSTRUCTION_STARTED', stage: 2, durationMs: 1 }, sinks);
    expect(spawned.map((entry) => entry.id)).toEqual(['evolution_celebration', 'construction_dust']);
    expect(spawned[0]?.x).toBe(11);
    expect(played.map((entry) => entry.key)).toEqual(['stage_evolved']);
  });

  it('hires poof, brakes sound, milestones ring', () => {
    const { sinks, spawned, played } = recorder();
    wireFx({ t: 'EMPLOYEE_HIRED', entityId: 7, roleId: 'cook' } as SimEvent, sinks);
    wireFx({ t: 'VEHICLE_BRAKED', entityId: 3 } as SimEvent, sinks);
    wireFx({ t: 'STAGE_UNLOCKED', stage: 2 }, sinks);
    expect(spawned[0]?.id).toBe('hire_poof');
    expect(played.map((entry) => entry.key)).toEqual(['brake', 'milestone']);
  });

  it('the deliberately silent moments stay silent', () => {
    const { sinks, spawned, played } = recorder();
    for (const t of [
      'DAY_STARTED',
      'SPEED_CHANGED',
      'WEATHER_CHANGED',
      'ORDER_PLACED',
      'OBJECT_REMOVED',
    ] as const) {
      wireFx({ t } as unknown as SimEvent, sinks);
    }
    expect(spawned).toHaveLength(0);
    expect(played).toHaveLength(0);
  });
});
