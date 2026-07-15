# SourcingRoute

Retail arbitrage route planner — plan sourcing days, find stores, optimize routes, track visits.

## Stack
- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Supabase (Auth, PostgreSQL, RLS)
- Google Maps Platform (Places API New, Routes API, Geocoding)
- Zustand for client state, Lucide for icons

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npx tsc --noEmit` — type check

## Project structure
- `src/app/(auth)/` — login, register (no bottom nav)
- `src/app/(dashboard)/` — home page with bottom nav via AppShell
- `src/app/route/create/` — create sourcing route form
- `src/app/trip/[id]/` — active trip view with stops
- `src/app/trip/[id]/stop/[stopId]/` — individual stop (rate, log products)
- `src/app/trip/[id]/report/` — trip summary
- `src/app/stores/` — store history list
- `src/app/stores/[id]/` — store detail
- `src/app/profile/` — user profile settings
- `src/app/api/` — backend routes (geocode, store search, route creation)
- `src/components/ui/` — reusable UI components
- `src/components/layout/` — app shell, header, bottom nav
- `src/components/route/` — route-specific components
- `src/utils/` — scoring engine, navigation URLs, geo utilities
- `src/lib/` — Supabase client/server/middleware setup
- `supabase/schema.sql` — database schema with RLS policies

## Environment variables
Copy `.env.local.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GOOGLE_ROUTES_API_KEY`
