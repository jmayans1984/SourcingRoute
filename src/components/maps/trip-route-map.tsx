'use client';

import { useEffect, useRef } from 'react';
import type { TripStop, Store } from '@/types/database';

interface StopWithStore extends TripStop {
  store: Store;
}

interface TripRouteMapProps {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  stops: StopWithStore[];
  routePolyline?: string | null;
}

const POLYLINE_COLOR = '#2563eb'; // primary blue
const START_ICON = 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
const STOP_ICON = 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
const END_ICON = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';

declare global {
  interface Window {
    google: any;
  }
}

export function TripRouteMap({
  startLat,
  startLng,
  endLat,
  endLng,
  stops,
  routePolyline,
}: TripRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    const google = window.google;

    // A coordinate of exactly (0,0) is "null island" in the Gulf of Guinea —
    // it means the point was never geocoded, so we skip drawing it instead of
    // showing a stray marker off the coast of Africa.
    const isValid = (lat: number, lng: number) => lat !== 0 || lng !== 0;
    const hasValidEnd =
      isValid(endLat, endLng) && (endLat !== startLat || endLng !== startLng);

    // Create map
    map.current = new google.maps.Map(mapRef.current, {
      zoom: 10,
      center: { lat: startLat, lng: startLng },
      mapTypeId: 'roadmap',
    });

    // Start marker (green)
    new google.maps.Marker({
      position: { lat: startLat, lng: startLng },
      map: map.current,
      title: 'Start',
      icon: START_ICON,
    });

    // End marker (red) — only if valid and different from start
    if (hasValidEnd) {
      new google.maps.Marker({
        position: { lat: endLat, lng: endLng },
        map: map.current,
        title: 'End',
        icon: END_ICON,
      });
    }

    // Stop markers with custom labels (skip any without real coordinates)
    stops
      .filter((s) => isValid(s.store.lat, s.store.lng))
      .forEach((stop) => {
      const marker = new google.maps.Marker({
        position: { lat: stop.store.lat, lng: stop.store.lng },
        map: map.current,
        title: stop.store.name,
        label: {
          text: String(stop.stop_order),
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        icon: STOP_ICON,
      });

      // Info window
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; font-size: 12px;">
            <strong>${stop.store.name}</strong><br/>
            ${stop.store.address}<br/>
            <span style="color: #2563eb;">Score: ${stop.score}</span>
          </div>
        `,
      });

      marker.addListener('click', () => {
        infoWindow.open(map.current, marker);
      });
    });

    // Prefer the actual street-following path returned by Google Routes API.
    // Falls back to straight lines between stops only if no polyline was saved
    // (e.g. the route was created before this existed, or Routes API failed).
    const fallbackPath = [
      { lat: startLat, lng: startLng },
      ...stops
        .filter((s) => isValid(s.store.lat, s.store.lng))
        .map((s) => ({ lat: s.store.lat, lng: s.store.lng })),
      ...(hasValidEnd ? [{ lat: endLat, lng: endLng }] : []),
    ];

    const roadPath = routePolyline
      ? google.maps.geometry.encoding.decodePath(routePolyline)
      : null;

    new google.maps.Polyline({
      path: roadPath || fallbackPath,
      geodesic: !roadPath,
      strokeColor: POLYLINE_COLOR,
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: map.current,
    });

    // Auto-fit bounds to show all markers and route
    const bounds = new google.maps.LatLngBounds();
    fallbackPath.forEach((point) => {
      bounds.extend(point);
    });
    map.current.fitBounds(bounds, { padding: 50 });
  }, [startLat, startLng, endLat, endLng, stops, routePolyline]);

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height: '300px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}
    />
  );
}
