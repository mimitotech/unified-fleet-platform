import { Circle } from 'react-leaflet';
import { useWialonContext } from '@/hooks/useWialon';
import { useWialonGeofencesLive } from '@/hooks/useWialonLive';
import { safeArray } from '@/lib/safeArray';

type Props = {
  enabled?: boolean;
};

/** Wialon geofence circles on the fleet map (when available). */
export function MapGeofenceLayer({ enabled = true }: Props) {
  const { connected } = useWialonContext();
  const { data } = useWialonGeofencesLive(enabled && connected);
  const geofences = safeArray(data?.geofences);

  return (
    <>
      {geofences.map((z) => {
        if (z.type !== 'circle' || !z.center || !z.radius) return null;
        return (
          <Circle
            key={`${z.resourceId}-${z.id}`}
            center={[z.center.lat, z.center.lng]}
            radius={z.radius}
            pathOptions={{
              color: '#6366f1',
              fillColor: '#6366f1',
              fillOpacity: 0.08,
              weight: 2,
              dashArray: '6 4',
            }}
          />
        );
      })}
    </>
  );
}
