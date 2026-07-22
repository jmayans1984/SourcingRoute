'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TripStatusBadge } from '@/components/ui/badge';
import { RouteDetailModal } from '@/components/route/route-detail-modal';
import { formatDuration } from '@/utils/geo';
import {
  MapPin,
  Store,
  DollarSign,
  Package,
  Route,
  TrendingUp,
  Eye,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Wallet,
  Calendar,
  Clock,
  ChevronRight,
} from 'lucide-react';
import type { SourcingTrip } from '@/types/database';

interface DashboardStats {
  totalTrips: number;
  totalStoresVisited: number;
  totalProducts: number;
  totalProfit: number;
}

interface TripTotals {
  itemsBought: number;
  spent: number;
  storesVisited: number;
  totalStops: number;
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

// Delta pill: green when improving, amber when declining
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
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        good ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
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
  const [stats, setStats] = useState<DashboardStats>({
    totalTrips: 0,
    totalStoresVisited: 0,
    totalProducts: 0,
    totalProfit: 0,
  });
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [tripTotals, setTripTotals] = useState<Record<string, TripTotals>>({});
  const [selectedTrip, setSelectedTrip] = useState<SourcingTrip | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>('week');

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
        .select('trip_id, total_spent, total_items_bought, status')
        .in('trip_id', allTrips.map((t) => t.id));

