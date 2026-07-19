import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { getMapTiles, type MapProviderId, type MapViewId } from '@/lib/mapConfig';

type Props = {
  provider: MapProviderId;
  view: MapViewId;
};

function MapZoomSync({ maxZoom }: { maxZoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setMaxZoom(maxZoom);
    if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
  }, [map, maxZoom]);
  return null;
}

/** Imperative tile layers — swaps basemap instantly when provider/view changes. */
export function FleetMapTileLayer({ provider, view }: Props) {
  const map = useMap();
  const tiles = getMapTiles(provider, view);
  const layersRef = useRef<L.TileLayer[]>([]);

  useEffect(() => {
    for (const layer of layersRef.current) {
      map.removeLayer(layer);
    }
    layersRef.current = [];

    const layerOpts: L.TileLayerOptions = {
      attribution: tiles.attribution,
      maxZoom: tiles.maxZoom,
      maxNativeZoom: tiles.maxNativeZoom,
      updateWhenIdle: true,
      updateWhenZooming: true,
      keepBuffer: 8,
      detectRetina: false,
    };
    if (tiles.subdomains) layerOpts.subdomains = tiles.subdomains;
    const base = L.tileLayer(tiles.url, layerOpts);
    base.addTo(map);
    layersRef.current.push(base);

    if (tiles.overlayUrl) {
      const overlayOpts: L.TileLayerOptions = {
        attribution: tiles.overlayAttribution,
        maxZoom: tiles.maxZoom,
        maxNativeZoom: tiles.maxNativeZoom,
        updateWhenIdle: true,
        updateWhenZooming: true,
        keepBuffer: 6,
        detectRetina: false,
      };
      if (tiles.overlaySubdomains) overlayOpts.subdomains = tiles.overlaySubdomains;
      const overlay = L.tileLayer(tiles.overlayUrl, overlayOpts);
      overlay.addTo(map);
      layersRef.current.push(overlay);
    }

    map.invalidateSize();

    return () => {
      for (const layer of layersRef.current) {
        map.removeLayer(layer);
      }
      layersRef.current = [];
    };
  }, [map, provider, view, tiles.url, tiles.overlayUrl]);

  return <MapZoomSync maxZoom={tiles.maxZoom} />;
}
