import { WialonAdapter } from './WialonAdapter.js';
import { LocoNavAdapter } from './LocoNavAdapter.js';
import { TrackSolidAdapter } from './TrackSolidAdapter.js';
export function createAdapter(sourceType, credentials) {
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
