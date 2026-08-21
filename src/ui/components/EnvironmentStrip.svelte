<script lang="ts">
  /**
   * The sky, the hour, and whatever the calendar is doing — Phase 15.
   *
   * The roadmap is specific about the shape: a **thin strip**, never a modal.
   * An event is ambient context the player glances at, and a popup for "yol
   * çalışması" would interrupt the exact play session the event exists to
   * flavour. Weather and time-of-day ride in the same strip because they are
   * the same glance. Primitive props, like every HUD cell — the bridge model
   * is rewritten in place and only copied primitives re-render.
   */
  interface Props {
    gameHour: number;
    weatherId: string;
    weatherLabel: string;
    eventId: string;
    eventLabel: string;
    eventRemainingMs: number;
  }

  const { gameHour, weatherId, weatherLabel, eventId, eventLabel, eventRemainingMs }: Props = $props();

  const WEATHER_GLYPHS: Record<string, string> = {
    CLEAR: '☀',
    OVERCAST: '☁',
    RAIN: '🌧',
    SNOW: '❄',
  };

  const EVENT_GLYPHS: Record<string, string> = {
    ROAD_WORK: '🚧',
    ACCIDENT: '⚠',
    FESTIVAL: '🎪',
    NIGHT_RUSH: '🚚',
    WEATHER_FRONT: '🌧',
    FUEL_SPIKE: '⛽',
  };

  const hourLabel = $derived(
    `${String(Math.floor(gameHour)).padStart(2, '0')}:${String(Math.floor((gameHour % 1) * 60)).padStart(
      2,
      '0',
    )}`,
  );
  const night = $derived(gameHour < 6 || gameHour >= 20);
  const remainingMin = $derived(Math.ceil(eventRemainingMs / 60_000));
</script>

<div class="strip" data-testid="environment-strip">
  <span class="cell" data-testid="hud-clock" data-hour={String(Math.floor(gameHour))}>
    <span aria-hidden="true">{night ? '🌙' : '🕐'}</span>
    {hourLabel}
  </span>
  <span class="cell" data-testid="hud-weather" data-weather={weatherId}>
    <span aria-hidden="true">{WEATHER_GLYPHS[weatherId] ?? '☀'}</span>
    {weatherLabel}
  </span>
  {#if eventId !== ''}
    <span class="cell event" data-testid="hud-event" data-event={eventId}>
      <span aria-hidden="true">{EVENT_GLYPHS[eventId] ?? '⚠'}</span>
      {eventLabel}
      {#if remainingMin > 0}
        <span class="left">{remainingMin} dk</span>
      {/if}
    </span>
  {/if}
</div>

<style>
  .strip {
    position: absolute;
    top: var(--sp-2);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: var(--sp-1);
    pointer-events: none;
    font-size: var(--fs-xs);
    z-index: 5;
  }

  .cell {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    padding: 0.2rem var(--sp-2);
    background: color-mix(in srgb, var(--c-surface) 82%, transparent);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    color: var(--c-text-muted);
    backdrop-filter: blur(4px);
  }

  .event {
    color: var(--c-text);
    border-color: color-mix(in srgb, var(--c-warn) 55%, var(--c-border));
    background: color-mix(in srgb, var(--c-warn) 14%, var(--c-surface));
  }

  .left {
    color: var(--c-text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
