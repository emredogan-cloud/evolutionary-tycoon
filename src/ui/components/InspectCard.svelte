<script lang="ts">
  import type { PropertyView } from '@app/bridge/hudModel';
  import { worldObject } from '@config/sprites';
  import { ensureWorldSheets, onIconsReady, worldFrameStyle } from '@ui/lib/atlasIcons';

  /**
   * Click a thing in the world; find out what it is and what it becomes.
   *
   * The restaurant evolution system's whole interface
   * (`docs/RESTAURANT_EVOLUTION_ROADMAP.md` §D). Every property carries a
   * hotspot at its own world anchor; selecting one opens this card beside it
   * with two faces:
   *
   *   BİLGİ    what it is, what level, what it provides, how much is in use
   *   İNŞA ET  the next level, its price, its duration, what it will look like,
   *            and — when it cannot be bought — exactly why
   *
   * ## Nothing here is computed
   *
   * Every number arrives on `PropertyView`, derived by the bridge from the
   * simulation on the sample that produced it. A component that worked out
   * "can I afford this" itself would be a second implementation of a rule the
   * purchase then applies differently, which is how a card ends up green over a
   * refusal. The overlay names an intent; the simulation decides.
   *
   * ## The preview never lies
   *
   * `nextArt` says how the next level's picture exists, and the card has a
   * different answer for each: draw the sprite, paint the bays, or say the art
   * is still being made. What it never does is show the *current* frame as the
   * next one — the directive's §17 forbids exactly that, and it is the
   * difference between a preview and a promise.
   */
  interface Props {
    properties: readonly PropertyView[];
    /** The property whose card is open, or '' for none. */
    selected: string;
    onselect: (id: string) => void;
    onupgrade: (id: string) => void;
  }

  const { properties, selected, onselect, onupgrade }: Props = $props();

  let face = $state<'info' | 'build'>('info');

  ensureWorldSheets();
  let iconRevision = $state(0);
  onIconsReady(() => {
    iconRevision++;
  });

  const pictureOf = (objectId: string, px: number): string | null => {
    void iconRevision;
    if (objectId === '') return null;
    const spec = worldObject(objectId);
    return spec === undefined ? null : worldFrameStyle(spec.frame, px);
  };

  const open = $derived(properties.find((item) => item.id === selected) ?? null);

  /*
   * Which of the three previews to draw. `sprite` is downgraded to `prompted`
   * when the frame does not actually resolve, so a table that claims art the
   * atlas does not carry shows an honest "still being made" rather than an
   * empty box that reads as a rendering fault.
   * `tests/unit/config/properties.test.ts` makes that case impossible to ship;
   * this makes it impossible to *see* if it ever were.
   */
  const previewKind = $derived(
    open?.nextArt !== 'sprite'
      ? (open?.nextArt ?? 'prompted')
      : pictureOf(open.nextAsset, 56) === null
        ? 'prompted'
        : 'sprite',
  );
  const money = (value: number): string => `₡${value.toFixed(2)}`;
  const seconds = (ms: number): string => `${String(Math.max(0, Math.round(ms / 1000)))} sn`;

  /*
   * The card sits beside its hotspot, clamped inside the viewport. Beside and
   * not over: §32 asks for a contextual card that does not cover the thing the
   * player just clicked, and a panel centred on the anchor hides exactly the
   * object it is describing.
   */
  const CARD_WIDTH = 232;
  const cardStyle = $derived(
    open === null
      ? ''
      : `left: ${String(Math.round(open.screenX + 28))}px; top: ${String(Math.round(open.screenY - 24))}px; width: ${String(CARD_WIDTH)}px`,
  );
</script>

