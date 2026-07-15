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
import type { SourcingTrip, TripStop, Store, StopStatus } from '@/types/database';
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
} from 'lucide-react';

interface StopWithStore extends TripStop {
  store: Store;
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

  useEffect(() => {
    loadTrip();
  }, [id]);

  async function loadTrip() {
    const supabase = createClient();

    const [{ data: tripData }, { data: stopsData }] = await Promise.all([
      supabase.from('sourcing_trips').select('*').eq('id', id).single(),
      supabase
        .from('trip_stops')
        .select('*, store:stores(*)')
        .eq('trip_id', id)
        .order('stop_order', { ascending: true }),
    ]);

    if (tripData) setTrip(tripData);
    if (stopsData) setStops(stopsData as StopWithStore[]);
    setLoading(false);
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
        {/* Trip KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Card className="text-center">
            <div className="flex items-center justify-center gap-1 text-text-muted">
              <StoreIcon size={14} />
            </div>
            <p className="mt-1 text-lg font-bold">{stops.length}</p>
            <p className="text-xs text-text-muted">Total Stores</p>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center gap-1 text-text-muted">
              <Clock size={14} />
            </div>
            <p className="mt-1 text-lg font-bold">
              {trip.total_store_minutes ? formatDuration(trip.total_store_minutes) : '--'}
            </p>
            <p className="text-xs text-text-muted">Time in Stores</p>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center gap-1 text-text-muted">
              <Car size={14} />
            </div>
            <p className="mt-1 text-lg font-bold">
              {trip.total_drive_minutes ? formatDuration(trip.total_drive_minutes) : '--'}
            </p>
            <p className="text-xs text-text-muted">Driving Time</p>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center gap-1 text-text-muted">
              <Clock size={14} />
            </div>
            <p className="mt-1 text-lg font-bold">
              {trip.total_drive_minutes && trip.total_store_minutes
                ? formatDuration(trip.total_drive_minutes + trip.total_store_minutes)
                : '--'}
            </p>
            <p className="text-xs text-text-muted">Total Time</p>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center gap-1 text-text-muted">
              <Package size={14} />
            </div>
            <p className="mt-1 text-lg font-bold">{totalItemsBought}</p>
            <p className="text-xs text-text-muted">Items Bought</p>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center gap-1 text-text-muted">
              <DollarSign size={14} />
            </div>
            <p className="mt-1 text-lg font-bold text-secondary">
              ${totalSpent.toLocaleString()}
            </p>
            <p className="text-xs text-text-muted">Total Spent</p>
          </Card>
        </div>

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
                        <ScoreBadge score={stop.score} />
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
    </AppShell>
  );
}
