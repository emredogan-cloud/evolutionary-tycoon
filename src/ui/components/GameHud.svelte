<script lang="ts">
  import type {
    HudSource,
    OrderCardView,
    PlacedView,
    PlayerLevelView,
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
  import AudioSettings from '../screens/AudioSettings.svelte';
  import AnalyticsPanel from '../screens/AnalyticsPanel.svelte';
  import ContextPanel from '../screens/ContextPanel.svelte';
  import DiagnosticsPanel from '../screens/DiagnosticsPanel.svelte';
  import NavRail from './NavRail.svelte';
  import NotificationStrip from './NotificationStrip.svelte';
  import OrderCards from './OrderCards.svelte';
  import PauseOverlay from './PauseOverlay.svelte';
  import BuildMode from '../screens/BuildMode.svelte';
  import ActionTiles from './ActionTiles.svelte';
  import ObjectivePanel from './ObjectivePanel.svelte';
  import PricePanel from './PricePanel.svelte';
  import SpeedRail from './SpeedRail.svelte';
  import StaffIcons from './StaffIcons.svelte';
  import StaffPanel from './StaffPanel.svelte';
  import UpgradeCard from './UpgradeCard.svelte';
  import WorldMarkers from './WorldMarkers.svelte';

  /**
   * The overlay root — the consolidation pass's reference layout
   * (UI_REFERENCE_AUDIT §2): economy pill top left, time pill top centre,
   * navigation tiles top right, speed rail on the left edge, action tiles
   * bottom left, the contextual build panel bottom centre, the objective
   * card top right, order cards on the left, evolution bottom right. The
   * world owns the centre; every panel hugs an edge.
   *
   * The "+" hotspot model is gone: upgrades are bought from the build
   * panel's cards. The bridge publishes the same object every sample,
   * refreshed in place, so every value is copied out (see the P18 note on
   * reference-based reactivity).
   */
  interface Props {
    source: HudSource;
    commands: UiCommands;
  }

  const { source, commands }: Props = $props();

  let openUpgrade = $state<string | null>(null);
  /** One panel at a time — GDD §14.2's world-dominance rule made mechanical. */
  let openPanel = $state<'settings' | 'staff' | 'analytics' | 'diagnostics' | 'menu' | 'build' | null>(null);

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
  let speedMultiplier = $state(1);
  let showPauseVeil = $state(false);
  let highContrast = $state(false);
  let orders = $state<OrderCardView[]>([]);
  let level = $state<PlayerLevelView>({ level: 1, xp: 0, levelFloor: 0, nextLevelXp: 60 });

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
      speedMultiplier = model.speedMultiplier;
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
        // Copied, not referenced: the bridge rewrites these records in place.
        if (marker?.visible === true) live.push({ ...marker });
      }
      markers = live;
      /*
       * `model.placedCount` is read through a `$state` proxy, which erases to
       * `any` inside a Svelte component — narrowed to a number before `slice`.
       */
      const placedCount: number = model.placedCount;
      placed = model.placed.slice(0, placedCount).map((object): PlacedView => ({ ...object }));

      incomePerMinute = model.incomePerMinute;
      objective = model.objective;
      objectiveProgress = model.objectiveProgress;
      upgrades = model.upgrades.map((item): UpgradeView => ({
        ...item,
        missingPrereqs: [...item.missingPrereqs],
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
      const orderCount: number = model.orderCount;
      orders = model.orders.slice(0, orderCount).map((order): OrderCardView => ({ ...order }));
      level = { ...model.level };
    }),
  );

  const togglePanel = (panel: NonNullable<typeof openPanel>): void => {
    openPanel = openPanel === panel ? null : panel;
    if (openPanel !== 'build') openUpgrade = null;
  };
</script>

<svelte:window
  onkeydown={(event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (event.key === 'Escape' && (openPanel !== null || openUpgrade !== null)) {
      openPanel = null;
      openUpgrade = null;
      event.preventDefault();
    } else if (event.key === ' ' && target?.tagName !== 'INPUT' && target?.tagName !== 'BUTTON') {
      commands.setPaused(!paused);
      event.preventDefault();
    }
  }}
/>

<div class="overlay" data-testid="game-hud">
  <WorldMarkers {markers} />
  <StaffIcons {staff} />

  <HudCash
    {cash}
    {reputation}
    {customersServed}
    {customersWaiting}
    {gameDay}
    {gameHour}
    {incomePerMinute}
    {level}
    {reducedMotion}
  />
  <EnvironmentStrip
    {gameDay}
    {gameHour}
    {weatherId}
    {weatherLabel}
    {eventId}
    {eventLabel}
    {eventRemainingMs}
  />
  <NavRail open={openPanel} ontoggle={togglePanel} />
  <SpeedRail
    {paused}
    speed={speedMultiplier}
    onpause={() => {
      commands.setPaused(!paused);
    }}
    onspeed={(mult: 1 | 2 | 4) => {
      commands.setSpeed(mult);
      if (paused) commands.setPaused(false);
    }}
  />
  <ActionTiles open={openPanel} ontoggle={togglePanel} />
  <OrderCards
    {orders}
    onprep={(slot: number) => {
      commands.prep(slot);
    }}
  />
  <ObjectivePanel {objective} progress={objectiveProgress} {progression} />

  {#if openPanel === 'build'}
    <ContextPanel
      {upgrades}
      stage={progression.stage}
      playerLevel={level.level}
      onselect={(id: string) => {
        openUpgrade = openUpgrade === id ? null : id;
      }}
    />
  {/if}

  {#each upgrades as upgrade (upgrade.id)}
    {#if upgrade.id === openUpgrade}
      <UpgradeCard
        {upgrade}
        centered
        onbuy={(id: string) => {
          commands.buyUpgrade(id);
        }}
        onclose={() => {
          openUpgrade = null;
        }}
      />
    {/if}
  {/each}

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

  <BuildMode
    active={openPanel === 'build'}
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
    /* Above the canvas, transparent to the pointer: a click that misses a
       control has to reach the world (TECHNICAL_ARCHITECTURE §7). */
    z-index: 10;
    pointer-events: none;
    font-family: var(--font-ui);
  }
</style>
