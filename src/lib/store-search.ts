import type { SupabaseClient } from '@supabase/supabase-js';
import { haversineDistance } from '@/utils/scoring';

interface PlaceResult {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  nationalPhoneNumber?: string;
  regularOpeningHours?: {
    weekdayDescriptions: string[];
  };
}

export interface FoundStore {
  id: string;
  google_place_id: string;
  name: string;
  chain: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  phone: string | null;
  opening_hours: Record<string, unknown> | null;
  is_active: boolean;
  last_verified_at: string;
}

export async function searchAndUpsertStores(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  params: { lat: number; lng: number; radius_miles: number; chains: string[] }
): Promise<{ stores: FoundStore[]; error?: string }> {
  const { lat, lng, radius_miles, chains } = params;

  if (!lat || !lng || !chains?.length) {
    return { stores: [], error: 'lat, lng, and chains are required' };
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { stores: [], error: 'Google Maps API key not configured' };
  }

  // Places Text Search's locationRestriction only accepts a rectangle, not a circle
  // (locationBias supports both, but only *biases* relevance — it doesn't hard-bound
  // results, which is how a store ~45 miles away previously slipped in and forced a
  // long detour). Build a bounding-box rectangle from the radius instead.
  const boundedRadiusMiles = Math.min(radius_miles || 30, 31);
  const deltaLat = boundedRadiusMiles / 69; // ~69 miles per degree latitude
  const deltaLng = boundedRadiusMiles / (69 * Math.cos((lat * Math.PI) / 180));

  const rectangle = {
    low: { latitude: lat - deltaLat, longitude: lng - deltaLng },
    high: { latitude: lat + deltaLat, longitude: lng + deltaLng },
  };

  const allStores: PlaceResult[] = [];

  for (const chain of chains) {
    const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.regularOpeningHours',
      },
      body: JSON.stringify({
        textQuery: chain,
        locationRestriction: { rectangle },
        // Default ranking is by "relevance" (reviews/popularity), which can bury
        // the store literally closest to the user under more prominent locations
        // elsewhere in the search box. Rank by distance instead so the nearest
        // matches always surface, and ask for the max allowed so fewer get cut off.
        rankPreference: 'DISTANCE',
        maxResultCount: 20,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Places API error for chain "${chain}":`, response.status, errText);
      continue;
    }

    const data = await response.json();
    if (data.places) {
      allStores.push(...data.places);
    }
  }

  // Belt-and-suspenders: Google's Text Search location restriction has proven
  // unreliable in practice (a store ~45-50 miles away has slipped through more than
  // once despite locationRestriction/locationBias). Enforce the real radius ourselves
  // regardless of what Google's API returned.
  const requestedRadius = radius_miles || 30;
  const withinRadius = allStores.filter((place) => {
    const distance = haversineDistance(lat, lng, place.location.latitude, place.location.longitude);
    return distance <= requestedRadius;
  });

  const upsertedStores: FoundStore[] = [];
  for (const place of withinRadius) {
    const chainName = detectChain(place.displayName.text);

    const storeData = {
      google_place_id: place.id,
      name: place.displayName.text,
      chain: chainName,
      address: place.formattedAddress,
      city: extractCity(place.formattedAddress),
      state: extractState(place.formattedAddress),
      zip: extractZip(place.formattedAddress),
      lat: place.location.latitude,
      lng: place.location.longitude,
      phone: place.nationalPhoneNumber || null,
      opening_hours: place.regularOpeningHours
        ? { weekdays: place.regularOpeningHours.weekdayDescriptions }
        : null,
      is_active: true,
      last_verified_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('stores')
      .select('id, last_verified_at')
      .eq('google_place_id', place.id)
      .single();

    if (existing) {
      const lastVerified = existing.last_verified_at
        ? new Date(existing.last_verified_at)
        : new Date(0);
      const daysSinceVerified = (Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceVerified > 30) {
        await supabase.from('stores').update(storeData).eq('id', existing.id);
      }

      upsertedStores.push({ ...storeData, id: existing.id });
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('stores')
        .insert(storeData)
        .select('id')
        .single();

      if (insertError) {
        console.error('Failed to insert store:', insertError.message);
        continue;
      }

      if (inserted) {
        upsertedStores.push({ ...storeData, id: inserted.id });
      }
    }
  }

  return { stores: upsertedStores };
}

export function detectChain(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ross')) return 'Ross';
  if (lower.includes('burlington')) return 'Burlington';
  if (lower.includes('tj maxx') || lower.includes('t.j. maxx')) return 'TJ Maxx';
  if (lower.includes('marshalls')) return 'Marshalls';
  if (lower.includes('walmart')) return 'Walmart';
  if (lower.includes('target')) return 'Target';
  if (lower.includes('homegoods') || lower.includes('home goods')) return 'HomeGoods';
  if (lower.includes('five below')) return 'Five Below';
  if (lower.includes('dollar tree')) return 'Dollar Tree';
  if (lower.includes("ollie's") || lower.includes('ollies')) return "Ollie's";
  if (lower.includes('big lots')) return 'Big Lots';
  if (lower.includes('nordstrom rack')) return 'Nordstrom Rack';
  if (lower.includes('sierra')) return 'Sierra';
  if (lower.includes('tuesday morning')) return 'Tuesday Morning';
  if (lower.includes('bealls')) return 'Bealls Outlet';
  return name;
}

function extractCity(address: string): string {
  const parts = address.split(',');
  return parts.length >= 3 ? parts[parts.length - 3].trim() : '';
}

function extractState(address: string): string {
  const parts = address.split(',');
  if (parts.length >= 2) {
    const stateZip = parts[parts.length - 2].trim();
    return stateZip.split(' ')[0] || '';
  }
  return '';
}

function extractZip(address: string): string {
  const match = address.match(/\b\d{5}(?:-\d{4})?\b/);
  return match?.[0] || '';
}
