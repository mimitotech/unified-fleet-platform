import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import type { WialonUnitEventSlice } from './wialonEventsService.js';
import {
  deriveWialonHostingStatus,
  type WialonHostingStatus,
  type WialonStatusOptions,
} from './wialonUnitStatus.js';

/** Map Wialon trip detector + ignition from events API to Hosting status. */
export function deriveStatusFromWialonEvents(
  item: WialonSearchItem,
  events?: WialonUnitEventSlice,
  opts?: WialonStatusOptions,
): WialonHostingStatus {
  if (!events) return deriveWialonHostingStatus(item, undefined, opts);

  if ((item as { netconn?: boolean }).netconn === false) {
    return { status: 'offline', motionState: events.tripStateLabel };
  }

  if (opts?.stationary) {
    if (events.ignitionOn === true) {
      return { status: 'idle', motionState: events.tripStateLabel || 'Running' };
    }
    if (events.ignitionOn === false) {
      return { status: 'stopped', motionState: events.tripStateLabel || 'Stopped' };
    }
    return deriveWialonHostingStatus(item, undefined, opts);
  }

  const minSpeed = (item as { rtd?: { minMovingSpeed?: number } }).rtd?.minMovingSpeed ?? 5;
  const speed = events.currSpeed ?? item.pos?.s ?? 0;
  const label = events.tripStateLabel;

  if (events.tripState === 1) {
    return { status: 'moving', motionState: label || 'Trip' };
  }

  if (events.tripState === 2) {
    if (speed > minSpeed) return { status: 'moving', motionState: label || 'Stop' };
    if (events.ignitionOn === true) return { status: 'idle', motionState: label || 'Stop' };
    return { status: 'stopped', motionState: label || 'Stop' };
  }

  if (events.tripState === 0) {
    if (events.ignitionOn === true) return { status: 'idle', motionState: label || 'Parking' };
    if (events.ignitionOn === false) return { status: 'stopped', motionState: label || 'Parking' };
    if (speed > minSpeed) return { status: 'moving', motionState: label || 'Parking' };
    return { status: 'stopped', motionState: label || 'Parking' };
  }

  if (speed > minSpeed) return { status: 'moving', motionState: label };
  if (events.ignitionOn === true) return { status: 'idle', motionState: label };
  if (events.ignitionOn === false) return { status: 'stopped', motionState: label };

  return deriveWialonHostingStatus(item, undefined, opts);
}
