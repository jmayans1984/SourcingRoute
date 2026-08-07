'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { Card, SectionTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TripStatusBadge, RatingBadge } from '@/components/ui/badge';
import { RouteDetailModal } from '@/components/route/route-detail-modal';
import { formatDuration } from '@/utils/geo';
import {
  MapPin,
  Store,
  Package,
  Route,
  TrendingUp,
  Eye,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Wallet,
  Clock,
  ChevronRight,
  Search,
  X,
  DollarSign,
} from 'lucide-react';
import type { SourcingTrip, StoreRating } from '@/types/database';

interface TripTotals {
  itemsBought: number;
  spent: number;
  storesVisited: number;
  totalStops: number;
  profit: number;
}

// A store_visits row with trip_id = null — logged via "Visita Suelta", not
// tied to any route. Kept separate from TripTotals so it can be folded into
// the period KPIs without a route to hang off of.
interface LooseVisit {
  id: string;
  storeId: string;
  storeName: string;
  visitedAt: string;
  rating: StoreRating | null;
  spent: number;
  itemsBought: number;
  profit: number;
}

type PeriodFilter = 'week' | 'month' | 'year' | 'all';

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
  all: 'Todo',
};

const PERIOD_LONG: Record<PeriodFilter, string> = {
  week: 'Esta Semana',
  month: 'Este Mes',
  year: 'Este Año',
  all: 'Histórico',
};

function getStartOfWeek(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0 ? -6 : 1) - day; // back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPeriodStart(period: PeriodFilter): Date | null {
  const now = new Date();
  if (period === 'week') return getStartOfWeek();
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
}

function getPreviousPeriodStart(period: PeriodFilter): { start: Date; end: Date } | null {
  const now = new Date();
  if (period === 'week') {
    const currentStart = getStartOfWeek();
    const prevEnd = new Date(currentStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    prevEnd.setHours(23, 59, 59, 999);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 6);
    prevStart.setHours(0, 0, 0, 0);
    return { start: prevStart, end: prevEnd };
  }
  if (period === 'month') {
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    prevMonthEnd.setHours(23, 59, 59, 999);
    return { start: prevMonthStart, end: prevMonthEnd };
  }
  if (period === 'year') {
    const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const prevYearEnd = new Date(now.getFullYear() - 1, 11, 31);
    prevYearEnd.setHours(23, 59, 59, 999);
    return { start: prevYearStart, end: prevYearEnd };
  }
  return null;
}

