'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StopStatusBadge, ScoreBadge } from '@/components/ui/badge';
import { TripRouteMap } from '@/components/maps/trip-route-map';
import { buildWazeUrl, buildGoogleMapsStopUrl } from '@/utils/navigation';
import { formatDuration } from '@/utils/geo';
import { calculateStoreScore } from '@/utils/scoring';
import type { SourcingTrip, TripStop, Store, StopStatus, StoreVisit } from '@/types/database';
import {
  Navigation,
  ExternalLink,
  Clock,
  ChevronRight,
  Play,
  CheckCircle2,
  SkipForward,
  Car,
  RefreshCw,
  Store as StoreIcon,
  Trash2,
  Undo2,
  Package,
  DollarSign,
  ChevronUp,
  ChevronDown,
  ListOrdered,
  TrendingUp,
  ShoppingBag,
  Search,
  X,
  Loader2,
  Wallet,
  Plus,
  MapPin,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface StopWithStore extends TripStop {
  store: Store;
}

interface GroupedProduct {
  code: string;
  product_name: string;
  quantity: number;
  totalCost: number;
  totalProfit: number;
  stores: string[];
}

interface TripExpense {
  id: string;
  category_name: string;
  amount: number;
  notes: string | null;
}

interface ExpenseCategory {
  id: string;
  name: string;
}

interface FindResult {
  id: string | null;
  google_place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string | null;
  opening_hours: Record<string, unknown> | null;
}

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<SourcingTrip | null>(null);
  const [stops, setStops] = useState<StopWithStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(new Set());
  const [updatingRoute, setUpdatingRoute] = useState(false);
  const [orderChanged, setOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  // Real scores calculated from visit history (keyed by store_id)
  const [storeScores, setStoreScores] = useState<Record<string, number>>({});
  const [showProducts, setShowProducts] = useState(false);
  const [tripProducts, setTripProducts] = useState<GroupedProduct[] | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  // Route-level expenses (gas, tolls, hotel...) subtracted from product profit
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [expCategories, setExpCategories] = useState<ExpenseCategory[]>([]);
  const [expCategoryId, setExpCategoryId] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);
  // Add-a-store-on-the-fly (works while planning or mid-route)
  const [showAddStore, setShowAddStore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FindResult[]>([]);
  const [addingStoreId, setAddingStoreId] = useState<string | null>(null);

  useEffect(() => {
    loadTrip();
  }, [id]);

  async function loadTrip() {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    const [{ data: tripData }, { data: stopsData }, { data: expensesData }, { data: catsData }] =
      await Promise.all([
        supabase.from('sourcing_trips').select('*').eq('id', id).single(),
        supabase
          .from('trip_stops')
          .select('*, store:stores(*)')
          .eq('trip_id', id)
          .order('stop_order', { ascending: true }),
        supabase
          .from('trip_expenses')
          .select('id, category_name, amount, notes')
          .eq('trip_id', id)
          .order('created_at', { ascending: true }),
        user
          ? supabase
              .from('expense_categories')
              .select('id, name')
              .eq('user_id', user.id)
              .order('name')
          : Promise.resolve({ data: null }),
      ]);

    if (tripData) setTrip(tripData);
    if (expensesData) setExpenses(expensesData);
    if (catsData) {
      setExpCategories(catsData);
      if (catsData.length > 0) setExpCategoryId((prev) => prev || catsData[0].id);
    }
    if (stopsData) {
      setStops(stopsData as StopWithStore[]);

      // Calculate real scores from visit history for each store in this trip
      if (user && stopsData.length > 0) {
        const storeIds = stopsData.map((s) => s.store_id);
        const { data: visits } = await supabase
          .from('store_visits')
          .select('*')
          .eq('user_id', user.id)
          .in('store_id', storeIds);

        if (visits) {
          const visitsByStore: Record<string, StoreVisit[]> = {};
          visits.forEach((v) => {
            if (!visitsByStore[v.store_id]) visitsByStore[v.store_id] = [];
            visitsByStore[v.store_id].push(v);
          });

          const scores: Record<string, number> = {};
          stopsData.forEach((stop) => {
            const storeVisits = visitsByStore[stop.store_id] || [];
            scores[stop.store_id] = calculateStoreScore({
              store: stop.store,
              visits: storeVisits,
              preference: null,
              distanceMiles: stop.drive_miles_from_previous ?? 0,
              chainPriority: 5,
            }).total;
          });
          setStoreScores(scores);
        }
      }
    }
    setLoading(false);
  }

  async function handleSearchStore() {
    if (!searchQuery.trim() || !trip) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const response = await fetch('/api/stores/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, lat: trip.start_lat, lng: trip.start_lng }),
      });
      const data = await response.json();
      // Hide stores that are already in the route
      const existingIds = new Set(stops.map((s) => s.store_id));
      setSearchResults(
        (data.results || []).filter((r: FindResult) => !r.id || !existingIds.has(r.id))
      );
    } finally {
      setSearching(false);
    }
  }

  async function handleAddStore(result: FindResult) {
    setAddingStoreId(result.google_place_id);
    try {
      // 1) Persist the store to get a stable id
      const upsertRes = await fetch('/api/stores/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      const upsertData = await upsertRes.json();
      if (!upsertData.store_id) return;

      // 2) Append it to this trip (works while planning or active)
      const addRes = await fetch('/api/route/add-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: id, store_id: upsertData.store_id }),
      });
      const addData = await addRes.json();

      if (!addRes.ok) {
        alert(addData.error || 'No se pudo agregar la tienda');
        return;
      }

      if (addData.stop) {
        setStops((prev) => [...prev, addData.stop as StopWithStore]);
        setSearchResults((prev) => prev.filter((r) => r.google_place_id !== result.google_place_id));
        // Refresh trip totals shown in the logistics strip
        const supabase = createClient();
        const { data: updatedTrip } = await supabase
          .from('sourcing_trips')
          .select('*')
          .eq('id', id)
          .single();
        if (updatedTrip) setTrip(updatedTrip);
      }
    } finally {
      setAddingStoreId(null);
    }
  }

  async function addExpense() {
    const amount = parseFloat(expAmount);
    const category = expCategories.find((c) => c.id === expCategoryId);
    if (!category || !amount || amount <= 0) return;

    setAddingExpense(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAddingExpense(false);
      return;
    }

    const { data } = await supabase
      .from('trip_expenses')
      .insert({
        user_id: user.id,
        trip_id: id,
        category_id: category.id,
        category_name: category.name,
        amount,
      })
      .select('id, category_name, amount, notes')
      .single();

    if (data) {
      setExpenses((prev) => [...prev, data]);
      setExpAmount('');
    }
    setAddingExpense(false);
  }

  async function deleteExpense(expenseId: string) {
    const supabase = createClient();
    await supabase.from('trip_expenses').delete().eq('id', expenseId);
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
  }

  async function openProducts() {
    setShowProducts(true);
    if (tripProducts !== null) return; // already loaded

    setLoadingProducts(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('found_products')
      .select('product_name, upc, notes, quantity_bought, buy_cost, estimated_profit, store:stores(name)')
      .eq('trip_id', id);

    const grouped = new Map<string, GroupedProduct>();
    for (const row of data ?? []) {
      const r = row as unknown as {
        product_name: string;
        upc: string | null;
        notes: string | null;
        quantity_bought: number | null;
        buy_cost: number | null;
        estimated_profit: number | null;
        store: { name: string } | null;
      };
      const code = r.upc || r.notes || r.product_name;
      const qty = r.quantity_bought ?? 0;
      const storeName = r.store?.name ?? '';

      const existing = grouped.get(code);
      if (existing) {
        existing.quantity += qty;
        existing.totalCost += (r.buy_cost ?? 0) * qty;
        existing.totalProfit += r.estimated_profit ?? 0;
        if (storeName && !existing.stores.includes(storeName)) existing.stores.push(storeName);
      } else {
        grouped.set(code, {
          code,
          product_name: r.product_name,
          quantity: qty,
          totalCost: (r.buy_cost ?? 0) * qty,
          totalProfit: r.estimated_profit ?? 0,
          stores: storeName ? [storeName] : [],
        });
      }
    }

    setTripProducts(Array.from(grouped.values()).sort((a, b) => b.quantity - a.quantity));
    setLoadingProducts(false);
  }

  async function updateStopStatus(stopId: string, status: StopStatus) {
    const supabase = createClient();

    const updates: Record<string, unknown> = { status };
    if (status === 'arrived') updates.actual_arrival_at = new Date().toISOString();
    if (status === 'completed') updates.actual_departure_at = new Date().toISOString();

    await supabase.from('trip_stops').update(updates).eq('id', stopId);

    setStops((prev) =>
      prev.map((s) => (s.id === stopId ? { ...s, status, ...updates } : s))
    );
  }

  async function startTrip() {
    const supabase = createClient();
    await supabase
      .from('sourcing_trips')
      .update({ status: 'active' })
      .eq('id', id);
    setTrip((prev) => (prev ? { ...prev, status: 'active' } : prev));
  }

  function moveStop(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    setStops((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      // Keep the visible numbering in sync with the new order
      return next.map((s, i) => ({ ...s, stop_order: i + 1 }));
    });
    setOrderChanged(true);
  }

  async function saveOrder() {
    if (!trip) return;
    setSavingOrder(true);

    try {
      const response = await fetch('/api/route/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: id,
          name: trip.name,
          trip_date: trip.trip_date,
          start_address: trip.start_address,
          start_lat: trip.start_lat,
          start_lng: trip.start_lng,
          end_address: trip.end_address,
          end_lat: trip.end_lat,
          end_lng: trip.end_lng,
          avoid_tolls: trip.avoid_tolls,
          avoid_highways: trip.avoid_highways,
          default_store_duration_minutes: trip.default_store_duration_minutes,
          stops: stops.map((s) => ({
            store_id: s.store_id,
            planned_duration_minutes: s.planned_duration_minutes,
          })),
        }),
      });

      if (response.ok) {
        setOrderChanged(false);
        await loadTrip();
      }
    } finally {
      setSavingOrder(false);
    }
  }

  function toggleStopRemoval(stopId: string) {
    setPendingRemovalIds((prev) => {
      const next = new Set(prev);
      if (next.has(stopId)) {
        next.delete(stopId);
      } else {
        next.add(stopId);
      }
      return next;
    });
  }

  async function updateRoute() {
    if (!trip || pendingRemovalIds.size === 0) return;
    setUpdatingRoute(true);

    try {
      const response = await fetch('/api/route/remove-stops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: id, stop_ids: [...pendingRemovalIds] }),
      });

      if (response.ok) {
        const supabase = createClient();
        const { data: updatedTrip } = await supabase
          .from('sourcing_trips')
          .select('*')
          .eq('id', id)
          .single();

        if (updatedTrip) setTrip(updatedTrip);

        setStops((prev) => prev.filter((s) => !pendingRemovalIds.has(s.id)));
        setPendingRemovalIds(new Set());
      }
    } finally {
      setUpdatingRoute(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <Header title="Cargando..." showBack />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell>
        <Header title="Ruta no encontrada" showBack />
        <div className="p-4 text-center text-text-muted">Esta ruta no existe.</div>
      </AppShell>
    );
  }

  const activeStopIndex = stops.findIndex(
    (s) => s.status === 'pending' || s.status === 'on_the_way' || s.status === 'arrived'
  );

  const completedStops = stops.filter((s) => s.status === 'completed').length;
  const allDone =
    stops.length > 0 &&
    (completedStops === stops.length ||
      stops.every((s) => s.status === 'completed' || s.status === 'skipped'));

  const totalItemsBought = stops.reduce((sum, s) => sum + (s.total_items_bought || 0), 0);
  const totalSpent = stops.reduce((sum, s) => sum + (s.total_spent || 0), 0);
  const totalProfit = stops.reduce((sum, s) => sum + (s.estimated_profit || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const realProfit = totalProfit - totalExpenses;
  const roiPercent = totalSpent > 0 ? Math.round((realProfit / totalSpent) * 100) : 0;
  const progressPct = stops.length > 0 ? Math.round((completedStops / stops.length) * 100) : 0;

  const statusLabel =
    trip.status === 'planning'
      ? 'Planeando'
      : trip.status === 'active'
        ? 'En ruta'
        : trip.status === 'completed'
          ? 'Completada'
          : 'Cancelada';

  return (
    <AppShell>
      <Header
        title={trip.name || trip.selected_chains?.slice(0, 2).join(', ') || 'Ruta'}
        showBack
        action={
          allDone ? (
            <Link href={`/trip/${id}/report`}>
              <Button size="sm" variant="secondary">
                Reporte
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="space-y-4 p-4 md:p-0">
        {/* Hero: progress + status */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 text-white shadow-xl shadow-indigo-500/25">
          <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 right-20 h-52 w-52 rounded-full bg-fuchsia-400/20 blur-3xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
                {statusLabel}
              </span>
              <p className="mt-2 text-sm text-indigo-100">
                {new Date(trip.trip_date).toLocaleDateString('es-CO', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              <p className="mt-1 text-lg font-extrabold leading-tight">
                {completedStops}/{stops.length} tiendas completadas
              </p>
            </div>
            <button
              onClick={openProducts}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold backdrop-blur-sm transition-colors hover:bg-white/25"
            >
              <ShoppingBag size={14} />
              Productos
            </button>
          </div>

          <div className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className={`h-full rounded-full transition-all ${allDone ? 'bg-emerald-300' : 'bg-white'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Money KPIs — the ones that matter while sourcing */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <Card className="!rounded-2xl !p-3 text-center">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20">
              <Package size={16} />
            </div>
            <p className="mt-1.5 text-lg font-extrabold leading-tight">{totalItemsBought}</p>
            <p className="text-[11px] text-text-muted">Artículos</p>
          </Card>
          <Card className="!rounded-2xl !p-3 text-center">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20">
              <DollarSign size={16} />
            </div>
            <p className="mt-1.5 text-lg font-extrabold leading-tight">
              ${totalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">Gastado</p>
          </Card>
          <Card className="!rounded-2xl !p-3 text-center">
            <div
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md ${
                realProfit >= 0
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20'
                  : 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/20'
              }`}
            >
              <TrendingUp size={16} />
            </div>
            <p
              className={`mt-1.5 text-lg font-extrabold leading-tight ${realProfit >= 0 ? 'text-emerald-600' : 'text-danger'}`}
            >
              ${realProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">
              Utilidad Real{roiPercent !== 0 ? ` · ${roiPercent}%` : ''}
            </p>
          </Card>
        </div>

        {/* Time / logistics strip */}
        <Card className="!rounded-2xl !p-3">
          <div className="grid grid-cols-4 divide-x divide-border text-center">
            <div className="px-1">
              <StoreIcon size={13} className="mx-auto text-indigo-500" />
              <p className="mt-1 text-sm font-bold leading-tight">{stops.length}</p>
              <p className="text-[10px] text-text-muted">Tiendas</p>
            </div>
            <div className="px-1">
              <Clock size={13} className="mx-auto text-indigo-500" />
              <p className="mt-1 text-sm font-bold leading-tight">
                {trip.total_store_minutes ? formatDuration(trip.total_store_minutes) : '--'}
              </p>
              <p className="text-[10px] text-text-muted">En tiendas</p>
            </div>
            <div className="px-1">
              <Car size={13} className="mx-auto text-indigo-500" />
              <p className="mt-1 text-sm font-bold leading-tight">
                {trip.total_drive_minutes ? formatDuration(trip.total_drive_minutes) : '--'}
              </p>
              <p className="text-[10px] text-text-muted">Manejando</p>
            </div>
            <div className="px-1">
              <Clock size={13} className="mx-auto text-indigo-500" />
              <p className="mt-1 text-sm font-bold leading-tight">
                {trip.total_drive_minutes && trip.total_store_minutes
                  ? formatDuration(trip.total_drive_minutes + trip.total_store_minutes)
                  : '--'}
              </p>
              <p className="text-[10px] text-text-muted">Total</p>
            </div>
          </div>
        </Card>

        {/* Route expenses — subtracted from product profit for real profit */}
        <Card className="!rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Wallet size={16} />
              </span>
              <p className="text-sm font-bold">Gastos de Ruta</p>
            </div>
            {totalExpenses > 0 && (
              <span className="text-sm font-bold text-danger">
                −${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>

          {expenses.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {expenses.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2 text-sm"
                >
                  <span className="font-medium">{exp.category_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-danger">
                      −${exp.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => deleteExpense(exp.id)}
                      className="text-text-muted hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {expCategories.length === 0 ? (
            <p className="mt-3 text-xs text-text-muted">
              No tienes cuentas contables.{' '}
              <Link href="/profile" className="font-medium text-primary hover:underline">
                Créalas en tu perfil
              </Link>{' '}
              (Gasolina, Peajes, Hotel...).
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <select
                value={expCategoryId}
                onChange={(e) => setExpCategoryId(e.target.value)}
                className="h-11 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {expCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="$0.00"
                className="!w-24 shrink-0"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addExpense}
                loading={addingExpense}
                disabled={!expAmount || parseFloat(expAmount) <= 0}
                className="h-11 shrink-0 gap-1"
              >
                <Plus size={15} />
              </Button>
            </div>
          )}

          {(totalExpenses > 0 || totalProfit > 0) && (
            <div className="mt-3 space-y-1 rounded-xl border border-border p-3 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Utilidad productos</span>
                <span>${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Gastos de ruta</span>
                <span className="text-danger">
                  −${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <span>Utilidad Real</span>
                <span className={realProfit >= 0 ? 'text-emerald-600' : 'text-danger'}>
                  ${realProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Route map - full width */}
        {stops.length > 0 && (
          <Card padding={false} className="!rounded-2xl overflow-hidden">
            <TripRouteMap
              startLat={trip.start_lat}
              startLng={trip.start_lng}
              endLat={trip.end_lat}
              endLng={trip.end_lng}
              stops={stops}
              routePolyline={trip.route_polyline}
            />
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {trip.status === 'planning' && (
            <Button size="lg" onClick={startTrip} className="gap-2">
              <Play size={18} />
              Iniciar Ruta
            </Button>
          )}

          {pendingRemovalIds.size > 0 && (
            <Button
              variant="secondary"
              onClick={updateRoute}
              loading={updatingRoute}
              className="gap-2"
            >
              <RefreshCw size={16} />
              Quitar {pendingRemovalIds.size} tienda{pendingRemovalIds.size > 1 ? 's' : ''}
            </Button>
          )}

          {orderChanged && (
            <Button variant="primary" onClick={saveOrder} loading={savingOrder} className="gap-2">
              <ListOrdered size={16} />
              Guardar nuevo orden
            </Button>
          )}
        </div>

        {/* Stops list - full width */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-600" />
              Paradas ({completedStops}/{stops.length})
            </h3>
            {trip.status !== 'completed' && trip.status !== 'cancelled' && (
              <Button
                size="sm"
                variant={showAddStore ? 'ghost' : 'outline'}
                onClick={() => setShowAddStore((v) => !v)}
                className="gap-1.5"
              >
                {showAddStore ? <X size={15} /> : <Plus size={15} />}
                {showAddStore ? 'Cerrar' : 'Agregar tienda'}
              </Button>
            )}
          </div>

          {/* Add-a-store search panel */}
          {showAddStore && trip.status !== 'completed' && trip.status !== 'cancelled' && (
            <Card className="!rounded-2xl mb-3 border-indigo-200 bg-indigo-50/40">
              <p className="text-sm font-semibold">Agregar una tienda a esta ruta</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Busca una tienda cercana y agrégala al final de la ruta.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchStore()}
                  placeholder="Ej: Ross Kissimmee, Walmart Orlando..."
                  className="flex-1"
                />
                <Button onClick={handleSearchStore} loading={searching} className="shrink-0 px-3">
                  <Search size={18} />
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {searchResults.map((result) => (
                    <div
                      key={result.google_place_id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                          <MapPin size={15} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{result.name}</p>
                          <p className="truncate text-xs text-text-muted">{result.address}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddStore(result)}
                        loading={addingStoreId === result.google_place_id}
                        className="shrink-0 gap-1"
                      >
                        <Plus size={14} />
                        Agregar
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchResults.length === 0 && searchQuery.trim() && (
                <p className="mt-3 text-xs text-text-muted">
                  Escribe el nombre de la tienda y presiona buscar.
                </p>
              )}
            </Card>
          )}

          {stops.length === 0 ? (
            <Card className="!rounded-2xl py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100">
                <StoreIcon size={22} className="text-indigo-500" />
              </div>
              <p className="font-semibold">Esta ruta no tiene tiendas todavía</p>
              <p className="mt-1 text-sm text-text-muted">
                Usa «Agregar tienda» para añadir la primera parada.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {stops.map((stop, index) => {
                const isNext = index === activeStopIndex && trip.status === 'active';
                const isPendingRemoval = pendingRemovalIds.has(stop.id);
                return (
                  <Card
                    key={stop.id}
                    className={`!rounded-2xl transition-all ${isNext ? 'ring-2 ring-primary' : ''} ${
                      isPendingRemoval ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          stop.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : stop.status === 'skipped'
                              ? 'bg-gray-100 text-gray-500'
                              : isNext
                                ? 'bg-brand-gradient text-white shadow-md shadow-indigo-500/25'
                                : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {stop.status === 'completed' ? <CheckCircle2 size={16} /> : stop.stop_order}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{stop.store.name}</p>
                          <ScoreBadge score={storeScores[stop.store_id] ?? stop.score} />
                          {isPendingRemoval && (
                            <span className="text-xs font-medium text-danger">Se quitará</span>
                          )}
                        </div>
                        <p className="truncate text-xs text-text-muted">{stop.store.address}</p>

                        <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
                          {stop.drive_minutes_from_previous != null && (
                            <span>{stop.drive_minutes_from_previous} min manejo</span>
                          )}
                          {stop.drive_miles_from_previous != null && (
                            <span>{stop.drive_miles_from_previous} mi</span>
                          )}
                          <span>{stop.planned_duration_minutes} min en tienda</span>
                        </div>

                        {(stop.total_items_bought > 0 || stop.total_spent > 0) && (
                          <div className="mt-1 flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1 text-text-secondary">
                              <Package size={12} />
                              {stop.total_items_bought} artículos
                            </span>
                            <span className="flex items-center gap-1 font-medium text-emerald-600">
                              <DollarSign size={12} />
                              ${stop.total_spent.toLocaleString()}
                            </span>
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-2">
                          <StopStatusBadge status={stop.status} />
                        </div>

                        {(isNext || stop.status === 'arrived') && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {stop.status === 'pending' && (
                              <>
                                <a
                                  href={buildWazeUrl(stop.store.lat, stop.store.lng)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    className="gap-1"
                                    onClick={() => updateStopStatus(stop.id, 'on_the_way')}
                                  >
                                    <Navigation size={14} />
                                    Waze
                                  </Button>
                                </a>
                                <a
                                  href={buildGoogleMapsStopUrl(stop.store.lat, stop.store.lng)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Button size="sm" variant="outline" className="gap-1">
                                    <ExternalLink size={14} />
                                    Maps
                                  </Button>
                                </a>
                              </>
                            )}
                            {(stop.status === 'pending' || stop.status === 'on_the_way') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateStopStatus(stop.id, 'arrived')}
                              >
                                Ya llegué
                              </Button>
                            )}
                            {stop.status === 'arrived' && (
                              <Link href={`/trip/${id}/stop/${stop.id}`}>
                                <Button size="sm" variant="secondary" className="gap-1">
                                  <CheckCircle2 size={14} />
                                  Completar visita
                                </Button>
                              </Link>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStopStatus(stop.id, 'skipped')}
                              className="gap-1 text-text-muted"
                            >
                              <SkipForward size={14} />
                              Saltar
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {trip.status === 'planning' && (
                          <div className="flex flex-col">
                            <button
                              onClick={() => moveStop(index, -1)}
                              disabled={index === 0}
                              className="rounded p-0.5 text-text-muted transition-colors hover:text-primary disabled:opacity-30"
                              title="Subir"
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              onClick={() => moveStop(index, 1)}
                              disabled={index === stops.length - 1}
                              className="rounded p-0.5 text-text-muted transition-colors hover:text-primary disabled:opacity-30"
                              title="Bajar"
                            >
                              <ChevronDown size={16} />
                            </button>
                          </div>
                        )}
                        {trip.status === 'planning' && (
                          <button
                            onClick={() => toggleStopRemoval(stop.id)}
                            className={`rounded-lg p-1.5 transition-colors ${
                              isPendingRemoval
                                ? 'text-danger hover:bg-surface-secondary'
                                : 'text-text-muted hover:bg-red-50 hover:text-danger'
                            }`}
                            title={isPendingRemoval ? 'Deshacer' : 'Quitar tienda'}
                          >
                            {isPendingRemoval ? <Undo2 size={16} /> : <Trash2 size={16} />}
                          </button>
                        )}
                        <Link href={`/trip/${id}/stop/${stop.id}`}>
                          <ChevronRight size={16} className="text-text-muted" />
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Products bought during this route — grouped by product code */}
      {showProducts && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={() => setShowProducts(false)}
        >
          <div
            className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-surface sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="font-semibold">Productos de la ruta</p>
                <p className="text-xs text-text-muted">
                  Agrupados por código · toca uno para buscarlo en Google
                </p>
              </div>
              <button
                onClick={() => setShowProducts(false)}
                className="rounded-full p-1.5 text-text-muted hover:bg-surface-secondary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loadingProducts ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={24} className="animate-spin text-primary" />
                </div>
              ) : !tripProducts || tripProducts.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-muted">
                  Aún no has comprado productos en esta ruta.
                </p>
              ) : (
                <div className="space-y-2">
                  {tripProducts.map((p) => (
                    <a
                      key={p.code}
                      href={`https://www.google.com/search?q=${encodeURIComponent(p.code)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-indigo-50/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-primary">
                        {p.quantity}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.product_name}</p>
                        <p className="truncate text-xs text-text-muted">
                          {p.code}
                          {p.stores.length > 0 && ` · ${p.stores.join(', ')}`}
                        </p>
                        <div className="mt-0.5 flex items-center gap-3 text-xs">
                          <span className="text-text-secondary">COGS ${p.totalCost.toFixed(2)}</span>
                          <span
                            className={`font-medium ${p.totalProfit >= 0 ? 'text-emerald-600' : 'text-danger'}`}
                          >
                            Utilidad ${p.totalProfit.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <Search size={15} className="shrink-0 text-text-muted" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {tripProducts && tripProducts.length > 0 && (
              <div className="border-t border-border px-4 py-3 text-center text-xs text-text-muted">
                {tripProducts.reduce((s, p) => s + p.quantity, 0)} unidades ·{' '}
                {tripProducts.length} producto{tripProducts.length !== 1 ? 's' : ''} distintos
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
