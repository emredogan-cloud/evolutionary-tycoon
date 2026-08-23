<script lang="ts">
  import { ensureSheet, frameStyle, onIconsReady } from '../lib/atlasIcons';
  import type { RoleView, StaffView } from '@app/bridge/hudModel';

  /**
   * The payroll — GAME_EXECUTION_ROADMAP Phase 10, rebuilt against
   * UI_REFERENCE_AUDIT §STAGE1_PRODUCT_EXPANSION_REFERENCES
   * (`personel-list-design.png`).
   *
   * "Personel paneli: liste, rol, skill, maaş, işe al/çıkar." A list rather than
   * a world-in-place card, and that is a deliberate difference from the upgrade
   * UI: an upgrade is a *place* — you click the sign — and a hire is not. There
   * is no object in the world to open a card beside before somebody exists.
   *
   * ## What the reference changes, and what it does not
   *
   * The reference's point is that **an employee is a person, not a row**: a
   * portrait, a name, and a coloured pill saying how they are getting on. The
   * old panel was three columns of grey text at one size, which is what the
   * directive means by the bare developer list.
   *
   * Two things in the reference are *not* copied, because the game does not
   * have them and drawing them would be the panel inventing mechanics:
   *
   * - The reference's `12 dk` per row is a tenure or shift clock. There is no
   *   such concept, so the second figure on our card is `busy01`, which is
   *   measured and varies and is the number a player actually needs.
   * - The reference's pills read `İyi / Orta / Uzman` — skill tiers. Every
   *   hire is at the same skill today (`DEFAULT_SKILL`), so a skill pill would
   *   say the same word on every card forever. Ours carries the **live state**
   *   instead, which is real, changes while you watch, and is what the colour
   *   is for.
   *
   * ## The names are cosmetic and say so
   *
   * `StaffView` has no name; the simulation has no reason to carry one. The
   * label is picked from a fixed table by `entityId`, so it is stable across a
   * save and identical on every machine, and nothing reads it back — it is not
   * hashed, not commanded, and not persisted. It exists because "Aşçı" three
   * times in a column is a spreadsheet and "Deniz, Aşçı" is a staff list.
   *
   * It is collapsed-capable but arrives open: Phase 18's dock owns opening
   * this panel, and a player who pressed "Personel" asked to see the staff,
   * not a second closed door.
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

  let open = $state(true);

  ensureSheet('ui');
  let iconRevision = $state(0);
  $effect(() => onIconsReady(() => (iconRevision += 1)));
  const icon = (frame: string, px: number): string | null => {
    void iconRevision;
    return frameStyle('ui', `${frame}@2x`, px);
  };

  /* `{@const}` is only legal inside a block; the header's icon is not. */
  const headIcon = $derived(icon('ui_icon_staff', 16));

  const ROLE_LABELS: Record<string, string> = {
    cook: 'Aşçı',
    waiter: 'Garson',
    cleaner: 'Temizlikçi',
  };

  const ROLE_FRAMES: Record<string, string> = {
    cook: 'ui_icon_role-cook',
    waiter: 'ui_icon_role-waiter',
    cleaner: 'ui_icon_role-cleaner',
  };

  /**
   * What each role is actually for — the directive's "Why should I hire this
   * person?", answered from measurement rather than from flavour text.
   *
   * The cook's line is the honest one and it took a measurement to write. At
   * Stage 1, over fifty simulated minutes, hiring a cook while the player is
   * also cooking changes throughput by **exactly nothing** (106 orders served
   * either way) and costs ₡37 in wages, because the player takes every order
   * the instant it is startable. The same cook, with the player not cooking at
   * all, serves 99 of those 106. So a cook is not a throughput upgrade; it is
   * what keeps the stand earning while nobody is playing it, which is the
   * light-idle model the game is built on. Saying "increases capacity" here
   * would be the panel lying about the simulation.
   */
  const ROLE_PITCH: Record<string, string> = {
    cook: 'Siparişleri kendi hazırlar. Sen tezgâhta değilken servisi de ayakta tutar.',
    waiter: "Pass'teki tabakları masalara taşır. Aşama 3'ten itibaren şart.",
    cleaner: 'Masaları toplar, memnuniyet düşüşünü yavaşlatır.',
  };

  /**
   * "Aşçı ne yapar?" — what the hire does and, just as importantly, what it
   * does not.
   *
   * The complaint this answers is that a ₡20 hire quietly took the whole game
   * over. It no longer does, and a panel that only said what it automates
   * would be hiding the half the player is being sold: **preparation is the
   * cook's, the counter is yours.** Every line is a fact the simulation can be
   * asked about — the cook's `tasks`, the cook's `fallbackTasks` and the
   * handover window — and `tests/unit/ui/roleDuties.test.ts` asks it.
   */
  const ROLE_DUTIES: Record<string, readonly { readonly does: boolean; readonly text: string }[]> = {
    cook: [
      { does: true, text: 'Mutfağı yönetir, siparişleri hazırlar' },
      { does: true, text: 'Sen yokken tezgâhı da devralır (4 sn sonra)' },
      { does: false, text: 'Servisi senin yerine üstlenmez' },
      { does: false, text: 'Fiyat, satın alma ve yerleşim kararı vermez' },
    ],
    waiter: [
      { does: true, text: 'Tabakları masalara taşır' },
      { does: false, text: 'Yemek pişirmez' },
    ],
    cleaner: [
      { does: true, text: 'Masaları toplar' },
      { does: false, text: 'Servise veya mutfağa girmez' },
    ],
  };

  /*
   * Four states, four different sentences. "İş yok" and "engellendi" used to
   * be the same word here because the simulation reported them as one state —
   * an employee with nothing to do and an employee whose work somebody else
   * had taken were both BLOCKED. They are different problems with opposite
   * answers (hire fewer / hire more), so they now read differently.
   *
   * The tone is what the reference's coloured dot carries: working is good,
   * moving is neutral, waiting behind someone else is a warning, and having
   * nothing to do at all is simply quiet.
   */
  const STATES: Record<string, { label: string; tone: string }> = {
    IDLE: { label: 'iş yok', tone: 'idle' },
    MOVING: { label: 'yolda', tone: 'moving' },
    PERFORMING: { label: 'çalışıyor', tone: 'working' },
    BLOCKED: { label: 'sırada bekliyor', tone: 'blocked' },
  };

  const money = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /*
   * Cosmetic labels only — see the component note. Kept deliberately short so
   * a name never pushes the wage off its own row, and deliberately plain so no
   * card has to be re-cut when the table grows.
   */
  const NAMES = [
    'Deniz',
    'Ayşe',
    'Gürcan',
    'Selin',
    'Emre',
    'Nur',
    'Kerem',
    'Bora',
    'Elif',
    'Tolga',
    'Sema',
    'Ozan',
  ] as const;

  const nameOf = (entityId: number): string =>
    NAMES[((entityId % NAMES.length) + NAMES.length) % NAMES.length] ?? 'Personel';

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
    <span class="title">Personel</span>
    <span class="count" data-testid="staff-count">
      {#if headIcon !== null}<i style={headIcon} aria-hidden="true"></i>{/if}
      {staff.length}
    </span>
    <span class="payroll" data-testid="staff-payroll" data-payroll={payroll.toFixed(2)}>
      ₡{money.format(payroll)}/dk
    </span>
  </button>

  {#if open}
    <ul class="list">
      {#each staff as person (person.entityId)}
        {@const state = STATES[person.state] ?? { label: person.state, tone: 'idle' }}
        {@const portrait = icon(ROLE_FRAMES[person.roleId] ?? 'ui_icon_staff', 38)}
        <li data-testid="staff-row" data-entity={person.entityId} data-role={person.roleId}>
          <span class="portrait {person.roleId}" aria-hidden="true">
            {#if portrait !== null}<i style={portrait}></i>{/if}
          </span>

          <div class="card">
            <div class="line">
              <strong class="name">{nameOf(person.entityId)}</strong>
              <span class="wage">₡{money.format(person.wagePerMinute)}/dk</span>
            </div>

            <div class="line">
              <span class="role">{ROLE_LABELS[person.roleId] ?? person.roleId}</span>
              <span
                class="busy"
                class:cold={person.busy01 < 0.05}
                title="Son bir dakikada çalışma oranı"
                data-testid="staff-busy"
                data-busy={person.busy01.toFixed(3)}
              >
                %{(person.busy01 * 100).toFixed(0)} meşgul
              </span>
            </div>

            <div class="line">
              <span class="pill {state.tone}" data-testid="staff-state">
                <b aria-hidden="true"></b>
                {state.label}
              </span>
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
            </div>
          </div>
        </li>
      {/each}

      {#if staff.length === 0}
        <li class="empty">Henüz kimse yok. Aşağıdan ilk kişiyi işe al.</li>
      {/if}
    </ul>

    <div class="hire">
      {#each roles as role (role.id)}
        {@const portrait = icon(ROLE_FRAMES[role.id] ?? 'ui_icon_hire', 32)}
        <button
          type="button"
          data-testid="staff-hire"
          data-role={role.id}
          disabled={!role.affordable || full}
          onclick={() => {
            onhire(role.id, DEFAULT_SKILL);
          }}
        >
          <span class="portrait small {role.id}" aria-hidden="true">
            {#if portrait !== null}<i style={portrait}></i>{/if}
          </span>
          <span class="hire-role">{ROLE_LABELS[role.id] ?? role.id}</span>
          <span class="cost">₡{role.hireCost}</span>
          <span class="pitch">{ROLE_PITCH[role.id] ?? ''}</span>
          <ul class="duties" data-testid="staff-duties" data-role={role.id}>
            {#each ROLE_DUTIES[role.id] ?? [] as duty (duty.text)}
              <li class:no={!duty.does}>
                <span aria-hidden="true">{duty.does ? '✓' : '✕'}</span>
                <span>{duty.text}</span>
              </li>
            {/each}
          </ul>
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
    right: var(--space-4);
    /* Clear of the action dock: the dock owns the bottom edge (Phase 18),
       and a panel underlapping it eats the very clicks that opened it. */
    bottom: calc(var(--touch-target) + var(--space-4) + var(--space-4));
    z-index: var(--z-panel);
    overflow: hidden;
    width: 17rem;
    max-width: calc(100vw - 2 * var(--space-4));
    border: var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-glass);
    box-shadow: var(--shadow-panel);
    backdrop-filter: blur(6px);
    pointer-events: auto;
  }

  /* ---- header ---- */

  .toggle {
    display: flex;
    width: 100%;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: none;
    color: var(--ink);
    cursor: pointer;
    font: inherit;
    gap: var(--space-2);
    text-align: left;
  }

  .title {
    font-size: var(--text-base);
    font-weight: 700;
  }

  .count {
    display: flex;
    align-items: center;
    color: var(--info);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    gap: 3px;
  }

  .payroll {
    margin-left: auto;
    color: var(--danger);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  /* ---- the people ---- */

  .list {
    display: grid;
    margin: 0;
    padding: 0 var(--space-3) var(--space-2);
    gap: var(--space-2);
    list-style: none;
  }

  .list li {
    display: grid;
    align-items: stretch;
    gap: var(--space-2);
    grid-template-columns: auto 1fr;
  }

  /*
   * The reference's square portrait tile — with what the delivered set
   * actually contains in it.
   *
   * `ui_icon_role-*` are not portraits: each is a ~120 px *scene* of four to
   * six objects (a chef's hat over a board and a pan; a cloche, clipboard,
   * waistcoat and napkin; a mop, trolley and wet-floor sign). Rendered at
   * portrait size the cook survives on the hat's silhouette and the other two
   * collapse into a grey-white blob and a blue-yellow blob — checked by
   * cropping the three frames out of `ui.webp` and looking at them at the size
   * they are drawn.
   *
   * So the tile carries a role-tinted ground under the illustration. The tint
   * is what actually distinguishes the three at a glance; the illustration
   * says which trade once you look. It is a real fix for a measured legibility
   * problem, not a stand-in for the missing art — the per-role portrait set is
   * filed as an asset requirement, and when it lands it drops into this tile
   * and the tint can go.
   */
  .portrait {
    display: grid;
    width: 48px;
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    place-items: center;
  }

  .portrait.cook {
    background: color-mix(in srgb, var(--amber-700) 40%, var(--surface-sunken));
  }
  .portrait.waiter {
    background: color-mix(in srgb, var(--azure-700) 40%, var(--surface-sunken));
  }
  .portrait.cleaner {
    background: color-mix(in srgb, var(--foliage-700) 40%, var(--surface-sunken));
  }

  .portrait.small {
    width: 40px;
    height: 40px;
    grid-area: art;
  }

  .card {
    display: grid;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    gap: 2px;
  }

  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .name {
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .wage {
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .role {
    color: var(--info);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .busy {
    color: var(--ink-dim);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .busy.cold {
    color: var(--ink-dim);
    opacity: 0.7;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    padding: 1px var(--space-2) 1px var(--space-1);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--neutral-900) 60%, transparent);
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    gap: 4px;
  }

  /* Never colour alone: the dot is the colour, the word is the meaning. */
  .pill b {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentcolor;
  }

  .pill.working {
    color: var(--ok);
  }
  .pill.moving {
    color: var(--info);
  }
  .pill.blocked {
    color: var(--warning);
  }
  .pill.idle {
    color: var(--ink-dim);
  }

  .fire {
    padding: 2px var(--space-2);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-dim);
    cursor: pointer;
    font-size: var(--text-xs);
  }

  .fire:hover {
    border-color: var(--danger);
    color: var(--danger);
  }

  .empty {
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }

  /* ---- hiring ---- */

  .hire {
    display: grid;
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-top: var(--border);
    gap: var(--space-2);
  }

  .hire button {
    display: grid;
    align-items: center;
    padding: var(--space-2);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    color: var(--ink);
    cursor: pointer;
    gap: 0 var(--space-2);
    grid-template-areas:
      'art role cost'
      'art pitch pitch'
      'duties duties duties';
    grid-template-columns: auto 1fr auto;
    text-align: left;
  }

  .hire button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .hire-role {
    font-size: var(--text-sm);
    font-weight: 700;
    grid-area: role;
  }

  .cost {
    color: var(--accent);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    grid-area: cost;
  }

  .pitch {
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    grid-area: pitch;
    line-height: 1.3;
  }

  /* What the hire does, and what it leaves to the player. Never colour alone:
     the tick and the cross carry the meaning, the colour only reinforces it. */
  .duties {
    display: grid;
    margin: var(--space-1) 0 0;
    padding: 0;
    grid-area: duties;
    list-style: none;
  }

  .duties li {
    display: grid;
    align-items: start;
    color: var(--ok);
    font-size: var(--text-xs);
    gap: 0 0.35em;
    grid-template-columns: 1em 1fr;
    line-height: 1.35;
  }

  .duties li.no {
    color: var(--ink-dim);
  }

  .full {
    margin: 0;
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }

  @media (max-width: 700px) {
    .panel {
      width: 14.5rem;
    }
    .portrait {
      width: 38px;
    }
  }
</style>
