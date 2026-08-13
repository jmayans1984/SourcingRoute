'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardTitle, IconChip, SectionTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StopStatusBadge, ScoreBadge, TripStatusBadge } from '@/components/ui/badge';
import { TripRouteMap } from '@/components/maps/trip-route-map';
import { toast } from '@/components/ui/toast';
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
      const results = (data.results || []).filter(
        (r: FindResult) => !r.id || !existingIds.has(r.id)
      );
      setSearchResults(results);
      if (results.length === 0) toast.info('No se encontraron tiendas con ese nombre');
    } catch {
      toast.error('No se pudo buscar. Revisa tu conexión.');
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
      if (!upsertData.store_id) {
        toast.error('No se pudo guardar la tienda');
        return;
      }

      // 2) Append it to this trip (works while planning or active)
      const addRes = await fetch('/api/route/add-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: id, store_id: upsertData.store_id }),
      });
      const addData = await addRes.json();

      if (!addRes.ok) {
        toast.error(addData.error || 'No se pudo agregar la tienda');
        return;
      }

      if (addData.stop) {
        setStops((prev) => [...prev, addData.stop as StopWithStore]);
        setSearchResults((prev) => prev.filter((r) => r.google_place_id !== result.google_place_id));
        toast.success(`${result.name} agregada a la ruta`);
        // Refresh trip totals shown in the logistics strip
        const supabase = createClient();
        const { data: updatedTrip } = await supabase
          .from('sourcing_trips')
          .select('*')
          .eq('id', id)
          .single();
        if (updatedTrip) setTrip(updatedTrip);
      }
    } catch {
      toast.error('No se pudo agregar la tienda');
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
      toast.success(`Gasto de ${category.name} agregado`);
    }
    setAddingExpense(false);
  }

  async function deleteExpense(expenseId: string) {
    const supabase = createClient();
    await supabase.from('trip_expenses').delete().eq('id', expenseId);
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    toast.info('Gasto eliminado');
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
    toast.success('¡Ruta iniciada! Buen sourcing.');
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
        toast.success('Nuevo orden guardado');
      } else {
        toast.error('No se pudo guardar el orden');
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

        const removed = pendingRemovalIds.size;
        setStops((prev) => prev.filter((s) => !pendingRemovalIds.has(s.id)));
        setPendingRemovalIds(new Set());
        toast.success(`${removed} tienda${removed > 1 ? 's' : ''} quitada${removed > 1 ? 's' : ''}`);
      } else {
        toast.error('No se pudieron quitar las tiendas');
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

  return (
    <AppShell>
      <Header
        title={trip.name || trip.selected_chains?.slice(0, 2).join(', ') || 'Ruta'}
        subtitle={new Date(trip.trip_date).toLocaleDateString('es-CO', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
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
        {/* Progress */}
        <Card className="bg-text text-surface">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TripStatusBadge status={trip.status} />
              <span className="text-sm font-semibold text-surface/75 tabular">
                {completedStops}/{stops.length} tiendas
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={openProducts} className="gap-1.5 border-white/20 bg-white/10 text-surface hover:bg-white/15">
              <ShoppingBag size={15} />
              Productos
            </Button>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className={`h-full rounded-full ${allDone ? 'bg-success' : 'bg-primary-light'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </Card>

        {/* Money KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="text-center">
            <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <Package size={17} />
            </span>
            <p className="mt-2 text-lg font-semibold tabular">{totalItemsBought}</p>
            <p className="text-[11px] text-text-muted">Artículos</p>
          </Card>
          <Card className="text-center">
            <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <DollarSign size={17} />
            </span>
            <p className="mt-2 text-lg font-semibold tabular">
              ${totalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">Gastado</p>
          </Card>
          <Card className="text-center">
            <span
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md ${
                realProfit >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
              }`}
            >
              <TrendingUp size={17} />
            </span>
            <p
              className={`mt-2 text-lg font-semibold tabular ${realProfit >= 0 ? 'text-success' : 'text-danger'}`}
            >
              ${realProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">
              Utilidad{roiPercent !== 0 ? ` · ${roiPercent}%` : ''}
            </p>
          </Card>
        </div>

        {/* Logistics strip */}
        <Card className="!p-3">
          <div className="grid grid-cols-4 divide-x divide-border text-center">
            <div className="px-1">
              <StoreIcon size={14} className="mx-auto text-text-muted" />
              <p className="mt-1 text-sm font-semibold tabular">{stops.length}</p>
              <p className="text-[10px] text-text-muted">Tiendas</p>
            </div>
            <div className="px-1">
              <Clock size={14} className="mx-auto text-text-muted" />
              <p className="mt-1 text-sm font-semibold tabular">
                {trip.total_store_minutes ? formatDuration(trip.total_store_minutes) : '--'}
              </p>
              <p className="text-[10px] text-text-muted">En tiendas</p>
            </div>
            <div className="px-1">
              <Car size={14} className="mx-auto text-text-muted" />
              <p className="mt-1 text-sm font-semibold tabular">
                {trip.total_drive_minutes ? formatDuration(trip.total_drive_minutes) : '--'}
              </p>
              <p className="text-[10px] text-text-muted">Manejando</p>
            </div>
            <div className="px-1">
              <Clock size={14} className="mx-auto text-text-muted" />
              <p className="mt-1 text-sm font-semibold tabular">
                {trip.total_drive_minutes && trip.total_store_minutes
                  ? formatDuration(trip.total_drive_minutes + trip.total_store_minutes)
                  : '--'}
              </p>
              <p className="text-[10px] text-text-muted">Total</p>
            </div>
          </div>
        </Card>

        {/* Route expenses */}
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconChip tone="warning">
                <Wallet size={16} />
              </IconChip>
              <CardTitle>Gastos de Ruta</CardTitle>
            </div>
            {totalExpenses > 0 && (
              <span className="text-sm font-semibold text-danger tabular">
                −${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>

          {expenses.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {expenses.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between rounded-xl bg-surface-secondary px-3 py-2 text-sm"
                >
                  <span className="font-medium">{exp.category_name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-danger tabular">
                      −${exp.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => deleteExpense(exp.id)}
                      aria-label="Eliminar gasto"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {expCategories.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">
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
                className="h-11 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              >
                {expCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="$0.00"
                className="h-11 w-24 shrink-0 rounded-xl border border-border bg-surface px-3 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              <Button
                onClick={addExpense}
                loading={addingExpense}
                disabled={!expAmount || parseFloat(expAmount) <= 0}
                className="shrink-0 !px-3.5"
                aria-label="Agregar gasto"
              >
                <Plus size={17} />
              </Button>
            </div>
          )}

          {(totalExpenses > 0 || totalProfit > 0) && (
            <div className="mt-3 space-y-1.5 rounded-xl border border-border p-3 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Utilidad productos</span>
                <span className="tabular">
                  ${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Gastos de ruta</span>
                <span className="text-danger tabular">
                  −${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                <span>Utilidad Real</span>
                <span className={`tabular ${realProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                  ${realProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Route map */}
        {stops.length > 0 && (
          <Card padding={false} className="overflow-hidden">
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
            <Button variant="secondary" onClick={updateRoute} loading={updatingRoute} className="gap-2">
              <RefreshCw size={16} />
              Quitar {pendingRemovalIds.size} tienda{pendingRemovalIds.size > 1 ? 's' : ''}
            </Button>
          )}

          {orderChanged && (
            <Button onClick={saveOrder} loading={savingOrder} className="gap-2">
              <ListOrdered size={16} />
              Guardar nuevo orden
            </Button>
          )}
        </div>

        {/* Stops */}
        <SectionTitle
          action={
            trip.status !== 'completed' && trip.status !== 'cancelled' ? (
              <Button
                size="sm"
                variant={showAddStore ? 'ghost' : 'outline'}
                onClick={() => setShowAddStore((v) => !v)}
                className="gap-1.5"
              >
                {showAddStore ? <X size={15} /> : <Plus size={15} />}
                {showAddStore ? 'Cerrar' : 'Agregar tienda'}
              </Button>
            ) : null
          }
        >
          Paradas ({completedStops}/{stops.length})
        </SectionTitle>

        {/* Add-a-store panel */}
        {showAddStore && trip.status !== 'completed' && trip.status !== 'cancelled' && (
          <Card className="border-primary/30 bg-primary/[0.03]">
            <p className="text-sm font-semibold">Agregar una tienda a esta ruta</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Busca una tienda cercana y agrégala al final de la ruta.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchStore()}
                placeholder="Ej: Ross Kissimmee..."
                className="flex-1"
              />
              <Button onClick={handleSearchStore} loading={searching} className="shrink-0 !px-3.5">
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
                      <IconChip tone="primary">
                        <MapPin size={15} />
                      </IconChip>
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
          </Card>
        )}

        {stops.length === 0 ? (
          <Card className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <StoreIcon size={22} className="text-primary" />
            </div>
            <p className="font-semibold">Esta ruta no tiene tiendas todavía</p>
            <p className="mt-1 text-sm text-text-muted">
              Usa «Agregar tienda» para añadir la primera parada.
            </p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {stops.map((stop, index) => {
              const isNext = index === activeStopIndex && trip.status === 'active';
              const isPendingRemoval = pendingRemovalIds.has(stop.id);
              return (
                <Card
                  key={stop.id}
                  className={`${isNext ? 'ring-2 ring-primary' : ''} ${isPendingRemoval ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                        stop.status === 'completed'
                          ? 'bg-success/12 text-success'
                          : stop.status === 'skipped'
                            ? 'bg-surface-secondary text-text-muted'
                            : isNext
                              ? 'bg-primary text-white'
                              : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {stop.status === 'completed' ? <CheckCircle2 size={17} /> : stop.stop_order}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{stop.store.name}</p>
                        <ScoreBadge score={storeScores[stop.store_id] ?? stop.score} />
                        {isPendingRemoval && (
                          <span className="text-xs font-medium text-danger">Se quitará</span>
                        )}
                      </div>
                      <p className="truncate text-xs text-text-muted">{stop.store.address}</p>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-text-muted tabular">
                        {stop.drive_minutes_from_previous != null && (
                          <span>{stop.drive_minutes_from_previous} min manejo</span>
                        )}
                        {stop.drive_miles_from_previous != null && (
                          <span>{stop.drive_miles_from_previous} mi</span>
                        )}
                        <span>{stop.planned_duration_minutes} min en tienda</span>
                      </div>

                      {(stop.total_items_bought > 0 || stop.total_spent > 0) && (
                        <div className="mt-1.5 flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-text-secondary tabular">
                            <Package size={12} />
                            {stop.total_items_bought} artículos
                          </span>
                          <span className="flex items-center gap-1 font-medium text-success tabular">
                            <DollarSign size={12} />
                            ${stop.total_spent.toLocaleString()}
                          </span>
                        </div>
                      )}

                      <div className="mt-2">
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
                            className="gap-1"
                          >
                            <SkipForward size={14} />
                            Saltar
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {trip.status === 'planning' && (
                        <div className="flex flex-col">
                          <button
                            onClick={() => moveStop(index, -1)}
                            disabled={index === 0}
                            className="rounded p-1 text-text-muted transition-colors hover:text-primary disabled:opacity-30"
                            title="Subir"
                          >
                            <ChevronUp size={17} />
                          </button>
                          <button
                            onClick={() => moveStop(index, 1)}
                            disabled={index === stops.length - 1}
                            className="rounded p-1 text-text-muted transition-colors hover:text-primary disabled:opacity-30"
                            title="Bajar"
                          >
                            <ChevronDown size={17} />
                          </button>
                        </div>
                      )}
                      {trip.status === 'planning' && (
                        <button
                          onClick={() => toggleStopRemoval(stop.id)}
                          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                            isPendingRemoval
                              ? 'text-danger hover:bg-surface-secondary'
                              : 'text-text-muted hover:bg-danger/10 hover:text-danger'
                          }`}
                          title={isPendingRemoval ? 'Deshacer' : 'Quitar tienda'}
                        >
                          {isPendingRemoval ? <Undo2 size={17} /> : <Trash2 size={17} />}
                        </button>
                      )}
                      <Link
                        href={`/trip/${id}/stop/${stop.id}`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-secondary hover:text-text"
                        aria-label="Abrir parada"
                      >
                        <ChevronRight size={18} />
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Products modal */}
      {showProducts && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={() => setShowProducts(false)}
        >
          <div
            className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-border bg-surface sm:max-w-lg sm:rounded-2xl"
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
                aria-label="Cerrar"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-secondary hover:text-text"
              >
                <X size={19} />
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
                      className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-surface-secondary"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary tabular">
                        {p.quantity}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.product_name}</p>
                        <p className="truncate text-xs text-text-muted">
                          {p.code}
                          {p.stores.length > 0 && ` · ${p.stores.join(', ')}`}
                        </p>
                        <div className="mt-0.5 flex items-center gap-3 text-xs tabular">
                          <span className="text-text-secondary">COGS ${p.totalCost.toFixed(2)}</span>
                          <span
                            className={`font-medium ${p.totalProfit >= 0 ? 'text-success' : 'text-danger'}`}
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
              <div className="border-t border-border px-4 py-3 text-center text-xs text-text-muted tabular">
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
