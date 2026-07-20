import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServerClient } from '@/lib/supabase-server';

// Column indices (0-based) matching the user's sheet:
// A=UPC, B=ProductName, C=ASIN, D=AmazonURL, E=SalePrice, F=Quantity, G=CostPrice, H=Profit, I=ROI
const COL = {
  UPC:        0,  // A
  NAME:       1,  // B
  ASIN:       2,  // C
  SALE_PRICE: 4,  // E
  QUANTITY:   5,  // F
  COST_PRICE: 6,  // G
  PROFIT:     7,  // H
};

function toNumber(val: string | undefined): number {
  if (!val) return 0;
  let s = val.toString().trim().replace(/[$%]/g, '');

  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');

  if (hasComma && !hasDot) {
    s = s.replace(',', '.');
  } else if (hasComma && hasDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }

  return parseFloat(s) || 0;
}

function buildTotals(rows: string[][]) {
  let totalItems      = 0;
  let totalSpent      = 0;
  let projectedSales  = 0;
  let projectedProfit = 0;

  // Group by UPC → ASIN → product_name as fallback key
  const grouped = new Map<string, {
    product_name: string;
    asin: string;
    upc: string;
    buy_cost: number;
    estimated_sale_price: number;
    quantity_bought: number;
    total_cost: number;
    total_sales: number;
    total_profit: number;
    notes: string;
  }>();

  for (const row of rows) {
    const qty    = Math.round(toNumber(row[COL.QUANTITY]));
    const cost   = toNumber(row[COL.COST_PRICE]);
    const sale   = toNumber(row[COL.SALE_PRICE]);
    const profit = toNumber(row[COL.PROFIT]);
    const name   = (row[COL.NAME] ?? '').trim();
    const upc    = (row[COL.UPC]  ?? '').trim();
    const asin   = (row[COL.ASIN] ?? '').trim();

    if (!name) continue;

    totalItems      += qty;
    totalSpent      += cost * qty;
    projectedSales  += sale * qty;
    projectedProfit += profit * qty;

    const key = upc || asin || name;

    if (grouped.has(key)) {
      const g = grouped.get(key)!;
      g.quantity_bought += qty;
      g.total_cost      += cost * qty;
      g.total_sales     += sale * qty;
      g.total_profit    += profit * qty;
    } else {
      grouped.set(key, {
        product_name:         name,
        asin,
        upc,
        buy_cost:             cost,
        estimated_sale_price: sale,
        quantity_bought:      qty,
        quantity_found:       qty,
        total_cost:           cost * qty,
        total_sales:          sale * qty,
        total_profit:         profit * qty,
        notes:                asin,
      } as typeof grouped extends Map<string, infer V> ? V : never);
    }
  }

  const products = Array.from(grouped.values()).map((p) => ({
    ...p,
    total_cost:    Math.round(p.total_cost    * 100) / 100,
    total_sales:   Math.round(p.total_sales   * 100) / 100,
    total_profit:  Math.round(p.total_profit  * 100) / 100,
  }));

  return {
    totalItems:      Math.round(totalItems),
    totalSpent:      Math.round(totalSpent      * 100) / 100,
    projectedSales:  Math.round(projectedSales  * 100) / 100,
    projectedProfit: Math.round(projectedProfit * 100) / 100,
    rowCount:        rows.filter((r) => (r[COL.NAME] ?? '').trim()).length,
    products,
  };
}

function getAuth() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    throw new Error('Google Sheets credentials not configured');
  }

  // Vercel env vars often arrive wrapped in quotes and/or with escaped newlines
  let privateKey = rawKey.trim();
  if (
    (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n').trim();

  if (!privateKey.includes('-----BEGIN')) {
    throw new Error(
      'GOOGLE_SHEETS_PRIVATE_KEY inválida: debe incluir -----BEGIN PRIVATE KEY----- completo'
    );
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetId(req: NextRequest, method: 'GET' | 'POST'): Promise<string | null> {
  let sheetId: string | null = null;

  if (method === 'GET') {
    sheetId = new URL(req.url).searchParams.get('sheet_id');
  } else {
    const body = await req.clone().json().catch(() => ({}));
    sheetId = body.sheet_id ?? null;
  }

  if (!sheetId) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('users_profile')
      .select('google_sheet_id')
      .eq('user_id', user.id)
      .single();

    sheetId = (profile as { google_sheet_id?: string } | null)?.google_sheet_id ?? null;
  }

  return sheetId;
}

const RANGE = '001-01!A2:I';

export async function GET(req: NextRequest) {
  try {
    const sheetId = await getSheetId(req, 'GET');
    if (!sheetId) {
      return NextResponse.json({ error: 'No Google Sheet ID configured. Add it in your profile.' }, { status: 400 });
    }

    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res    = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: RANGE });
    const rows   = (res.data.values ?? []) as string[][];

    if (rows.length === 0) {
      return NextResponse.json({ totalItems: 0, totalSpent: 0, projectedSales: 0, projectedProfit: 0, rowCount: 0, products: [] });
    }

    return NextResponse.json(buildTotals(rows));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sheets/import GET]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: same as GET but clears the sheet after reading
export async function POST(req: NextRequest) {
  try {
    const sheetId = await getSheetId(req, 'POST');
    if (!sheetId) {
      return NextResponse.json({ error: 'No Google Sheet ID configured. Add it in your profile.' }, { status: 400 });
    }

    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res    = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: RANGE });
    const rows   = (res.data.values ?? []) as string[][];

    const totals = buildTotals(rows);

    if (rows.length > 0) {
      await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: RANGE });
    }

    return NextResponse.json({ ...totals, cleared: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sheets/import POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
