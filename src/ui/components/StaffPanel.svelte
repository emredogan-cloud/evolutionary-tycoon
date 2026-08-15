<script lang="ts">
  import type { RoleView, StaffView } from '@app/bridge/hudModel';

  /**
   * The payroll — GAME_EXECUTION_ROADMAP Phase 10.
   *
   * "Personel paneli: liste, rol, skill, maaş, işe al/çıkar." A list rather than
   * a world-in-place card, and that is a deliberate difference from the upgrade
   * UI: an upgrade is a *place* — you click the sign — and a hire is not. There
   * is no object in the world to open a card beside before somebody exists.
   *
   * It is collapsed by default. Eight employees, three roles and a wage bill is
   * a lot of chrome for a screen whose whole point is that the game is visible,
   * and TECHNICAL_ARCHITECTURE §7 budgets 22% of the viewport for all UI.
   */
  interface Props {
    staff: readonly StaffView[];
    roles: readonly RoleView[];
    payroll: number;
    full: boolean;
    onhire: (roleId: string, skill: number) => void;
    onfire: (entityId: number) => void;
  }

  const { staff, roles, payroll, full, onhire, onfire }: Props = $props();

  let open = $state(false);

  const ROLE_LABELS: Record<string, string> = {
    cook: 'Aşçı',
    waiter: 'Garson',
    cleaner: 'Temizlikçi',
  };

  const STATE_LABELS: Record<string, string> = {
    IDLE: 'boşta',
    MOVING: 'yolda',
    PERFORMING: 'çalışıyor',
    BLOCKED: 'iş yok',
  };

  const money = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /*
   * Every hire is at the same skill for now. The applicant pool — three
   * candidates with different skills and wages, pick one — is a Phase 13
   * feature, and a slider here would be the player choosing their own
   * difficulty rather than making a decision about people.
   */
  const DEFAULT_SKILL = 0.5;
</script>

<section class="panel" class:open aria-label="Personel" data-testid="staff-panel">
  <button
    class="toggle"
    type="button"
    data-testid="staff-toggle"
    aria-expanded={open}
    onclick={() => {
      open = !open;
    }}
  >
    <span>Personel</span>
    <span class="count" data-testid="staff-count">{staff.length}</span>
    <span class="payroll" data-testid="staff-payroll" data-payroll={payroll.toFixed(2)}>
      ₡{money.format(payroll)}/dk
    </span>
  </button>

  {#if open}
    <ul class="list">
      {#each staff as person (person.entityId)}
        <li data-testid="staff-row" data-entity={person.entityId} data-role={person.roleId}>
          <div class="who">
            <span class="role">{ROLE_LABELS[person.roleId] ?? person.roleId}</span>
            <span class="state" data-testid="staff-state">{STATE_LABELS[person.state] ?? person.state}</span>
          </div>
          <div class="numbers">
            <span title="Yetenek">★ {(person.skill * 100).toFixed(0)}</span>
            <span title="Ücret">₡{money.format(person.wagePerMinute)}/dk</span>
          </div>
          <button
            class="fire"
            type="button"
            data-testid="staff-fire"
            onclick={() => {
              onfire(person.entityId);
            }}
          >
            Çıkar
          </button>
        </li>
      {/each}

      {#if staff.length === 0}
        <li class="empty">Henüz kimse yok.</li>
      {/if}
    </ul>

    <div class="hire">
      {#each roles as role (role.id)}
        <button
          type="button"
          data-testid="staff-hire"
          data-role={role.id}
          disabled={!role.affordable || full}
          onclick={() => {
            onhire(role.id, DEFAULT_SKILL);
          }}
        >
          <span>{ROLE_LABELS[role.id] ?? role.id}</span>
          <span class="cost">₡{role.hireCost}</span>
        </button>
      {/each}
      {#if full}
        <p class="full" data-testid="staff-full">Kadro dolu.</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .panel {
    position: absolute;
    right: var(--sp-4);
    bottom: var(--sp-4);
    width: 14rem;
    background: color-mix(in srgb, var(--c-surface) 90%, transparent);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    pointer-events: auto;
    backdrop-filter: blur(6px);
    overflow: hidden;
  }

  .toggle {
    display: flex;
    width: 100%;
    align-items: baseline;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    background: none;
    border: none;
    color: var(--c-text);
    font: inherit;
    font-size: var(--fs-xs);
    cursor: pointer;
    text-align: left;
  }

  .count {
    padding: 0 6px;
    border-radius: 999px;
    background: var(--c-surface-raised);
    font-weight: 700;
  }

  .payroll {
    margin-left: auto;
    color: var(--c-error);
    font-variant-numeric: tabular-nums;
  }

  .list {
    margin: 0;
    padding: 0 var(--sp-3) var(--sp-2);
    list-style: none;
  }

  .list li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 var(--sp-2);
    padding: var(--sp-2) 0;
    border-top: 1px solid var(--c-border);
    font-size: var(--fs-xs);
  }

  .who {
    display: flex;
    flex-direction: column;
  }

  .role {
    font-weight: 700;
  }

  .state {
    color: var(--c-text-dim);
  }

  .numbers {
    display: flex;
    flex-direction: column;
    align-items: end;
    color: var(--c-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .fire {
    grid-column: 1 / -1;
    justify-self: start;
    padding: 2px 6px;
    background: none;
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    color: var(--c-text-dim);
    font-size: var(--fs-xs);
    cursor: pointer;
  }

  .fire:hover {
    border-color: var(--c-error);
    color: var(--c-error);
  }

  .empty {
    color: var(--c-text-dim);
  }

  .hire {
    display: grid;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3) var(--sp-3);
    border-top: 1px solid var(--c-border);
  }

  .hire button {
    display: flex;
    justify-content: space-between;
    padding: var(--sp-2);
    background: var(--c-surface-raised);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    color: var(--c-text);
    font-size: var(--fs-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .hire button:disabled {
    color: var(--c-text-dim);
    cursor: not-allowed;
  }

  .cost {
    font-variant-numeric: tabular-nums;
    color: var(--c-accent);
  }

  .full {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--c-text-dim);
  }
</style>
