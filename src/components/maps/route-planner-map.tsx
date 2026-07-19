'use client';

import { useEffect, useRef, useState } from 'react';
import type { ManualStop } from '@/components/route/stop-picker';

export interface RouteStats {
  distanceMiles: number;
  driveMinutes: number;
}

interface RoutePlannerMapProps {
  startLat: number | null;
  startLng: number | null;
  endLat?: number | null;
  endLng?: number | null;
  // Open-ended route: no return leg — the route ends at the last stop
  openEnded?: boolean;
  stops: ManualStop[];
  optimizeOrder?: boolean;
  onStats?: (stats: RouteStats | null) => void;
}

const START_ICON = 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
const STOP_ICON = 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
const END_ICON = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
  }
}

export function RoutePlannerMap({
  startLat,
  startLng,
  endLat,
  endLng,
  openEnded = false,
  stops,
  optimizeOrder = false,
  onStats,
}: RoutePlannerMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const directionsRenderer = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const directionsService = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fallbackLine = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  // Init map once Google Maps JS is available
  useEffect(() => {
    let cancelled = false;

    function tryInit() {
      if (cancelled || !mapRef.current) return;
      if (!window.google?.maps) {
        setTimeout(tryInit, 200);
        return;
      }
      const google = window.google;
      map.current = new google.maps.Map(mapRef.current, {
        zoom: 9,
        center: { lat: startLat ?? 28.5384, lng: startLng ?? -81.3789 }, // Orlando fallback
        mapTypeId: 'roadmap',
        streetViewControl: false,
        mapTypeControl: false,
      });
      directionsService.current = new google.maps.DirectionsService();
      directionsRenderer.current = new google.maps.DirectionsRenderer({
        map: map.current,
        suppressMarkers: true, // we draw our own numbered markers
        preserveViewport: true,
        polylineOptions: {
          strokeColor: '#2563eb',
          strokeOpacity: 0.9,
          strokeWeight: 5,
        },
      });
      setReady(true);
    }

    tryInit();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers + route whenever inputs change
  useEffect(() => {
    if (!ready || !map.current) return;
    const google = window.google;

    // Clear old markers
    markers.current.forEach((m) => m.setMap(null));
    markers.current = [];

    // Only stops with real coordinates can be plotted / routed
    const validStops = stops.filter((s) => s.lat !== 0 || s.lng !== 0);

    const points: { lat: number; lng: number }[] = [];

    if (startLat != null && startLng != null) {
      markers.current.push(
        new google.maps.Marker({
          position: { lat: startLat, lng: startLng },
          map: map.current,
          title: 'Start',
          icon: START_ICON,
        })
      );
      points.push({ lat: startLat, lng: startLng });
    }

    validStops.forEach((stop, index) => {
      const marker = new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map: map.current,
        title: stop.name,
        label: { text: String(index + 1), color: 'white', fontSize: '13px', fontWeight: 'bold' },
        icon: STOP_ICON,
      });
      const info = new google.maps.InfoWindow({
        content: `<div style="padding:6px;font-size:12px;"><strong>${stop.name}</strong><br/>${stop.address}</div>`,
      });
      marker.addListener('click', () => info.open(map.current, marker));
      markers.current.push(marker);
      points.push({ lat: stop.lat, lng: stop.lng });
    });

    const hasEnd = endLat != null && endLng != null && (endLat !== startLat || endLng !== startLng);
    if (hasEnd) {
      markers.current.push(
        new google.maps.Marker({
          position: { lat: endLat!, lng: endLng! },
          map: map.current,
          title: 'End',
          icon: END_ICON,
        })
      );
      points.push({ lat: endLat!, lng: endLng! });
    }

    // Clear any previous drawings
    if (fallbackLine.current) {
      fallbackLine.current.setMap(null);
      fallbackLine.current = null;
    }
    if (directionsRenderer.current) {
      directionsRenderer.current.setDirections({ routes: [] });
    }

    // Need a start + at least one stop to draw a real route along roads
    const canRoute = startLat != null && startLng != null && validStops.length > 0;

    if (!canRoute) {
      onStatsRef.current?.(null);
      // Just center on whatever single point we have
      if (points.length === 1) {
        map.current.setCenter(points[0]);
        map.current.setZoom(11);
      }
      return;
    }

    const origin = { lat: startLat!, lng: startLng! };

    // Open-ended: the route ends at the last stop (no return leg). The last stop
    // becomes the destination and the rest are intermediate waypoints.
    let destination: { lat: number; lng: number };
    let waypointStops: ManualStop[];

    if (openEnded) {
      const last = validStops[validStops.length - 1];
      destination = { lat: last.lat, lng: last.lng };
      waypointStops = validStops.slice(0, -1);
    } else {
      destination = hasEnd ? { lat: endLat!, lng: endLng! } : origin;
      waypointStops = validStops;
    }

    const waypoints = waypointStops.map((s) => ({
      location: { lat: s.lat, lng: s.lng },
      stopover: true,
    }));

    directionsService.current.route(
      {
        origin,
        destination,
        waypoints,
        // Open-ended keeps the last stop fixed as destination; only reorder if asked
        optimizeWaypoints: optimizeOrder,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result: any, status: string) => {
        if (status === 'OK' && result?.routes?.[0]) {
          directionsRenderer.current.setDirections(result);

          // Sum up legs for distance + duration
          let meters = 0;
          let seconds = 0;
          result.routes[0].legs.forEach((leg: { distance?: { value: number }; duration?: { value: number } }) => {
            meters += leg.distance?.value ?? 0;
            seconds += leg.duration?.value ?? 0;
          });

          onStatsRef.current?.({
            distanceMiles: Number((meters / 1609.34).toFixed(1)),
            driveMinutes: Math.round(seconds / 60),
          });

          // Fit map to the route
          const bounds = new google.maps.LatLngBounds();
          points.forEach((p) => bounds.extend(p));
          map.current.fitBounds(bounds, { padding: 50 });
        } else {
          // Directions failed — fall back to a straight preview line so the user
          // still sees their stops connected, and clear stats.
          onStatsRef.current?.(null);
          fallbackLine.current = new google.maps.Polyline({
            path: points,
            geodesic: true,
            strokeColor: '#2563eb',
            strokeOpacity: 0.4,
            strokeWeight: 3,
            map: map.current,
          });
          const bounds = new google.maps.LatLngBounds();
          points.forEach((p) => bounds.extend(p));
          map.current.fitBounds(bounds, { padding: 50 });
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, startLat, startLng, endLat, endLng, stops, optimizeOrder]);

  return (
    <div
      ref={mapRef}
      className="h-[300px] w-full overflow-hidden rounded-2xl border border-border lg:h-[420px]"
    />
  );
}
