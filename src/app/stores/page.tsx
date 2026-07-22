'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { AppShell } from '@/components/layout/app-shell';
import { Header } from '@/components/layout/header';
import { Card, CardTitle } from '@/components/ui/card';
import { ScoreBadge, RatingBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeBrand } from '@/utils/brands';
import type { Store, StoreVisit, StoreRating } from '@/types/database';
import {
  ChevronRight,
  Heart,
  Plus,
  Trash2,
  Store as StoreIcon,
  DollarSign,
  Tag,
  Award,
} from 'lucide-react';

interface StoreWithStats {
  store: Store;
  visitCount: number;
  avgRating: number | null;
  avgProfit: number;
  itemsBought: number;
  totalSpent: number;
  lastVisit: string | null;
  isFavorite: boolean;
}

interface BrandStats {
  brand: string;
  storeCount: number;
  visitCount: number;
  itemsBought: number;
  totalSpent: number;
}

type SortBy = 'recent' | 'rating' | 'profit' | 'visits';
type ViewMode = 'stores' | 'brands';

export default function StoresPage() {
  const [stores, setStores] = useState<StoreWithStats[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [chainFilter, setChainFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('stores');
  const [loading, setLoading] = useState(true);
  const [myBrands, setMyBrands] = useState<string[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load the user's own brand list (from their profile) so they can manage it
    // here and have it drive the brand suggestions when creating a route.
    supabase
      .from('users_profile')
      .select('id, preferred_chains')
      .eq('user_id', user.id)
      .single()
      .then(({ data: profile }) => {
        if (profile) {
          setProfileId(profile.id);
          setMyBrands(profile.preferred_chains || []);
        }
      });

    const [{ data: visits }, { data: preferences }] = await Promise.all([
      supabase
        .from('store_visits')
        .select('*, store:stores(*)')
        .eq('user_id', user.id)
        .order('visited_at', { ascending: false }),
      supabase
        .from('user_store_preferences')
        .select('*')
        .eq('user_id', user.id),
    ]);

    const storeMap = new Map<string, StoreWithStats>();

    (visits || []).forEach((visit: StoreVisit & { store: Store }) => {
      const existing = storeMap.get(visit.store_id);
      if (existing) {
        existing.visitCount++;
        existing.avgProfit += visit.estimated_profit;
        existing.itemsBought += visit.total_items_bought || 0;
        existing.totalSpent += visit.total_spent || 0;
        if (visit.rating) {
          existing.avgRating =
            existing.avgRating !== null
              ? (existing.avgRating * (existing.visitCount - 1) + visit.rating) / existing.visitCount
              : visit.rating;
        }
      } else {
        const pref = (preferences || []).find(
          (p: { store_id: string }) => p.store_id === visit.store_id
        );
        storeMap.set(visit.store_id, {
          store: visit.store,
          visitCount: 1,
          avgRating: visit.rating,
          avgProfit: visit.estimated_profit,
          itemsBought: visit.total_items_bought || 0,
          totalSpent: visit.total_spent || 0,
          lastVisit: visit.visited_at,
          isFavorite: pref?.is_favorite || false,
        });
      }
    });

    storeMap.forEach((s) => {
      if (s.visitCount > 1) s.avgProfit = s.avgProfit / s.visitCount;
    });

    setStores(Array.from(storeMap.values()));
    setLoading(false);
  }

  async function saveBrands(brands: string[]) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (profileId) {
      await supabase
        .from('users_profile')
        .update({ preferred_chains: brands })
        .eq('id', profileId);
    } else {
      const { data } = await supabase
        .from('users_profile')
        .insert({ user_id: user.id, preferred_chains: brands })
        .select('id')
        .single();
      if (data) setProfileId(data.id);
    }
  }

  function addBrand() {
    const brand = normalizeBrand(newBrand);
    if (!brand || myBrands.includes(brand)) {
      setNewBrand('');
      return;
    }
    const next = [...myBrands, brand];
    setMyBrands(next);
    setNewBrand('');
    saveBrands(next);
  }

  function removeBrand(brand: string) {
    const next = myBrands.filter((b) => b !== brand);
    setMyBrands(next);
    saveBrands(next);
  }

  const chains = [...new Set(stores.map((s) => s.store.chain))].sort();

  // Roll up store history by brand so the user can see which brand yields the
  // most merchandise. Sorted by items bought (most merchandise first).
  const brandStats: BrandStats[] = Object.values(
    stores.reduce((acc: Record<string, BrandStats>, s) => {
      const brand = s.store.chain || 'Otro';
      const current = acc[brand] || {
        brand,
        storeCount: 0,
        visitCount: 0,
        itemsBought: 0,
        totalSpent: 0,
      };
      current.storeCount += 1;
      current.visitCount += s.visitCount;
      current.itemsBought += s.itemsBought;
      current.totalSpent += s.totalSpent;
      acc[brand] = current;
      return acc;
    }, {})
  ).sort((a, b) => b.itemsBought - a.itemsBought);

  const maxBrandItems = Math.max(...brandStats.map((b) => b.itemsBought), 1);

  // Aggregate stats for the hero
  const totalVisits = stores.reduce((s, x) => s + x.visitCount, 0);
  const totalItemsAll = stores.reduce((s, x) => s + x.itemsBought, 0);
  const totalSpentAll = stores.reduce((s, x) => s + x.totalSpent, 0);

  const filtered = stores
    .filter((s) => chainFilter === 'all' || s.store.chain === chainFilter)
    .sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return (b.lastVisit || '').localeCompare(a.lastVisit || '');
        case 'rating':
          return (b.avgRating ?? 0) - (a.avgRating ?? 0);
        case 'profit':
          return b.avgProfit - a.avgProfit;
        case 'visits':
          return b.visitCount - a.visitCount;
        default:
          return 0;
      }
    });

  return (
    <AppShell>
      <Header title="Historial de Tiendas" />

      <div className="space-y-4 p-4 md:p-0">
        {/* Hero with aggregate stats */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 text-white shadow-xl shadow-indigo-500/25">
          <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 right-16 h-52 w-52 rounded-full bg-fuchsia-400/20 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <StoreIcon size={18} />
              </span>
              <div>
                <h2 className="text-lg font-extrabold leading-tight">Mis Tiendas</h2>
                <p className="text-xs text-indigo-100/90">
                  {stores.length} {stores.length === 1 ? 'tienda' : 'tiendas'} · {totalVisits}{' '}
                  {totalVisits === 1 ? 'visita' : 'visitas'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold leading-tight">{stores.length}</p>
                <p className="text-[11px] text-indigo-100/80">Tiendas</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold leading-tight">{totalItemsAll}</p>
                <p className="text-[11px] text-indigo-100/80">Artículos</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold leading-tight">
                  ${totalSpentAll.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-indigo-100/80">Gastado</p>
              </div>
            </div>

            {/* View toggle */}
            <div className="mt-4 inline-flex w-full gap-1 rounded-2xl bg-white/10 p-1 backdrop-blur-sm">
              {([
                { v: 'stores', label: 'Por Tienda' },
                { v: 'brands', label: 'Por Marca' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setViewMode(opt.v)}
                  className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold transition-all ${
                    viewMode === opt.v
                      ? 'bg-white text-indigo-700 shadow-md'
                      : 'text-indigo-100 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {viewMode === 'brands' ? (
          <div className="space-y-4">
            {/* Manage brands: this list drives the suggestions when creating a route */}
            <Card className="!rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                  <Tag size={16} />
                </span>
                <CardTitle>Mis Marcas</CardTitle>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Crea las marcas que visitas. Aparecerán al crear una ruta.
              </p>
              <div className="mt-3 flex gap-2">
                <div className="flex-1">
                  <Input
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addBrand();
                      }
                    }}
                    placeholder='Agregar marca (ej: "Ross", "Kohl&apos;s")'
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addBrand}
                  disabled={!newBrand.trim()}
                  className="gap-1"
                >
                  <Plus size={16} />
                  Agregar
                </Button>
              </div>
              {myBrands.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {myBrands.map((b) => (
                    <div
                      key={b}
                      className="flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-50 to-violet-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100"
                    >
                      <span>{b}</span>
                      <button
                        type="button"
                        onClick={() => removeBrand(b)}
                        className="text-indigo-400 transition-colors hover:text-danger"
                        title={`Quitar ${b}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-text-muted">Aún no has agregado marcas</p>
              )}
            </Card>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : brandStats.length === 0 ? (
              <Card className="!rounded-2xl py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100">
                  <Award size={22} className="text-indigo-500" />
                </div>
                <p className="font-semibold">Sin datos por marca todavía</p>
                <p className="mt-1 text-sm text-text-muted">
                  Completa viajes de sourcing para ver el análisis por marca
                </p>
              </Card>
            ) : (
              <div className="space-y-2.5">
                <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-600" />
                  Ranking por artículos
                </p>
                {brandStats.map((b, index) => {
                  const medal =
                    index === 0
                      ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white'
                      : index === 1
                        ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                        : index === 2
                          ? 'bg-gradient-to-br from-orange-400 to-amber-600 text-white'
                          : 'bg-indigo-50 text-indigo-600';
                  return (
                    <Card key={b.brand} className="!rounded-2xl">
                      <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold shadow-sm ${medal}`}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold">{b.brand}</p>
                            <p className="text-xs text-text-muted">
                              {b.storeCount} {b.storeCount === 1 ? 'tienda' : 'tiendas'} · {b.visitCount}{' '}
                              {b.visitCount === 1 ? 'visita' : 'visitas'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-extrabold leading-tight">{b.itemsBought}</p>
                          <p className="text-[11px] text-text-muted">artículos</p>
                        </div>
                      </div>
                      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all"
                          style={{ width: `${(b.itemsBought / maxBrandItems) * 100}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-text-muted">
                        <span>
                          Gastado:{' '}
                          <span className="font-semibold text-emerald-600">
                            ${b.totalSpent.toLocaleString()}
                          </span>
                        </span>
                        <span>
                          {b.visitCount > 0
                            ? `${(b.itemsBought / b.visitCount).toFixed(1)} art./visita`
                            : '--'}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Sort filters */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {(['recent', 'rating', 'profit', 'visits'] as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    sortBy === s
                      ? 'bg-brand-gradient text-white shadow-md shadow-indigo-500/25'
                      : 'border border-border bg-surface text-text-secondary hover:border-primary/30'
                  }`}
                >
                  {s === 'recent' ? 'Recientes' : s === 'rating' ? 'Mejor Calificadas' : s === 'profit' ? 'Más Utilidad' : 'Más Visitas'}
                </button>
              ))}
            </div>

            {chains.length > 1 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setChainFilter('all')}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    chainFilter === 'all'
                      ? 'bg-text text-surface'
                      : 'border border-border bg-surface text-text-secondary hover:border-primary/30'
                  }`}
                >
                  Todas
                </button>
                {chains.map((chain) => (
                  <button
                    key={chain}
                    onClick={() => setChainFilter(chain)}
                    className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      chainFilter === chain
                        ? 'bg-text text-surface'
                        : 'border border-border bg-surface text-text-secondary hover:border-primary/30'
                    }`}
                  >
                    {chain}
                  </button>
                ))}
              </div>
            )}

            {/* Store list */}
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : filtered.length === 0 ? (
              <Card className="!rounded-2xl py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100">
                  <StoreIcon size={22} className="text-indigo-500" />
                </div>
                <p className="font-semibold">Aún no has visitado tiendas</p>
                <p className="mt-1 text-sm text-text-muted">
                  Completa una ruta de sourcing para ver tu historial
                </p>
              </Card>
            ) : (
              <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
                {filtered.map((item) => (
                  <Link key={item.store.id} href={`/stores/${item.store.id}`}>
                    <Card className="!rounded-2xl flex items-center gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-extrabold text-white shadow-md shadow-indigo-500/20">
                        {item.store.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold">{item.store.name}</p>
                          {item.isFavorite && (
                            <Heart size={13} className="shrink-0 fill-danger text-danger" />
                          )}
                        </div>
                        <p className="truncate text-xs text-text-muted">{item.store.address}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="inline-flex items-center gap-1 rounded-md bg-surface-secondary px-1.5 py-0.5 text-text-secondary">
                            <StoreIcon size={11} />
                            {item.visitCount}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-600">
                            <DollarSign size={11} />~{item.avgProfit.toFixed(0)}/v
                          </span>
                          {item.avgRating && (
                            <RatingBadge rating={Math.round(item.avgRating) as StoreRating} />
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-text-muted" />
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
