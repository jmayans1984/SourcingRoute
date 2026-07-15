import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { searchAndUpsertStores } from '@/lib/store-search';
import { buildChainedRoute } from '@/lib/chained-route';
import { geocode, optimizeRoute } from '@/lib/route-optimize';
import { haversineDistance, calculateStoreScore } from '@/utils/scoring';
import { normalizeBrand } from '@/utils/brands';
import type { RoutePriority, StoreVisit, UserStorePreference } from '@/types/database';

type RouteStore = { id: string; lat: number; lng: number; chain: string; score: number };

interface ManualStopInput {
  place_id: string;
  name: string;
  brand?: string;
  address: string;
  lat: number;
  lng: number;
}

interface CreateRouteBody {
  name?: string;
  trip_date?: string;
  start_address: string;
  start_lat: number | null;
  start_lng: number | null;
  end_address: string;
  end_lat: number | null;
  end_lng: number | null;
  // Manual mode: the user picked the exact stores; no search/scoring involved
  manual_stops?: ManualStopInput[];
  optimize_order?: boolean;
  // Open-ended route: no return leg — ends at the last stop (multi-day trips)
  open_ended?: boolean;
  selected_chains?: string[];
  radius_miles?: number;
  available_minutes?: number;
  default_store_duration_minutes: number;
  max_stores?: number;
  avoid_tolls: boolean;
  avoid_highways: boolean;
  route_priority?: RoutePriority;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: CreateRouteBody = await request.json();

  // Legacy auto-search fields (unused in manual mode)
  const radiusMiles = body.radius_miles ?? 30;
  const selectedChains = body.selected_chains ?? [];
  const maxStores = body.max_stores ?? 6;
  const routePriority = body.route_priority ?? 'best_stores';

  // Step 1: Geocode if coordinates not provided
  let startLat = body.start_lat;
  let startLng = body.start_lng;

  if (!startLat || !startLng) {
    const geo = await geocode(body.start_address);
    if (!geo) {
      return NextResponse.json({ error: 'Could not geocode start address' }, { status: 400 });
    }
    startLat = geo.lat;
    startLng = geo.lng;
  }

  let endLat = body.end_lat ?? startLat;
  let endLng = body.end_lng ?? startLng;

  if (body.end_address && body.end_address !== body.start_address && (!body.end_lat || !body.end_lng)) {
    const geo = await geocode(body.end_address);
    if (geo) {
      endLat = geo.lat;
      endLng = geo.lng;
    }
  }

  // A point-to-point trip (e.g. Orlando -> Miami) needs a different selection
  // strategy than a round trip: instead of clustering tightly around one hub,
  // it should hop forward store-by-store toward the destination.
  const isRoundTrip =
    body.end_address === body.start_address || (endLat === startLat && endLng === startLng);

  let selectedStores: RouteStore[];
  // Address of the last valid manual stop — used as the end for open-ended routes.
  let manualLastAddress: string | null = null;

  if (body.manual_stops?.length) {
    // Manual mode: upsert the user's chosen stores and use them as-is.
    // Any stop missing coordinates (typed an address without picking a Google
    // suggestion) gets geocoded here so it never lands at (0,0) / "null island".
    const geocodedStops = await Promise.all(
      body.manual_stops.map(async (s) => {
        if ((s.lat === 0 && s.lng === 0) || s.lat == null || s.lng == null) {
          const geo = await geocode(s.address || s.name);
          if (geo) return { ...s, lat: geo.lat, lng: geo.lng };
        }
        return s;
      })
    );

    // Drop any stop we still couldn't locate so it doesn't corrupt the route.
    const validStops = geocodedStops.filter((s) => s.lat !== 0 || s.lng !== 0);
    if (validStops.length === 0) {
      return NextResponse.json(
        { error: 'Could not locate any of your stores. Pick an address from the dropdown suggestions.' },
        { status: 400 }
      );
    }

    const rows = validStops.map((s) => ({
      google_place_id: s.place_id,
      name: s.name,
      // Standardize the brand so historical analysis groups by brand (Ross,
      // TJ Maxx, Marshalls...) instead of by every spelling variant.
      chain: normalizeBrand(s.brand || s.name),
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      is_active: true,
      last_verified_at: new Date().toISOString(),
    }));

    const { data: upserted, error: upsertError } = await supabase
      .from('stores')
      .upsert(rows, { onConflict: 'google_place_id' })
      .select('id, lat, lng, chain, google_place_id');

    if (upsertError || !upserted?.length) {
      console.error('Manual stops upsert error:', upsertError?.message);
      return NextResponse.json({ error: 'Could not save your stores' }, { status: 500 });
    }

    // Preserve the order the user added them in
    const byPlaceId = new Map(upserted.map((s) => [s.google_place_id, s]));
    selectedStores = validStops
      .map((s) => byPlaceId.get(s.place_id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, chain: s.chain, score: 0 }));

