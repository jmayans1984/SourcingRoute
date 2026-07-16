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
  week: 'Esta Semana',
  month: 'Este Mes',
  year: 'Este Año',
  all: 'Todo',
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
  const filteredAvgCost =
    filteredTotalItems > 0 ? filteredTotalSpent / filteredTotalItems : 0;

  return (
    <>
      <Header title="SourcingRoute" />

      <div className="space-y-4 p-4 md:p-0">
        <div className="md:flex md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Hey, {userName}!</h2>
            <p className="text-sm text-text-secondary">Ready to source today?</p>
          </div>

          <Link href="/route/create" className="mt-3 block md:mt-0 md:w-auto">
            <Button size="lg" fullWidth className="gap-2 md:w-auto">
              <Route size={20} />
              Create New Route
            </Button>
          </Link>
        </div>

        {/* Historical KPIs (all-time) */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card>
            <div className="flex items-center gap-2 text-text-secondary">
              <Store size={16} />
              <span className="text-xs">Tiendas Visitadas</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.totalStoresVisited}</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-text-secondary">
              <DollarSign size={16} />
              <span className="text-xs">Ganancia Estimada</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-secondary">
              ${stats.totalProfit.toLocaleString()}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-text-secondary">
              <Package size={16} />
              <span className="text-xs">Productos Encontrados</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.totalProducts}</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-text-secondary">
              <TrendingUp size={16} />
              <span className="text-xs">Total Rutas</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.totalTrips}</p>
          </Card>
        </div>

        {/* Period filter */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            Mis Rutas
          </h3>
          <div className="inline-flex rounded-xl border border-border bg-surface p-1 gap-0.5">
            {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs for the filtered period */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <div className="flex items-center gap-2 text-text-secondary">
              <DollarSign size={16} />
              <span className="text-xs">Total Gastado</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-primary">
              ${filteredTotalSpent.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-text-muted">{PERIOD_LABELS[period]}</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-text-secondary">
              <Package size={16} />
              <span className="text-xs">Total Artículos</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{filteredTotalItems}</p>
            <p className="text-xs text-text-muted">{PERIOD_LABELS[period]}</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-text-secondary">
              <TrendingUp size={16} />
              <span className="text-xs">Costo/Artículo</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-secondary">
              ${filteredAvgCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-text-muted">{PERIOD_LABELS[period]}</p>
          </Card>
        </div>

        <div>
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredTrips.length === 0 ? (
            <Card className="text-center py-8">
              <MapPin size={40} className="mx-auto text-text-muted mb-3" />
              <p className="font-medium text-text">
                {trips.length === 0 ? 'No hay rutas aún' : `Sin rutas en ${PERIOD_LABELS[period].toLowerCase()}`}
              </p>
              <p className="text-sm text-text-muted mt-1">
                {trips.length === 0
                  ? 'Crea tu primera ruta para empezar'
                  : 'Cambia el período o crea una nueva ruta'}
              </p>
            </Card>
          ) : (
            <Card padding={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Ruta</th>
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 font-semibold">Distancia</th>
                      <th className="px-4 py-3 font-semibold">Tiendas</th>
                      <th className="px-4 py-3 font-semibold">Artículos</th>
                      <th className="px-4 py-3 font-semibold">Gastado</th>
                      <th className="px-4 py-3 font-semibold">Tiempo</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold text-right">Acciones</th>
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
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-secondary transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <MapPin size={16} />
                            </div>
                            <span className="font-medium">
                              {trip.name || trip.selected_chains?.slice(0, 3).join(', ') || 'Untitled route'}
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
                        <td className="px-4 py-3 font-medium text-secondary">
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
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => deleteTrip(trip.id)}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeletingTripId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => router.push(`/trip/${trip.id}`)}
                                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-primary transition-colors"
                                title="View route"
                              >
                                <Eye size={16} />
                              </button>
                              {trip.status === 'planning' && (
                                <button
                                  onClick={() => router.push(`/trip/${trip.id}/edit`)}
                                  className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-primary transition-colors"
                                  title="Edit route"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => setDeletingTripId(trip.id)}
                                className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-danger transition-colors"
                                title="Delete route"
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
          )}
        </div>
      </div>

      {selectedTrip && (
        <RouteDetailModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
      )}
    </>
  );
}
