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
import { formatTrackDuration, TRACK_STATUS_COLORS } from '@/lib/trackAnalysis';
import type { TrackStopEvent } from '@/lib/trackAnalysis';
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

function FitTrackBounds({ track, point }: { track: [number, number][]; point?: { lat: number; lng: number } }) {
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

function TrackUnitMarker({ unit }: { unit: FleetUnit }) {
  const iconSrc = useFleetUnitIcon(unit.wialonId, unit.iconUgi ?? 1);
  if (unit.lat == null || unit.lng == null) return null;
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
  return <Marker position={[unit.lat, unit.lng]} icon={icon} />;
}

function StopMarker({ stop }: { stop: TrackStopEvent }) {
  const color =
    stop.status === 'parked' ? '#7c3aed' : stop.status === 'stopped' ? TRACK_STATUS_COLORS.stopped : TRACK_STATUS_COLORS.idle;
  const html = `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
    <div style="background:${color};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)">${stop.label}</div>
    <div style="background:#fff;border:2px solid ${color};width:10px;height:10px;border-radius:50%;margin-top:2px"></div>
  </div>`;
  const icon = L.divIcon({
    html,
    className: 'track-stop-marker',
    iconSize: [64, 36],
    iconAnchor: [32, 18],
  });

  return (
    <Marker position={[stop.lat, stop.lng]} icon={icon}>
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
    statusSegments,
    route,
    stops,
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

  const fitTrack = useMemo(() => (route.length > 1 ? route : []), [route]);

  if (!unit) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        Select a vehicle to view its route history.
      </div>
    );
  }

  if (unit.lat == null || unit.lng == null) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        No GPS position for {unit.name}.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 z-[500] bg-card/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading route history…</p>
          <p className="text-xs text-muted-foreground">Fetching GPS track from Wialon</p>
        </div>
      )}
      <div className="absolute top-2 left-2 z-[500] bg-card/95 border border-border rounded-lg px-2.5 py-2 shadow-md max-w-[220px]">
        <p className="font-semibold text-xs truncate">{unit.name}</p>
        <p className="text-[10px] text-muted-foreground">{unit.plate || unit.id}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <StatusBadge status={unit.status} size="sm" />
          <span className="text-[10px] text-muted-foreground">Fuel {formatFuelDisplay(unit)}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
          {pointCount > 0 ? `${pointCount} GPS points · ${stopCount} stops` : 'Building route…'}
        </p>
        {liveRecent && (
          <p className="text-[10px] text-status-moving mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-status-moving animate-pulse" />
            Live refresh
          </p>
        )}
      </div>

      <div className="absolute bottom-2 left-2 z-[500] bg-card/95 border border-border rounded-lg px-2 py-1.5 shadow-sm flex flex-wrap gap-2 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ background: TRACK_STATUS_COLORS.moving }} /> Moving</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ background: TRACK_STATUS_COLORS.idle }} /> Idle</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ background: TRACK_STATUS_COLORS.stopped }} /> Stopped</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border-2 border-violet-600 bg-white" /> Parked</span>
      </div>

      <MapContainer
        center={unit.lat != null ? [unit.lat, unit.lng] : MAP_REGION_DEFAULT.center}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        preferCanvas
        zoomControl
        maxZoom={tiles.maxZoom}
      >
        <FleetMapTileLayer key={`${provider}-${view}`} provider={provider} view={view} />
        <FitTrackBounds track={fitTrack} point={{ lat: unit.lat, lng: unit.lng }} />

        {statusSegments.map((seg, i) =>
          seg.positions.length > 1 ? (
            <Polyline
              key={`seg-${seg.status}-${i}`}
              positions={seg.positions}
              pathOptions={{
                color: seg.color,
                weight: 5,
                opacity: 0.92,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ) : null
        )}

        {start && (
          <CircleMarker
            center={[start.lat, start.lng]}
            radius={8}
            pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }}
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
            radius={8}
            pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1, weight: 2 }}
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

        <TrackUnitMarker unit={unit} />
      </MapContainer>
    </div>
  );
}
