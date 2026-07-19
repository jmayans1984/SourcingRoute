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
} from 'lucide-react';

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

  useEffect(() => {
    loadTrip();
  }, [id]);

  async function loadTrip() {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    const [{ data: tripData }, { data: stopsData }] = await Promise.all([
      supabase.from('sourcing_trips').select('*').eq('id', id).single(),
      supabase
        .from('trip_stops')
        .select('*, store:stores(*)')
        .eq('trip_id', id)
        .order('stop_order', { ascending: true }),
    ]);

    if (tripData) setTrip(tripData);
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
        <Header title="Loading..." showBack />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell>
        <Header title="Trip not found" showBack />
        <div className="p-4 text-center text-text-muted">This trip does not exist.</div>
      </AppShell>
    );
  }

  const activeStopIndex = stops.findIndex(
    (s) => s.status === 'pending' || s.status === 'on_the_way' || s.status === 'arrived'
  );

  const completedStops = stops.filter((s) => s.status === 'completed').length;
  const allDone = completedStops === stops.length || stops.every((s) => s.status === 'completed' || s.status === 'skipped');

  const totalItemsBought = stops.reduce((sum, s) => sum + (s.total_items_bought || 0), 0);
  const totalSpent = stops.reduce((sum, s) => sum + (s.total_spent || 0), 0);
  const totalProfit = stops.reduce((sum, s) => sum + (s.estimated_profit || 0), 0);
  const roiPercent = totalSpent > 0 ? Math.round((totalProfit / totalSpent) * 100) : 0;
  const progressPct = stops.length > 0 ? Math.round((completedStops / stops.length) * 100) : 0;

  return (
    <AppShell>
      <Header
        title={trip.name || trip.selected_chains?.slice(0, 2).join(', ') || 'Trip'}
        showBack
        action={
          allDone ? (
            <Link href={`/trip/${id}/report`}>
              <Button size="sm" variant="secondary">
                Report
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="space-y-4 p-4 md:p-0">
        {/* Progress + quick actions */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">
                  Progreso de la ruta
                </p>
                <span className="text-xs font-medium text-text-muted">
                  {completedStops}/{stops.length} tiendas
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                <div
                  className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={openProducts}
              className="shrink-0 gap-1.5"
            >
              <ShoppingBag size={14} />
              Productos
            </Button>
          </div>
        </Card>

        {/* Money KPIs — the ones that matter while sourcing */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <Card className="!p-3 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-primary">
              <Package size={15} />
            </div>
            <p className="mt-1.5 text-lg font-bold leading-tight">{totalItemsBought}</p>
            <p className="text-[11px] text-text-muted">Artículos</p>
          </Card>
          <Card className="!p-3 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-danger">
              <DollarSign size={15} />
            </div>
            <p className="mt-1.5 text-lg font-bold leading-tight">
              ${totalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">Gastado</p>
          </Card>
          <Card className="!p-3 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-green-600">
              <TrendingUp size={15} />
            </div>
            <p className="mt-1.5 text-lg font-bold leading-tight text-green-600">
              ${totalProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">
              Utilidad{roiPercent > 0 ? ` · ${roiPercent}% ROI` : ''}
            </p>
          </Card>
        </div>

        {/* Time / logistics strip */}
        <Card className="!p-3">
          <div className="grid grid-cols-4 divide-x divide-border text-center">
            <div className="px-1">
              <StoreIcon size={13} className="mx-auto text-text-muted" />
              <p className="mt-1 text-sm font-semibold leading-tight">{stops.length}</p>
              <p className="text-[10px] text-text-muted">Tiendas</p>
            </div>
            <div className="px-1">
              <Clock size={13} className="mx-auto text-text-muted" />
              <p className="mt-1 text-sm font-semibold leading-tight">
                {trip.total_store_minutes ? formatDuration(trip.total_store_minutes) : '--'}
              </p>
              <p className="text-[10px] text-text-muted">En tiendas</p>
            </div>
            <div className="px-1">
              <Car size={13} className="mx-auto text-text-muted" />
              <p className="mt-1 text-sm font-semibold leading-tight">
                {trip.total_drive_minutes ? formatDuration(trip.total_drive_minutes) : '--'}
              </p>
              <p className="text-[10px] text-text-muted">Manejando</p>
            </div>
            <div className="px-1">
              <Clock size={13} className="mx-auto text-text-muted" />
              <p className="mt-1 text-sm font-semibold leading-tight">
                {trip.total_drive_minutes && trip.total_store_minutes
                  ? formatDuration(trip.total_drive_minutes + trip.total_store_minutes)
                  : '--'}
              </p>
              <p className="text-[10px] text-text-muted">Total</p>
            </div>
          </div>
        </Card>

        {/* Route map - full width */}
        {stops.length > 0 && (
          <Card padding={false}>
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
        <div className="flex gap-2 flex-wrap items-center">
          {trip.status === 'planning' && (
            <Button size="lg" onClick={startTrip} className="gap-2">
              <Play size={18} />
              Start Route
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
              Actualizar ({pendingRemovalIds.size} removal{pendingRemovalIds.size > 1 ? 's' : ''})
            </Button>
          )}

          {orderChanged && (
            <Button
              variant="primary"
              onClick={saveOrder}
              loading={savingOrder}
              className="gap-2"
            >
              <ListOrdered size={16} />
              Guardar nuevo orden
            </Button>
          )}
        </div>

        {/* Stops list - full width */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-secondary uppercase tracking-wide">
            Stops ({completedStops}/{stops.length})
          </h3>
          <div className="space-y-2">
            {stops.map((stop, index) => {
              const isNext = index === activeStopIndex && trip.status === 'active';
              const isPendingRemoval = pendingRemovalIds.has(stop.id);
              return (
                <Card
                  key={stop.id}
                  className={`transition-all ${isNext ? 'ring-2 ring-primary' : ''} ${
                    isPendingRemoval ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        stop.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : stop.status === 'skipped'
                            ? 'bg-gray-100 text-gray-500'
                            : isNext
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {stop.status === 'completed' ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        stop.stop_order
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{stop.store.name}</p>
                        <ScoreBadge score={storeScores[stop.store_id] ?? stop.score} />
                        {isPendingRemoval && (
                          <span className="text-xs font-medium text-danger">Marked for removal</span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted truncate">{stop.store.address}</p>

                      <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
                        {stop.drive_minutes_from_previous != null && (
                          <span>{stop.drive_minutes_from_previous} min drive</span>
                        )}
                        {stop.drive_miles_from_previous != null && (
                          <span>{stop.drive_miles_from_previous} mi</span>
                        )}
                        <span>{stop.planned_duration_minutes} min in store</span>
                      </div>

                      {(stop.total_items_bought > 0 || stop.total_spent > 0) && (
                        <div className="mt-1 flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-text-secondary">
                            <Package size={12} />
                            {stop.total_items_bought} items
                          </span>
                          <span className="flex items-center gap-1 font-medium text-secondary">
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
                              I&apos;m here
                            </Button>
                          )}
                          {stop.status === 'arrived' && (
                            <Link href={`/trip/${id}/stop/${stop.id}`}>
                              <Button size="sm" variant="secondary" className="gap-1">
                                <CheckCircle2 size={14} />
                                Complete Visit
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
                            Skip
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
                          title={isPendingRemoval ? 'Undo removal' : 'Delete store'}
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
                      className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-blue-50/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-primary text-sm">
                        {p.quantity}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.product_name}</p>
                        <p className="truncate text-xs text-text-muted">
                          {p.code}
                          {p.stores.length > 0 && ` · ${p.stores.join(', ')}`}
                        </p>
                        <div className="mt-0.5 flex items-center gap-3 text-xs">
                          <span className="text-text-secondary">
                            COGS ${p.totalCost.toFixed(2)}
                          </span>
                          <span className={`font-medium ${p.totalProfit >= 0 ? 'text-green-600' : 'text-danger'}`}>
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
