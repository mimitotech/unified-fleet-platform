import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MapContainer, Marker, Polyline, CircleMarker, useMap } from 'react-leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import L from 'leaflet';
import { Crosshair } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import {
  MAP_REGION_DEFAULT,
  getFleetMapTiles,
} from '@/lib/mapConfig';
import { FleetMapTileLayer } from '@/components/map/FleetMapTileLayer';
import { useMapStyle } from '@/hooks/useMapStyle';
import { safeArray } from '@/lib/safeArray';
import { MapGeofenceLayer } from '@/components/map/MapGeofenceLayer';
import { buildFleetMapIcon } from '@/lib/fleetMapIcons';
import { useFleetUnitIcon } from '@/hooks/useFleetUnitIcon';
import { MapUnitDetailCard } from '@/components/fleet/MapUnitDetailCard';
import { useMovingTrails } from '@/hooks/useMovingTrails';
import { useWialonUnitTrack } from '@/hooks/useWialonUnitTrack';
import { useSmoothMapPositions } from '@/hooks/useSmoothMapPositions';
import { isValidMapCoord, recentTrackWindow, splitTrackSegments } from '@/lib/mapGeo';
import type { VehicleStatus } from '@/components/shared/StatusBadge';

const DETAIL_CARD_WIDTH = 420;
const TRACK_COLOR = '#2563eb';
const TRAIL_COLOR = '#3b82f6';
const TRAIL_GLOW = '#93c5fd';

export interface MapStatusPoint {
  assetId: string;
  status?: {
    location?: { latitude: number; longitude: number; speed?: number; course?: number };
    status?: string;
    fuelLevel?: number;
    fuelFormatted?: string;
    fuelLiters?: number;
  };
  asset?: { name: string; registrationPlate?: string };
  wialon?: {
    hwName?: string;
    hw?: number;
    motionState?: string;
    course?: number;
    wialonId?: number;
    iconUgi?: number;
    iconUrl?: string;
    fuelFormatted?: string;
    fuelLiters?: number;
    trip?: {
      state?: 0 | 1 | 2;
      currSpeed?: number;
      course?: number;
    };
  };
}

interface MapPoint {
  id: string;
  wialonId?: number;
  iconUgi?: number;
  name: string;
  plate?: string;
  lat: number;
  lng: number;
  motion: VehicleStatus;
  motionState?: string;
  hwName?: string;
  hw?: number;
  speed?: number;
  fuel?: number;
  fuelFormatted?: string;
  fuelLiters?: number;
  course?: number;
}

function createFleetIcon(
  point: MapPoint,
  isSelected: boolean,
  wialonIconSrc?: string
) {
  const { html, width, height, anchorY } = buildFleetMapIcon({
    status: point.motion,
    plate: point.plate || '',
    name: point.name,
    isSelected,
    course: point.course ?? 0,
    speed: point.speed ?? 0,
    wialonIconSrc,
  });

  return L.divIcon({
    html,
    className: 'fleet-unit-marker',
    iconSize: [width, height],
    iconAnchor: [width / 2, anchorY],
  });
}

export function fitMapToFleet(map: L.Map, points: MapPoint[]): void {
  if (points.length === 0) {
    map.setView(MAP_REGION_DEFAULT.center, MAP_REGION_DEFAULT.zoom, { animate: false });
    return;
  }
  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 15, { animate: true });
    return;
  }
  const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
  map.fitBounds(bounds, { padding: [52, 52], maxZoom: 16, animate: true });
}

function MapScaleControl() {
  const map = useMap();
  useEffect(() => {
    const scale = L.control.scale({ metric: true, imperial: false, position: 'bottomleft' });
    scale.addTo(map);
    return () => {
      scale.remove();
    };
  }, [map]);
  return null;
}

