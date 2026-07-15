import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { trip_id, stop_ids } = await request.json();

  if (!trip_id || !Array.isArray(stop_ids) || stop_ids.length === 0) {
    return NextResponse.json({ error: 'trip_id and stop_ids are required' }, { status: 400 });
  }

  const { data: trip } = await supabase
    .from('sourcing_trips')
    .select('*')
    .eq('id', trip_id)
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

  // Delete the specified stops
  const { error: deleteError } = await supabase
    .from('trip_stops')
    .delete()
    .eq('trip_id', trip_id)
    .in('id', stop_ids);

  if (deleteError) {
    console.error('Failed to remove stops:', deleteError.message);
    return NextResponse.json({ error: 'Failed to remove stops' }, { status: 500 });
  }

  // Get remaining stops
  const { data: remainingStops, error: fetchError } = await supabase
    .from('trip_stops')
    .select('*, store:stores(*)')
    .eq('trip_id', trip_id)
    .order('stop_order', { ascending: true });

  if (fetchError) {
    console.error('Failed to fetch remaining stops:', fetchError.message);
    return NextResponse.json({ error: 'Failed to fetch remaining stops' }, { status: 500 });
  }

  // Recalculate totals from remaining stops
  let totalDistance = 0;
  let totalDriveMinutes = 0;
  let totalStoreMinutes = 0;

  if (remainingStops && remainingStops.length > 0) {
    remainingStops.forEach((stop: any) => {
      totalDriveMinutes += stop.drive_minutes_from_previous || 0;
      totalStoreMinutes += stop.planned_duration_minutes || 0;
      totalDistance += stop.drive_miles_from_previous || 0;
    });
  }

  // Update trip with recalculated totals
  const { error: updateError } = await supabase
    .from('sourcing_trips')
    .update({
      total_distance_miles: totalDistance || null,
      total_drive_minutes: totalDriveMinutes || null,
      total_store_minutes: totalStoreMinutes || null,
    })
    .eq('id', trip_id);

  if (updateError) {
    console.error('Failed to update trip totals:', updateError.message);
    return NextResponse.json({ error: 'Failed to update trip totals' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
