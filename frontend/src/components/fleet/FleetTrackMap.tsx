import { useEffect, useMemo } from 'react';
import { MapContainer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { format } from 'date-fns';
import 'leaflet/dist/leaflet.css';
import { MAP_REGION_DEFAULT, getFleetMapTiles } from '@/lib/mapConfig';
import { FleetMapTileLayer } from '@/components/map/FleetMapTileLayer';
import { useMapStyle } from '@/hooks/useMapStyle';
import { useWialonTrackHistory } from '@/hooks/useWialonTrackHistory';
import { useWialonContext } from '@/hooks/useWialon';
import { useFleetUnitIcon } from '@/hooks/useFleetUnitIcon';
import { buildFleetMapIcon } from '@/lib/fleetMapIcons';
import type { FleetUnit } from '@/lib/fleetUnits';
import { formatFuelDisplay } from '@/lib/fleetUnits';
import {
  formatTrackDuration,
  ROUTE_LINE_COLOR,
  TRACK_STATUS_COLORS,
  type TrackStopEvent,
  type TrackStateMarker,
  type TrackDirectionMarker,
} from '@/lib/trackAnalysis';
import { Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';

export type TrackPeriod = 'hour' | 'day' | 'week' | 'month';

export function trackPeriodToMinutes(period: TrackPeriod, amount: number): number {
  const n = Math.max(1, amount);
  switch (period) {
    case 'hour':
      return n * 60;
    case 'day':
      return n * 24 * 60;
    case 'week':
      return n * 7 * 24 * 60;
    case 'month':
      return n * 30 * 24 * 60;
    default:
      return n * 24 * 60;
  }
}

function FitTrackBounds({
  track,
  point,
}: {
  track: [number, number][];
  point?: { lat: number; lng: number };
}) {
  const map = useMap();
  useEffect(() => {
    if (track.length < 2) {
      if (point) map.setView([point.lat, point.lng], 15, { animate: false });
      return;
    }
    const bounds = L.latLngBounds(track);
    if (point) bounds.extend([point.lat, point.lng]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17, animate: true });
  }, [map, track, point]);
  return null;
}

function TrackUnitMarker({ unit, lat, lng }: { unit: FleetUnit; lat: number; lng: number }) {
  const iconSrc = useFleetUnitIcon(unit.wialonId, unit.iconUgi ?? 1);
  const { html, width, height, anchorY } = buildFleetMapIcon({
    status: unit.status,
    plate: unit.plate || '',
    name: unit.name,
    isSelected: true,
    course: unit.course ?? 0,
    speed: unit.speed ?? 0,
    wialonIconSrc: iconSrc,
  });
  const icon = L.divIcon({
    html,
    className: 'fleet-unit-marker',
    iconSize: [width, height],
    iconAnchor: [width / 2, anchorY],
  });
  return <Marker position={[lat, lng]} icon={icon} />;
}

function StopMarker({ stop }: { stop: TrackStopEvent }) {
  const color =
    stop.status === 'parked'
      ? '#7c3aed'
      : stop.status === 'stopped'
        ? TRACK_STATUS_COLORS.stopped
        : TRACK_STATUS_COLORS.idle;
  const html = `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
    <div style="background:${color};color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">${stop.label}</div>
    <div style="background:#fff;border:2px solid ${color};width:12px;height:12px;border-radius:50%;margin-top:2px;box-shadow:0 1px 3px rgba(0,0,0,.2)"></div>
  </div>`;
  const icon = L.divIcon({
    html,
    className: 'track-stop-marker',
    iconSize: [72, 40],
    iconAnchor: [36, 20],
  });

  return (
    <Marker position={[stop.lat, stop.lng]} icon={icon} zIndexOffset={400}>
      <Popup>
        <div className="text-xs space-y-1 min-w-[140px]">
          <p className="font-semibold">{stop.label}</p>
          <p className="text-muted-foreground">Duration: {formatTrackDuration(stop.durationSec)}</p>
          <p className="text-muted-foreground">{format(new Date(stop.from * 1000), 'PPp')}</p>
          <p className="text-muted-foreground">to {format(new Date(stop.to * 1000), 'PPp')}</p>
        </div>
      </Popup>
    </Marker>
  );
}

function StateMarker({ marker }: { marker: TrackStateMarker }) {
  const color = TRACK_STATUS_COLORS[marker.status];
  const label = marker.status.charAt(0).toUpperCase() + marker.status.slice(1);
  return (
    <CircleMarker
      center={[marker.lat, marker.lng]}
      radius={6}
      pathOptions={{
        color: '#fff',
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      }}
      zIndexOffset={300}
    >
      <Popup>
        <div className="text-xs space-y-0.5">
          <p className="font-semibold">{label}</p>
          <p className="text-muted-foreground">{format(new Date(marker.time * 1000), 'PPp')}</p>
          <p className="text-muted-foreground tabular-nums">{Math.round(marker.speed)} km/h</p>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function DirectionMarker({ marker }: { marker: TrackDirectionMarker }) {
  const html = `<div style="transform:rotate(${marker.course}deg);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid ${ROUTE_LINE_COLOR};opacity:0.85;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))"></div>`;
  const icon = L.divIcon({
    html,
    className: 'track-direction-marker',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
  return <Marker position={[marker.lat, marker.lng]} icon={icon} interactive={false} zIndexOffset={200} />;
}

type Props = {
  unit: FleetUnit | null;
  period: TrackPeriod;
  amount: number;
  height?: string;
  onTrackStats?: (stats: { pointCount: number; stopCount: number; loading: boolean }) => void;
};

export function FleetTrackMap({ unit, period, amount, height = '60vh', onTrackStats }: Props) {
  const { provider, view } = useMapStyle();
  const tiles = getFleetMapTiles(provider, view);
  const { connected } = useWialonContext();
  const minutes = trackPeriodToMinutes(period, amount);
  const wialonId = unit?.wialonId ?? (unit && Number.isFinite(Number(unit.id)) ? Number(unit.id) : null);
  const liveRecent = minutes <= 24 * 60;

  const {
    route,
    stops,
    stateMarkers,
    directionMarkers,
    summary,
    start,
    end,
    isLoading,
    isFetching,
    pointCount,
    stopCount,
  } = useWialonTrackHistory(wialonId, connected && wialonId != null, minutes, liveRecent);

  const loading = isLoading || isFetching;

  useEffect(() => {
    onTrackStats?.({ pointCount, stopCount, loading });
  }, [pointCount, stopCount, loading, onTrackStats]);

  const mapCenter = useMemo(() => {
    if (unit?.lat != null && unit?.lng != null) return { lat: unit.lat, lng: unit.lng };
    if (end) return { lat: end.lat, lng: end.lng };
    if (start) return { lat: start.lat, lng: start.lng };
    return { lat: MAP_REGION_DEFAULT.center[0], lng: MAP_REGION_DEFAULT.center[1] };
  }, [unit, start, end]);

  const unitMarkerPos = useMemo(() => {
    if (unit?.lat != null && unit?.lng != null) return { lat: unit.lat, lng: unit.lng };
    if (end) return { lat: end.lat, lng: end.lng };
    return null;
  }, [unit, end]);

  const fitTrack = useMemo(() => (route.length > 1 ? route : []), [route]);

  if (!unit) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        Select a vehicle to view its route history.
      </div>
    );
  }

  if (!loading && pointCount === 0 && unit.lat == null && unit.lng == null) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm px-6 text-center" style={{ height }}>
        No GPS track for {unit.name} in this period.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 z-[500] bg-card/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading route history…</p>
          <p className="text-xs text-muted-foreground">Fetching GPS track</p>
        </div>
      )}

      <div className="absolute top-2 left-2 z-[500] bg-card/95 border border-border rounded-lg px-2.5 py-2 shadow-md max-w-[240px]">
        <p className="font-semibold text-xs truncate">{unit.name}</p>
        <p className="text-[10px] text-muted-foreground">{unit.plate || unit.id}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <StatusBadge status={unit.status} size="sm" />
          <span className="text-[10px] text-muted-foreground">Fuel {formatFuelDisplay(unit)}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
          {pointCount > 0
            ? `${pointCount} GPS points · ${stopCount} stops · ${formatTrackDuration(summary.movingSec)} moving`
            : 'Building route…'}
        </p>
        {unit.lat == null && pointCount > 0 && (
          <p className="text-[10px] text-amber-700 mt-0.5">Historical track (no live position)</p>
        )}
        {liveRecent && (
          <p className="text-[10px] text-status-moving mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-status-moving animate-pulse" />
            Live refresh
          </p>
        )}
      </div>

      <div className="absolute bottom-2 left-2 z-[500] bg-card/95 border border-border rounded-lg px-2 py-1.5 shadow-sm flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="w-4 h-1 rounded" style={{ background: ROUTE_LINE_COLOR }} /> Route
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: TRACK_STATUS_COLORS.moving }} /> Moving
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: TRACK_STATUS_COLORS.idle }} /> Idle
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: TRACK_STATUS_COLORS.stopped }} /> Stopped
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-violet-600 bg-white" /> Parked
        </span>
      </div>

      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        preferCanvas
        zoomControl
        maxZoom={tiles.maxZoom}
      >
        <FleetMapTileLayer key={`${provider}-${view}`} provider={provider} view={view} />
        <FitTrackBounds track={fitTrack} point={unitMarkerPos ?? undefined} />

        {/* White outline for contrast on any basemap */}
        {fitTrack.length > 1 && (
          <Polyline
            positions={fitTrack}
            pathOptions={{
              color: '#ffffff',
              weight: 8,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Primary blue route line */}
        {fitTrack.length > 1 && (
          <Polyline
            positions={fitTrack}
            pathOptions={{
              color: ROUTE_LINE_COLOR,
              weight: 5,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {directionMarkers.map((m, i) => (
          <DirectionMarker key={`dir-${i}`} marker={m} />
        ))}

        {stateMarkers.map((m, i) => (
          <StateMarker key={`state-${m.time}-${i}`} marker={m} />
        ))}

        {start && (
          <CircleMarker
            center={[start.lat, start.lng]}
            radius={9}
            pathOptions={{ color: '#fff', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }}
            zIndexOffset={500}
          >
            <Popup>
              <span className="text-xs font-medium">Route start</span>
              <br />
              <span className="text-[10px] text-muted-foreground">{format(new Date(start.time * 1000), 'PPp')}</span>
            </Popup>
          </CircleMarker>
        )}

        {end && end !== start && (
          <CircleMarker
            center={[end.lat, end.lng]}
            radius={9}
            pathOptions={{ color: '#fff', fillColor: '#dc2626', fillOpacity: 1, weight: 2 }}
            zIndexOffset={500}
          >
            <Popup>
              <span className="text-xs font-medium">Route end</span>
              <br />
              <span className="text-[10px] text-muted-foreground">{format(new Date(end.time * 1000), 'PPp')}</span>
            </Popup>
          </CircleMarker>
        )}

        {stops.map((stop, i) => (
          <StopMarker key={`stop-${stop.from}-${i}`} stop={stop} />
        ))}

        {unitMarkerPos && <TrackUnitMarker unit={unit} lat={unitMarkerPos.lat} lng={unitMarkerPos.lng} />}
      </MapContainer>
    </div>
  );
}
