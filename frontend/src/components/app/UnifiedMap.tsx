import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default marker for Vite bundlers
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapAsset {
  id: string;
  name: string;
  registrationPlate?: string;
}

export function UnifiedMap({
  statuses,
  height = '400px',
}: {
  assets?: MapAsset[];
  statuses?: Array<{
    assetId: string;
    status?: { location?: { latitude: number; longitude: number }; status?: string };
    asset?: { name: string };
  }>;
  height?: string;
}) {
  const points = (statuses || [])
    .filter((s) => s.status?.location?.latitude && s.status?.location?.longitude)
    .map((s) => ({
      id: s.assetId,
      name: s.asset?.name || 'Vehicle',
      lat: s.status!.location!.latitude,
      lng: s.status!.location!.longitude,
      motion: s.status?.status,
    }));

  const center: [number, number] = points[0] ? [points[0].lat, points[0].lng] : [0.3476, 32.5825];

  return (
    <div className="map-container rounded-lg overflow-hidden border relative" style={{ height }}>
      <MapContainer center={center} zoom={points.length ? 11 : 8} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            <Popup>
              <strong>{p.name}</strong>
              <br />
              Status: {p.motion || 'unknown'}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {!points.length && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground bg-card/50">
          No vehicle positions — configure integrations in Admin
        </div>
      )}
    </div>
  );
}
