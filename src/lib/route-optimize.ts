export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.results?.[0]) {
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
  }
  return null;
}

export interface RouteResult {
  totalDistanceMiles: number;
  totalDriveMinutes: number;
  trafficDelayMinutes: number;
  optimizedOrder: number[];
  legDurations: number[];
  legDistances: number[];
  encodedPolyline: string | null;
}

export async function optimizeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[],
  avoidTolls: boolean,
  avoidHighways: boolean,
  optimizeOrder: boolean = true
): Promise<RouteResult | null> {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const routeModifiers: Record<string, boolean> = {};
  if (avoidTolls) routeModifiers.avoidTolls = true;
  if (avoidHighways) routeModifiers.avoidHighways = true;

  const requestBody = {
    origin: {
      location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
    },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    intermediates: waypoints.map((wp) => ({
      location: { latLng: { latitude: wp.lat, longitude: wp.lng } },
    })),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    optimizeWaypointOrder: optimizeOrder,
    ...(Object.keys(routeModifiers).length > 0 && { routeModifiers }),
  };

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.duration,routes.distanceMeters,routes.optimizedIntermediateWaypointIndex,routes.legs.duration,routes.legs.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Routes API error:', response.status, errText);
      return null;
    }

    const data = await response.json();
    const route = data.routes?.[0];

    if (!route) return null;

    const totalMeters = route.distanceMeters || 0;
    const totalSeconds = parseInt(route.duration?.replace('s', '') || '0', 10);
    const staticSeconds = totalSeconds;

    const legDurations = (route.legs || []).map((leg: { duration: string }) =>
      Math.round(parseInt(leg.duration?.replace('s', '') || '0', 10) / 60)
    );
    const legDistances = (route.legs || []).map(
      (leg: { distanceMeters: number }) => Number(((leg.distanceMeters || 0) / 1609.34).toFixed(1))
    );

    return {
      totalDistanceMiles: Number((totalMeters / 1609.34).toFixed(1)),
      totalDriveMinutes: Math.round(totalSeconds / 60),
      trafficDelayMinutes: Math.max(0, Math.round((totalSeconds - staticSeconds) / 60)),
      optimizedOrder: route.optimizedIntermediateWaypointIndex || [],
      legDurations,
      legDistances,
      encodedPolyline: route.polyline?.encodedPolyline ?? null,
    };
  } catch {
    return null;
  }
}
