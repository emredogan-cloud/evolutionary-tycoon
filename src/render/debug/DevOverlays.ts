import type Phaser from 'phaser';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { worldToScreen } from '../iso/IsoProjection';
import type { SceneGraph } from '../SceneGraph';

/**
 * Development overlays: world grid, coordinate readout, actor count.
 *
 * One module rather than the three the roadmap sketched (`GridOverlay`,
 * `DepthDebug`, `CoordReadout`) because together they are a hundred lines that
 * share a lifetime, a layer and an on/off switch. Three files would be three
 * places to look for one thing.
 *
 * All of it is gated on `showDevOverlays`, and none of it exists in a production
 * build: the grid is what makes "is that object at 12, 8 or at 8, 12" a
 * one-second question instead of a debugging session.
 */

const GRID_COLOUR = 0x7fd4ff;
const GRID_MAJOR_COLOUR = 0xffffff;

export class DevOverlays {
  private readonly readout: Phaser.GameObjects.Text;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, graph: SceneGraph) {
    this.scene = scene;

    const grid = scene.add.graphics();
    const lot = STAGE1_LAYOUT.lot;
    const point = { x: 0, y: 0 };

    const line = (x1: number, y1: number, x2: number, y2: number, major: boolean): void => {
      grid.lineStyle(major ? 1.5 : 1, major ? GRID_MAJOR_COLOUR : GRID_COLOUR, major ? 0.35 : 0.15);
      const from = worldToScreen(x1, y1, 0, point);
      const fromX = from.x;
      const fromY = from.y;
      const to = worldToScreen(x2, y2, 0, point);
      grid.lineBetween(fromX, fromY, to.x, to.y);
    };

    // Every metre, with a heavier line every four so the eye can count.
    for (let x = lot.minX; x <= lot.maxX; x++) line(x, lot.minY, x, lot.maxY, x % 4 === 0);
    for (let y = lot.minY; y <= lot.maxY; y++) line(lot.minX, y, lot.maxX, y, y % 4 === 0);

    graph.layer('scatter').add(grid);

    this.readout = scene.add.text(8, 8, '', {
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11px',
      color: '#d8dee9',
      backgroundColor: 'rgba(12,14,18,0.8)',
      padding: { x: 6, y: 4 },
    });
    this.readout.setScrollFactor(0);
    this.readout.setDepth(1000);
    graph.layer('worldUi').add(this.readout);
  }

  update(visibleCount: number): void {
    const camera = this.scene.cameras.main;
    const pointer = this.scene.input.activePointer;

    // Screen to world through the camera, so the readout answers "what is under
    // my cursor" rather than "what is under this canvas pixel".
    const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
    const halfW = 32;
    const halfH = 16;
    const dx = worldPoint.x / halfW;
    const sy = worldPoint.y / halfH;

    this.readout.setText(
      [
        `zoom    ${camera.zoom.toFixed(2)}x`,
        `centre  ${camera.midPoint.x.toFixed(0)}, ${camera.midPoint.y.toFixed(0)}`,
        `world   ${((sy + dx) / 2).toFixed(2)}, ${((sy - dx) / 2).toFixed(2)} m`,
        `drawn   ${visibleCount}`,
      ].join('\n'),
    );
  }
}
