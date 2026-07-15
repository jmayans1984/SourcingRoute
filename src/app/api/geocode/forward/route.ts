import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 });
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.results?.[0]) {
    const { lat, lng } = data.results[0].geometry.location;
    return NextResponse.json({
      lat,
      lng,
      address: data.results[0].formatted_address,
    });
  }

  return NextResponse.json({ error: 'Address not found' }, { status: 404 });
}
