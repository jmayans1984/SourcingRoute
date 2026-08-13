'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { AppShell } from '@/components/layout/app-shell';
import { Header } from '@/components/layout/header';
import { Card, CardTitle, IconChip } from '@/components/ui/card';
import { RatingBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { normalizeBrand } from '@/utils/brands';
import type { Store, StoreVisit, StoreRating } from '@/types/database';
import {
  ChevronRight,
  Heart,
  Plus,
  Store as StoreIcon,
  Tag,
  Award,
  Search,
  X,
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

const SORT_LABELS: Record<SortBy, string> = {
  recent: 'Recientes',
  rating: 'Mejor Calificadas',
  profit: 'Más Utilidad',
  visits: 'Más Visitas',
};

export default function StoresPage() {
  const [stores, setStores] = useState<StoreWithStats[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [chainFilter, setChainFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('stores');
  const [loading, setLoading] = useState(true);
  const [myBrands, setMyBrands] = useState<string[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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
    toast.success(`Marca "${brand}" agregada`);
  }

  function removeBrand(brand: string) {
    const next = myBrands.filter((b) => b !== brand);
    setMyBrands(next);
    saveBrands(next);
    toast.info(`Marca "${brand}" quitada`);
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

  // Aggregate stats for the summary row
  const totalVisits = stores.reduce((s, x) => s + x.visitCount, 0);
  const totalSpentAll = stores.reduce((s, x) => s + x.totalSpent, 0);
  const avgProfitAll =
    stores.length > 0 ? stores.reduce((s, x) => s + x.avgProfit, 0) / stores.length : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores
      .filter((s) => chainFilter === 'all' || s.store.chain === chainFilter)
      .filter((s) => {
        if (!q) return true;
        return (
          s.store.name.toLowerCase().includes(q) ||
          (s.store.address || '').toLowerCase().includes(q) ||
          (s.store.chain || '').toLowerCase().includes(q)
        );
      })
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
  }, [stores, chainFilter, query, sortBy]);

  return (
    <AppShell>
      <Header
        title="Tiendas"
        subtitle={`${stores.length} visitadas · ${totalVisits} visitas`}
        action={
          <Link href="/visit/new">
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
              <Plus size={15} />
              Visita
            </Button>
          </Link>
        }
      />

      <div className="space-y-4 p-4 md:p-0">
        {/* Summary */}
        <Card padding={false}>
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="p-4 text-center">
            <p className="text-[11px] text-text-muted">Tiendas</p>
            <p className="mt-0.5 text-xl font-semibold tabular">{stores.length}</p>
          </div>
            <div className="p-4 text-center">
            <p className="text-[11px] text-text-muted">Utilidad prom.</p>
            <p className="mt-0.5 text-xl font-semibold tabular">${avgProfitAll.toFixed(0)}</p>
          </div>
            <div className="p-4 text-center">
            <p className="text-[11px] text-text-muted">Gastado</p>
            <p className="mt-0.5 text-xl font-semibold tabular">
              ${totalSpentAll.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            </div>
          </div>
        </Card>

        {/* View toggle */}
        <div className="inline-flex w-full gap-1 rounded-lg bg-surface-secondary p-1">
          {([
            { v: 'stores', label: 'Por Tienda' },
            { v: 'brands', label: 'Por Marca' },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setViewMode(opt.v)}
              className={`min-h-[38px] flex-1 rounded-lg px-3 text-sm font-medium transition-colors ${
                viewMode === opt.v
                  ? 'bg-surface text-text shadow-soft'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {viewMode === 'brands' ? (
          <div className="space-y-4">
            {/* Manage brands */}
            <Card>
              <div className="flex items-center gap-2">
                <IconChip tone="primary">
                  <Tag size={16} />
                </IconChip>
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
                    placeholder="Agregar marca (ej: Ross)"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addBrand}
                  disabled={!newBrand.trim()}
                  className="shrink-0 gap-1"
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
                      className="flex items-center gap-1.5 rounded-full bg-surface-secondary py-1.5 pl-3 pr-1.5 text-sm font-medium text-text-secondary"
                    >
                      <span>{b}</span>
                      <button
                        type="button"
                        onClick={() => removeBrand(b)}
                        aria-label={`Quitar ${b}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-danger/15 hover:text-danger"
                      >
                        <X size={13} />
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
              <Card className="py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Award size={22} className="text-primary" />
                </div>
                <p className="font-semibold">Sin datos por marca todavía</p>
                <p className="mt-1 text-sm text-text-muted">
                  Completa rutas de sourcing para ver el análisis por marca
                </p>
              </Card>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-text-muted">
                  Ordenado por artículos comprados — dónde consigues más mercancía
                </p>
                {brandStats.map((b, index) => (
                  <Card key={b.brand}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular ${
                            index === 0
                              ? 'bg-warning/15 text-warning'
                              : 'bg-surface-secondary text-text-secondary'
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{b.brand}</p>
                          <p className="text-xs text-text-muted">
                            {b.storeCount} {b.storeCount === 1 ? 'tienda' : 'tiendas'} · {b.visitCount}{' '}
                            {b.visitCount === 1 ? 'visita' : 'visitas'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold leading-tight tabular">{b.itemsBought}</p>
                        <p className="text-[11px] text-text-muted">artículos</p>
                      </div>
                    </div>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(b.itemsBought / maxBrandItems) * 100}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-text-muted tabular">
                      <span>
                        Gastado:{' '}
                        <span className="font-medium text-success">
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
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tienda por nombre o dirección..."
                className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-10 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-secondary hover:text-text"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {(Object.keys(SORT_LABELS) as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`min-h-[36px] whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors ${
                    sortBy === s
                      ? 'bg-primary text-white'
                      : 'border border-border bg-surface text-text-secondary hover:bg-surface-secondary'
                  }`}
                >
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>

            {chains.length > 1 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setChainFilter('all')}
                  className={`min-h-[36px] whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors ${
                    chainFilter === 'all'
                      ? 'bg-primary text-white'
                      : 'border border-border bg-surface text-text-secondary hover:bg-surface-secondary'
                  }`}
                >
                  Todas
                </button>
                {chains.map((chain) => (
                  <button
                    key={chain}
                    onClick={() => setChainFilter(chain)}
                    className={`min-h-[36px] whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors ${
                      chainFilter === chain
                        ? 'bg-primary text-white'
                        : 'border border-border bg-surface text-text-secondary hover:bg-surface-secondary'
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
              <Card className="py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <StoreIcon size={22} className="text-primary" />
                </div>
                <p className="font-semibold">
                  {query || chainFilter !== 'all' ? 'Sin resultados' : 'Aún no has visitado tiendas'}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {query || chainFilter !== 'all'
                    ? 'Prueba con otra búsqueda o filtro'
                    : 'Completa una ruta de sourcing para ver tu historial'}
                </p>
              </Card>
            ) : (
              <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
                {filtered.map((item) => (
                  <Link key={item.store.id} href={`/stores/${item.store.id}`}>
                    <Card className="flex items-center gap-3 transition-colors active:bg-surface-hover hover:bg-surface-secondary">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-sm font-semibold text-text-secondary">
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
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-text-muted">
                          <span className="tabular">{item.visitCount} visitas</span>
                          {item.avgRating && (
                            <RatingBadge rating={Math.round(item.avgRating) as StoreRating} />
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-sm font-semibold tabular ${
                            item.avgProfit >= 0 ? 'text-success' : 'text-danger'
                          }`}
                        >
                          ${item.avgProfit.toFixed(0)}
                        </p>
                        <p className="text-[11px] text-text-muted">prom.</p>
                      </div>
                      <ChevronRight size={17} className="shrink-0 text-text-muted" />
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
