import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COUNTER_HANDOVER_MS, EMPLOYEE_ROLES, role, roleIndexOf } from '@config/employees';

/**
 * The staff panel says what a hire automates. It has to be telling the truth.
 *
 * The complaint that produced the responsibility split was that a ₡20 cook
 * quietly took the whole game over. The fix is only half a fix if the panel
 * then oversells or undersells what was bought — "DO NOT HIDE AUTOMATION
 * BEHIND AMBIGUOUS UI" is the directive's wording, and an ambiguous panel is
 * exactly what a hand-written duty list becomes three refactors later.
 *
 * So each claim on the card is checked against the config it describes. The
 * text is read out of the component rather than imported, because the component
 * is a `.svelte` file and the point is to catch the day somebody edits the copy
 * without editing the simulation — importing a shared constant would make the
 * two agree by construction and prove nothing.
 */

const PANEL = readFileSync(join(process.cwd(), 'src/ui/components/StaffPanel.svelte'), 'utf8');

describe('the staff panel’s duty list matches the simulation', () => {
  it('claims a cook prepares, which is the cook’s own task table', () => {
    expect(role(roleIndexOf('cook')).tasks).toContain('PREP_ORDER');
    expect(PANEL).toContain('Mutfağı yönetir, siparişleri hazırlar');
  });

  it('claims a cook covers the counter only as a fallback, and names the window', () => {
    const cook = role(roleIndexOf('cook'));
    expect(cook.tasks, 'a cook that owned delivery outright').not.toContain('DELIVER_ORDER');
    expect(cook.fallbackTasks, 'a cook that could never cover the counter').toContain('DELIVER_ORDER');

    // The card promises a number. It has to be the number.
    const seconds = COUNTER_HANDOVER_MS / 1000;
    expect(PANEL, `the card should say ${String(seconds)} sn`).toContain(`(${String(seconds)} sn sonra)`);
  });

  it('does not claim a cook serves for the player', () => {
    // The negative half of the split, and the one a future "improvement" is
    // most likely to break by promoting the fallback to a task.
    expect(PANEL).toContain('Servisi senin yerine üstlenmez');
  });

  it('claims a waiter carries and does not cook, which the role table says too', () => {
    const waiter = role(roleIndexOf('waiter'));
    expect(waiter.tasks).toContain('DELIVER_ORDER');
    expect(waiter.tasks).not.toContain('PREP_ORDER');
    expect(waiter.fallbackTasks).toEqual([]);
    expect(PANEL).toContain('Tabakları masalara taşır');
    expect(PANEL).toContain('Yemek pişirmez');
  });

  it('has a duty list for every role the panel can offer', () => {
    for (const spec of EMPLOYEE_ROLES) {
      expect(PANEL, `no duty list for ${spec.id}`).toContain(`${spec.id}: [`);
    }
  });
});
