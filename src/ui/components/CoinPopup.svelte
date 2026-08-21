<script lang="ts">
  /**
   * `+₡` at the moment money is earned.
   *
   * The rise and the fade come from `age`, which the bridge computes from
   * *simulation* time — not from a CSS animation. A CSS animation would keep
   * playing while the game is paused, would run at wall-clock speed while the
   * world ran at 4x, and would make the visual golden depend on how long the
   * screenshot took. Driving it from the same clock as everything else means the
   * popup is exactly where the world says it is.
   */
  interface Props {
    amount: number;
    age: number;
    x: number;
    y: number;
  }

  const { amount, age, x, y }: Props = $props();

  // Full opacity for the first half, then out. A popup that starts fading
  // immediately is unreadable at the moment it matters most.
  const opacity = $derived(age < 0.5 ? 1 : Math.max(0, 1 - (age - 0.5) * 2));
</script>

<div
  class="coin"
  data-testid="coin-popup"
  style="transform: translate3d({x}px, {y}px, 0) translate(-50%, -100%); opacity: {opacity.toFixed(3)}"
>
  +₡{amount.toFixed(2)}
</div>

<style>
  .coin {
    position: absolute;
    top: 0;
    left: 0;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--c-accent);
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.9),
      0 0 6px rgba(255, 182, 72, 0.4);
    will-change: transform, opacity;
  }
</style>
