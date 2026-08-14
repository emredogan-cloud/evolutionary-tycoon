import type Phaser from 'phaser';
import { CAMERA } from '@config/world';
import { clampToBounds, edgePushVelocity, panByScreenDelta, zoomAtPointer } from './cameraMath';
import type { CameraBounds, CameraState, Viewport } from './cameraMath';

/**
 * Phaser wiring around `cameraMath`.
 *
 * Every decision this class makes about *where the camera should be* lives in
 * `cameraMath`, which has no Phaser import and is unit-tested. What is left here
 * is input plumbing and applying the result — the part that genuinely needs a
 * browser and is covered by E2E instead.
 *
 * Reduced motion is honoured by disabling smoothing and shake outright rather
 * than shortening them. A player who asks for less motion is often asking
 * because motion makes them ill, and a faster version of the same movement does
 * not help (GAME_DESIGN_DOCUMENT §14.7, TESTING_STRATEGY §7.6).
 */
export interface CameraControllerOptions {
  readonly bounds: CameraBounds;
  readonly reducedMotion: boolean;
  /** Fixed transform for visual regression; input is ignored while set. */
  readonly locked?: CameraState;
}

export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly scene: Phaser.Scene;
  private readonly bounds: CameraBounds;
  private readonly reducedMotion: boolean;
  private readonly locked: CameraState | null;

  private readonly state: CameraState;
  private readonly scratch: CameraState = { x: 0, y: 0, zoom: 1 };
  private readonly velocityScratch = { x: 0, y: 0 };

  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerX = -1;
  private pointerY = -1;

  constructor(scene: Phaser.Scene, options: CameraControllerOptions) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.bounds = options.bounds;
    this.reducedMotion = options.reducedMotion;
    this.locked = options.locked ?? null;

    this.state = this.locked ?? {
      x: (options.bounds.left + options.bounds.right) / 2,
      y: (options.bounds.top + options.bounds.bottom) / 2,
      zoom: CAMERA.defaultZoom,
    };

    this.apply();
    if (this.locked === null) this.attachInput();
  }

  get current(): Readonly<CameraState> {
    return this.state;
  }

  private get viewport(): Viewport {
    return { width: this.camera.width, height: this.camera.height };
  }

  private attachInput(): void {
    const input = this.scene.input;

    input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
    });

    input.on('pointerup', () => {
      this.dragging = false;
    });

    input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointerX = pointer.x;
      this.pointerY = pointer.y;
      if (!this.dragging) return;
      const deltaX = pointer.x - this.lastPointerX;
      const deltaY = pointer.y - this.lastPointerY;
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      panByScreenDelta(this.state, deltaX, deltaY, this.bounds, this.viewport, this.state);
      this.apply();
    });

    input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, deltaY: number) => {
      const factor = deltaY > 0 ? 1 / CAMERA.wheelZoomStep : CAMERA.wheelZoomStep;
      zoomAtPointer(this.state, factor, pointer.x, pointer.y, this.bounds, this.viewport, this.state);
      this.apply();
    });
  }

  /**
   * Per-frame keyboard and edge-push panning.
   *
   * `deltaMs` rather than a per-frame constant, so panning covers the same
   * ground per second on a 30 Hz laptop as on a 144 Hz desktop.
   */
  update(deltaMs: number): void {
    if (this.locked !== null) return;

    const seconds = deltaMs / 1000;
    let dx = 0;
    let dy = 0;

    const keyboard = this.scene.input.keyboard;
    if (keyboard !== null) {
      const keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<
        string,
        Phaser.Input.Keyboard.Key
      >;
      const speed = CAMERA.keyboardPanSpeed;
      if (keys['A']?.isDown === true || keys['LEFT']?.isDown === true) dx += speed;
      if (keys['D']?.isDown === true || keys['RIGHT']?.isDown === true) dx -= speed;
      if (keys['W']?.isDown === true || keys['UP']?.isDown === true) dy += speed;
      if (keys['S']?.isDown === true || keys['DOWN']?.isDown === true) dy -= speed;
    }

    if (!this.dragging && this.pointerX >= 0) {
      const push = edgePushVelocity(this.pointerX, this.pointerY, this.viewport, this.velocityScratch);
      dx -= push.x;
      dy -= push.y;
    }

    if (dx === 0 && dy === 0) return;

    panByScreenDelta(
      this.state,
      dx * seconds * this.state.zoom,
      dy * seconds * this.state.zoom,
      this.bounds,
      this.viewport,
      this.state,
    );
    this.apply();
  }

  /** Recompute the clamp after a resize; the viewport is part of the constraint. */
  handleResize(): void {
    clampToBounds(this.state, this.bounds, this.viewport, this.state);
    this.apply();
  }

  centreOn(x: number, y: number, zoom?: number): void {
    if (this.locked !== null) return;
    this.scratch.x = x;
    this.scratch.y = y;
    this.scratch.zoom = zoom ?? this.state.zoom;
    clampToBounds(this.scratch, this.bounds, this.viewport, this.state);
    this.apply();
  }

  private apply(): void {
    this.camera.setZoom(this.state.zoom);
    this.camera.centerOn(this.state.x, this.state.y);
    if (this.reducedMotion) this.camera.panEffect.reset();
  }
}
