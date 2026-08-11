import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Map, Camera, ViewAnnotation, GeoJSONSource, Layer, type LngLat, type ViewStateChangeEvent, type CameraRef } from '@maplibre/maplibre-react-native';
import { TILE_URL_TEMPLATE } from '../config/mapServer';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Props = {
  style?: any;
  initialRegion?: Region;
  region?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  children?: React.ReactNode;
};

/** Rough conversion so callers can keep thinking in "delta" terms like react-native-maps. */
function regionToZoom(region: Region) {
  return Math.log2(360 / region.longitudeDelta);
}

// Self-hosted raster tiles as the base style. v11 requires an explicit
// `mapStyle`, so the OSM raster source is declared right in the style JSON
// instead of as a child component.
const osmStyle = {
  version: 8 as const,
  sources: {
    'osm-raster': {
      type: 'raster' as const,
      tiles: [TILE_URL_TEMPLATE],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'osm-raster-layer',
      type: 'raster' as const,
      source: 'osm-raster',
    },
  ],
};

export default function OsmMapView({ style, initialRegion, region, onRegionChangeComplete, children }: Props) {
  const cameraRef = useRef<CameraRef>(null);
  const start = initialRegion ?? region;

  useEffect(() => {
    if (region && cameraRef.current) {
      cameraRef.current.easeTo({
        center: [region.longitude, region.latitude],
        zoom: regionToZoom(region),
        duration: 300,
      });
    }
  }, [region?.latitude, region?.longitude]);

  return (
    <Map
      style={style}
      mapStyle={osmStyle}
      onRegionDidChange={(event) => {
        if (!onRegionChangeComplete) return;
        const { center, zoom } = event.nativeEvent as ViewStateChangeEvent;
        const [longitude, latitude] = center as LngLat;
        const longitudeDelta = 360 / Math.pow(2, zoom);
        onRegionChangeComplete({
          latitude,
          longitude,
          latitudeDelta: longitudeDelta, // close enough for our square-ish viewports
          longitudeDelta,
        });
      }}
    >
      <Camera
        ref={cameraRef}
        initialViewState={
          start
            ? { center: [start.longitude, start.latitude], zoom: regionToZoom(start) }
            : { center: [102.6331, 17.9757], zoom: 13 }
        }
      />
      {children}
    </Map>
  );
}

/** Drop-in-ish replacement for react-native-maps' <Marker>. */
export function Marker({
  coordinate,
  color = '#111111',
}: {
  coordinate: { latitude: number; longitude: number };
  color?: string;
}) {
  return (
    <ViewAnnotation lngLat={[coordinate.longitude, coordinate.latitude]}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color, borderWidth: 2, borderColor: 'white' }} />
    </ViewAnnotation>
  );
}

/** Drop-in-ish replacement for react-native-maps' <Polyline>. */
export function Polyline({
  coordinates,
  strokeColor = '#111111',
  strokeWidth = 4,
}: {
  coordinates: { latitude: number; longitude: number }[];
  strokeColor?: string;
  strokeWidth?: number;
}) {
  const geojson = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: coordinates.map((c) => [c.longitude, c.latitude]),
    },
  };
  return (
    <GeoJSONSource data={geojson}>
      <Layer
        type="line"
        paint={{ 'line-color': strokeColor, 'line-width': strokeWidth }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </GeoJSONSource>
  );
}
