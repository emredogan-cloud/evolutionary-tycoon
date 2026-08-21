<script lang="ts">
  import type {
    HudSource,
    PlacedView,
    PriceView,
    ProgressionView,
    RoleView,
    StaffView,
    UiCommands,
    UpgradeView,
    WorldMarker,
  } from '@app/bridge/hudModel';
  import EnvironmentStrip from './EnvironmentStrip.svelte';
  import HudCash from './HudCash.svelte';
  import EvolutionPanel from './EvolutionPanel.svelte';
  import BuildMenu from '../screens/BuildMenu.svelte';
  import AudioSettings from '../screens/AudioSettings.svelte';
  import AnalyticsPanel from '../screens/AnalyticsPanel.svelte';
  import DiagnosticsPanel from '../screens/DiagnosticsPanel.svelte';
  import NotificationStrip from './NotificationStrip.svelte';
  import PauseOverlay from './PauseOverlay.svelte';
  import BuildMode from '../screens/BuildMode.svelte';
  import ObjectivePanel from './ObjectivePanel.svelte';
  import PricePanel from './PricePanel.svelte';
  import StaffIcons from './StaffIcons.svelte';
  import StaffPanel from './StaffPanel.svelte';
  import UpgradeCard from './UpgradeCard.svelte';
  import UpgradeHotspots from './UpgradeHotspots.svelte';
  import WorldMarkers from './WorldMarkers.svelte';

  /**
   * The overlay root: everything the DOM draws above the world.
   *
   * It takes a `HudSource` — a subscribe function and nothing else. The
   * simulation is not reachable from here, structurally: `src/ui` cannot import
   * `src/sim`, and what it does import is a plain data type with no methods to
   * call back through. The only way in is a `Command`, dispatched by `src/app`.
   *
   * ## Why the values are copied out instead of held as one object
   *
   * The bridge publishes **the same object every time**, refreshed in place, so
   * that sampling ten times a second allocates nothing. Svelte's reactivity is
   * reference-based: `hud = model` with an unchanged reference invalidates
   * nothing, and a `$derived` that returns the same object does not re-run its
   * dependents. Held that way the HUD renders once at boot and then never
   * updates again — which is indistinguishable from a simulation that has
   * stopped, and is exactly what happened.
   *
   * Copying a dozen primitives per sample is the fix and it is the right trade:
   * the expensive thing was reading the world per *frame*, which the throttle
   * already prevents. Ten small copies a second is nothing.
   */
  interface Props {
    source: HudSource;
    commands: UiCommands;
  }

  const { source, commands }: Props = $props();

  /**
   * Which upgrade card is open, or null.
   *
   * Component state rather than simulation state, and that is the right place
   * for it: which panel a player has open changes nothing about the world, must
   * not be hashed, must not be saved, and must not survive a replay.
   */
  let openUpgrade = $state<string | null>(null);
  /** One panel at a time — GDD §14.2's world-dominance rule made mechanical. */
  let openPanel = $state<'settings' | 'staff' | 'analytics' | 'diagnostics' | 'menu' | null>(null);

  let cash = $state(0);
  let reputation = $state(0);
  let customersServed = $state(0);
  let customersWaiting = $state(0);
  let gameDay = $state(0);
  let gameHour = $state(0);
  let weatherId = $state('CLEAR');
  let weatherLabel = $state('Açık');
  let eventId = $state('');
  let eventLabel = $state('');
  let eventRemainingMs = $state(0);
  // A fresh array per sample, because `{#each}` needs a new reference to
  // re-key. This is the one allocation the overlay makes, and it is bounded by
  // the number of visible markers rather than by the pool size.
  let markers = $state<WorldMarker[]>([]);
  let placed = $state<PlacedView[]>([]);
  let incomePerMinute = $state(0);
  let upgrades = $state<UpgradeView[]>([]);
  let prices = $state<PriceView[]>([]);
  let objective = $state('');
  let objectiveProgress = $state(0);
  let staff = $state<StaffView[]>([]);
  let roles = $state<RoleView[]>([]);
  let payroll = $state(0);
  let payrollFull = $state(false);
  let audioMix = $state({ master: 1, music: 1, sfx: 1, ambience: 1, muted: false });
  let reducedMotion = $state(false);
  let analytics = $state({ sampleSize: 0, converted: 0, reasonCounts: [] as number[] });
  let notices = $state<{ id: number; kind: string; text: string }[]>([]);
  let paused = $state(false);
  let showPauseVeil = $state(false);
  let highContrast = $state(false);

  /*
   * Presentation-only preferences live outside the world: they must survive
   * page loads (localStorage) but never enter a save, a hash, or a replay.
   */
  const storedScale = Number(localStorage.getItem('evo-ui-scale') ?? '1');
  let uiScale = $state(Number.isFinite(storedScale) && storedScale > 0 ? storedScale : 1);
  let dyslexiaFont = $state(localStorage.getItem('evo-dyslexia-font') === '1');

  $effect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
    document.documentElement.style.fontSize = `${String(16 * uiScale)}px`;
    localStorage.setItem('evo-ui-scale', String(uiScale));
  });
  $effect(() => {
    document.documentElement.classList.toggle('dyslexia-font', dyslexiaFont);
    localStorage.setItem('evo-dyslexia-font', dyslexiaFont ? '1' : '0');
  });
  $effect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast);
  });
  let progression = $state<ProgressionView>({
    stage: 1,
    pendingStage: 0,
    constructionProgress: 0,
    constructionRemainingMs: 0,
    constructing: false,
    requirements: [],
  });

  $effect(() =>
    source.subscribe((model) => {
      cash = model.cash;
      audioMix = { ...model.audio };
      analytics = {
        sampleSize: model.analytics.sampleSize,
        converted: model.analytics.converted,
        reasonCounts: [...model.analytics.reasonCounts],
      };
      notices = [...model.notices];
      paused = model.paused;
      showPauseVeil = model.showPauseVeil;
      highContrast = model.highContrast;
      reducedMotion = model.reducedMotion;
      reputation = model.reputation;
      customersServed = model.customersServed;
      customersWaiting = model.customersWaiting;
      gameDay = model.gameDay;
      gameHour = model.gameHour;
      weatherId = model.weatherId;
      weatherLabel = model.weatherLabel;
      eventId = model.eventId;
      eventLabel = model.eventLabel;
      eventRemainingMs = model.eventRemainingMs;

      const live: WorldMarker[] = [];
      for (let i = 0; i < model.markerCount; i++) {
        const marker = model.markers[i];
        // Copied, not referenced: the bridge rewrites these records in place on
        // the next sample, so a stored reference would silently change under a
        // component that had already rendered it.
        if (marker?.visible === true) live.push({ ...marker });
      }
      markers = live;
      // Copied for the same reason: `model.placed` is a reused buffer.
      /*
       * `model.placedCount` is read through a `$state` proxy, which erases to
       * `any` inside a Svelte component — so it is narrowed to a number here
       * rather than handed straight to `slice`, where the type-aware lint
       * (correctly) refuses an unsafe argument.
       */
      const placedCount: number = model.placedCount;
      placed = model.placed.slice(0, placedCount).map((object): PlacedView => ({ ...object }));

      incomePerMinute = model.incomePerMinute;
      objective = model.objective;
      objectiveProgress = model.objectiveProgress;
      // Copied for the same reason the markers are: the bridge rewrites these
      // records in place on the next sample.
      upgrades = model.upgrades.map((item): UpgradeView => ({
        ...item,
        effects: item.effects.map((effect) => ({ ...effect })),
      }));
      prices = model.prices.map((item): PriceView => ({ ...item }));
      staff = model.staff.slice(0, model.staffCount).map((person): StaffView => ({ ...person }));
      roles = model.roles.map((item): RoleView => ({ ...item }));
      payroll = model.payrollPerMinute;
      payrollFull = model.payrollFull;
      progression = {
        ...model.progression,
        requirements: model.progression.requirements.map((row) => ({ ...row })),
      };
    }),
  );