// Delta chip: green when improving, amber when declining
function DeltaPill({
  current,
  prev,
  invert = false,
}: {
  current: number;
  prev: number;
  invert?: boolean;
}) {
  if (prev <= 0) return null;
  const up = current >= prev;
  const good = invert ? !up : up;
  const pct = Math.abs(Math.round(((current - prev) / prev) * 100));
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular ${
        good ? 'bg-success/12 text-success' : 'bg-warning/12 text-warning'
      }`}
    >
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {pct}%
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<SourcingTrip[]>([]);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [tripTotals, setTripTotals] = useState<Record<string, TripTotals>>({});
  const [looseVisits, setLooseVisits] = useState<LooseVisit[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<SourcingTrip | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>('week');
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserName(user.user_metadata?.full_name || 'Seller');

    const { data: allTrips } = await supabase
      .from('sourcing_trips')
      .select('*')
      .eq('user_id', user.id)
      .order('trip_date', { ascending: false });

    if (allTrips) setTrips(allTrips);

    if (allTrips && allTrips.length > 0) {
      const { data: allStops } = await supabase
        .from('trip_stops')
        .select('trip_id, total_spent, total_items_bought, estimated_profit, status')
        .in('trip_id', allTrips.map((t) => t.id));

      if (allStops) {
        const totals: Record<string, TripTotals> = {};
        allStops.forEach((s) => {
          const current = totals[s.trip_id] || {
            itemsBought: 0,
            spent: 0,
            storesVisited: 0,
            totalStops: 0,
            profit: 0,
          };
          current.itemsBought += s.total_items_bought || 0;
          current.spent += s.total_spent || 0;
          current.profit += s.estimated_profit || 0;
          current.totalStops += 1;
          if (s.status === 'completed') current.storesVisited += 1;
          totals[s.trip_id] = current;
        });
        setTripTotals(totals);
      }
    }

    // Visits logged via "Visita Suelta" (trip_id null) — not part of any
    // route, so they don't show up in tripTotals. Folded into the period
    // KPIs separately below.
    const { data: standaloneVisits } = await supabase
      .from('store_visits')
      .select('id, store_id, visited_at, rating, estimated_profit, total_spent, total_items_bought, store:stores(name)')
      .eq('user_id', user.id)
      .is('trip_id', null)
      .order('visited_at', { ascending: false });

    if (standaloneVisits) {
      setLooseVisits(
        standaloneVisits.map((v) => {
          const store = v.store as unknown as { name: string } | null;
          return {
            id: v.id,
            storeId: v.store_id,
            storeName: store?.name || 'Tienda',
            visitedAt: v.visited_at,
            rating: v.rating,
            spent: v.total_spent || 0,
            itemsBought: v.total_items_bought || 0,
            profit: v.estimated_profit || 0,
          };
        })
      );
    }

    setLoading(false);
  }

  async function deleteTrip(tripId: string) {
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDeletingTripId(null);
        return;
      }

      // Delete trip_stops first (foreign key constraint)
      const { error: stopsError } = await supabase
        .from('trip_stops')
        .delete()
        .eq('trip_id', tripId);

      if (stopsError) {
        console.error('Error deleting trip_stops:', stopsError.message);
        return;
      }

      // Then delete the trip (with user_id check for RLS)
      const { error: tripError } = await supabase
        .from('sourcing_trips')
        .delete()
        .eq('id', tripId)
        .eq('user_id', user.id);

      if (tripError) {
        console.error('Error deleting trip:', tripError.message);
        return;
      }

      // Update local state
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
      setDeletingTripId(null);
    } catch (error) {
      console.error('Error deleting trip:', error);
      setDeletingTripId(null);
    }
  }

  // Filter trips by selected period
  const periodStart = getPeriodStart(period);
  const periodTrips = periodStart
    ? trips.filter((t) => new Date(t.trip_date) >= periodStart!)
    : trips;

  // Visits logged without a route ("Visita Suelta") fall in the same period
  // window so they count toward the weekly/monthly summary too.
  const periodLooseVisits = periodStart
    ? looseVisits.filter((v) => new Date(v.visitedAt) >= periodStart!)
    : looseVisits;
  const looseSpent = periodLooseVisits.reduce((sum, v) => sum + v.spent, 0);
  const looseItems = periodLooseVisits.reduce((sum, v) => sum + v.itemsBought, 0);
  const looseProfit = periodLooseVisits.reduce((sum, v) => sum + v.profit, 0);
  const looseStores = periodLooseVisits.length;

  // Text search runs on top of the period filter (name or chains)
  const filteredTrips = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return periodTrips;
    return periodTrips.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const chains = (t.selected_chains || []).join(' ').toLowerCase();
      return name.includes(q) || chains.includes(q);
    });
  }, [periodTrips, query]);

  // KPIs derived from the period (routes + standalone visits combined)
  const filteredTotalSpent =
    periodTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.spent || 0), 0) + looseSpent;
  const filteredTotalItems =
    periodTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.itemsBought || 0), 0) + looseItems;
  const filteredTotalStores =
    periodTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.storesVisited || 0), 0) + looseStores;
  // Real projected profit = sum of each stop's estimated_profit across the
  // period's trips, plus standalone visits (not a ratio approximation, so
  // every completed store counts).
  const filteredTotalProfit =
    periodTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.profit || 0), 0) + looseProfit;
  const filteredAvgCost =
    filteredTotalItems > 0 ? filteredTotalSpent / filteredTotalItems : 0;

  // Previous period comparison
  const prevPeriod = getPreviousPeriodStart(period);
  let prevTotalSpent = 0;
  let prevTotalItems = 0;
  let prevTotalStores = 0;
  let prevTotalProfit = 0;

  if (prevPeriod && period !== 'all') {
    const prevTrips = trips.filter((t) => {
      const tripDate = new Date(t.trip_date);
      return tripDate >= prevPeriod.start && tripDate <= prevPeriod.end;
    });
    const prevLooseVisits = looseVisits.filter((v) => {
      const visitDate = new Date(v.visitedAt);
      return visitDate >= prevPeriod.start && visitDate <= prevPeriod.end;
    });
    prevTotalSpent =
      prevTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.spent || 0), 0) +
      prevLooseVisits.reduce((sum, v) => sum + v.spent, 0);
    prevTotalItems =
      prevTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.itemsBought || 0), 0) +
      prevLooseVisits.reduce((sum, v) => sum + v.itemsBought, 0);
    prevTotalStores =
      prevTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.storesVisited || 0), 0) +
      prevLooseVisits.length;
    prevTotalProfit =
      prevTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.profit || 0), 0) +
      prevLooseVisits.reduce((sum, v) => sum + v.profit, 0);
  }

  // Averages track completed work as you go: a route counts as soon as it has
  // at least one completed store, and routes not started yet don't dilute it.
  const routesWithProgress = periodTrips.filter(
    (t) => (tripTotals[t.id]?.storesVisited || 0) > 0
  ).length;
  const avgStoresPerActiveRoute =
    routesWithProgress > 0 ? filteredTotalStores / routesWithProgress : 0;
  const avgProfitPerStore =
    filteredTotalStores > 0 ? filteredTotalProfit / filteredTotalStores : 0;

  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const kpis = [
    {
      label: 'Tiendas',
      value: `${filteredTotalStores}`,
      icon: Store,
      tone: 'bg-primary/10 text-primary',
      cur: filteredTotalStores,
      prev: prevTotalStores,
      prevLabel: prevTotalStores > 0 ? `vs ${prevTotalStores} antes` : null,
      invert: false,
      accent: '',
    },
    {
      label: 'Utilidad',
      value: `$${Math.round(filteredTotalProfit).toLocaleString()}`,
      icon: TrendingUp,
      tone: 'bg-success/10 text-success',
      cur: filteredTotalProfit,
      prev: prevTotalProfit,
      prevLabel:
        prevTotalProfit > 0 ? `vs $${Math.round(prevTotalProfit).toLocaleString()} antes` : null,
      invert: false,
      accent: filteredTotalProfit >= 0 ? 'text-success' : 'text-danger',
    },
    {
      label: 'Artículos',
      value: `${filteredTotalItems}`,
      icon: Package,
      tone: 'bg-info/10 text-info',
      cur: filteredTotalItems,
      prev: prevTotalItems,
      prevLabel: prevTotalItems > 0 ? `vs ${prevTotalItems} antes` : null,
      invert: false,
      accent: '',
    },
    {
      label: 'Gastado',
      value: `$${filteredTotalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      icon: Wallet,
      tone: 'bg-warning/10 text-warning',
      cur: filteredTotalSpent,
      prev: prevTotalSpent,
      prevLabel: prevTotalSpent > 0 ? `vs $${prevTotalSpent.toLocaleString()} antes` : null,
      invert: true,
      accent: '',
    },
  ];

  const secondary = [
    {
      label: 'Rutas',
      value: `${periodTrips.length}`,
      sub:
        looseStores > 0
          ? `+${looseStores} visita${looseStores !== 1 ? 's' : ''} suelta${looseStores !== 1 ? 's' : ''}`
          : PERIOD_LONG[period],
      icon: Route,
    },
    {
      label: 'Costo/Artículo',
      value: `$${filteredAvgCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: PERIOD_LONG[period],
      icon: DollarSign,
    },
    {
      label: 'Tiendas/Ruta',
      value: avgStoresPerActiveRoute > 0 ? avgStoresPerActiveRoute.toFixed(1) : '0',
      sub:
        routesWithProgress > 0
          ? `${routesWithProgress} ruta${routesWithProgress !== 1 ? 's' : ''} activa${routesWithProgress !== 1 ? 's' : ''}`
          : PERIOD_LONG[period],
      icon: Store,
    },
    {
      label: 'Utilidad/Tienda',
      value: `$${Math.round(avgProfitPerStore).toLocaleString()}`,
      sub:
        filteredTotalStores > 0
          ? `${filteredTotalStores} tienda${filteredTotalStores !== 1 ? 's' : ''}`
          : PERIOD_LONG[period],
      icon: TrendingUp,
    },
  ];

  return (
    <>
      <Header title="Inicio" subtitle={today} />

      <div className="space-y-5 p-4 md:p-0">
        {/* Greeting + primary action */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight md:text-2xl">
              Hola, {userName}
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              Listo para hacer sourcing hoy
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/visit/new" className="flex-1 md:flex-none">
              <Button size="lg" variant="outline" fullWidth className="gap-2 md:w-auto">
                <Store size={19} />
                Visita Suelta
              </Button>
            </Link>
            <Link href="/route/create" className="flex-1 md:flex-none">
              <Button size="lg" fullWidth className="gap-2 md:w-auto">
                <Route size={19} />
                Crear Ruta
              </Button>
            </Link>
          </div>
        </div>

        {/* Period selector */}
        <div className="inline-flex w-full gap-1 rounded-xl border border-border bg-surface p-1 md:w-auto">
          {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`min-h-[38px] flex-1 rounded-lg px-3 text-sm font-medium transition-colors md:flex-none md:px-5 ${
                period === p
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <div className="flex items-start justify-between gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.tone}`}>
                  <k.icon size={17} />
                </span>
                <DeltaPill current={k.cur} prev={k.prev} invert={k.invert} />
              </div>
              <p className="mt-3 text-xs font-medium text-text-secondary">{k.label}</p>
              <p className={`text-2xl font-bold tracking-tight tabular ${k.accent || 'text-text'}`}>
                {k.value}
              </p>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {k.prevLabel ?? PERIOD_LONG[period]}
              </p>
            </Card>
          ))}
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {secondary.map((s) => (
            <Card key={s.label}>
              <div className="flex items-center gap-2 text-text-secondary">
                <s.icon size={14} />
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <p className="mt-1.5 text-xl font-bold tabular">{s.value}</p>
              <p className="text-[11px] text-text-muted">{s.sub}</p>
            </Card>
          ))}
        </div>

        {/* Routes */}
        <SectionTitle
          action={
            <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-text-secondary tabular">
              {filteredTrips.length}
            </span>
          }
        >
          Mis Rutas
        </SectionTitle>

        {/* Search */}
        {trips.length > 0 && (
          <div className="relative">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ruta por nombre..."
              className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-10 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-secondary hover:text-text"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        <div>
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredTrips.length === 0 ? (
            <Card className="py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <MapPin size={22} className="text-primary" />
              </div>
              <p className="font-semibold text-text">
                {query
                  ? 'Sin resultados'
                  : trips.length === 0
                    ? 'No hay rutas aún'
                    : `Sin rutas en ${PERIOD_LONG[period].toLowerCase()}`}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {query
                  ? 'Prueba con otro nombre'
                  : trips.length === 0
                    ? 'Crea tu primera ruta para empezar'
                    : 'Cambia el período o crea una nueva ruta'}
              </p>
            </Card>
          ) : (
            <>
              {/* Mobile: route cards */}
              <div className="space-y-3 md:hidden">
                {filteredTrips.map((trip) => {
                  const totals = tripTotals[trip.id];
                  const timeWorked =
                    (trip.total_drive_minutes || 0) + (trip.total_store_minutes || 0);
                  return (
                    <Card
                      key={trip.id}
                      onClick={() => setSelectedTrip(trip)}
                      className="cursor-pointer active:bg-surface-hover"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <MapPin size={17} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-text">
                              {trip.name || trip.selected_chains?.slice(0, 3).join(', ') || 'Ruta sin nombre'}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-text-muted">
                              {new Date(trip.trip_date).toLocaleDateString()}
                              {timeWorked > 0 && (
                                <>
                                  <span>·</span>
                                  <Clock size={11} />
                                  {formatDuration(timeWorked)}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <TripStatusBadge status={trip.status} />
                      </div>

                      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-surface-secondary p-2.5 text-center">
                        <div>
                          <p className="text-[10px] font-medium text-text-muted">Tiendas</p>
                          <p className="text-sm font-semibold tabular">
                            {totals ? `${totals.storesVisited}/${totals.totalStops}` : '0'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-text-muted">Artíc.</p>
                          <p className="text-sm font-semibold tabular">{totals?.itemsBought || 0}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-text-muted">Gastado</p>
                          <p className="text-sm font-semibold tabular">
                            ${(totals?.spent || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-text-muted">Utilidad</p>
                          <p
                            className={`text-sm font-semibold tabular ${(totals?.profit || 0) >= 0 ? 'text-success' : 'text-danger'}`}
                          >
                            ${Math.round(totals?.profit || 0).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div
                        className="mt-3 flex items-center justify-between"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {deletingTripId === trip.id ? (
                          <div className="flex w-full items-center gap-2">
                            <Button size="sm" variant="danger" fullWidth onClick={() => deleteTrip(trip.id)}>
                              Confirmar
                            </Button>
                            <Button size="sm" variant="outline" fullWidth onClick={() => setDeletingTripId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => router.push(`/trip/${trip.id}`)}
                              className="flex min-h-[40px] items-center gap-1 rounded-xl bg-primary/10 px-3.5 text-sm font-semibold text-primary transition-colors active:bg-primary/20"
                            >
                              Ver ruta
                              <ChevronRight size={15} />
                            </button>
                            <div className="flex items-center gap-1">
                              {trip.status === 'planning' && (
                                <button
                                  onClick={() => router.push(`/trip/${trip.id}/edit`)}
                                  aria-label="Editar ruta"
                                  className="flex h-10 w-10 items-center justify-center rounded-xl text-text-muted transition-colors active:bg-surface-secondary"
                                >
                                  <Pencil size={17} />
                                </button>
                              )}
                              <button
                                onClick={() => setDeletingTripId(trip.id)}
                                aria-label="Eliminar ruta"
                                className="flex h-10 w-10 items-center justify-center rounded-xl text-text-muted transition-colors active:bg-danger/10 active:text-danger"
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <Card padding={false} className="hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-secondary text-left text-xs font-medium text-text-secondary">
                        <th className="px-4 py-3">Ruta</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Distancia</th>
                        <th className="px-4 py-3">Tiendas</th>
                        <th className="px-4 py-3">Artículos</th>
                        <th className="px-4 py-3">Gastado</th>
                        <th className="px-4 py-3">Utilidad</th>
                        <th className="px-4 py-3">Tiempo</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrips.map((trip) => {
                        const totals = tripTotals[trip.id];
                        const timeWorked =
                          (trip.total_drive_minutes || 0) + (trip.total_store_minutes || 0);
                        return (
                          <tr
                            key={trip.id}
                            onClick={() => setSelectedTrip(trip)}
                            className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-secondary"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                  <MapPin size={16} />
                                </div>
                                <span className="font-medium">
                                  {trip.name || trip.selected_chains?.slice(0, 3).join(', ') || 'Ruta sin nombre'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-text-secondary tabular">
                              {new Date(trip.trip_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-text-secondary tabular">
                              {trip.total_distance_miles ? `${trip.total_distance_miles.toFixed(1)} mi` : '--'}
                            </td>
                            <td className="px-4 py-3 text-text-secondary tabular">
                              {totals ? `${totals.storesVisited}/${totals.totalStops}` : '0'}
                            </td>
                            <td className="px-4 py-3 text-text-secondary tabular">
                              {totals?.itemsBought || 0}
                            </td>
                            <td className="px-4 py-3 font-medium tabular">
                              ${(totals?.spent || 0).toLocaleString()}
                            </td>
                            <td
                              className={`px-4 py-3 font-semibold tabular ${(totals?.profit || 0) >= 0 ? 'text-success' : 'text-danger'}`}
                            >
                              ${Math.round(totals?.profit || 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-text-secondary tabular">
                              {timeWorked > 0 ? formatDuration(timeWorked) : '--'}
                            </td>
                            <td className="px-4 py-3">
                              <TripStatusBadge status={trip.status} />
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {deletingTripId === trip.id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <Button size="sm" variant="danger" onClick={() => deleteTrip(trip.id)}>
                                    Confirmar
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setDeletingTripId(null)}>
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => router.push(`/trip/${trip.id}`)}
                                    className="rounded-lg p-2 text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                                    title="Ver ruta"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  {trip.status === 'planning' && (
                                    <button
                                      onClick={() => router.push(`/trip/${trip.id}/edit`)}
                                      className="rounded-lg p-2 text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                                      title="Editar ruta"
                                    >
                                      <Pencil size={16} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setDeletingTripId(trip.id)}
                                    className="rounded-lg p-2 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                                    title="Eliminar ruta"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Standalone visits — logged via "Visita Suelta", no route attached */}
        {looseVisits.length > 0 && (
          <div>
            <SectionTitle
              action={
                <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-text-secondary tabular">
                  {periodLooseVisits.length}
                </span>
              }
            >
              Visitas Sueltas
            </SectionTitle>
            <div className="mt-3">
              {periodLooseVisits.length === 0 ? (
                <Card className="py-6 text-center text-sm text-text-muted">
                  Sin visitas sueltas en {PERIOD_LONG[period].toLowerCase()}
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {periodLooseVisits.map((v) => (
                    <Link key={v.id} href={`/stores/${v.storeId}`}>
                      <Card className="flex items-center gap-3 transition-colors hover:bg-surface-secondary">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                          {v.storeName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">{v.storeName}</p>
                            {v.rating && <RatingBadge rating={v.rating} />}
                          </div>
                          <p className="text-xs text-text-muted tabular">
                            {new Date(v.visitedAt).toLocaleDateString()} · {v.itemsBought} artículos
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`text-sm font-semibold tabular ${v.profit >= 0 ? 'text-success' : 'text-danger'}`}
                          >
                            ${Math.round(v.profit).toLocaleString()}
                          </p>
                          <p className="text-xs text-text-muted tabular">
                            ${v.spent.toLocaleString()} gastado
                          </p>
                        </div>
                        <ChevronRight size={16} className="shrink-0 text-text-muted" />
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedTrip && (
        <RouteDetailModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
      )}
    </>
  );
}
