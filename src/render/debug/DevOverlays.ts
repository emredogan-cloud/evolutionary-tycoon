import type Phaser from 'phaser';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { FlowFieldCache } from '@sim/nav/FlowFieldCache';
import { CELL_SIZE_METRES } from '@sim/nav/NavGrid';
import { worldToScreen } from '../iso/IsoProjection';
import type { SceneGraph } from '../SceneGraph';

/**
 * Development overlays: world grid, navigation grid, coordinate readout, actor
 * count.
 *
 * One module rather than the several the roadmap sketched (`GridOverlay`,
 * `DepthDebug`, `CoordReadout`, `NavDebug`) because together they are a couple
 * of hundred lines that share a lifetime, a layer and an on/off switch. Several
 * files would be several places to look for one thing.
 *
 * All of it is gated on `showDevOverlays`, and none of it exists in a production
 * build: the grid is what makes "is that object at 12, 8 or at 8, 12" a
 * one-second question instead of a debugging session.
 */

const GRID_COLOUR = 0x7fd4ff;
const GRID_MAJOR_COLOUR = 0xffffff;
const NAV_BLOCKED_COLOUR = 0xff5c5c;
const NAV_GOAL_COLOUR = 0x8bff7f;

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

    /*
     * The navigation grid on top of the world grid — Phase 7, deliverable 7.
     *
     * Blocked cells are shaded and the goals are ringed. It answers the question
     * that otherwise costs an afternoon: a pedestrian who will not move is
     * either standing in a cell the grid thinks is solid or trying to reach a
     * goal nothing routes to, and both are invisible without this.
     */
    const nav = scene.add.graphics();
    const fields = new FlowFieldCache(STAGE1_LAYOUT);
    const navGrid = fields.grid;

    for (let cy = 0; cy < navGrid.height; cy++) {
      for (let cx = 0; cx < navGrid.width; cx++) {
        if (!navGrid.isBlocked(cx, cy)) continue;
        const half = CELL_SIZE_METRES / 2;
        const wx = navGrid.centreX(cx);
        const wy = navGrid.centreY(cy);
        const a = worldToScreen(wx - half, wy - half, 0, point);
        const ax = a.x;
        const ay = a.y;
        const b = worldToScreen(wx + half, wy - half, 0, point);
        const bx = b.x;
        const by = b.y;
        const c = worldToScreen(wx + half, wy + half, 0, point);
        const cxs = c.x;
        const cys = c.y;
        const d = worldToScreen(wx - half, wy + half, 0, point);

        // `beginPath`/`lineTo` rather than `fillPoints`, which wants Phaser
        // `Vector2` instances and would mean four allocations per blocked cell.
        nav.fillStyle(NAV_BLOCKED_COLOUR, 0.18);
        nav.beginPath();
        nav.moveTo(ax, ay);
        nav.lineTo(bx, by);
        nav.lineTo(cxs, cys);
        nav.lineTo(d.x, d.y);
        nav.closePath();
        nav.fillPath();
      }
    }

    for (const goal of fields.goalNames) {
      const field = fields.field(goal);
      if (field === null) continue;
      const at = worldToScreen(navGrid.centreX(field.goalX), navGrid.centreY(field.goalY), 0, point);
      nav.lineStyle(2, NAV_GOAL_COLOUR, 0.9);
      nav.strokeCircle(at.x, at.y, 6);
    }

    graph.layer('scatter').add(grid);
    graph.layer('scatter').add(nav);

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