function MapFleetAutoFit({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const fitted = useRef(false);
  const hadPoints = useRef(false);

  useEffect(() => {
    if (points.length === 0) {
      if (!hadPoints.current && !fitted.current) {
        map.setView(MAP_REGION_DEFAULT.center, MAP_REGION_DEFAULT.zoom, { animate: false });
      }
      return;
    }
    hadPoints.current = true;
    if (fitted.current) return;
    fitMapToFleet(map, points);
    fitted.current = true;
  }, [map, points]);

  return null;
}

/** Fly to exact unit position on selection only — never chase animated frames. */
function MapFocusOnUnit({
  point,
  enabled,
  focusKey,
  offsetForCard,
}: {
  point: MapPoint | null;
  enabled: boolean;
  focusKey: number;
  offsetForCard: boolean;
}) {
  const map = useMap();
  const lastFocus = useRef('');

  useEffect(() => {
    if (!point || !enabled) return;
    const sig = `${point.id}:${focusKey}`;
    if (lastFocus.current === sig) return;
    lastFocus.current = sig;

    const zoom = Math.max(map.getZoom(), 16);
    const { lat, lng } = point;
    map.flyTo([lat, lng], zoom, { duration: 0.45, easeLinearity: 0.25 });

    if (!offsetForCard) return;

    window.setTimeout(() => {
      const target = map.latLngToContainerPoint([lat, lng]);
      const size = map.getSize();
      const cardPad = DETAIL_CARD_WIDTH + 32;
      const idealX = cardPad + (size.x - cardPad) * 0.55;
      const deltaX = idealX - target.x;
      if (Math.abs(deltaX) > 20) {
        map.panBy([deltaX, 0], { animate: true });
      }
    }, 480);
    // Intentionally ignore continuous lat/lng updates — selection only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, point?.id, enabled, focusKey, offsetForCard]);

  return null;
}

/** Fit map once on unit selection to a recent track window — never on every live refresh. */
function MapFitTrackBounds({
  track,
  point,
  enabled,
  focusKey,
}: {
  track: [number, number][];
  point: MapPoint | null;
  enabled: boolean;
  focusKey: number;
}) {
  const map = useMap();
  const lastFit = useRef<string>('');

  useEffect(() => {
    if (!enabled || !point || track.length < 2) return;
    if (!isValidMapCoord(point.lat, point.lng)) return;
    const sig = `${point.id}:${focusKey}`;
    if (lastFit.current === sig) return;
    lastFit.current = sig;

    const recent = track.slice(-Math.min(track.length, 40));
    const bounds = L.latLngBounds(recent);
    bounds.extend([point.lat, point.lng]);
    if (!bounds.isValid()) return;
    // Avoid world-scale zoom if something slipped through.
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (Math.abs(ne.lat - sw.lat) > 1.2 || Math.abs(ne.lng - sw.lng) > 1.2) {
      map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15), { animate: true });
      return;
    }
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 16, animate: true });
  }, [map, track, point, enabled, focusKey]);

  return null;
}

function FitFleetControl({ points, visible }: { points: MapPoint[]; visible: boolean }) {
  const map = useMap();
  if (!visible) return null;
  return (
    <div className="leaflet-top leaflet-right pointer-events-none" style={{ marginTop: 10, marginRight: 10 }}>
      <button
        type="button"
        className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-border/80 bg-card/95 backdrop-blur-sm px-3 py-2 text-xs font-medium shadow-md hover:bg-muted transition-colors"
        onClick={() => fitMapToFleet(map, points)}
        title="Center on your fleet"
      >
        <Crosshair className="h-3.5 w-3.5 text-primary" />
        Fit Fleet
      </button>
    </div>
  );
}

function MapFitOnSignal({ points, signal }: { points: MapPoint[]; signal?: number }) {
  const map = useMap();
  const last = useRef(0);
  useEffect(() => {
    if (!signal || signal === last.current) return;
    last.current = signal;
    fitMapToFleet(map, points);
  }, [map, points, signal]);
  return null;
}

const FleetUnitMarker = memo(function FleetUnitMarker({
  point,
  selected,
  onMarkerClick,
  onMarkerHover,
  onMarkerLeave,
}: {
  point: MapPoint;
  selected: boolean;
  onMarkerClick: (point: MapPoint) => void;
  onMarkerHover: (point: MapPoint) => void;
  onMarkerLeave: (point: MapPoint) => void;
}) {
  const loadedIcon = useFleetUnitIcon(point.wialonId, point.iconUgi ?? 1);
  const lastIconRef = useRef<string | undefined>();
  if (loadedIcon) lastIconRef.current = loadedIcon;
  const wialonIconSrc = loadedIcon ?? lastIconRef.current;
  const markerRef = useRef<LeafletMarker>(null);

  const icon = useMemo(() => {
    const courseBucket = Math.round((point.course ?? 0) / 15) * 15;
    const speedBucket = Math.round((point.speed ?? 0) / 5) * 5;
    return createFleetIcon(
      { ...point, course: courseBucket, speed: speedBucket },
      selected,
      wialonIconSrc,
    );
    // Intentionally omit lat/lng so icon does not rebuild every animation frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    point.id,
    point.motion,
    point.plate,
    point.name,
    // Bucketed in createFleetIcon call — still list raw for rebuild when heading changes meaningfully
    Math.round((point.course ?? 0) / 15),
    Math.round((point.speed ?? 0) / 5),
    selected,
    wialonIconSrc,
  ]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    marker.setLatLng([point.lat, point.lng]);
    marker.setIcon(icon);
    const z =
      point.motion === 'moving'
        ? selected
          ? 2500
          : 1500
        : selected
          ? 1200
          : 0;
    marker.setZIndexOffset(z);
  }, [point.lat, point.lng, point.motion, icon, selected]);

  const zIndex =
    point.motion === 'moving' ? (selected ? 2500 : 1500) : selected ? 1200 : 0;

  return (
    <Marker
      ref={markerRef}
      position={[point.lat, point.lng]}
      icon={icon}
      zIndexOffset={zIndex}
      eventHandlers={{
        click: () => onMarkerClick(point),
        mouseover: () => onMarkerHover(point),
        mouseout: () => onMarkerLeave(point),
      }}
    />
  );
});