</script>

<svelte:window
  onkeydown={(event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (event.key === 'Escape' && openPanel !== null) {
      openPanel = null;
      event.preventDefault();
    } else if (event.key === ' ' && target?.tagName !== 'INPUT' && target?.tagName !== 'BUTTON') {
      commands.setPaused(!paused);
      event.preventDefault();
    }
  }}
/>

<div class="overlay" data-testid="game-hud">
  <EnvironmentStrip {gameHour} {weatherId} {weatherLabel} {eventId} {eventLabel} {eventRemainingMs} />
  <WorldMarkers {markers} />

  <StaffIcons {staff} />

  <UpgradeHotspots
    {upgrades}
    open={openUpgrade}
    ontoggle={(id: string) => {
      openUpgrade = openUpgrade === id ? null : id;
    }}
  />

  {#each upgrades as upgrade (upgrade.id)}
    {#if upgrade.id === openUpgrade && upgrade.visible}
      <UpgradeCard
        {upgrade}
        onbuy={(id: string) => {
          commands.buyUpgrade(id);
        }}
        onclose={() => {
          openUpgrade = null;
        }}
      />
    {/if}
  {/each}

  <HudCash {cash} {reputation} {customersServed} {customersWaiting} {gameDay} {gameHour} {incomePerMinute} />

  <nav class="action-dock" aria-label="Birincil eylemler">
    <button
      type="button"
      data-testid="dock-staff"
      aria-pressed={openPanel === 'staff'}
      onclick={() => {
        openPanel = openPanel === 'staff' ? null : 'staff';
      }}><span aria-hidden="true">👥</span> Personel</button
    >
    <button
      type="button"
      data-testid="dock-menu"
      aria-pressed={openPanel === 'menu'}
      onclick={() => {
        openPanel = openPanel === 'menu' ? null : 'menu';
      }}><span aria-hidden="true">🧾</span> Menü</button
    >
    <button
      type="button"
      data-testid="dock-analytics"
      aria-pressed={openPanel === 'analytics'}
      onclick={() => {
        openPanel = openPanel === 'analytics' ? null : 'analytics';
      }}><span aria-hidden="true">📊</span> Analiz</button
    >
    <button
      type="button"
      data-testid="settings-gear"
      aria-pressed={openPanel === 'settings'}
      aria-label="Ayarlar"
      onclick={() => {
        openPanel = openPanel === 'settings' ? null : 'settings';
      }}><span aria-hidden="true">⚙</span> Ayarlar</button
    >
    <button
      type="button"
      data-testid="dock-diagnostics"
      aria-pressed={openPanel === 'diagnostics'}
      aria-label="Tanılama"
      onclick={() => {
        openPanel = openPanel === 'diagnostics' ? null : 'diagnostics';
      }}><span aria-hidden="true">🛠</span></button
    >
  </nav>

  {#if openPanel === 'settings'}
    <AudioSettings
      audio={audioMix}
      {reducedMotion}
      {highContrast}
      {uiScale}
      {dyslexiaFont}
      {commands}
      onUiScale={(scale: number) => {
        uiScale = scale;
      }}
      onDyslexiaFont={(on: boolean) => {
        dyslexiaFont = on;
      }}
      onclose={() => {
        openPanel = null;
      }}
    />
  {/if}

  {#if openPanel === 'analytics'}
    <AnalyticsPanel
      {analytics}
      onclose={() => {
        openPanel = null;
      }}
    />
  {/if}
  {#if openPanel === 'diagnostics'}
    <DiagnosticsPanel
      {gameDay}
      {gameHour}
      stage={progression.stage}
      onclose={() => {
        openPanel = null;
      }}
    />
  {/if}

  <NotificationStrip {notices} />
  <PauseOverlay
    paused={showPauseVeil}
    ontoggle={() => {
      commands.setPaused(!paused);
    }}
  />
  <ObjectivePanel {objective} progress={objectiveProgress} />
  <!--
    The full list, for discovery — Phase 13. Selecting a row opens the card
    beside the object rather than buying anything, so the list is a map and the
    world is still where the decision is made (GAME_DESIGN_DOCUMENT §14.3).
  -->
  <BuildMenu
    {upgrades}
    stage={progression.stage}
    onselect={(id: string) => {
      openUpgrade = id;
    }}
  />

  <BuildMode
    {placed}
    onplace={(objectId: string, x: number, y: number) => {
      commands.place(objectId, x, y);
    }}
    onremove={(index: number) => {
      commands.removePlaced(index);
    }}
    preview={(objectId: string, screenX: number, screenY: number) =>
      commands.previewPlacement(objectId, screenX, screenY)}
  />
  {#if progression.pendingStage > 0 || progression.stage < 4}
    <EvolutionPanel
      {progression}
      compact={progression.pendingStage === 0}
      onevolve={() => {
        commands.evolve();
      }}
    />
  {/if}
  {#if openPanel === 'staff'}
    <StaffPanel
      {staff}
      {roles}
      {payroll}
      full={payrollFull}
      onhire={(roleId: string, skill: number) => {
        commands.hire(roleId, skill);
      }}
      onfire={(entityId: number) => {
        commands.fire(entityId);
      }}
    />
  {/if}
  {#if openPanel === 'menu'}
    <PricePanel
      {prices}
      onprice={(itemId: string, price: number) => {
        commands.setPrice(itemId, price);
      }}
    />
  {/if}
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    /* Above the canvas, and transparent to the pointer: a click that misses a
       control has to reach the world (TECHNICAL_ARCHITECTURE §7). */
    z-index: 10;
    pointer-events: none;
    font-family: var(--font-ui);
  }
  .action-dock {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    display: flex;
    gap: var(--space-2);
    z-index: var(--z-hud);
    pointer-events: auto;
  }
  .action-dock button {
    min-height: var(--touch-target);
    min-width: var(--touch-target);
    padding: 0 var(--space-3);
    background: var(--surface-raised);
    border: var(--border);
    border-radius: var(--radius-md);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }
  .action-dock button[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent);
  }
  .action-dock button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 700px) {
    .action-dock {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      bottom: max(var(--space-2), env(safe-area-inset-bottom));
    }
  }
</style>
