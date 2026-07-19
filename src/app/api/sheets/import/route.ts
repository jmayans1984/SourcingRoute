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
  let s = val.toString().trim().replace(/[$%]/g, '');

  // Detect European decimal format (e.g. "12,99" or "1.234,56")
  // vs US format (e.g. "1,234.56")
  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');

  if (hasComma && !hasDot) {
    // Pure European: "12,99" → "12.99"
    s = s.replace(',', '.');
  } else if (hasComma && hasDot) {
    // European with thousands: "1.234,56" → "1234.56"
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // US format or plain number — remove thousands commas
    s = s.replace(/,/g, '');
  }

  return parseFloat(s) || 0;
}

function getAuth() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    throw new Error('Google Sheets credentials not configured');
  }

  // Normalize escaped newlines from Vercel env vars
  const privateKey = rawKey.replace(/\\n/g, '\n');

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
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
    const range = '001-01!A2:I';
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
    const range = '001-01!A2:I';
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
