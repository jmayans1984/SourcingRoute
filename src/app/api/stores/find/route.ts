import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

interface PlaceResult {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  nationalPhoneNumber?: string;
  regularOpeningHours?: { weekdayDescriptions: string[] };
}

// Free-text store lookup used by the manual route editor's "Add store" flow.
// Unlike /api/stores/search (which searches per-chain within a strict radius),
// this searches by whatever the user types and returns candidates to pick from.
export async function POST(request: NextRequest) {
  const { query, lat, lng } = await request.json();

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 });
  }

  const requestBody: Record<string, unknown> = {
    textQuery: query,
    maxResultCount: 8,
  };

  if (lat && lng) {
    requestBody.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: 50000 },
    };
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.regularOpeningHours',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Places find error:', response.status, errText);
    return NextResponse.json({ error: 'Search failed' }, { status: 502 });
  }

  const data = await response.json();
  const places: PlaceResult[] = data.places || [];

  const supabase = await createClient();
  const results = [];

  for (const place of places) {
    const { data: existing } = await supabase
      .from('stores')
      .select('id')
      .eq('google_place_id', place.id)
      .single();

    results.push({
      id: existing?.id ?? null,
      google_place_id: place.id,
      name: place.displayName.text,
      address: place.formattedAddress,
      lat: place.location.latitude,
      lng: place.location.longitude,
      phone: place.nationalPhoneNumber || null,
      opening_hours: place.regularOpeningHours
        ? { weekdays: place.regularOpeningHours.weekdayDescriptions }
        : null,
    });
  }

  return NextResponse.json({ results });
}
