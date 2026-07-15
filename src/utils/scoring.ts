import type { Store, StoreVisit, UserStorePreference, WifiSignal } from '@/types/database';

interface ScoreInput {
  store: Store;
  visits: StoreVisit[];
  preference: UserStorePreference | null;
  distanceMiles: number;
  chainPriority: number;
  trafficDelayMinutes?: number;
}

interface ScoreBreakdown {
  total: number;
  ratingScore: number;
  profitScore: number;
  productsScore: number;
  chainScore: number;
  recencyScore: number;
  distancePenalty: number;
  trafficPenalty: number;
  experiencePenalty: number;
  wifiPenalty: number;
  customAdjustment: number;
}

const WIFI_PENALTY: Record<WifiSignal, number> = {
  bad: 45,
  regular: 10,
  good: 0,
};

const MAX_COMPONENT = 25;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: number, min: number, max: number, targetMax: number): number {
  if (max === min) return 0;
  return clamp(((value - min) / (max - min)) * targetMax, 0, targetMax);
}

export function calculateStoreScore(input: ScoreInput): ScoreBreakdown {
  const { store, visits, preference, distanceMiles, chainPriority, trafficDelayMinutes = 0 } = input;

  // Rating: average user rating (1-3) normalized to 0-25
  let ratingScore = 0;
  if (visits.length > 0) {
    const avgRating = visits.reduce((sum, v) => sum + v.rating, 0) / visits.length;
    ratingScore = normalize(avgRating, 1, 3, MAX_COMPONENT);
  }

  // Profit: average profit per visit normalized to 0-25 (cap at $200 avg)
  let profitScore = 0;
  if (visits.length > 0) {
    const avgProfit = visits.reduce((sum, v) => sum + v.estimated_profit, 0) / visits.length;
    profitScore = normalize(avgProfit, 0, 200, MAX_COMPONENT);
  }

  // Products found: average products per visit normalized to 0-25 (cap at 10 avg)
  let productsScore = 0;
  if (visits.length > 0) {
    const avgProducts = visits.reduce((sum, v) => sum + v.products_found, 0) / visits.length;
    productsScore = normalize(avgProducts, 0, 10, MAX_COMPONENT);
  }

  // Chain priority: 0-25 based on user preference order
  const chainScore = normalize(chainPriority, 0, 10, MAX_COMPONENT);

  // Recency bonus: days since last visit (more days = higher bonus, cap at 30 days)
  let recencyScore = MAX_COMPONENT; // Never visited = max bonus
  if (visits.length > 0) {
    const lastVisit = visits.reduce((latest, v) =>
      new Date(v.visited_at) > new Date(latest.visited_at) ? v : latest
    );
    const daysSince = Math.floor(
      (Date.now() - new Date(lastVisit.visited_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    recencyScore = normalize(daysSince, 0, 30, MAX_COMPONENT);
  }

  // Distance penalty: 0-20 (closer = less penalty)
  const distancePenalty = normalize(distanceMiles, 0, 50, 20);

  // Traffic penalty: 0-10
  const trafficPenalty = normalize(trafficDelayMinutes, 0, 30, 10);

  // Bad experience penalty
  let experiencePenalty = 0;
  if (visits.length > 0) {
    const badVisits = visits.filter((v) => v.rating === 1).length;
    const badRatio = badVisits / visits.length;
    experiencePenalty = badRatio * 15;
  }

  // Wifi/data signal penalty — based on most recent visit's reported signal.
  // A bad signal makes a store nearly unusable for price-checking, so it's weighted heavily.
  let wifiPenalty = 0;
  if (visits.length > 0) {
    const lastVisit = visits.reduce((latest, v) =>
      new Date(v.visited_at) > new Date(latest.visited_at) ? v : latest
    );
    if (lastVisit.wifi_signal) {
      wifiPenalty = WIFI_PENALTY[lastVisit.wifi_signal];
    }
  }

  const customAdjustment = preference?.custom_score_adjustment ?? 0;

  const total = clamp(
    Math.round(
      ratingScore +
      profitScore +
      productsScore +
      chainScore +
      recencyScore -
      distancePenalty -
      trafficPenalty -
      experiencePenalty -
      wifiPenalty +
      customAdjustment
    ),
    0,
    100
  );

  return {
    total,
    ratingScore: Math.round(ratingScore),
    profitScore: Math.round(profitScore),
    productsScore: Math.round(productsScore),
    chainScore: Math.round(chainScore),
    recencyScore: Math.round(recencyScore),
    distancePenalty: Math.round(distancePenalty),
    trafficPenalty: Math.round(trafficPenalty),
    experiencePenalty: Math.round(experiencePenalty),
    wifiPenalty: Math.round(wifiPenalty),
    customAdjustment,
  };
}

export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