      if (allStops) {
        const totals: Record<string, TripTotals> = {};
        allStops.forEach((s) => {
          const current = totals[s.trip_id] || {
            itemsBought: 0,
            spent: 0,
            storesVisited: 0,
            totalStops: 0,
          };
          current.itemsBought += s.total_items_bought || 0;
          current.spent += s.total_spent || 0;
          current.totalStops += 1;
          if (s.status === 'completed') current.storesVisited += 1;
          totals[s.trip_id] = current;
        });
        setTripTotals(totals);
      }
    }

    const { data: visitStats } = await supabase
      .from('store_visits')
      .select('id, estimated_profit, products_found')
      .eq('user_id', user.id);

    if (visitStats) {
      setStats({
        totalTrips: allTrips?.length ?? 0,
        totalStoresVisited: visitStats.length,
        totalProducts: visitStats.reduce((sum, v) => sum + (v.products_found || 0), 0),
        totalProfit: visitStats.reduce((sum, v) => sum + (v.estimated_profit || 0), 0),
      });
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
  const filteredTrips = periodStart
    ? trips.filter((t) => new Date(t.trip_date) >= periodStart!)
    : trips;

  // KPIs derived from the filtered trips
  const filteredTotalSpent = filteredTrips.reduce(
    (sum, t) => sum + (tripTotals[t.id]?.spent || 0),
    0
  );
  const filteredTotalItems = filteredTrips.reduce(
    (sum, t) => sum + (tripTotals[t.id]?.itemsBought || 0),
    0
  );
  const filteredTotalStores = filteredTrips.reduce(
    (sum, t) => sum + (tripTotals[t.id]?.storesVisited || 0),
    0
  );
  const filteredAvgCost =
    filteredTotalItems > 0 ? filteredTotalSpent / filteredTotalItems : 0;

  // Previous period comparison
  const prevPeriod = getPreviousPeriodStart(period);
  let prevTotalSpent = 0;
  let prevTotalItems = 0;
  let prevTotalStores = 0;

  if (prevPeriod && period !== 'all') {
    const prevTrips = trips.filter((t) => {
      const tripDate = new Date(t.trip_date);
      return tripDate >= prevPeriod.start && tripDate <= prevPeriod.end;
    });
    prevTotalSpent = prevTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.spent || 0), 0);
    prevTotalItems = prevTrips.reduce((sum, t) => sum + (tripTotals[t.id]?.itemsBought || 0), 0);
    prevTotalStores = prevTrips.reduce(
      (sum, t) => sum + (tripTotals[t.id]?.storesVisited || 0),
      0
    );
  }

  // Profit estimate: spend ratio vs all-time profit
  const allTimeSpent = trips.reduce((sum, t) => sum + (tripTotals[t.id]?.spent || 0), 0);
  const profitRatio = allTimeSpent > 0 ? stats.totalProfit / allTimeSpent : 0;
  const estimatedCurrentProfit = filteredTotalSpent * profitRatio;
  const estimatedPrevProfit = prevTotalSpent * profitRatio;

  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const kpis = [
    {
      label: 'Tiendas Visitadas',
      value: `${filteredTotalStores}`,
      icon: Store,
      chip: 'bg-gradient-to-br from-violet-500 to-purple-600',
      glow: 'shadow-violet-500/20',
      cur: filteredTotalStores,
      prev: prevTotalStores,
      prevLabel: prevTotalStores > 0 ? `vs ${prevTotalStores} anterior` : null,
      invert: false,
    },
    {
      label: 'Ganancia Estimada',
      value: `$${Math.round(estimatedCurrentProfit).toLocaleString()}`,
      icon: TrendingUp,
      chip: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      glow: 'shadow-emerald-500/20',
      cur: estimatedCurrentProfit,
      prev: estimatedPrevProfit,
      prevLabel:
        estimatedPrevProfit > 0
          ? `vs $${Math.round(estimatedPrevProfit).toLocaleString()} anterior`
          : null,
      invert: false,
    },
    {
      label: 'Artículos',
      value: `${filteredTotalItems}`,
      icon: Package,
      chip: 'bg-gradient-to-br from-sky-500 to-blue-600',
      glow: 'shadow-sky-500/20',
      cur: filteredTotalItems,
      prev: prevTotalItems,
      prevLabel: prevTotalItems > 0 ? `vs ${prevTotalItems} anterior` : null,
      invert: false,
    },
    {
      label: 'Gastado',
      value: `$${filteredTotalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      icon: Wallet,
      chip: 'bg-gradient-to-br from-orange-500 to-amber-600',
      glow: 'shadow-orange-500/20',
      cur: filteredTotalSpent,
      prev: prevTotalSpent,
      prevLabel:
        prevTotalSpent > 0 ? `vs $${prevTotalSpent.toLocaleString()} anterior` : null,
      invert: true,
    },
  ];

  return (
    <>
      <Header title="SourcingRoute" />

      <div className="space-y-5 p-4 md:p-0">
        {/* Hero banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-5 text-white shadow-xl shadow-indigo-500/25 md:p-7">
          {/* decorative blobs */}
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 right-24 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-cyan-300/10 blur-2xl" />

          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-blue-100/80">
                <Calendar size={13} />
                {today}
              </p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
                Hey, {userName} <span className="align-middle">👋</span>
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-blue-100">
                <Sparkles size={14} className="text-amber-300" />
                Listo para hacer sourcing hoy?
              </p>
            </div>

            <Link href="/route/create" className="shrink-0">
              <Button
                size="lg"
                fullWidth
                className="gap-2 !bg-none !bg-white !text-indigo-700 !shadow-lg hover:!bg-blue-50 md:w-auto"
              >
                <Route size={20} />
                Crear Nueva Ruta
              </Button>
            </Link>
          </div>

          {/* Period selector inside hero */}
          <div className="relative mt-5 inline-flex w-full gap-1 rounded-2xl bg-white/10 p-1 backdrop-blur-sm md:w-auto">
            {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all md:flex-none md:px-4 ${
                  period === p
                    ? 'bg-white text-indigo-700 shadow-md'
                    : 'text-blue-100 hover:bg-white/10'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className={`rounded-2xl border border-border bg-surface p-4 shadow-lg ${k.glow} transition-transform hover:-translate-y-0.5`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md ${k.chip}`}
                >
                  <k.icon size={19} />
                </div>
                <DeltaPill current={k.cur} prev={k.prev} invert={k.invert} />
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {k.label}
              </p>
              <p className="text-2xl font-extrabold tracking-tight text-text">{k.value}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {k.prevLabel ?? PERIOD_LONG[period]}
              </p>
            </div>
          ))}
        </div>

        {/* Secondary stat strip */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="!rounded-2xl">
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <Route size={14} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide">Rutas</span>
            </div>
            <p className="mt-2 text-xl font-extrabold">{filteredTrips.length}</p>
            <p className="text-[11px] text-text-muted">{PERIOD_LONG[period]}</p>
          </Card>
          <Card className="!rounded-2xl">
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <DollarSign size={14} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                Costo/Artículo
              </span>
            </div>
            <p className="mt-2 text-xl font-extrabold">
              ${filteredAvgCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-text-muted">{PERIOD_LONG[period]}</p>
          </Card>
          <Card className="!rounded-2xl">
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                <Store size={14} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                Tiendas/Ruta
              </span>
            </div>
            <p className="mt-2 text-xl font-extrabold">
              {filteredTrips.length > 0
                ? (filteredTotalStores / filteredTrips.length).toFixed(1)
                : '0'}
            </p>
            <p className="text-[11px] text-text-muted">{PERIOD_LONG[period]}</p>
          </Card>
        </div>

        {/* Routes */}
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text">
            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-600" />
            Mis Rutas
          </h3>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
            {filteredTrips.length}
          </span>
        </div>

        <div>
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredTrips.length === 0 ? (
            <Card className="!rounded-2xl py-10 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100">
                <MapPin size={26} className="text-indigo-500" />
              </div>
              <p className="font-semibold text-text">
                {trips.length === 0 ? 'No hay rutas aún' : `Sin rutas en ${PERIOD_LONG[period].toLowerCase()}`}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {trips.length === 0
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
                    <div
                      key={trip.id}
                      onClick={() => setSelectedTrip(trip)}
                      className="cursor-pointer rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow active:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/25">
                            <MapPin size={17} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-text">
                              {trip.name || trip.selected_chains?.slice(0, 3).join(', ') || 'Ruta sin nombre'}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-text-muted">
                              <Calendar size={11} />
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

                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-surface-secondary p-2.5 text-center">
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-text-muted">Tiendas</p>
                          <p className="text-sm font-bold">
                            {totals ? `${totals.storesVisited}/${totals.totalStops}` : '0'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-text-muted">Artículos</p>
                          <p className="text-sm font-bold">{totals?.itemsBought || 0}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-text-muted">Gastado</p>
                          <p className="text-sm font-bold text-emerald-600">
                            ${(totals?.spent || 0).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
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
                              className="flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors active:bg-indigo-100"
                            >
                              Ver ruta
                              <ChevronRight size={14} />
                            </button>
                            <div className="flex items-center gap-1">
                              {trip.status === 'planning' && (
                                <button
                                  onClick={() => router.push(`/trip/${trip.id}/edit`)}
                                  className="rounded-lg p-2 text-text-muted transition-colors active:bg-surface-secondary"
                                  title="Editar ruta"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => setDeletingTripId(trip.id)}
                                className="rounded-lg p-2 text-text-muted transition-colors active:bg-red-50 active:text-danger"
                                title="Eliminar ruta"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <Card padding={false} className="hidden overflow-hidden !rounded-2xl md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-gradient-to-r from-slate-50 to-indigo-50/50 text-left text-xs uppercase tracking-wide text-text-muted">
                        <th className="px-4 py-3 font-semibold">Ruta</th>
                        <th className="px-4 py-3 font-semibold">Fecha</th>
                        <th className="px-4 py-3 font-semibold">Distancia</th>
                        <th className="px-4 py-3 font-semibold">Tiendas</th>
                        <th className="px-4 py-3 font-semibold">Artículos</th>
                        <th className="px-4 py-3 font-semibold">Gastado</th>
                        <th className="px-4 py-3 font-semibold">Tiempo</th>
                        <th className="px-4 py-3 font-semibold">Estado</th>
                        <th className="px-4 py-3 text-right font-semibold">Acciones</th>
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
                            className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-indigo-50/40"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
                                  <MapPin size={16} />
                                </div>
                                <span className="font-medium">
                                  {trip.name || trip.selected_chains?.slice(0, 3).join(', ') || 'Ruta sin nombre'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
                              {new Date(trip.trip_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
                              {trip.total_distance_miles ? `${trip.total_distance_miles.toFixed(1)} mi` : '--'}
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
                              {totals ? `${totals.storesVisited}/${totals.totalStops}` : '0'}
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
                              {totals?.itemsBought || 0}
                            </td>
                            <td className="px-4 py-3 font-semibold text-emerald-600">
                              ${(totals?.spent || 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
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
                                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-indigo-50 hover:text-primary"
                                    title="Ver ruta"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  {trip.status === 'planning' && (
                                    <button
                                      onClick={() => router.push(`/trip/${trip.id}/edit`)}
                                      className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-indigo-50 hover:text-primary"
                                      title="Editar ruta"
                                    >
                                      <Pencil size={16} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setDeletingTripId(trip.id)}
                                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-danger"
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
      </div>

      {selectedTrip && (
        <RouteDetailModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
      )}
    </>
  );
}
