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
import { ChevronRight, Filter, Star, Heart, Plus, Trash2 } from 'lucide-react';

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
        {/* View toggle: individual stores vs brand rollup */}
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          <button
            onClick={() => setViewMode('stores')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'stores' ? 'bg-primary text-white' : 'text-text-secondary'
            }`}
          >
            Por Tienda
          </button>
          <button
            onClick={() => setViewMode('brands')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'brands' ? 'bg-primary text-white' : 'text-text-secondary'
            }`}
          >
            Por Marca
          </button>
        </div>

        {viewMode === 'brands' ? (
          <div className="space-y-4">
            {/* Manage brands: this list drives the suggestions when creating a route */}
            <Card>
              <CardTitle>Mis Marcas</CardTitle>
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
                      className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                    >
                      <span>{b}</span>
                      <button
                        type="button"
                        onClick={() => removeBrand(b)}
                        className="transition-colors hover:text-primary/60"
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
            <Card className="py-8 text-center">
              <Star size={40} className="mx-auto mb-3 text-text-muted" />
              <p className="font-medium">Sin datos por marca todavía</p>
              <p className="mt-1 text-sm text-text-muted">
                Completa viajes de sourcing para ver el análisis por marca
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">
                Ordenado por artículos comprados — dónde consigues más mercancía
              </p>
              {brandStats.map((b, index) => (
                <Card key={b.brand}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {index + 1}
                      </span>
                      <span className="font-semibold">{b.brand}</span>
                      <span className="text-xs text-text-muted">
                        {b.storeCount} {b.storeCount === 1 ? 'tienda' : 'tiendas'} · {b.visitCount}{' '}
                        {b.visitCount === 1 ? 'visita' : 'visitas'}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{b.itemsBought}</p>
                      <p className="text-xs text-text-muted">artículos</p>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(b.itemsBought / maxBrandItems) * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                    <span>
                      Gastado:{' '}
                      <span className="font-medium text-secondary">
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
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['recent', 'rating', 'profit', 'visits'] as SortBy[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                sortBy === s
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              {s === 'recent' ? 'Recientes' : s === 'rating' ? 'Mejor Calificadas' : s === 'profit' ? 'Más Utilidad' : 'Más Visitas'}
            </button>
          ))}
        </div>

        {chains.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setChainFilter('all')}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                chainFilter === 'all'
                  ? 'bg-text text-surface'
                  : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              Todas
            </button>
            {chains.map((chain) => (
              <button
                key={chain}
                onClick={() => setChainFilter(chain)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  chainFilter === chain
                    ? 'bg-text text-surface'
                    : 'bg-surface border border-border text-text-secondary'
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
              <Star size={22} className="text-indigo-500" />
            </div>
            <p className="font-semibold">Aún no has visitado tiendas</p>
            <p className="mt-1 text-sm text-text-muted">
              Completa una ruta de sourcing para ver tu historial
            </p>
          </Card>
        ) : (
          <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
            {filtered.map((item) => (
              <Link key={item.store.id} href={`/stores/${item.store.id}`}>
                <Card className="flex items-center justify-between hover:bg-surface-secondary transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{item.store.name}</p>
                      {item.isFavorite && <Heart size={14} className="text-danger fill-danger shrink-0" />}
                    </div>
                    <p className="text-xs text-text-muted truncate">{item.store.address}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                      <span>{item.visitCount} visitas</span>
                      <span>·</span>
                      <span className="text-secondary font-medium">
                        ~${item.avgProfit.toFixed(0)}/visita
                      </span>
                      {item.avgRating && (
                        <>
                          <span>·</span>
                          <RatingBadge rating={Math.round(item.avgRating) as StoreRating} />
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-text-muted shrink-0" />
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
