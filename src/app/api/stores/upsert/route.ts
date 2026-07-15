import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { detectChain } from '@/lib/store-search';

// Persists a single store the user picked manually (via the route editor's
// "Add store" search) so it has a stable id to attach to a trip_stop.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { google_place_id, name, address, lat, lng, phone, opening_hours } = body;

  if (!google_place_id || !name || !address || lat == null || lng == null) {
    return NextResponse.json({ error: 'Missing required store fields' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('stores')
    .select('id')
    .eq('google_place_id', google_place_id)
    .single();

  if (existing) {
    return NextResponse.json({ store_id: existing.id });
  }

  const parts = String(address).split(',');
  const city = parts.length >= 3 ? parts[parts.length - 3].trim() : '';
  const stateZip = parts.length >= 2 ? parts[parts.length - 2].trim() : '';
  const state = stateZip.split(' ')[0] || '';
  const zip = (String(address).match(/\b\d{5}(?:-\d{4})?\b/) || [''])[0];

  const { data: inserted, error } = await supabase
    .from('stores')
    .insert({
      google_place_id,
      name,
      chain: detectChain(name),
      address,
      city,
      state,
      zip,
      lat,
      lng,
      phone: phone || null,
      opening_hours: opening_hours || null,
      is_active: true,
      last_verified_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: 'Failed to save store' }, { status: 500 });
  }

  return NextResponse.json({ store_id: inserted.id });
}
