import { STORE_CHAINS } from '@/types/database';

// Canonical brand list shown as suggestions when planning a route.
export const KNOWN_BRANDS: string[] = [...STORE_CHAINS];

// Common variants / misspellings / full legal names → canonical brand.
// Keys must be lowercase. Add new aliases here as they come up.
const ALIASES: Record<string, string> = {
  // Marshalls
  marshalls: 'Marshalls',
  marshall: 'Marshalls',
  marshal: 'Marshalls',
  marchall: 'Marshalls',
  marchalls: 'Marshalls',
  // TJ Maxx
  'tj maxx': 'TJ Maxx',
  'tjmaxx': 'TJ Maxx',
  'tj max': 'TJ Maxx',
  't.j. maxx': 'TJ Maxx',
  'tj-maxx': 'TJ Maxx',
  tjx: 'TJ Maxx',
  // Ross
  ross: 'Ross',
  'ross dress for less': 'Ross',
  // Burlington
  burlington: 'Burlington',
  'burlington coat factory': 'Burlington',
  // HomeGoods
  homegoods: 'HomeGoods',
  'home goods': 'HomeGoods',
  // Others
  'five below': 'Five Below',
  'dollar tree': 'Dollar Tree',
  "ollie's": "Ollie's",
  ollies: "Ollie's",
  "ollie's bargain outlet": "Ollie's",
  'big lots': 'Big Lots',
  'nordstrom rack': 'Nordstrom Rack',
  nordstrom: 'Nordstrom Rack',
  sierra: 'Sierra',
  'sierra trading post': 'Sierra',
  'tuesday morning': 'Tuesday Morning',
  'bealls outlet': 'Bealls Outlet',
  bealls: 'Bealls Outlet',
  walmart: 'Walmart',
  'wal-mart': 'Walmart',
  target: 'Target',
};

function titleCase(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Maps a free-text store name to a standardized brand so that historical
 * analysis groups by brand (Ross, TJ Maxx, Marshalls...) instead of by every
 * spelling variant. Falls back to a title-cased version of the input when the
 * brand is unknown, so at least casing stays consistent.
 */
export function normalizeBrand(input: string): string {
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return '';

  // 1. Exact alias/brand match
  if (ALIASES[cleaned]) return ALIASES[cleaned];

  // 2. Input contains a known brand keyword (e.g. "Marshalls & HomeGoods",
  //    "Ross Dress for Less #123"). Prefer the longest alias match to avoid a
  //    short alias winning over a more specific one.
  const matches = Object.keys(ALIASES)
    .filter((alias) => cleaned.includes(alias))
    .sort((a, b) => b.length - a.length);
  if (matches.length > 0) return ALIASES[matches[0]];

  // 3. Unknown brand — keep it but normalize casing
  return titleCase(input);
}
