import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServerClient } from '@/lib/supabase-server';

// Column indices (0-based) matching the user's sheet:
// A=UPC, B=ProductName, C=ASIN, D=AmazonURL, E=SalePrice, F=Quantity, G=CostPrice, H=Profit, I=ROI
const COL = {
  SALE_PRICE: 4,  // E
  QUANTITY:   5,  // F
  COST_PRICE: 6,  // G
  PROFIT:     7,  // H
};

function toNumber(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/[$,%]/g, '')) || 0;
}

function getAuth() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey  = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('Google Sheets credentials not configured');
  }

  return new google.auth.JWT({
    email: clientEmail,
    key:   privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function GET(req: NextRequest) {
  try {
    // Read the sheet ID from query param or the user's profile
    const { searchParams } = new URL(req.url);
    let sheetId = searchParams.get('sheet_id');

    if (!sheetId) {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const { data: profile } = await supabase
        .from('users_profile')
        .select('google_sheet_id')
        .eq('user_id', user.id)
        .single();

      sheetId = (profile as { google_sheet_id?: string } | null)?.google_sheet_id ?? null;
    }

    if (!sheetId) {
      return NextResponse.json(
        { error: 'No Google Sheet ID configured. Add it in your profile.' },
        { status: 400 }
      );
    }

    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Read all data rows (row 2 onwards — row 1 is headers)
    const range = 'Sheet1!A2:I';
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const rows = res.data.values ?? [];

    if (rows.length === 0) {
      return NextResponse.json({ totalItems: 0, totalSpent: 0, projectedSales: 0, projectedProfit: 0, rowCount: 0 });
    }

    let totalItems      = 0;
    let totalSpent      = 0;
    let projectedSales  = 0;
    let projectedProfit = 0;

    for (const row of rows) {
      const qty      = toNumber(row[COL.QUANTITY]);
      const cost     = toNumber(row[COL.COST_PRICE]);
      const sale     = toNumber(row[COL.SALE_PRICE]);
      const profit   = toNumber(row[COL.PROFIT]);

      totalItems      += qty;
      totalSpent      += cost  * qty;
      projectedSales  += sale  * qty;
      projectedProfit += profit * qty;
    }

    return NextResponse.json({
      totalItems:      Math.round(totalItems),
      totalSpent:      Math.round(totalSpent * 100) / 100,
      projectedSales:  Math.round(projectedSales * 100) / 100,
      projectedProfit: Math.round(projectedProfit * 100) / 100,
      rowCount:        rows.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sheets/import]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: same as GET but also clears the sheet from row 2 onwards after reading
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let sheetId: string | null = body.sheet_id ?? null;

    if (!sheetId) {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const { data: profile } = await supabase
        .from('users_profile')
        .select('google_sheet_id')
        .eq('user_id', user.id)
        .single();

      sheetId = (profile as { google_sheet_id?: string } | null)?.google_sheet_id ?? null;
    }

    if (!sheetId) {
      return NextResponse.json(
        { error: 'No Google Sheet ID configured. Add it in your profile.' },
        { status: 400 }
      );
    }

    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Read
    const range = 'Sheet1!A2:I';
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const rows = res.data.values ?? [];

    let totalItems      = 0;
    let totalSpent      = 0;
    let projectedSales  = 0;
    let projectedProfit = 0;

    for (const row of rows) {
      const qty    = toNumber(row[COL.QUANTITY]);
      const cost   = toNumber(row[COL.COST_PRICE]);
      const sale   = toNumber(row[COL.SALE_PRICE]);
      const profit = toNumber(row[COL.PROFIT]);

      totalItems      += qty;
      totalSpent      += cost  * qty;
      projectedSales  += sale  * qty;
      projectedProfit += profit * qty;
    }

    // 2. Clear from row 2 onwards
    if (rows.length > 0) {
      await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range });
    }

    return NextResponse.json({
      totalItems:      Math.round(totalItems),
      totalSpent:      Math.round(totalSpent * 100) / 100,
      projectedSales:  Math.round(projectedSales * 100) / 100,
      projectedProfit: Math.round(projectedProfit * 100) / 100,
      rowCount:        rows.length,
      cleared:         true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sheets/import POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
