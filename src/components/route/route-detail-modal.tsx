'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { TripStatusBadge } from '@/components/ui/badge';
import { formatDistance, formatDuration } from '@/utils/geo';
import type { SourcingTrip, TripStop, Store } from '@/types/database';
import {
  X,
  MapPin,
  Clock,
  Store as StoreIcon,
  Package,
  DollarSign,
  Eye,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface StopWithStore extends TripStop {
  store: Store;
}

interface RouteDetailModalProps {
  trip: SourcingTrip;
  onClose: () => void;
}

export function RouteDetailModal({ trip, onClose }: RouteDetailModalProps) {
  const router = useRouter();
  const [stops, setStops] = useState<StopWithStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function loadStops() {
    const supabase = createClient();
    const { data } = await supabase
      .from('trip_stops')
      .select('*, store:stores(*)')
      .eq('trip_id', trip.id)
      .order('stop_order', { ascending: true });

    if (data) setStops(data as StopWithStore[]);
    setLoading(false);
  }

  const storesVisited = stops.filter((s) => s.status === 'completed').length;
  const itemsBought = stops.reduce((sum, s) => sum + (s.total_items_bought || 0), 0);
  const totalSpent = stops.reduce((sum, s) => sum + (s.total_spent || 0), 0);
  const timeWorked =
    (trip.total_drive_minutes || 0) + (trip.total_store_minutes || 0);
  const maxSpent = Math.max(...stops.map((s) => s.total_spent || 0), 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-start justify-between border-b border-border bg-surface p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">
                {trip.name || trip.selected_chains?.slice(0, 3).join(', ') || 'Untitled route'}
              </h2>
              <TripStatusBadge status={trip.status} />
            </div>
            <p className="text-sm text-text-muted">
              {new Date(trip.trip_date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* KPI grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-primary/5 p-3 text-center">
              <MapPin size={18} className="mx-auto text-primary" />
              <p className="mt-1 text-xl font-bold">
                {trip.total_distance_miles ? formatDistance(trip.total_distance_miles) : '--'}
              </p>
              <p className="text-xs text-text-muted">Distancia</p>
            </div>
            <div className="rounded-xl bg-secondary/5 p-3 text-center">
              <Clock size={18} className="mx-auto text-secondary" />
              <p className="mt-1 text-xl font-bold">
                {timeWorked > 0 ? formatDuration(timeWorked) : '--'}
              </p>
              <p className="text-xs text-text-muted">Tiempo</p>
            </div>
            <div className="rounded-xl bg-accent/5 p-3 text-center">
              <StoreIcon size={18} className="mx-auto text-accent" />
              <p className="mt-1 text-xl font-bold">
                {storesVisited}/{stops.length}
              </p>
              <p className="text-xs text-text-muted">Tiendas</p>
            </div>
            <div className="rounded-xl bg-primary/5 p-3 text-center">
              <Package size={18} className="mx-auto text-primary" />
              <p className="mt-1 text-xl font-bold">{itemsBought}</p>
              <p className="text-xs text-text-muted">Artículos</p>
            </div>
            <div className="col-span-2 rounded-xl bg-secondary/5 p-3 text-center">
              <DollarSign size={18} className="mx-auto text-secondary" />
              <p className="mt-1 text-xl font-bold text-secondary">
                ${totalSpent.toLocaleString()}
              </p>
              <p className="text-xs text-text-muted">Dinero Gastado</p>
            </div>
          </div>

          {/* Per-store spending breakdown */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-secondary uppercase tracking-wide">
              Gasto por Tienda
            </h3>
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : stops.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">No hay paradas registradas</p>
            ) : (
              <div className="space-y-2">
                {stops.map((stop) => {
                  const spent = stop.total_spent || 0;
                  const pct = (spent / maxSpent) * 100;
                  return (
                    <div key={stop.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {stop.stop_order}
                          </span>
                          <span className="truncate font-medium">{stop.store?.name || 'Store'}</span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="font-medium text-secondary">${spent.toLocaleString()}</span>
                          <span className="ml-1 text-xs text-text-muted">
                            · {stop.total_items_bought || 0} art.
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                        <div
                          className="h-full rounded-full bg-secondary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <button
            onClick={() => router.push(`/trip/${trip.id}`)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <Eye size={16} />
            Abrir Ruta Completa
          </button>
        </div>
      </div>
    </div>
  );
}
