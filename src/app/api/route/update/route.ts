import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { optimizeRoute } from '@/lib/route-optimize';
import { calculateStoreScore, haversineDistance } from '@/utils/scoring';
import type { StoreVisit, UserStorePreference } from '@/types/database';

interface UpdateRouteBody {
  trip_id: string;
  name: string | null;
  trip_date: string;
  start_address: string;
  start_lat: number;
  start_lng: number;
  end_address: string;
  end_lat: number;
  end_lng: number;
  avoid_tolls: boolean;
  avoid_highways: boolean;
  default_store_duration_minutes: number;
  stops: { store_id: string; planned_duration_minutes: number }[];
}

// Saves a manually-edited route from the desktop route editor. Unlike
// /api/route/create, this always preserves the exact stop order the user set
// (optimizeWaypointOrder: false) since manual reordering is the whole point.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: UpdateRouteBody = await request.json();

  if (!body.trip_id || !Array.isArray(body.stops) || body.stops.length === 0) {
    return NextResponse.json({ error: 'At least one stop is required' }, { status: 400 });
  }

  const { data: trip } = await supabase
    .from('sourcing_trips')
    .select('id, status')
    .eq('id', body.trip_id)
    .eq('user_id', user.id)
    .single();

  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  if (trip.status !== 'planning') {
    return NextResponse.json(
      { error: 'Only trips that have not started yet can be edited' },
      { status: 400 }
    );
  }

  const storeIds = body.stops.map((s) => s.store_id);
  const { data: storesData } = await supabase
    .from('stores')
    .select('id, lat, lng')
    .in('id', storeIds);

  const storeMap = new Map((storesData || []).map((s) => [s.id, s]));
  const orderedStops = body.stops.filter((s) => storeMap.has(s.store_id));

  if (orderedStops.length === 0) {
    return NextResponse.json({ error: 'No valid stores in route' }, { status: 400 });
  }

  const [{ data: visits }, { data: preferences }] = await Promise.all([
    supabase.from('store_visits').select('*').eq('user_id', user.id).in('store_id', storeIds),
    supabase
      .from('user_store_preferences')
      .select('*')
      .eq('user_id', user.id)
      .in('store_id', storeIds),
  ]);

  const scoreByStoreId = new Map<string, number>();
  for (const stop of orderedStops) {
    const store = storeMap.get(stop.store_id)!;
    const storeVisits = (visits || []).filter((v: StoreVisit) => v.store_id === stop.store_id);
    const preference =
      (preferences || []).find((p: UserStorePreference) => p.store_id === stop.store_id) || null;
    const distance = haversineDistance(body.start_lat, body.start_lng, store.lat, store.lng);

    const scoreResult = calculateStoreScore({
      store: store as never,
      visits: storeVisits,
      preference,
      distanceMiles: distance,
      chainPriority: 0,
    });
    scoreByStoreId.set(stop.store_id, scoreResult.total);
  }

  const waypoints = orderedStops.map((s) => {
    const store = storeMap.get(s.store_id)!;
    return { lat: store.lat, lng: store.lng };
  });

  const routeResult = await optimizeRoute(
    { lat: body.start_lat, lng: body.start_lng },
    { lat: body.end_lat, lng: body.end_lng },
    waypoints,
    body.avoid_tolls,
    body.avoid_highways,
    false // preserve manual order
  );

  const { error: tripError } = await supabase
    .from('sourcing_trips')
    .update({
      name: body.name,
      trip_date: body.trip_date,
      start_address: body.start_address,
      start_lat: body.start_lat,
      start_lng: body.start_lng,
      end_address: body.end_address,
      end_lat: body.end_lat,
      end_lng: body.end_lng,
      avoid_tolls: body.avoid_tolls,
      avoid_highways: body.avoid_highways,
      default_store_duration_minutes: body.default_store_duration_minutes,
      total_distance_miles: routeResult?.totalDistanceMiles ?? null,
      total_drive_minutes: routeResult?.totalDriveMinutes ?? null,
      total_store_minutes: orderedStops.reduce((sum, s) => sum + s.planned_duration_minutes, 0),
      traffic_delay_minutes: routeResult?.trafficDelayMinutes ?? null,
      route_polyline: routeResult?.encodedPolyline ?? null,
    })
    .eq('id', body.trip_id);

  if (tripError) {
    return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 });
  }

  // Replace all stops with the new manually-ordered list. Safe because edits are
  // only allowed while status is 'planning' (no visit progress exists yet).
  const { error: deleteError } = await supabase.from('trip_stops').delete().eq('trip_id', body.trip_id);
  if (deleteError) {
    console.error('Failed to clear old stops:', deleteError.message);
    return NextResponse.json({ error: 'Failed to update stops' }, { status: 500 });
  }

  const newStops = orderedStops.map((s, index) => ({
    trip_id: body.trip_id,
    user_id: user.id,
    store_id: s.store_id,
    stop_order: index + 1,
    planned_duration_minutes: s.planned_duration_minutes || body.default_store_duration_minutes || 40,
    status: 'pending',
    score: scoreByStoreId.get(s.store_id) ?? 0,
    found_products_count: 0,
    estimated_profit: 0,
    drive_minutes_from_previous: routeResult?.legDurations?.[index] ?? null,
    drive_miles_from_previous: routeResult?.legDistances?.[index] ?? null,
  }));

  const { error: insertError } = await supabase.from('trip_stops').insert(newStops);
  if (insertError) {
    console.error('Failed to insert new stops:', insertError.message);
    return NextResponse.json({ error: 'Failed to update stops' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
