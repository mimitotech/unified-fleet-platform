import type { SourceType } from '@ufp/shared';
import { BaseAdapter, type AdapterCredentials } from './BaseAdapter.js';
import { WialonAdapter } from './WialonAdapter.js';
import { LocoNavAdapter } from './LocoNavAdapter.js';
import { TrackSolidAdapter } from './TrackSolidAdapter.js';

export function createAdapter(sourceType: SourceType, credentials: AdapterCredentials): BaseAdapter {
  switch (sourceType) {
    case 'wialon':
      return new WialonAdapter(credentials);
    case 'loconav':
      return new LocoNavAdapter(credentials);
    case 'tracksolid':
      return new TrackSolidAdapter(credentials);
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
}
