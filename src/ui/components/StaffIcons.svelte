<script lang="ts">
  import type { StaffView } from '@app/bridge/hudModel';

  /**
   * A small icon over each employee saying what they are doing.
   *
   * "Dünyada: çalışanın üstünde küçük görev ikonu (ne yapıyor)." It is the
   * cheapest available answer to the roadmap's own Phase 10 risk — that
   * employees read as "tokens sliding on a board" — because intent that is
   * *legible* is halfway to intent that is believable, and none of the rig
   * clips exist yet.
   *
   * **Placeholder**, like the order bubble: a letter in a magenta box until the
   * Phase 4 icons exist. Registered in docs/PLACEHOLDER_REGISTER.md.
   */
  interface Props {
    staff: readonly StaffView[];
  }

  const { staff }: Props = $props();

  const TASK_GLYPHS: Record<string, string> = {
    PREP_ORDER: 'P',
    DELIVER_ORDER: 'S',
    CLEAN_TABLE: 'T',
  };

  const STATE_GLYPHS: Record<string, string> = {
    IDLE: '·',
    BLOCKED: '!',
  };

  function glyph(person: StaffView): string {
    if (person.taskKind !== '') return TASK_GLYPHS[person.taskKind] ?? '?';
    return STATE_GLYPHS[person.state] ?? '·';
  }
</script>

<div class="layer" aria-hidden="true">
  {#each staff as person (person.entityId)}
    {#if person.visible}
      <div
        class="icon"
        class:blocked={person.state === 'BLOCKED'}
        data-testid="staff-icon"
        data-entity={person.entityId}
        data-task={person.taskKind}
        style="transform: translate3d({person.screenX}px, {person.screenY}px, 0) translate(-50%, -100%)"
      >
        {glyph(person)}
      </div>
    {/if}
  {/each}
</div>

<style>
  .layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .icon {
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    place-items: center;
    width: 14px;
    height: 14px;
    background: #16121a;
    border: 1px dashed #ff00ff;
    border-radius: var(--radius-sm);
    color: #ff00ff;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    will-change: transform;
  }

  /* The one state worth drawing the eye to: somebody who wants work and has
     none is a thing the player can fix. */
  .icon.blocked {
    border-style: solid;
    border-color: var(--c-warn);
    color: var(--c-warn);
  }
</style>
