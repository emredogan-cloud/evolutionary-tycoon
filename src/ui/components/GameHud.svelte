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
  import HudCash from './HudCash.svelte';
  import EvolutionPanel from './EvolutionPanel.svelte';
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

  let cash = $state(0);
  let reputation = $state(0);
  let customersServed = $state(0);
  let customersWaiting = $state(0);
  let gameDay = $state(0);
  let gameHour = $state(0);
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
      reputation = model.reputation;
      customersServed = model.customersServed;
      customersWaiting = model.customersWaiting;
      gameDay = model.gameDay;
      gameHour = model.gameHour;

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

<div class="overlay" data-testid="game-hud">
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
  <ObjectivePanel {objective} progress={objectiveProgress} />
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
  <EvolutionPanel
    {progression}
    onevolve={() => {
      commands.evolve();
    }}
  />
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
  <PricePanel
    {prices}
    onprice={(itemId: string, price: number) => {
      commands.setPrice(itemId, price);
    }}
  />
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
</style>
