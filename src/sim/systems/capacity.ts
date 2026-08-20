import type { StageLayout } from '@config/layouts/stage1';
import type { World } from '../core/World';
import { effectValue } from './UpgradeSystem';

/**
 * Shared capacity formulas — a leaf module, deliberately.
 *
 * `queueCapacityOf` began life inside `QueueSystem`, which was fine until the
 * offline meter (Phase 14) needed the same number: the meter is called from
 * four systems, `QueueSystem` reaches into `DriveThruSystem`, and the import
 * closed a cycle the architecture gate rightly refuses. The formula moved to
 * a module that imports only downward; both callers now share one
 * implementation instead of two that would drift.
 */
export function queueCapacityOf(world: World, layout: StageLayout): number {
  return Math.min(layout.queue.length, layout.queueCapacity + effectValue(world, 'queueCapacity'));
}
