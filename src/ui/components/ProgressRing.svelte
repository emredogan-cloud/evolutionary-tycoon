<script lang="ts">
  /**
   * How far through preparation a station is.
   *
   * An SVG ring rather than a bar: it reads at a glance from any angle, and the
   * stations sit at different depths in an isometric view where a horizontal bar
   * would look like it belonged to whatever is behind it.
   *
   * `stroke-dasharray` on a circle, not a rotating element — the arc has to be
   * exact at the moment the screenshot is taken, and an animation would make the
   * visual golden a race between the browser and the camera.
   */
  interface Props {
    progress: number;
    x: number;
    y: number;
  }

  const { progress, x, y }: Props = $props();

  const RADIUS = 9;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const clamped = $derived(Math.min(1, Math.max(0, progress)));
  const dash = $derived(`${(clamped * CIRCUMFERENCE).toFixed(3)} ${CIRCUMFERENCE.toFixed(3)}`);
</script>

<svg
  class="ring"
  data-testid="progress-ring"
  data-progress={clamped.toFixed(2)}
  width="24"
  height="24"
  viewBox="0 0 24 24"
  aria-hidden="true"
  style="transform: translate3d({x}px, {y}px, 0) translate(-50%, -50%)"
>
  <circle class="track" cx="12" cy="12" r={RADIUS} />
  <!-- Rotated so the arc starts at twelve o'clock and runs clockwise, which is
       the direction everybody already reads a timer in. -->
  <circle class="fill" cx="12" cy="12" r={RADIUS} stroke-dasharray={dash} transform="rotate(-90 12 12)" />
</svg>

<style>
  .ring {
    position: absolute;
    top: 0;
    left: 0;
    will-change: transform;
  }

  .track {
    fill: rgba(10, 13, 18, 0.75);
    stroke: var(--c-border);
    stroke-width: 3;
  }

  .fill {
    fill: none;
    stroke: var(--c-accent);
    stroke-width: 3;
    stroke-linecap: round;
  }
</style>
