import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_ANGRY,
  ACTIVITY_COOK,
  ACTIVITY_EAT,
  ACTIVITY_IDLE,
  ACTIVITY_PAY,
  ACTIVITY_TAKE_ORDER,
  ACTIVITY_WAIT_IMPATIENT,
  ACTIVITY_WALK,
  ACTIVITY_WALK_CARRY,
} from '@config/animation';
import { Sim } from '@sim/core/Sim';
import { hire } from '@sim/systems/StaffSystem';
import {
  STATE_ABANDONING,
  STATE_EATING,
  STATE_ORDERING,
  STATE_PAYING,
  STATE_QUEUEING_AT_COUNTER,
  STATE_WAITING_FOR_FOOD,
} from '@sim/ai/fsm/customerFsm';

/**
 * The readView activity derivation — Phase 17. White-box staging, exactly the
 * uiBridge fixtures' idiom: place a record in a state, read the view, assert
 * the clip selector the renderer would see.
 */
function stagedCustomer(sim: Sim, state: number, patienceFraction = 1): number {
  const slot = sim.world.customers.acquire();
  const record = sim.world.customers.at(slot);
  record.entityId = sim.world.allocateEntityId();
  record.visible = 1;
  record.state = state;
  record.x = 5;
  record.y = 5;
  record.targetX = 5;
  record.targetY = 5;
  record.patienceMaxMs = 10_000;
  record.patienceMs = 10_000 * patienceFraction;
  return record.entityId;
}

function activityOf(sim: Sim, entityId: number): number {
  const view = sim.readView();
  for (let i = 0; i < view.actorCount; i++) {
    const actor = view.actors[i];
    if (actor?.entityId === entityId) return actor.activity;
  }
  throw new Error('actor not in view');
}

describe('customer activity from the FSM', () => {
  it('eats, pays, orders and rages exactly per state', () => {
    const sim = new Sim({ seed: 1 });
    expect(activityOf(sim, stagedCustomer(sim, STATE_EATING))).toBe(ACTIVITY_EAT);
    expect(activityOf(sim, stagedCustomer(sim, STATE_PAYING))).toBe(ACTIVITY_PAY);
    expect(activityOf(sim, stagedCustomer(sim, STATE_ORDERING))).toBe(ACTIVITY_TAKE_ORDER);
    expect(activityOf(sim, stagedCustomer(sim, STATE_ABANDONING))).toBe(ACTIVITY_ANGRY);
  });

  it('queueing is idle while patient and fidgety once patience runs low', () => {
    const sim = new Sim({ seed: 1 });
    expect(activityOf(sim, stagedCustomer(sim, STATE_QUEUEING_AT_COUNTER, 0.9))).toBe(ACTIVITY_IDLE);
    expect(activityOf(sim, stagedCustomer(sim, STATE_QUEUEING_AT_COUNTER, 0.2))).toBe(
      ACTIVITY_WAIT_IMPATIENT,
    );
    expect(activityOf(sim, stagedCustomer(sim, STATE_WAITING_FOR_FOOD, 0.1))).toBe(ACTIVITY_WAIT_IMPATIENT);
  });

  it('movement wins over the waiting poses', () => {
    const sim = new Sim({ seed: 1 });
    const id = stagedCustomer(sim, STATE_QUEUEING_AT_COUNTER, 0.2);
    for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
      if (sim.world.customers.isActive(slot) && sim.world.customers.at(slot).entityId === id) {
        sim.world.customers.at(slot).targetX = 20;
      }
    }
    expect(activityOf(sim, id)).toBe(ACTIVITY_WALK);
  });
});

describe('employee activity from the task board', () => {
  it('a hired cook derives cook/serve/clean/idle from claimed task kind', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 500;
    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');
    const employees = sim.world.employees;
    const record = employees.at(0);
    record.x = 3;
    record.y = 3;
    record.targetX = 3;
    record.targetY = 3;

    // No task, standing: idle.
    record.state = 0;
    record.taskSlot = -1;
    expect(activityOf(sim, record.entityId)).toBe(ACTIVITY_IDLE);

    // Performing each task kind.
    const task = sim.world.tasks.acquire();
    const taskRecord = sim.world.tasks.at(task);
    record.taskSlot = task;
    record.state = 2;
    taskRecord.kind = 0; // PREP_ORDER
    expect(activityOf(sim, record.entityId)).toBe(ACTIVITY_COOK);
    taskRecord.kind = 1; // DELIVER_ORDER
    expect(activityOf(sim, record.entityId)).toBe(5); // ACTIVITY_SERVE
    taskRecord.kind = 2; // CLEAN_TABLE
    expect(activityOf(sim, record.entityId)).toBe(6); // ACTIVITY_CLEAN

    // Moving with a delivery: the carry walk. Moving without: plain walk.
    record.state = 1;
    taskRecord.kind = 1;
    expect(activityOf(sim, record.entityId)).toBe(ACTIVITY_WALK_CARRY);
    taskRecord.kind = 0;
    expect(activityOf(sim, record.entityId)).toBe(ACTIVITY_WALK);

    // Performing an unknown kind falls back to idle.
    record.state = 2;
    taskRecord.kind = 9;
    expect(activityOf(sim, record.entityId)).toBe(ACTIVITY_IDLE);
  });
});