<div class="hotspots" data-testid="property-hotspots">
  {#each properties as item (item.id)}
    {#if item.visible}
      <button
        type="button"
        class="dot"
        class:active={selected === item.id}
        class:busy={item.building}
        data-testid="property-hotspot"
        data-property={item.id}
        data-level={String(item.level)}
        aria-label="{item.label} — seviye {item.level}"
        aria-pressed={selected === item.id}
        style="left: {Math.round(item.screenX)}px; top: {Math.round(item.screenY)}px"
        onclick={() => {
          face = 'info';
          onselect(selected === item.id ? '' : item.id);
        }}
      >
        <span class="pip" aria-hidden="true">{item.level}</span>
      </button>
    {/if}
  {/each}
</div>

{#if open !== null}
  <section
    class="card"
    data-testid="inspect-card"
    data-property={open.id}
    data-level={String(open.level)}
    data-face={face}
    aria-label="{open.label} kartı"
    style={cardStyle}
  >
    <header>
      <span class="art" aria-hidden="true">
        {#if pictureOf(open.levelAsset, 34) !== null}<i style={pictureOf(open.levelAsset, 34)}></i>{/if}
      </span>
      <div class="title">
        <strong>{open.label}</strong>
        <span class="lv" data-testid="inspect-level">Sv. {open.level} / {open.maxLevel}</span>
      </div>
      <button
        type="button"
        class="close"
        aria-label="Kapat"
        onclick={() => {
          onselect('');
        }}>×</button
      >
    </header>

    <nav class="faces">
      <button
        type="button"
        class:on={face === 'info'}
        data-testid="inspect-info"
        onclick={() => (face = 'info')}>BİLGİ</button
      >
      <button
        type="button"
        class:on={face === 'build'}
        data-testid="inspect-build"
        onclick={() => (face = 'build')}>İNŞA ET</button
      >
    </nav>

    {#if face === 'info'}
      <dl class="facts" data-testid="inspect-facts">
        <dt>Durum</dt>
        <dd data-testid="inspect-state">{open.levelLabel}</dd>
        <dt>Ne yapar</dt>
        <dd>{open.description}</dd>
        {#if open.capacity >= 0}
          <dt>Kapasite</dt>
          <dd data-testid="inspect-capacity">{open.capacity} {open.unit}</dd>
          <dt>Kullanım</dt>
          <dd data-testid="inspect-usage">{open.used} / {open.capacity}</dd>
        {/if}
      </dl>
    {:else if open.building}
      <!--
        A site is up. The same construction the machines and the stage use, so
        pause holds it and 2x/4x speed it; what is shown is the simulation's own
        remaining time, not a wall clock.
      -->
      <div class="site" data-testid="inspect-site">
        <div
          class="bar"
          role="progressbar"
          aria-valuenow={Math.round(open.buildProgress * 100)}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span style="width: {open.buildProgress * 100}%"></span>
        </div>
        <span class="left" data-testid="inspect-remaining">{seconds(open.buildRemainingMs)}</span>
      </div>
    {:else if open.nextLabel === ''}
      <p class="note" data-testid="inspect-maxed">Azami seviye.</p>
    {:else}
      <div class="next" data-testid="inspect-next">
        <div class="preview" data-testid="inspect-preview" data-art={previewKind}>
          {#if previewKind === 'sprite'}
            <i style={pictureOf(open.nextAsset, 56)}></i>
          {:else if previewKind === 'procedural'}
            <!--
              No sprite by design: the car park is painted from the layout. So
              the preview paints it too, at card size — the bays this level
              opens, with the ones already built filled in. That is the actual
              change, drawn, rather than a picture of it.
            -->
            <span class="cells" aria-hidden="true">
              {#each { length: open.nextCells } as _, index (index)}
                <b class:added={index >= open.cells}></b>
              {/each}
            </span>
          {:else}
            <!--
              The level is real and its art is not made yet. Showing the current
              frame here would be the card telling the player they are buying
              what they already own, so it says what is true instead, and the
              prompt for it is filed (docs/LEVEL_ASSET_EVOLUTION_LIBRARY.md).
            -->
            <span class="pending">Görsel üretimde</span>
          {/if}
        </div>
        <div class="terms">
          <strong data-testid="inspect-next-label">Sv. {open.level + 1} · {open.nextLabel}</strong>
          {#if open.nextCost >= 0}
            <span data-testid="inspect-cost">{money(open.nextCost)}</span>
          {/if}
          {#if open.nextBuildMs > 0}
            <span class="dim" data-testid="inspect-duration">{seconds(open.nextBuildMs)} inşaat</span>
          {/if}
        </div>
      </div>

      <button
        type="button"
        class="cta"
        data-testid="inspect-upgrade"
        data-property={open.id}
        disabled={open.lockReason !== ''}
        onclick={() => {
          onupgrade(open.id);
        }}
      >
        {open.lockReason === '' ? 'YÜKSELT' : open.lockReason.toLocaleUpperCase('tr-TR')}
      </button>
    {/if}
  </section>
{/if}

<style>
  .hotspots {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: var(--z-hud);
  }

  /* Touch target is 44px (a11y §33); the painted pip is smaller. */
  .dot {
    position: absolute;
    width: var(--touch-target);
    height: var(--touch-target);
    padding: 0;
    transform: translate(-50%, -50%);
    border: none;
    background: none;
    color: var(--ink);
    cursor: pointer;
    pointer-events: auto;
  }

  .pip {
    display: grid;
    width: 22px;
    height: 22px;
    margin: 0 auto;
    border: var(--border);
    border-radius: 50%;
    background: var(--surface-glass);
    box-shadow: var(--shadow-card);
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: 1;
    place-items: center;
  }

  .dot.active .pip {
    border-color: var(--accent);
    background: var(--accent);
    color: #12161d;
  }

  .dot.busy .pip {
    border-color: var(--ok);
  }

  .dot:focus-visible .pip {
    box-shadow: var(--focus-ring);
  }

  .card {
    position: absolute;
    max-width: calc(100vw - 2 * var(--space-3));
    padding: var(--space-2) var(--space-3) var(--space-3);
    border: var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-glass);
    box-shadow: var(--shadow-card);
    pointer-events: auto;
    z-index: var(--z-panel);
  }

  header {
    display: grid;
    align-items: center;
    gap: var(--space-2);
    grid-template-columns: auto 1fr auto;
  }

  .art i {
    display: block;
  }

  .title {
    display: grid;
  }

  .title strong {
    font-size: var(--text-sm);
  }

  .lv {
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .close {
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: var(--text-lg);
    line-height: 1;
  }

  .faces {
    display: grid;
    margin: var(--space-2) 0;
    gap: var(--space-1);
    grid-template-columns: 1fr 1fr;
  }

  .faces button {
    min-height: 28px;
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    color: var(--ink-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .faces button.on {
    border-color: var(--accent);
    color: var(--ink);
  }

  .faces button:focus-visible,
  .cta:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .facts {
    display: grid;
    margin: 0;
    gap: 0 var(--space-2);
    grid-template-columns: auto 1fr;
  }

  .facts dt {
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }

  .facts dd {
    margin: 0;
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .next {
    display: grid;
    align-items: center;
    gap: var(--space-2);
    grid-template-columns: 64px 1fr;
  }

  .preview {
    display: grid;
    min-height: 64px;
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    place-items: center;
  }

  .pending {
    padding: 0 4px;
    color: var(--ink-dim);
    font-size: 9px;
    line-height: 1.2;
    text-align: center;
  }

  /* The car park, at card size: a bay per cell, the new ones picked out. */
  .cells {
    display: flex;
    max-width: 52px;
    flex-wrap: wrap;
    justify-content: center;
    gap: 3px;
  }

  .cells b {
    width: 10px;
    height: 6px;
    border: 1px solid var(--ink-dim);
    border-radius: 1px;
  }

  .cells b.added {
    border-color: var(--accent);
    background: var(--accent);
  }

  .terms {
    display: grid;
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .terms strong {
    font-size: var(--text-xs);
  }

  .dim {
    color: var(--ink-dim);
  }

  .cta {
    width: 100%;
    min-height: var(--touch-target);
    margin-top: var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: #12161d;
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .cta:disabled {
    background: var(--surface-sunken);
    color: var(--ink-dim);
    cursor: not-allowed;
  }

  .site {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .bar {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: var(--surface-sunken);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--ok);
  }

  .left {
    color: var(--ink-secondary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 0;
    color: var(--ink-dim);
    font-size: var(--text-xs);
  }
</style>
