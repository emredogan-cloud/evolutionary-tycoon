<script lang="ts">
  /**
   * Audio & motion settings — Phase 17 (GDD §14.9).
   *
   * Four sliders, a mute, and the reduced-motion preference. Every control is
   * an intent through the bridge: the values on screen come back from the
   * world on the next sample, so the panel shows what the simulation actually
   * accepted — the same one-way loop every other screen uses. A slide-in
   * panel, never a modal (GDD §14.2): the world stays visible and playable.
   */
  import type { UiCommands } from '@app/bridge/hudModel';

  interface AudioView {
    readonly master: number;
    readonly music: number;
    readonly sfx: number;
    readonly ambience: number;
    readonly muted: boolean;
  }

  interface Props {
    audio: AudioView;
    reducedMotion: boolean;
    commands: UiCommands;
    onclose: () => void;
  }

  const { audio, reducedMotion, commands, onclose }: Props = $props();

  const rows = $derived([
    { id: 'master', label: 'Ana ses', value: audio.master },
    { id: 'music', label: 'Müzik', value: audio.music },
    { id: 'sfx', label: 'Efektler', value: audio.sfx },
    { id: 'ambience', label: 'Ambiyans', value: audio.ambience },
  ] as const);
</script>

<aside class="panel" data-testid="audio-settings" aria-label="Ses ve hareket ayarları">
  <header>
    <h2>Ayarlar</h2>
    <button type="button" class="close" data-testid="settings-close" onclick={onclose} aria-label="Kapat"
      >×</button
    >
  </header>

  {#each rows as channel (channel.id)}
    <label class="row">
      <span>{channel.label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={channel.value}
        data-testid={`slider-${channel.id}`}
        oninput={(event) => {
          commands.setAudio(channel.id, Number((event.target as HTMLInputElement).value));
        }}
      />
      <output>{Math.round(channel.value * 100)}%</output>
    </label>
  {/each}

  <label class="row toggle">
    <span>Sesi tamamen kapat</span>
    <input
      type="checkbox"
      checked={audio.muted}
      data-testid="toggle-muted"
      onchange={(event) => {
        commands.setMuted((event.target as HTMLInputElement).checked);
      }}
    />
  </label>

  <label class="row toggle">
    <span>Azaltılmış hareket</span>
    <input
      type="checkbox"
      checked={reducedMotion}
      data-testid="toggle-reduced-motion"
      onchange={(event) => {
        commands.setReducedMotion((event.target as HTMLInputElement).checked);
      }}
    />
  </label>

  <p class="hint">Ses sıfırken oyun tamamen oynanabilir kalır — hiçbir bilgi yalnızca seste yaşamaz.</p>
</aside>

<style>
  .panel {
    position: absolute;
    top: 56px;
    right: 12px;
    width: 260px;
    padding: 14px 16px;
    background: rgba(18, 20, 26, 0.94);
    border: 1px solid #2b303d;
    border-radius: 10px;
    color: #e8e9ee;
    font-size: 13px;
    pointer-events: auto;
    z-index: 40;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
  }
  .close {
    background: none;
    border: none;
    color: #9aa0b8;
    font-size: 18px;
    cursor: pointer;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 110px 42px;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
  }
  .row.toggle {
    grid-template-columns: 1fr auto;
  }
  input[type='range'] {
    width: 100%;
  }
  output {
    text-align: right;
    color: #9aa0b8;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin: 10px 0 0;
    color: #9aa0b8;
    font-size: 11px;
    line-height: 1.4;
  }
</style>
