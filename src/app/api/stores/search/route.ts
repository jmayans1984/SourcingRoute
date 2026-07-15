import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { searchAndUpsertStores } from '@/lib/store-search';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { lat, lng, radius_miles, chains } = body;

  const supabase = await createClient();
  const result = await searchAndUpsertStores(supabase, { lat, lng, radius_miles, chains });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ stores: result.stores });
}
