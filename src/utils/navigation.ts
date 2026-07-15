export function buildGoogleMapsRouteUrl(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[]
): string {
  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = `${destination.lat},${destination.lng}`;
  // Always use coordinates, never the store name — chain names like "Ross Dress
  // for Less" repeat across many locations, so Google Maps can't tell which
  // physical store a bare name refers to and drops/misplaces the waypoint.
  const waypointsStr = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=driving`;
  if (waypointsStr) {
    url += `&waypoints=${waypointsStr}`;
  }
  return url;
}

export function buildWazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function buildGoogleMapsStopUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}
