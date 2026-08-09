import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { TILE_URL_TEMPLATE } from '../config/mapServer';

// MapLibre doesn't need a token for a self-hosted raster source, but the
// library still wants this called once at startup.
MapLibreGL.setAccessToken(null);

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

export default function OsmMapView({ style, initialRegion, region, onRegionChangeComplete, children }: Props) {
  const cameraRef = useRef<MapLibreGL.Camera>(null);
  const start = initialRegion ?? region;

  useEffect(() => {
    if (region && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [region.longitude, region.latitude],
        zoomLevel: regionToZoom(region),
        animationDuration: 300,
      });
    }
  }, [region?.latitude, region?.longitude]);

  return (
    <MapLibreGL.MapView
      style={style}
      onRegionDidChange={(feature: any) => {
        if (!onRegionChangeComplete) return;
        const [longitude, latitude] = feature.geometry.coordinates;
        const zoom = feature.properties.zoomLevel ?? 14;
        const longitudeDelta = 360 / Math.pow(2, zoom);
        onRegionChangeComplete({
          latitude,
          longitude,
          latitudeDelta: longitudeDelta, // close enough for our square-ish viewports
          longitudeDelta,
        });
      }}
    >
      <MapLibreGL.Camera
        ref={cameraRef}
        defaultSettings={
          start
            ? { centerCoordinate: [start.longitude, start.latitude], zoomLevel: regionToZoom(start) }
            : { centerCoordinate: [102.6331, 17.9757], zoomLevel: 13 }
        }
      />
      <MapLibreGL.RasterSource id="osm-raster" tileUrlTemplates={[TILE_URL_TEMPLATE]} tileSize={256}>
        <MapLibreGL.RasterLayer id="osm-raster-layer" sourceID="osm-raster" />
      </MapLibreGL.RasterSource>
      {children}
    </MapLibreGL.MapView>
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
    <MapLibreGL.PointAnnotation
      id={`marker-${coordinate.latitude}-${coordinate.longitude}`}
      coordinate={[coordinate.longitude, coordinate.latitude]}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color, borderWidth: 2, borderColor: 'white' }} />
    </MapLibreGL.PointAnnotation>
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
    <MapLibreGL.ShapeSource id={`route-${coordinates.length}`} shape={geojson}>
      <MapLibreGL.LineLayer
        id={`route-line-${coordinates.length}`}
        style={{ lineColor: strokeColor, lineWidth: strokeWidth, lineCap: 'round', lineJoin: 'round' }}
      />
    </MapLibreGL.ShapeSource>
  );
}
