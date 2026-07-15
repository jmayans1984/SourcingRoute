import type { SupabaseClient } from '@supabase/supabase-js';
import { searchAndUpsertStores } from '@/lib/store-search';
import { haversineDistance, calculateStoreScore } from '@/utils/scoring';
import type { StoreVisit, UserStorePreference } from '@/types/database';

export interface ChainedStop {
  id: string;
  lat: number;
  lng: number;
  chain: string;
  score: number;
}

interface ChainedRouteParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  userId: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  radiusMiles: number;
  chains: string[];
  maxStores: number;
}

// Builds a route for point-to-point trips (start ≠ end, e.g. Orlando -> Miami) by
// hopping forward: find the best store within radius of the current position,
// jump there, then search again within radius of *that* new position — always
// discarding candidates that don't get measurably closer to the final
// destination, so the route advances toward the endpoint instead of forming a
// tight loop around the start (which is what the single-hub cluster algorithm
// does, and is the right choice for round trips but wrong here).
export async function buildChainedRoute(params: ChainedRouteParams): Promise<ChainedStop[]> {
  const { supabase, userId, startLat, startLng, endLat, endLng, radiusMiles, chains, maxStores } = params;

  const chainPriorityMap = new Map(chains.map((c, i) => [c, chains.length - i]));

  const selected: ChainedStop[] = [];
  const usedIds = new Set<string>();

  let current = { lat: startLat, lng: startLng };
  let remainingToEnd = haversineDistance(current.lat, current.lng, endLat, endLng);

  for (let hop = 0; hop < maxStores; hop++) {
    const searchResult = await searchAndUpsertStores(supabase, {
      lat: current.lat,
      lng: current.lng,
      radius_miles: radiusMiles,
      chains,
    });

    if (searchResult.error || !searchResult.stores.length) break;

    const candidateStores = searchResult.stores.filter((s) => !usedIds.has(s.id));
    if (candidateStores.length === 0) break;

    const storeIds = candidateStores.map((s) => s.id);
    const [{ data: visits }, { data: preferences }] = await Promise.all([
      supabase.from('store_visits').select('*').eq('user_id', userId).in('store_id', storeIds),
      supabase.from('user_store_preferences').select('*').eq('user_id', userId).in('store_id', storeIds),
    ]);

    type Candidate = ChainedStop & { distanceToEnd: number };

    const forwardCandidates: Candidate[] = candidateStores
      .map((store): Candidate | null => {
        const preference =
          (preferences || []).find((p: UserStorePreference) => p.store_id === store.id) || null;
        if (preference?.is_blocked) return null;

        const distanceFromCurrent = haversineDistance(current.lat, current.lng, store.lat, store.lng);
        if (distanceFromCurrent > radiusMiles) return null;

        const distanceToEnd = haversineDistance(store.lat, store.lng, endLat, endLng);
        // Require real forward progress so the route doesn't backtrack or stall.
        if (distanceToEnd >= remainingToEnd) return null;

        const storeVisits = (visits || []).filter((v: StoreVisit) => v.store_id === store.id);
        const scoreResult = calculateStoreScore({
          store: store as never,
          visits: storeVisits,
          preference,
          distanceMiles: distanceFromCurrent,
          chainPriority: chainPriorityMap.get(store.chain) ?? 0,
        });

        return { id: store.id, lat: store.lat, lng: store.lng, chain: store.chain, score: scoreResult.total, distanceToEnd };
      })
      .filter((c): c is Candidate => c !== null);

    if (forwardCandidates.length === 0) break; // no way to keep advancing — stop the chain here

    forwardCandidates.sort((a, b) => b.score - a.score);
    const next = forwardCandidates[0];

    selected.push({ id: next.id, lat: next.lat, lng: next.lng, chain: next.chain, score: next.score });
    usedIds.add(next.id);
    current = { lat: next.lat, lng: next.lng };
    remainingToEnd = next.distanceToEnd;
  }

  return selected;
}
