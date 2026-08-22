import type Phaser from 'phaser';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { FlowFieldCache } from '@sim/nav/FlowFieldCache';
import { CELL_SIZE_METRES } from '@sim/nav/NavGrid';
import { worldRectToScreenBounds, worldToScreen } from '../iso/IsoProjection';
import { CAMERA } from '@config/world';
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

    const search = new URLSearchParams(scene.game.canvas.ownerDocument.location.search);
    const fullDebug = search.get('debug') === '1';

    const grid = scene.add.graphics();
    grid.setVisible(fullDebug);
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
    nav.setVisible(fullDebug);
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

    /*
     * `?worldBounds=1` — the correction pass's coverage proof, drawn.
     *
     * Three rectangles tell the whole world-fill story at a glance: the lot
     * diamond (what is authored), the camera clamp box (what the player can
     * reach — the bounding box of the diamond plus margin), and the ground
     * cover rect (what is painted — grown to a 3840x2160 viewport at minimum
     * zoom). Coverage holds exactly when the middle one is inside the outer
     * one with room for the worst monitor; production never shows this
     * (the overlay only exists behind the debug/worldBounds doors).
     */
    if (search.get('worldBounds') === '1') {
      const bounds = scene.add.graphics();
      const lot = STAGE1_LAYOUT.lot;
      const margin = STAGE1_LAYOUT.cameraMarginMetres;

      // The lot diamond, in world space.
      bounds.lineStyle(2, 0x5bb169, 0.9);
      const corners: [number, number][] = [
        [lot.minX, lot.minY],
        [lot.maxX, lot.minY],
        [lot.maxX, lot.maxY],
        [lot.minX, lot.maxY],
      ];
      const first = worldToScreen(corners[0]?.[0] ?? 0, corners[0]?.[1] ?? 0, 0, point);
      bounds.beginPath();
      bounds.moveTo(first.x, first.y);
      for (const [x, y] of corners.slice(1)) {
        const at = worldToScreen(x, y, 0, point);
        bounds.lineTo(at.x, at.y);
      }
      bounds.closePath();
      bounds.strokePath();

      // The camera clamp box.
      const clamp = worldRectToScreenBounds(
        lot.minX - margin,
        lot.minY - margin,
        lot.maxX + margin,
        lot.maxY + margin,
        { left: 0, top: 0, right: 0, bottom: 0 },
      );
      bounds.lineStyle(2, 0xf4bc55, 0.9);
      bounds.strokeRect(clamp.left, clamp.top, clamp.right - clamp.left, clamp.bottom - clamp.top);

      // The ground cover rect — the same arithmetic WorldScene uses.
      const centreX = (clamp.left + clamp.right) / 2;
      const centreY = (clamp.top + clamp.bottom) / 2;
      const halfW = Math.max((clamp.right - clamp.left) / 2, 3840 / (2 * CAMERA.minZoom)) + 64;
      const halfH = Math.max((clamp.bottom - clamp.top) / 2, 2160 / (2 * CAMERA.minZoom)) + 64;
      bounds.lineStyle(3, 0xe8706f, 0.9);
      bounds.strokeRect(centreX - halfW, centreY - halfH, halfW * 2, halfH * 2);

      graph.layer('worldUi').add(bounds);
    }

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
