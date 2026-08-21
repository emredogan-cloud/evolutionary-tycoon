/**
 * Event → effect/sound wiring — Phase 17.
 *
 * The one place that knows which world moment makes which flash and which
 * noise. Pure decision logic over injected callbacks, so it unit-tests
 * without a scene: the scene hands in `spawnAt` (screen-projected) and
 * `play`, this decides ids and positions.
 *
 * Events carry entity ids, not positions — the renderer already tracks every
 * visible actor by id, and `positionOf` is that lookup. An event about
 * somebody off-screen resolves to null and spawns nothing, which is right:
 * an effect nobody can see is budget spent on nothing.
 */
import type { SimEvent } from '@sim/core/events';
import { UPGRADES } from '@config/economy/upgrades';

export interface FxSinks {
  /** Fire an effect at a world position (metres). */
  readonly spawnAtWorld: (effectId: string, worldX: number, worldY: number) => void;
  /** Play a sound key, world position optional for distance fade. */
  readonly play: (key: string, worldX?: number, worldY?: number) => void;
  /** Where an entity is right now, or null when not visible. */
  readonly positionOf: (entityId: number) => { x: number; y: number } | null;
  /** The lot's centre — celebrations anchor here. */
  readonly lotCentre: () => { x: number; y: number };
}

const UPGRADE_ANCHORS: ReadonlyMap<string, { x: number; y: number }> = new Map(
  UPGRADES.map((upgrade) => [upgrade.id, upgrade.anchor]),
);

export function wireFx(event: SimEvent, sinks: FxSinks): void {
  switch (event.t) {
    case 'PAYMENT': {
      const at = sinks.positionOf(event.customerId);
      if (at !== null) {
        sinks.spawnAtWorld('coin_burst', at.x, at.y);
        if (event.tip > 0) sinks.spawnAtWorld('tip_sparkle', at.x, at.y);
      }
      sinks.play('coin', at?.x, at?.y);
      break;
    }
    case 'ORDER_READY': {
      sinks.play('bell_ready');
      break;
    }
    case 'PREP_STARTED': {
      sinks.play('sizzle');
      break;
    }
    case 'ORDER_DELIVERED': {
      const at = sinks.positionOf(event.customerId);
      if (at !== null) sinks.spawnAtWorld('steam_puff', at.x, at.y);
      sinks.play('plate', at?.x, at?.y);
      break;
    }
    case 'CUSTOMER_LEFT_ANGRY': {
      const at = sinks.positionOf(event.entityId);
      if (at !== null) sinks.spawnAtWorld('angry_puff', at.x, at.y);
      sinks.play('chatter_upset', at?.x, at?.y);
      break;
    }
    case 'UPGRADE_APPLIED': {
      const anchor = UPGRADE_ANCHORS.get(event.upgradeId);
      if (anchor !== undefined) sinks.spawnAtWorld('upgrade_burst', anchor.x, anchor.y);
      sinks.play('upgrade_bought');
      break;
    }
    case 'STAGE_CHANGED': {
      const centre = sinks.lotCentre();
      sinks.spawnAtWorld('evolution_celebration', centre.x, centre.y);
      sinks.play('stage_evolved');
      break;
    }
    case 'CONSTRUCTION_STARTED': {
      const centre = sinks.lotCentre();
      sinks.spawnAtWorld('construction_dust', centre.x, centre.y);
      break;
    }
    case 'EMPLOYEE_HIRED': {
      const at = sinks.positionOf(event.entityId);
      if (at !== null) sinks.spawnAtWorld('hire_poof', at.x, at.y);
      break;
    }
    case 'VEHICLE_BRAKED': {
      const at = sinks.positionOf(event.entityId);
      sinks.play('brake', at?.x, at?.y);
      break;
    }
    case 'STAGE_UNLOCKED': {
      sinks.play('milestone');
      break;
    }
    case 'DAY_STARTED':
    case 'SPEED_CHANGED':
    case 'PAUSE_CHANGED':
    case 'VEHICLE_SPAWNED':
    case 'VEHICLE_DESPAWNED':
    case 'CONVERSION_SUCCEEDED':
    case 'CONVERSION_FAILED':
    case 'VEHICLE_PARKED':
    case 'CUSTOMER_SPAWNED':
    case 'ORDER_PLACED':
    case 'PRICE_CHANGED':
    case 'EMPLOYEE_LEFT':
    case 'OBJECT_PLACED':
    case 'WEATHER_CHANGED':
    case 'ROAD_EVENT_STARTED':
    case 'ROAD_EVENT_ENDED':
    case 'OBJECT_REMOVED':
      // Deliberately silent moments. Listing them is the exhaustiveness
      // contract: a NEW event type will land here as a build error and get a
      // conscious yes/no instead of a silent nothing.
      break;
  }
}
