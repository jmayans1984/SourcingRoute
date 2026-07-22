'use client';

import { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import Image from 'next/image';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RatingBadge, WifiBadge } from '@/components/ui/badge';
import { buildWazeUrl } from '@/utils/navigation';
import type { Store, StoreVisit, UserStorePreference } from '@/types/database';
import {
  Heart,
  Ban,
  Navigation,
  DollarSign,
  Star,
  Package,
} from 'lucide-react';

export default function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [store, setStore] = useState<Store | null>(null);
  const [visits, setVisits] = useState<StoreVisit[]>([]);
  const [preference, setPreference] = useState<UserStorePreference | null>(null);

  useEffect(() => {
    loadStore();
  }, [id]);

  async function loadStore() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: storeData }, { data: visitsData }, { data: prefData }] = await Promise.all([
      supabase.from('stores').select('*').eq('id', id).single(),
      supabase
        .from('store_visits')
        .select('*')
        .eq('user_id', user.id)
        .eq('store_id', id)
        .order('visited_at', { ascending: false }),
      supabase
        .from('user_store_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('store_id', id)
        .single(),
    ]);

    if (storeData) setStore(storeData);
    if (visitsData) setVisits(visitsData);
    if (prefData) setPreference(prefData);
  }

  async function toggleFavorite() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newFavorite = !preference?.is_favorite;

    if (preference) {
      await supabase
        .from('user_store_preferences')
        .update({ is_favorite: newFavorite })
        .eq('id', preference.id);
      setPreference({ ...preference, is_favorite: newFavorite });
    } else {
      const { data } = await supabase
        .from('user_store_preferences')
        .insert({
          user_id: user.id,
          store_id: id,
          is_favorite: true,
          is_blocked: false,
          custom_score_adjustment: 0,
        })
        .select()
        .single();
      if (data) setPreference(data);
    }
  }

  async function toggleBlocked() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newBlocked = !preference?.is_blocked;

    if (preference) {
      await supabase
        .from('user_store_preferences')
        .update({ is_blocked: newBlocked })
        .eq('id', preference.id);
      setPreference({ ...preference, is_blocked: newBlocked });
    } else {
      const { data } = await supabase
        .from('user_store_preferences')
        .insert({
          user_id: user.id,
          store_id: id,
          is_favorite: false,
          is_blocked: true,
          custom_score_adjustment: 0,
        })
        .select()
        .single();
      if (data) setPreference(data);
    }
  }

  if (!store) {
    return (
      <AppShell>
        <Header title="Cargando..." showBack />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  const avgRating = visits.length > 0
    ? visits.reduce((sum, v) => sum + v.rating, 0) / visits.length
    : null;
  const avgProfit = visits.length > 0
    ? visits.reduce((sum, v) => sum + v.estimated_profit, 0) / visits.length
    : 0;
  const totalProducts = visits.reduce((sum, v) => sum + v.products_found, 0);
  const latestSignal = visits.find((v) => v.wifi_signal)?.wifi_signal ?? null;
  const allReceipts = visits.flatMap((v) => v.receipt_photo_urls || []);

  return (
    <AppShell>
      <Header title={store.name} showBack />

      <div className="space-y-4 p-4 md:p-0">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 text-white shadow-xl shadow-indigo-500/25">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-extrabold">{store.name}</h2>
              <p className="text-sm text-indigo-100">{store.chain}</p>
              <p className="mt-1 text-sm text-indigo-100/80">{store.address}</p>
              {latestSignal && (
                <div className="mt-3">
                  <WifiBadge signal={latestSignal} />
                </div>
              )}
            </div>
            <a href={buildWazeUrl(store.lat, store.lng)} target="_blank" rel="noopener noreferrer">
              <button className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-indigo-700 shadow-md transition-colors hover:bg-blue-50">
                <Navigation size={15} />
                Ir
              </button>
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="!rounded-2xl text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20">
              <Star size={18} />
            </div>
            <p className="mt-1.5 text-lg font-extrabold">
              {avgRating ? avgRating.toFixed(1) : '--'}
            </p>
            <p className="text-xs text-text-muted">Calificación</p>
          </Card>
          <Card className="!rounded-2xl text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <DollarSign size={18} />
            </div>
            <p className="mt-1.5 text-lg font-extrabold">${avgProfit.toFixed(0)}</p>
            <p className="text-xs text-text-muted">Utilidad prom.</p>
          </Card>
          <Card className="!rounded-2xl text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20">
              <Package size={18} />
            </div>
            <p className="mt-1.5 text-lg font-extrabold">{totalProducts}</p>
            <p className="text-xs text-text-muted">Productos</p>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            fullWidth
            variant={preference?.is_favorite ? 'danger' : 'outline'}
            onClick={toggleFavorite}
            className="gap-2"
          >
            <Heart size={16} className={preference?.is_favorite ? 'fill-current' : ''} />
            {preference?.is_favorite ? 'Quitar favorita' : 'Favorita'}
          </Button>
          <Button
            fullWidth
            variant={preference?.is_blocked ? 'danger' : 'outline'}
            onClick={toggleBlocked}
            className="gap-2"
          >
            <Ban size={16} />
            {preference?.is_blocked ? 'Desbloquear' : 'Bloquear'}
          </Button>
        </div>

        {/* Visit history */}
        <Card className="!rounded-2xl">
          <CardTitle>Historial de Visitas ({visits.length})</CardTitle>
          {visits.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">Aún no hay visitas registradas</p>
          ) : (
            <div className="mt-2 space-y-3">
              {visits.map((visit) => (
                <div
                  key={visit.id}
                  className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">
                        {new Date(visit.visited_at).toLocaleDateString()}
                      </p>
                      <RatingBadge rating={visit.rating} />
                      {visit.wifi_signal && <WifiBadge signal={visit.wifi_signal} />}
                    </div>
                    {visit.notes && (
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
                        {visit.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-secondary">
                      ${visit.estimated_profit.toFixed(0)}
                    </p>
                    <p className="text-xs text-text-muted">{visit.products_found} artículos</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Receipts */}
        {allReceipts.length > 0 && (
          <Card className="!rounded-2xl">
            <CardTitle>Recibos ({allReceipts.length})</CardTitle>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {allReceipts.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block aspect-square overflow-hidden rounded-lg border border-border"
                >
                  <Image src={url} alt="Receipt" fill className="object-cover" unoptimized />
                </a>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