export type MapDetailPanelMode = 'overlay' | 'none';

interface UnifiedMapProps {
  statuses?: MapStatusPoint[];
  height?: string;
  sessionKey?: string;
  selectedUnitId?: string | null;
  onUnitSelect?: (unitId: string | null) => void;
  /** overlay = docked card on map; none = rely on external panel (e.g. monitoring workspace) */
  detailPanel?: MapDetailPanelMode;
  /** Increment to trigger fit-from-toolbar (outside map). */
  fitSignal?: number;
  /** Show Fit Fleet control on the map (top-right). */
  showFitControl?: boolean;
  /** Overlay Wialon geofence circles when connected. */
  showGeofences?: boolean;
}

function normalizeMotion(raw?: string): VehicleStatus {
  const s = (raw || 'offline').toLowerCase();
  if (s === 'moving' || s === 'idle' || s === 'stopped' || s === 'offline') return s;
  if (s.includes('move')) return 'moving';
  if (s.includes('idle')) return 'idle';
  if (s.includes('stop')) return 'stopped';
  return 'offline';
}

function UnifiedMapInner({
  statuses,
  height = '400px',
  sessionKey = 'default',
  selectedUnitId,
  onUnitSelect,
  detailPanel = 'overlay',
  fitSignal,
  showFitControl = true,
  showGeofences = false,
}: UnifiedMapProps) {
  const { provider, view } = useMapStyle();
  const tiles = getFleetMapTiles(provider, view);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selectedUnitId != null) {
      setLocalDetailId(selectedUnitId);
      setFocusKey((k) => k + 1);
    }
  }, [selectedUnitId]);

  const points = useMemo<MapPoint[]>(() => {
    return safeArray<MapStatusPoint>(statuses)
      .filter((s) => {
        const lat = s.status?.location?.latitude;
        const lng = s.status?.location?.longitude;
        return lat != null && lng != null && isValidMapCoord(lat, lng);
      })
      .map((s) => ({
        id: s.assetId,
        wialonId: s.wialon?.wialonId ?? (Number.isFinite(Number(s.assetId)) ? Number(s.assetId) : undefined),
        iconUgi: s.wialon?.iconUgi,
        name: s.asset?.name || 'Unit',
        plate: s.asset?.registrationPlate,
        lat: s.status!.location!.latitude,
        lng: s.status!.location!.longitude,
        motion: normalizeMotion(s.status?.status),
        motionState: s.wialon?.motionState,
        hwName: s.wialon?.hwName,
        hw: s.wialon?.hw,
        speed: s.wialon?.trip?.currSpeed ?? s.status?.location?.speed,
        fuel: s.status?.fuelLevel,
        fuelFormatted: s.status?.fuelFormatted ?? s.wialon?.fuelFormatted,
        fuelLiters: s.status?.fuelLiters ?? s.wialon?.fuelLiters,
        course: s.wialon?.trip?.course ?? s.wialon?.course ?? s.status?.location?.course,
      }));
  }, [statuses]);

  // Smooth markers for display; trails use raw GPS so animated frames never smear the map.
  const displayPoints = useSmoothMapPositions(points);
  const safeDisplayPoints = Array.isArray(displayPoints) ? displayPoints : points;

  const focusedId = selectedUnitId ?? localDetailId;
  const overlayDetailId = detailPanel === 'overlay' ? focusedId : null;
  const detailPoint = points.find((p) => p.id === focusedId) || null;
  const hoverPoint = points.find((p) => p.id === hoverId) || null;
  const showDetailCard = detailPanel === 'overlay' && !!detailPoint;
  const showTrack = !!focusedId;
  const showHoverCard = !!hoverPoint && hoverPoint.id !== focusedId;

  const movingTrailsRaw = useMovingTrails(points);
  const liveTrailSegments = useMemo(() => {
    return movingTrailsRaw
      .filter((trail) => trail.id === focusedId)
      .flatMap((trail) =>
        splitTrackSegments(trail.positions, 800).map((positions, idx) => ({
          id: `${trail.id}-${idx}`,
          positions,
        })),
      );
  }, [movingTrailsRaw, focusedId]);

  const activeWialonId =
    detailPoint?.wialonId ??
    (detailPoint && Number.isFinite(Number(detailPoint.id)) ? Number(detailPoint.id) : null);

  // Short recent-message window (Wialon unit trace), not multi-hour history.
  const { data: trackData } = useWialonUnitTrack(
    activeWialonId,
    !!detailPoint && showTrack,
    45,
    true,
  );
  const wialonTrackSegments = useMemo(() => {
    if (trackData.segments.length) return trackData.segments;
    return splitTrackSegments(trackData.points, 2_500);
  }, [trackData]);
  const wialonTrackForFit = useMemo(
    () => recentTrackWindow(trackData.points, 40),
    [trackData.points],
  );
  const hasWialonTrack = wialonTrackSegments.some((s) => s.length > 1);

  const handleMarkerClick = useCallback(
    (point: MapPoint) => {
      setLocalDetailId(point.id);
      setFocusKey((k) => k + 1);
      setHoverId(null);
      onUnitSelect?.(point.id);
    },
    [onUnitSelect]
  );

  const handleMarkerHover = useCallback((point: MapPoint) => {
    if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
    setHoverId(point.id);
  }, []);

  const handleMarkerLeave = useCallback(() => {
    hoverLeaveTimer.current = setTimeout(() => setHoverId(null), 180);
  }, []);

  const closeDetail = useCallback(() => {
    setLocalDetailId(null);
    onUnitSelect?.(null);
  }, [onUnitSelect]);

  const displayDetailPoint = safeDisplayPoints.find((p) => p.id === focusedId) || detailPoint;
  const displayHoverPoint = safeDisplayPoints.find((p) => p.id === hoverId) || hoverPoint;
  const hoverRawPoint = points.find((p) => p.id === hoverId) || null;

  return (
    <div className="map-container rounded-lg overflow-hidden border relative" style={{ height }}>
      <MapContainer
        key={sessionKey}
        center={MAP_REGION_DEFAULT.center}
        zoom={MAP_REGION_DEFAULT.zoom}
        style={{ height: '100%', width: '100%' }}
        preferCanvas
        worldCopyJump
        zoomControl
        maxZoom={tiles.maxZoom}
        minZoom={2}
        scrollWheelZoom
      >
        <FleetMapTileLayer key={`${provider}-${view}`} provider={provider} view={view} />
        <MapScaleControl />
        <MapFleetAutoFit points={points} />
        {showGeofences && <MapGeofenceLayer enabled />}
        <MapFitOnSignal points={points} signal={fitSignal} />
        <MapFocusOnUnit
          point={detailPoint}
          enabled={!!detailPoint}
          focusKey={focusKey}
          offsetForCard={showDetailCard}
        />
        <MapFitTrackBounds
          track={wialonTrackForFit}
          point={detailPoint}
          enabled={showTrack && wialonTrackForFit.length > 1}
          focusKey={focusKey}
        />
        <FitFleetControl points={points} visible={showFitControl} />
        {/* Live breadcrumbs while waiting for Wialon message track */}
        {!hasWialonTrack &&
          liveTrailSegments.map((trail) => (
            <Polyline
              key={`trail-glow-${trail.id}`}
              positions={trail.positions}
              pathOptions={{
                color: TRAIL_GLOW,
                weight: 5,
                opacity: 0.3,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}
        {!hasWialonTrack &&
          liveTrailSegments.map((trail) => (
            <Polyline
              key={`trail-core-${trail.id}`}
              positions={trail.positions}
              pathOptions={{
                color: TRAIL_COLOR,
                weight: 3,
                opacity: 0.75,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}
        {displayDetailPoint &&
          wialonTrackSegments.map((segment, idx) => (
            <Polyline
              key={`wialon-track-glow-${displayDetailPoint.id}-${idx}`}
              positions={segment}
              pathOptions={{
                color: TRAIL_GLOW,
                weight: 7,
                opacity: 0.28,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}
        {displayDetailPoint &&
          wialonTrackSegments.map((segment, idx) => (
            <Polyline
              key={`wialon-track-${displayDetailPoint.id}-${idx}`}
              positions={segment}
              pathOptions={{
                color: TRACK_COLOR,
                weight: 4,
                opacity: 0.92,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}
        {displayDetailPoint && isValidMapCoord(displayDetailPoint.lat, displayDetailPoint.lng) && (
          <CircleMarker
            key={`pin-${displayDetailPoint.id}`}
            center={[displayDetailPoint.lat, displayDetailPoint.lng]}
            radius={10}
            pathOptions={{
              color: TRACK_COLOR,
              fillColor: '#ffffff',
              fillOpacity: 1,
              weight: 3,
            }}
          />
        )}
        {safeDisplayPoints.map((p) => (
          <FleetUnitMarker
            key={p.id}
            point={p}
            selected={p.id === focusedId}
            onMarkerClick={handleMarkerClick}
            onMarkerHover={handleMarkerHover}
            onMarkerLeave={handleMarkerLeave}
          />
        ))}
      </MapContainer>

      {showHoverCard && displayHoverPoint && (
        <div
          className="absolute z-[550] pointer-events-none"
          style={{ top: 12, right: 12, width: 320, maxWidth: 'calc(100% - 24px)' }}
          onMouseEnter={() => {
            if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
            setHoverId(displayHoverPoint.id);
          }}
          onMouseLeave={handleMarkerLeave}
        >
          <MapUnitDetailCard
            unit={{
              id: displayHoverPoint.id,
              wialonId: displayHoverPoint.wialonId,
              name: displayHoverPoint.name,
              plate: displayHoverPoint.plate,
              status: displayHoverPoint.motion,
              motionState: displayHoverPoint.motionState,
              iconUgi: displayHoverPoint.iconUgi,
              hwName: displayHoverPoint.hwName,
              hw: displayHoverPoint.hw,
              fuelLevel: displayHoverPoint.fuel,
              fuelLiters: displayHoverPoint.fuelLiters,
              fuelFormatted: displayHoverPoint.fuelFormatted,
            }}
            lat={hoverRawPoint?.lat ?? displayHoverPoint.lat}
            lng={hoverRawPoint?.lng ?? displayHoverPoint.lng}
            speed={displayHoverPoint.speed}
            course={displayHoverPoint.course}
            live
            className="shadow-xl pointer-events-auto max-h-[min(50vh,420px)]"
          />
        </div>
      )}

      {showDetailCard && displayDetailPoint && (
        <>
          <button
            type="button"
            className="absolute inset-0 z-[590] cursor-default bg-black/15"
            aria-label="Close unit details"
            onClick={closeDetail}
          />
          <div
            className="map-unit-detail-overlay absolute z-[600] pointer-events-none"
            style={{ top: 12, left: 12, bottom: 12, width: DETAIL_CARD_WIDTH, maxWidth: 'calc(100% - 24px)' }}
          >
            <div className="pointer-events-auto h-full flex flex-col justify-start">
              <MapUnitDetailCard
                unit={{
                  id: displayDetailPoint.id,
                  wialonId: displayDetailPoint.wialonId,
                  name: displayDetailPoint.name,
                  plate: displayDetailPoint.plate,
                  status: displayDetailPoint.motion,
                  motionState: displayDetailPoint.motionState,
                  iconUgi: displayDetailPoint.iconUgi,
                  hwName: displayDetailPoint.hwName,
                  hw: displayDetailPoint.hw,
                  fuelLevel: displayDetailPoint.fuel,
                  fuelLiters: displayDetailPoint.fuelLiters,
                  fuelFormatted: displayDetailPoint.fuelFormatted,
                }}
                lat={detailPoint?.lat ?? displayDetailPoint.lat}
                lng={detailPoint?.lng ?? displayDetailPoint.lng}
                speed={displayDetailPoint.speed}
                course={displayDetailPoint.course}
                live
                onClose={closeDetail}
                onOpenPanel={onUnitSelect ? () => onUnitSelect(displayDetailPoint.id) : undefined}
                className="shadow-2xl"
              />
            </div>
          </div>
        </>
      )}

      {!points.length && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground bg-card/20">
          <p className="text-sm bg-card/90 px-4 py-2 rounded-lg border shadow-sm">
            Loading fleet positions…
          </p>
        </div>
      )}
    </div>
  );
}

export const UnifiedMap = memo(UnifiedMapInner);
