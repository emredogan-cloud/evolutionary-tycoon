import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseAssetName } from './naming.ts';

/**
 * WAV to the two shipped formats, at a fixed loudness.
 *
 * Built in Phase 4 with the rest of the pipeline; **used** in Phase 17, when
 * there is audio. It is here now so that the phase that produces sound does not
 * also have to invent the pipeline that carries it.
 *
 * Two formats, not one. ASSET_PIPELINE §2 records why: Safari's support for
 * OGG/Vorbis has historically been unreliable, so every sound ships as OGG *and*
 * M4A/AAC and Phaser picks whichever the browser admits to supporting. This is
 * the single most common silent failure in a browser audio matrix — the game
 * does not crash, it is simply mute for a fraction of players, and nobody files
 * a bug.
 *
 * Loudness is normalised rather than left to whatever the generator produced:
 * −16 LUFS for effects, −20 for music (§11), so ducking at run time has a known
 * starting point instead of a guess.
 *
 * ffmpeg is not a project dependency and is not installed by the pipeline. If it
 * is missing this module says so and stops; it does not fall back to copying the
 * WAV through, because a 48 kHz WAV in the bundle would blow the 5 MB audio
 * budget while looking like it worked.
 */

export const SFX_LUFS = -16;
export const MUSIC_LUFS = -20;

export interface AudioTarget {
  readonly extension: 'ogg' | 'm4a';
  readonly args: readonly string[];
}

export const AUDIO_TARGETS: readonly AudioTarget[] = [
  { extension: 'ogg', args: ['-c:a', 'libvorbis', '-qscale:a', '5'] },
  { extension: 'm4a', args: ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'] },
];

export function ffmpegAvailable(): boolean {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

export interface ConvertedAudio {
  readonly source: string;
  readonly outputs: readonly string[];
}

export function convertAudio(file: string, outputDir: string): ConvertedAudio {
  if (!ffmpegAvailable()) {
    throw new Error(
      'assets:audio needs ffmpeg on PATH. Install it, or run the audio stage on a machine that has it. ' +
        'Not falling back to shipping the WAV — that would silently blow the 5 MB audio budget.',
    );
  }

  const parsed = parseAssetName(basename(file));
  if (!parsed.ok) throw new Error(`audio: ${basename(file)} — ${parsed.reason}`);
  if (parsed.name.category.kind !== 'audio') {
    throw new Error(`audio: ${basename(file)} is not in an audio category`);
  }

  mkdirSync(outputDir, { recursive: true });
  const stem = basename(file, extname(file));
  const target = parsed.name.category.id === 'music' ? MUSIC_LUFS : SFX_LUFS;
  const outputs: string[] = [];

  for (const format of AUDIO_TARGETS) {
    const output = join(outputDir, `${stem}.${format.extension}`);
    const result = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        file,
        // Single-pass loudnorm. Two-pass is more accurate; it is also twice the
        // wall clock and the difference is inaudible at these levels. Revisit in
        // Phase 17 if the mix needs it.
        '-af',
        `loudnorm=I=${target}:TP=-1.5:LRA=11`,
        ...format.args,
        output,
      ],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`ffmpeg failed on ${basename(file)} -> ${format.extension}: ${result.stderr}`);
    }
    outputs.push(output);
  }

  return { source: file, outputs };
}

export function convertAudioDirectory(sourceDir: string, outputDir: string): ConvertedAudio[] {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir)
    .filter((entry) => entry.endsWith('.wav'))
    .sort()
    .map((entry) => convertAudio(join(sourceDir, entry), outputDir));
}
