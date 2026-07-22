import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { calculateStoreScore, haversineDistance } from '@/utils/scoring';
import type { StoreVisit, UserStorePreference } from '@/types/database';

interface AddStopBody {
  trip_id: string;
  store_id: string;
  planned_duration_minutes?: number;
}

// Appends a single store to an existing trip WITHOUT wiping/recomputing the
// whole route. Unlike /api/route/update (planning-only, replaces every stop),
// this works while a trip is 'active' too — so you can add a store you stumbled
// onto mid-route. The new stop goes to the end; drive time/distance from the
// previous point is estimated with a straight-line heuristic (no Routes API
// call) to keep it fast and avoid disturbing the saved polyline.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: AddStopBody = await request.json();

  if (!body.trip_id || !body.store_id) {
    return NextResponse.json({ error: 'trip_id and store_id are required' }, { status: 400 });
  }

  const { data: trip } = await supabase
    .from('sourcing_trips')
    .select('*')
    .eq('id', body.trip_id)
    .eq('user_id', user.id)
    .single();

  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  if (trip.status === 'completed' || trip.status === 'cancelled') {
    return NextResponse.json(
      { error: 'No se pueden agregar tiendas a una ruta finalizada' },
      { status: 400 }
    );
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', body.store_id)
    .single();

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Existing stops — to compute next order, avoid duplicates, and find the
  // last waypoint so we can estimate the drive leg to the new store.
  const { data: existingStops } = await supabase
    .from('trip_stops')
    .select('id, store_id, stop_order, drive_miles_from_previous, drive_minutes_from_previous, planned_duration_minutes, store:stores(lat, lng)')
    .eq('trip_id', body.trip_id)
    .order('stop_order', { ascending: true });

  const stops = existingStops || [];

  if (stops.some((s) => s.store_id === body.store_id)) {
    return NextResponse.json({ error: 'Esta tienda ya está en la ruta' }, { status: 400 });
  }

  const nextOrder = stops.length > 0 ? Math.max(...stops.map((s) => s.stop_order)) + 1 : 1;

  // Origin for the new leg: last stop's coordinates, or the trip start.
  let fromLat = trip.start_lat;
  let fromLng = trip.start_lng;
  if (stops.length > 0) {
    const last = stops[stops.length - 1] as unknown as { store: { lat: number; lng: number } | null };
    if (last.store) {
      fromLat = last.store.lat;
      fromLng = last.store.lng;
    }
  }

  const legMiles = Number(haversineDistance(fromLat, fromLng, store.lat, store.lng).toFixed(1));
  // Straight-line → road heuristic: ~1.25x detour, ~35 mph average.
  const legMinutes = Math.max(1, Math.round((legMiles * 1.25) / 35 * 60));

  // Score from this user's visit history for the store.
  const [{ data: visits }, { data: preferences }] = await Promise.all([
    supabase.from('store_visits').select('*').eq('user_id', user.id).eq('store_id', body.store_id),
    supabase
      .from('user_store_preferences')
      .select('*')
      .eq('user_id', user.id)
      .eq('store_id', body.store_id),
  ]);

  const distanceFromStart = haversineDistance(trip.start_lat, trip.start_lng, store.lat, store.lng);
  const score = calculateStoreScore({
    store: store as never,
    visits: (visits || []) as StoreVisit[],
    preference: ((preferences || [])[0] as UserStorePreference) || null,
    distanceMiles: distanceFromStart,
    chainPriority: 5,
  }).total;

  const plannedDuration =
    body.planned_duration_minutes || trip.default_store_duration_minutes || 40;

  const { data: inserted, error: insertError } = await supabase
    .from('trip_stops')
    .insert({
      trip_id: body.trip_id,
      user_id: user.id,
      store_id: body.store_id,
      stop_order: nextOrder,
      planned_duration_minutes: plannedDuration,
      status: 'pending',
      score,
      found_products_count: 0,
      estimated_profit: 0,
      drive_minutes_from_previous: legMinutes,
      drive_miles_from_previous: legMiles,
    })
    .select('*, store:stores(*)')
    .single();

  if (insertError || !inserted) {
    console.error('Failed to add stop:', insertError?.message);
    return NextResponse.json({ error: 'Failed to add stop' }, { status: 500 });
  }

  // Keep the trip's running totals in sync (additive, non-destructive).
  await supabase
    .from('sourcing_trips')
    .update({
      total_distance_miles: Number(((trip.total_distance_miles || 0) + legMiles).toFixed(1)),
      total_drive_minutes: (trip.total_drive_minutes || 0) + legMinutes,
      total_store_minutes: (trip.total_store_minutes || 0) + plannedDuration,
    })
    .eq('id', body.trip_id);

  return NextResponse.json({ ok: true, stop: inserted });
}