    manualLastAddress = validStops[validStops.length - 1].address;
  } else if (!isRoundTrip) {
    // Step 2-5 (point-to-point): hop forward from start to end, always searching
    // within radius of the *current* position and requiring forward progress.
    selectedStores = await buildChainedRoute({
      supabase,
      userId: user.id,
      startLat: startLat!,
      startLng: startLng!,
      endLat: endLat!,
      endLng: endLng!,
      radiusMiles: radiusMiles,
      chains: selectedChains,
      maxStores: maxStores,
    });

    if (selectedStores.length === 0) {
      console.error('Chained route found no forward-progressing stores from', startLat, startLng, 'toward', endLat, endLng);
      return NextResponse.json(
        { error: 'Could not find a chain of stores between your start and end points. Try a larger radius.' },
        { status: 404 }
      );
    }
  } else {
    // Step 2 (round trip): search once around the start/hub location
    const searchResult = await searchAndUpsertStores(supabase, {
      lat: startLat!,
      lng: startLng!,
      radius_miles: radiusMiles,
      chains: selectedChains,
    });

    if (searchResult.error) {
      console.error('Store search error:', searchResult.error);
      return NextResponse.json({ error: searchResult.error }, { status: 400 });
    }

    const foundStores = searchResult.stores;
    if (!foundStores?.length) {
      console.error('No stores found for chains:', selectedChains, 'near', startLat, startLng);
      return NextResponse.json({ error: 'No stores found in this area' }, { status: 404 });
    }

    // Step 3: Get user history for scoring
    const storeIds = foundStores.map((s: { id: string }) => s.id);

    const [{ data: visits }, { data: preferences }] = await Promise.all([
      supabase
        .from('store_visits')
        .select('*')
        .eq('user_id', user.id)
        .in('store_id', storeIds),
      supabase
        .from('user_store_preferences')
        .select('*')
        .eq('user_id', user.id)
        .in('store_id', storeIds),
    ]);

    // Step 4: Score and rank stores
    const chainPriorityMap = new Map(
      selectedChains.map((c, i) => [c, selectedChains.length - i])
    );

    type ScoredStore = RouteStore & { distance: number };

    const scoredStores = foundStores
      .map((store: { id: string; lat: number; lng: number; chain: string }): ScoredStore | null => {
        const storeVisits = (visits || []).filter(
          (v: StoreVisit) => v.store_id === store.id
        );
        const preference = (preferences || []).find(
          (p: UserStorePreference) => p.store_id === store.id
        ) || null;
        const distance = haversineDistance(startLat!, startLng!, store.lat, store.lng);

        if (preference?.is_blocked) return null;
        if (distance > radiusMiles) return null;

        const scoreResult = calculateStoreScore({
          store: store as never,
          visits: storeVisits,
          preference,
          distanceMiles: distance,
          chainPriority: chainPriorityMap.get(store.chain) ?? 0,
        });

        return { ...store, score: scoreResult.total, distance };
      })
      .filter((s: ScoredStore | null): s is ScoredStore => s !== null);

    // Step 5: Build a tight, efficient cluster of stores instead of mechanically
    // guaranteeing one store per selected chain — a distant chain outlier isn't
    // worth a 20-mile detour just to check a box. Take a pool of the best-ranked
    // candidates, then greedily grow the route by always adding whichever
    // remaining candidate is closest to the cluster formed so far.
    const sortFn =
      routePriority === 'less_driving'
        ? (a: ScoredStore, b: ScoredStore) => a.distance - b.distance
        : (a: ScoredStore, b: ScoredStore) => b.score - a.score;

    const candidatePool = [...scoredStores]
      .sort(sortFn)
      .slice(0, Math.max(maxStores * 3, 15));

    const cluster: ScoredStore[] = [];
    if (candidatePool.length > 0) {
      cluster.push(candidatePool.shift()!); // anchor: best-ranked candidate

      while (cluster.length < maxStores && candidatePool.length > 0) {
        let bestIndex = 0;
        let bestDistance = Infinity;

        candidatePool.forEach((candidate, i) => {
          const distanceToCluster = Math.min(
            ...cluster.map((s) => haversineDistance(s.lat, s.lng, candidate.lat, candidate.lng))
          );
          if (distanceToCluster < bestDistance) {
            bestDistance = distanceToCluster;
            bestIndex = i;
          }
        });

        cluster.push(candidatePool.splice(bestIndex, 1)[0]);
      }
    }

    selectedStores = cluster;

    if (selectedStores.length === 0) {
      console.error(
        `All ${foundStores.length} found stores were filtered out (blocked or outside ${radiusMiles}mi radius)`
      );
      return NextResponse.json(
        { error: 'No suitable stores found within your radius. Try increasing the search radius.' },
        { status: 404 }
      );
    }
  }

  // Step 6: Optimize route with Google Routes API. For point-to-point trips the
  // chained selection already put stops in forward-progressing order — let
  // Google reorder freely only for round trips, where the cluster has no
  // inherent sequence yet.
  const shouldOptimizeOrder = body.manual_stops?.length
    ? body.optimize_order !== false
    : isRoundTrip;

  // Open-ended: the last store is the destination (no return leg). Route the
  // remaining stores as intermediate waypoints toward it.
  const isOpenEnded = Boolean(body.open_ended) && selectedStores.length > 0;
  const destinationStore = isOpenEnded ? selectedStores[selectedStores.length - 1] : null;
  const waypointStores = isOpenEnded ? selectedStores.slice(0, -1) : selectedStores;
  const routeDestination = destinationStore
    ? { lat: destinationStore.lat, lng: destinationStore.lng }
    : { lat: endLat!, lng: endLng! };

  const routeResult = await optimizeRoute(
    { lat: startLat!, lng: startLng! },
    routeDestination,
    waypointStores.map((s: { lat: number; lng: number }) => ({ lat: s.lat, lng: s.lng })),
    body.avoid_tolls,
    body.avoid_highways,
    shouldOptimizeOrder
  );

  // Step 7: Create trip record
  const { data: trip, error: tripError } = await supabase
    .from('sourcing_trips')
    .insert({
      user_id: user.id,
      name: body.name || null,
      trip_date: body.trip_date || new Date().toISOString().split('T')[0],
      start_address: body.start_address,
      start_lat: startLat,
      start_lng: startLng,
      end_address: isOpenEnded
        ? manualLastAddress || body.start_address
        : body.end_address || body.start_address,
      end_lat: destinationStore ? destinationStore.lat : endLat,
      end_lng: destinationStore ? destinationStore.lng : endLng,
      selected_chains: body.selected_chains ?? [],
      radius_miles: body.radius_miles ?? 30,
      available_minutes: body.available_minutes ?? 360,
      max_stores: body.max_stores ?? selectedStores.length,
      default_store_duration_minutes: body.default_store_duration_minutes,
      avoid_tolls: body.avoid_tolls,
      avoid_highways: body.avoid_highways,
      route_priority: body.route_priority ?? 'best_stores',
      total_distance_miles: routeResult?.totalDistanceMiles ?? null,
      total_drive_minutes: routeResult?.totalDriveMinutes ?? null,
      total_store_minutes: selectedStores.length * body.default_store_duration_minutes,
      traffic_delay_minutes: routeResult?.trafficDelayMinutes ?? null,
      route_polyline: routeResult?.encodedPolyline ?? null,
      status: 'planning',
    })
    .select('id')
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 });
  }

  // Step 8: Create trip stops in optimized order. For open-ended routes the
  // optimized indices refer to the intermediate waypoints only, so the fixed
  // destination store is appended last.
  const orderedWaypoints = routeResult?.optimizedOrder?.length
    ? routeResult.optimizedOrder.map((i: number) => waypointStores[i])
    : waypointStores;
  const orderedStores = destinationStore
    ? [...orderedWaypoints, destinationStore]
    : orderedWaypoints;

  const stops = orderedStores.map(
    (store: { id: string; score: number }, index: number) => ({
      trip_id: trip.id,
      user_id: user.id,
      store_id: store.id,
      stop_order: index + 1,
      planned_duration_minutes: body.default_store_duration_minutes,
      status: 'pending',
      score: store.score,
      found_products_count: 0,
      estimated_profit: 0,
      drive_minutes_from_previous: routeResult?.legDurations?.[index] ?? null,
      drive_miles_from_previous: routeResult?.legDistances?.[index] ?? null,
    })
  );

  await supabase.from('trip_stops').insert(stops);

  return NextResponse.json({ trip_id: trip.id });
}
