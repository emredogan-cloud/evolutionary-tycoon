/**
 * The clip editor — a preview harness over the *real* runtime.
 *
 * Imports the same `applyClip`/`poseIdle` the game ships, so what this canvas
 * shows is what the game will do — the whole point of the tool. Not part of
 * the production build; `pnpm rig:editor` serves it with Vite.
 */
import { createPose, poseIdle, RIG_PARTS } from '../../src/render/rig/DollRig';
import { applyClip, type Clip } from '../../src/render/rig/clips';
import { CLIP_DATA } from '../../src/render/rig/clips/library.data';

const clips: Record<string, Omit<Clip, 'name'>> = { ...CLIP_DATA };

const clipSelect = document.getElementById('clip') as HTMLSelectElement;
const timeInput = document.getElementById('time') as HTMLInputElement;
const timeLabel = document.getElementById('timeLabel') as HTMLSpanElement;
const mirrorInput = document.getElementById('mirror') as HTMLInputElement;
const playingInput = document.getElementById('playing') as HTMLInputElement;
const jsonArea = document.getElementById('json') as HTMLTextAreaElement;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const context2d = canvas.getContext('2d');
if (context2d === null) throw new Error('no 2d context');
const ctx = context2d;

for (const name of Object.keys(clips)) {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  clipSelect.append(option);
}

let current: Clip = { name: clipSelect.value, ...clips[clipSelect.value] } as Clip;
const syncJson = (): void => {
  jsonArea.value = JSON.stringify(
    { [current.name]: { durationMs: current.durationMs, loop: current.loop, channels: current.channels } },
    null,
    2,
  );
};
syncJson();

clipSelect.addEventListener('change', () => {
  current = { name: clipSelect.value, ...clips[clipSelect.value] } as Clip;
  syncJson();
});
document.getElementById('apply')?.addEventListener('click', () => {
  const parsed = JSON.parse(jsonArea.value) as Record<string, Omit<Clip, 'name'>>;
  const [name, body] = Object.entries(parsed)[0] ?? [];
  if (name !== undefined && body !== undefined) current = { name, ...body };
});
document.getElementById('copy')?.addEventListener('click', () => {
  void navigator.clipboard.writeText(jsonArea.value);
});

/** Stick-figure joints from the pose, in editor pixels. */
const SCALE = 160;
function draw(tMs: number): void {
  const pose = createPose();
  poseIdle(pose);
  applyClip(current, tMs, 1, mirrorInput.checked, pose);

  const width = (canvas.width = canvas.clientWidth);
  const height = (canvas.height = canvas.clientHeight);
  ctx.clearRect(0, 0, width, height);
  const originX = width / 2;
  const originY = height * 0.8;

  ctx.strokeStyle = '#5bb169';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const part of RIG_PARTS) {
    const t = pose[part];
    const x = originX + t.offsetX * SCALE;
    const y = originY - t.offsetY * SCALE;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.rotation);
    ctx.beginPath();
    if (part === 'head') {
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
    } else if (part === 'torso') {
      ctx.moveTo(0, -30);
      ctx.lineTo(0, 30);
    } else {
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 34);
    }
    ctx.stroke();
    ctx.restore();
  }
  timeLabel.textContent = `${String(Math.round(tMs))} ms`;
}

let startedAt = performance.now();
function frame(now: number): void {
  const duration = Math.max(1, current.durationMs);
  let tMs: number;
  if (playingInput.checked) {
    const elapsed = now - startedAt;
    tMs = current.loop ? elapsed % duration : Math.min(duration, elapsed);
    if (!current.loop && elapsed > duration + 600) startedAt = now;
    timeInput.value = String(tMs / duration);
  } else {
    tMs = Number(timeInput.value) * duration;
  }
  draw(tMs);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
