<script lang="ts">
  import { ensureSheet, frameStyle, onIconsReady } from '../lib/atlasIcons';

  /**
   * The time pill, top centre — day, clock, weather with its painted icon,
   * and the event chip with a countdown when the road is not ordinary
   * (UI_REFERENCE_AUDIT §2). Weather/event icons come from the delivered
   * `ui_icon_*` set; until the sheet arrives the label carries the meaning,
   * exactly like the order bubble's fallback.
   */
  interface Props {
    gameDay: number;
    gameHour: number;
    weatherId: string;
    weatherLabel: string;
    eventId: string;
    eventLabel: string;
    eventRemainingMs: number;
  }

  const { gameDay, gameHour, weatherId, weatherLabel, eventId, eventLabel, eventRemainingMs }: Props =
    $props();

  const WEATHER_FRAMES: Record<string, string> = {
    CLEAR: 'ui_icon_weather-clear@2x',
    OVERCAST: 'ui_icon_weather-overcast@2x',
    RAIN: 'ui_icon_weather-rain@2x',
    SNOW: 'ui_icon_weather-snow@2x',
  };
  const EVENT_FRAMES: Record<string, string> = {
    ROAD_WORK: 'ui_icon_event-road-work@2x',
    ACCIDENT: 'ui_icon_event-accident@2x',
    FESTIVAL: 'ui_icon_event-festival@2x',
    NIGHT_RUSH: 'ui_icon_event-night-rush@2x',
    WEATHER_FRONT: 'ui_icon_event-weather-front@2x',
    FUEL_SPIKE: 'ui_icon_event-fuel-spike@2x',
  };

  ensureSheet('ui');
  let revision = $state(0);
  $effect(() => onIconsReady(() => (revision += 1)));
  const icon = (frame: string | undefined, px: number): string | null => {
    void revision;
    return frame === undefined ? null : frameStyle('ui', frame, px);
  };

  const hourLabel = $derived(`${String(Math.floor(gameHour)).padStart(2, '0')}:00`);
  const minutesLeft = $derived(Math.ceil(eventRemainingMs / 60_000));
</script>

<div class="strip" data-testid="environment-strip">
  <span class="cell" data-testid="hud-clock">
    <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"
      ><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><path
        d="M12 7v5l3.4 2"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      /></svg
    >
    Gün {gameDay} · {hourLabel}
  </span>
  <span class="cell" data-testid="hud-weather" data-weather={weatherId}>
    {#if icon(WEATHER_FRAMES[weatherId], 20) !== null}
      <span class="icon" style={icon(WEATHER_FRAMES[weatherId], 20)} aria-hidden="true"></span>
    {/if}
    {weatherLabel}
  </span>
  {#if eventId !== ''}
    <span class="cell event" data-testid="hud-event" data-event={eventId}>
      {#if icon(EVENT_FRAMES[eventId], 20) !== null}
        <span class="icon" style={icon(EVENT_FRAMES[eventId], 20)} aria-hidden="true"></span>
      {/if}
      {eventLabel}
      {#if eventRemainingMs > 0}<span class="left">{minutesLeft} dk</span>{/if}
    </span>
  {/if}
</div>

<style>
  .strip {
    position: absolute;
    top: var(--space-3);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: var(--space-2);
    pointer-events: auto;
    z-index: var(--z-hud);
  }
  .cell {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-glass);
    border: var(--border);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-card);
    font-size: var(--text-sm);
    font-weight: 600;
    white-space: nowrap;
  }
  .glyph {
    width: 16px;
    height: 16px;
    color: var(--ink-muted);
  }
  .icon {
    flex: none;
  }
  .event {
    border-color: var(--accent);
  }
  .left {
    font-size: var(--text-xs);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 700px) {
    .strip {
      top: calc(var(--space-3) + 74px);
    }
    .cell {
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-xs);
    }
  }
</style>
