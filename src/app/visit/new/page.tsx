'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardTitle, IconChip } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible } from '@/components/ui/collapsible';
import { toast } from '@/components/ui/toast';
import type { StoreRating, WifiSignal } from '@/types/database';
import {
  Search,
  MapPin,
  Star,
  Save,
  Wifi,
  WifiOff,
  SignalMedium,
  Camera,
  X,
  Loader2,
  FileSpreadsheet,
  DollarSign,
  Package,
  StickyNote,
  ArrowLeft,
  Store as StoreIcon,
} from 'lucide-react';

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

interface SelectedStore {
  id: string;
  name: string;
  address: string;
}

interface ProductEntry {
  product_name: string;
  asin?: string;
  upc?: string;
  buy_cost: number;
  estimated_sale_price: number;
  quantity_found: number;
  quantity_bought: number;
  total_cost?: number;
  total_sales?: number;
  total_profit?: number;
  notes: string;
}

const wifiOptions: { value: WifiSignal; label: string; icon: typeof Wifi }[] = [
  { value: 'bad', label: 'Sin señal', icon: WifiOff },
  { value: 'regular', label: 'Débil', icon: SignalMedium },
  { value: 'good', label: 'Buena', icon: Wifi },
];

export default function NewQuickVisitPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: find the store
  const [homeLat, setHomeLat] = useState<number | null>(null);
  const [homeLng, setHomeLng] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FindResult[]>([]);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(null);

  // Step 2: log the visit — same fields as a route stop, minus trip context
  const [rating, setRating] = useState<StoreRating | null>(null);
  const [wifiSignal, setWifiSignal] = useState<WifiSignal | null>(null);
  const [notes, setNotes] = useState('');
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [totalItemsBought, setTotalItemsBought] = useState<number>(0);
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [products, setProducts] = useState<ProductEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [historicalQty, setHistoricalQty] = useState<Record<string, number>>({});
  const [projectedProfit, setProjectedProfit] = useState<number>(0);
  const [projectedSales, setProjectedSales] = useState<number>(0);
  const [importResult, setImportResult] = useState<{
    totalItems: number;
    totalSpent: number;
    projectedSales: number;
    projectedProfit: number;
    rowCount: number;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from('users_profile')
        .select('home_lat, home_lng')
        .eq('user_id', user.id)
        .single();
      if (profile) {
        setHomeLat(profile.home_lat);
        setHomeLng(profile.home_lng);
      }
    });
  }, []);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const response = await fetch('/api/stores/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, lat: homeLat, lng: homeLng }),
      });
      const data = await response.json();
      const results = data.results || [];
      setSearchResults(results);
      if (results.length === 0) toast.info('No se encontraron tiendas con ese nombre');
    } catch {
      toast.error('No se pudo buscar. Revisa tu conexión.');
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectStore(result: FindResult) {
    setSelectingId(result.google_place_id);
    try {
      const response = await fetch('/api/stores/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      const data = await response.json();
      if (!data.store_id) {
        toast.error('No se pudo guardar la tienda');
        return;
      }
      setSelectedStore({ id: data.store_id, name: result.name, address: result.address });
    } finally {
      setSelectingId(null);
    }
  }

  function changeStore() {
    setSelectedStore(null);
    setSearchResults([]);
  }

  function handleSpentChange(val: number) {
    setTotalSpent(val);
    if (importResult && importResult.totalSpent > 0) {
      const ratio = val / importResult.totalSpent;
      setProjectedSales(Math.round(importResult.projectedSales * ratio * 100) / 100);
      setProjectedProfit(Math.round(importResult.projectedProfit * ratio * 100) / 100);
    }
  }

  function handleItemsChange(val: number) {
    setTotalItemsBought(val);
    if (importResult && importResult.totalItems > 0) {
      const ratio = val / importResult.totalItems;
      setProjectedSales(Math.round(importResult.projectedSales * ratio * 100) / 100);
      setProjectedProfit(Math.round(importResult.projectedProfit * ratio * 100) / 100);
    }
  }

  async function importFromSheets() {
    setImporting(true);
    try {
      const res = await fetch('/api/sheets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error importing');

      if (!data.rowCount) {
        toast.error(
          'No se encontraron filas con datos en la hoja (001-01, desde la fila 2). La hoja NO fue borrada.'
        );
        return;
      }

      setTotalSpent(data.totalSpent);
      setTotalItemsBought(data.totalItems);
      setProjectedProfit(data.projectedProfit);
      setProjectedSales(data.projectedSales);
      setImportResult(data);
      if (data.products?.length > 0) {
        setProducts(data.products);
        await loadHistoricalQty(data.products.map((p: ProductEntry) => p.product_name));
      }
      toast.success(
        `Importado: ${data.rowCount} producto${data.rowCount !== 1 ? 's' : ''} · la hoja quedó limpia`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar del Sheet');
    } finally {
      setImporting(false);
    }
  }

  async function loadHistoricalQty(names: string[]) {
    if (names.length === 0 || !selectedStore) return;
    const supabase = createClient();
    // Sum units bought of each product in PREVIOUS visits to this same store
    // (any trip or none) — the anti-overbuy signal, scoped by store instead
    // of by route since a quick visit has no route.
    const { data } = await supabase
      .from('found_products')
      .select('product_name, quantity_bought')
      .eq('store_id', selectedStore.id)
      .in('product_name', names);

    if (!data) return;
    const totals: Record<string, number> = {};
    for (const row of data) {
      totals[row.product_name] = (totals[row.product_name] ?? 0) + (row.quantity_bought ?? 0);
    }
    setHistoricalQty(totals);
  }

  async function handleReceiptCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedStore) return;

    setUploadingReceipt(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUploadingReceipt(false);
      return;
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/${selectedStore.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('receipts').upload(path, file, {
      contentType: file.type,
    });

    if (!error) {
      const { data: urlData } = await supabase.storage
        .from('receipts')
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (urlData?.signedUrl) {
        setReceiptUrls((prev) => [...prev, urlData.signedUrl]);
        toast.success('Recibo guardado');
      }
    } else {
      toast.error('No se pudo subir el recibo');
    }

    setUploadingReceipt(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeReceipt(url: string) {
    setReceiptUrls((prev) => prev.filter((u) => u !== url));
  }

  async function saveVisit() {
    if (!selectedStore || !rating) return;
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const productsProfit = products.reduce(
      (sum, p) => sum + (p.estimated_sale_price - p.buy_cost) * p.quantity_bought,
      0
    );
    const finalProfit = projectedProfit > 0 ? projectedProfit : productsProfit;

    // No trip_id / trip_stop_id — this visit stands on its own.
    const { data: visit, error } = await supabase
      .from('store_visits')
      .insert({
        user_id: user.id,
        store_id: selectedStore.id,
        trip_id: null,
        visited_at: new Date().toISOString(),
        rating,
        wifi_signal: wifiSignal,
        products_found: totalItemsBought || products.length,
        estimated_profit: finalProfit,
        total_spent: totalSpent,
        total_items_bought: totalItemsBought,
        receipt_photo_urls: receiptUrls,
        clearance_found: false,
        notes,
      })
      .select('id')
      .single();

    if (error || !visit) {
      console.error('[saveVisit] store_visits insert failed:', error);
      toast.error(`Error al guardar: ${error?.message ?? 'inténtalo de nuevo'}`);
      setSaving(false);
      return;
    }

    if (products.length > 0) {
      const productRecords = products
        .filter((p) => p.product_name)
        .map((p) => ({
          user_id: user.id,
          store_id: selectedStore.id,
          trip_id: null,
          trip_stop_id: null,
          product_name: p.product_name,
          upc: p.upc || p.asin || null,
          buy_cost: p.buy_cost,
          estimated_sale_price: p.estimated_sale_price,
          estimated_profit:
            p.total_profit ?? (p.estimated_sale_price - p.buy_cost) * p.quantity_bought,
          roi_percent:
            p.buy_cost > 0
              ? Math.round(((p.estimated_sale_price - p.buy_cost) / p.buy_cost) * 100)
              : 0,
          quantity_found: p.quantity_found,
          quantity_bought: p.quantity_bought,
          notes: p.notes || null,
        }));

      if (productRecords.length > 0) {
        await supabase.from('found_products').insert(productRecords);
      }
    }

    toast.success('Visita registrada');
    router.push(`/stores/${selectedStore.id}`);
  }

  const liveROI = totalSpent > 0 ? Math.round((projectedProfit / totalSpent) * 100) : 0;

  // ---------------------------------------------------------------------
  // Step 1: find the store
  // ---------------------------------------------------------------------
  if (!selectedStore) {
    return (
      <AppShell>
        <Header title="Visita Suelta" subtitle="Registra una tienda sin necesidad de una ruta" showBack />

        <div className="space-y-4 p-4 md:mx-auto md:max-w-lg md:p-0">
          <Card>
            <div className="flex items-center gap-2">
              <IconChip tone="primary">
                <StoreIcon size={16} />
              </IconChip>
              <CardTitle>¿En qué tienda estás?</CardTitle>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Búscala por nombre — ej: &quot;Ross Kissimmee&quot; o &quot;Walmart Orlando&quot;.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Nombre de la tienda..."
                className="flex-1"
                autoFocus
              />
              <Button onClick={handleSearch} loading={searching} className="shrink-0 !px-3.5">
                <Search size={18} />
              </Button>
            </div>
          </Card>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((result) => (
                <Card
                  key={result.google_place_id}
                  className="flex items-center justify-between gap-2"
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
                    onClick={() => handleSelectStore(result)}
                    loading={selectingId === result.google_place_id}
                    className="shrink-0"
                  >
                    Seleccionar
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  // ---------------------------------------------------------------------
  // Step 2: log the visit
  // ---------------------------------------------------------------------
  return (
    <AppShell>
      <Header title={selectedStore.name} subtitle={selectedStore.address} showBack />

      <div className="space-y-4 p-4 pb-32 md:mx-auto md:max-w-2xl md:p-0 md:pb-10">
        {/* Store + change link */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-bold text-primary">
                {selectedStore.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{selectedStore.name}</p>
                <p className="truncate text-sm text-text-muted">{selectedStore.address}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={changeStore}
              className="flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text"
            >
              <ArrowLeft size={14} />
              Cambiar
            </button>
          </div>
        </Card>

        {/* Live totals summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-[11px] text-text-muted">Gastado</p>
            <p className="mt-0.5 text-lg font-bold tabular">
              ${totalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
          </Card>
          <Card className="text-center">
            <p className="text-[11px] text-text-muted">Venta Proy.</p>
            <p className="mt-0.5 text-lg font-bold tabular">
              ${projectedSales.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
          </Card>
          <Card className="text-center">
            <p className="text-[11px] text-text-muted">
              Utilidad{liveROI !== 0 ? ` · ${liveROI}%` : ''}
            </p>
            <p
              className={`mt-0.5 text-lg font-bold tabular ${projectedProfit >= 0 ? 'text-success' : 'text-danger'}`}
            >
              ${projectedProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
          </Card>
        </div>

        {/* Totals */}
        <Card>
          <div className="flex items-center gap-2">
            <IconChip tone="primary">
              <DollarSign size={16} />
            </IconChip>
            <CardTitle>Totales de Compra</CardTitle>
          </div>

          <button
            type="button"
            onClick={importFromSheets}
            disabled={importing}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/[0.06] px-4 py-3 text-left transition-colors hover:bg-success/10 disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/15 text-success">
                {importing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={18} />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-text">
                  {importing ? 'Importando...' : 'Importar desde Google Sheets'}
                </p>
                <p className="text-xs text-text-muted">Autocompleta todos los totales</p>
              </div>
            </div>
          </button>

          {importResult && (
            <p className="mt-2.5 rounded-xl bg-success/10 px-3 py-2 text-xs text-success">
              ✓ {importResult.rowCount} producto{importResult.rowCount !== 1 ? 's' : ''} importado
              {importResult.rowCount !== 1 ? 's' : ''} · hoja limpiada
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Input
              label="Gastado"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={totalSpent || ''}
              onChange={(e) => handleSpentChange(Number(e.target.value))}
              placeholder="$0.00"
            />
            <Input
              label="Artículos"
              type="number"
              inputMode="numeric"
              min="0"
              value={totalItemsBought || ''}
              onChange={(e) => handleItemsChange(Number(e.target.value))}
              placeholder="0"
            />
            <Input
              label="Venta Proyectada"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={projectedSales || ''}
              onChange={(e) => setProjectedSales(Number(e.target.value))}
              placeholder="$0.00"
            />
            <Input
              label="Utilidad Proyectada"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={projectedProfit || ''}
              onChange={(e) => setProjectedProfit(Number(e.target.value))}
              placeholder="$0.00"
            />
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Al editar «Gastado» o «Artículos», la venta y utilidad se recalculan solas.
          </p>
        </Card>

        {/* Rating — required, this IS the visit record */}
        <Card>
          <div className="flex items-center gap-2">
            <IconChip tone="warning">
              <Star size={16} />
            </IconChip>
            <CardTitle>¿Cómo estuvo la tienda?</CardTitle>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([1, 2, 3] as StoreRating[]).map((r) => {
              const selected = rating === r;
              const sel =
                r === 3
                  ? 'border-success bg-success text-white'
                  : r === 2
                    ? 'border-warning bg-warning text-white'
                    : 'border-danger bg-danger text-white';
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRating(r)}
                  className={`min-h-[76px] rounded-xl border-2 py-3 text-center text-sm font-semibold transition-colors ${
                    selected ? sel : 'border-border text-text-secondary hover:border-primary/40'
                  }`}
                >
                  <Star size={22} className={`mx-auto mb-1.5 ${selected ? 'fill-current' : ''}`} />
                  {r === 3 ? 'Buena' : r === 2 ? 'Regular' : 'Mala'}
                </button>
              );
            })}
          </div>
          {!rating && (
            <p className="mt-2 text-xs text-text-muted">Requerida para guardar la visita.</p>
          )}
        </Card>

        {/* Products */}
        {products.length > 0 && (
          <Card>
            <div className="flex items-center gap-2">
              <IconChip tone="info">
                <Package size={16} />
              </IconChip>
              <CardTitle>Productos ({products.length})</CardTitle>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Agrupado por código · Hist. = comprado antes en esta tienda.
            </p>
            <div className="mt-3 -mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[500px] text-xs tabular">
                <thead>
                  <tr className="border-b border-border text-text-secondary">
                    <th className="px-2 py-2 text-left font-medium">Producto</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    <th className="px-2 py-2 text-right font-medium">COGS</th>
                    <th className="px-2 py-2 text-right font-medium">Venta</th>
                    <th className="px-2 py-2 text-right font-medium">Hist.</th>
                    <th className="px-2 py-2 text-right font-medium">Utilidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((p, i) => {
                    const cogs   = p.total_cost   ?? p.buy_cost * p.quantity_bought;
                    const sales  = p.total_sales  ?? p.estimated_sale_price * p.quantity_bought;
                    const profit = p.total_profit ?? (p.estimated_sale_price - p.buy_cost) * p.quantity_bought;
                    const hist   = historicalQty[p.product_name] ?? 0;
                    const code   = p.upc || p.asin || '';
                    return (
                      <tr key={i}>
                        <td className="max-w-[160px] px-2 py-2 pr-3">
                          <p className="truncate font-medium">{p.product_name}</p>
                          {code && <p className="truncate text-text-muted">{code}</p>}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">{p.quantity_bought}</td>
                        <td className="px-2 py-2 text-right">${cogs.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right">${sales.toFixed(2)}</td>
                        <td className={`px-2 py-2 text-right font-semibold ${hist > 0 ? 'text-warning' : 'text-text-muted'}`}>
                          {hist > 0 ? hist : '—'}
                        </td>
                        <td className={`px-2 py-2 text-right font-medium ${profit > 0 ? 'text-success' : 'text-danger'}`}>
                          ${profit.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-2 py-2">Total</td>
                    <td className="px-2 py-2 text-right">
                      {products.reduce((s, p) => s + p.quantity_bought, 0)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      ${products.reduce((s, p) => s + (p.total_cost ?? p.buy_cost * p.quantity_bought), 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      ${products.reduce((s, p) => s + (p.total_sales ?? p.estimated_sale_price * p.quantity_bought), 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-2 text-right text-text-muted">—</td>
                    <td className="px-2 py-2 text-right text-success">
                      ${products.reduce((s, p) => s + (p.total_profit ?? (p.estimated_sale_price - p.buy_cost) * p.quantity_bought), 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Optional details */}
        <Collapsible
          title="Señal de internet"
          summary={
            wifiSignal
              ? `Registrada: ${wifiOptions.find((o) => o.value === wifiSignal)?.label}`
              : 'Opcional · afecta el puntaje'
          }
          icon={
            <IconChip tone="info">
              <Wifi size={16} />
            </IconChip>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            {wifiOptions.map((opt) => {
              const Icon = opt.icon;
              const selected = wifiSignal === opt.value;
              const sel =
                opt.value === 'good'
                  ? 'border-success bg-success text-white'
                  : opt.value === 'regular'
                    ? 'border-warning bg-warning text-white'
                    : 'border-danger bg-danger text-white';
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWifiSignal(opt.value)}
                  className={`min-h-[72px] rounded-xl border-2 py-3 text-center text-sm font-semibold transition-colors ${
                    selected ? sel : 'border-border text-text-secondary hover:border-primary/40'
                  }`}
                >
                  <Icon size={20} className="mx-auto mb-1.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Collapsible>

        <Collapsible
          title="Recibos"
          summary={receiptUrls.length > 0 ? `${receiptUrls.length} guardado(s)` : 'Opcional'}
          icon={
            <IconChip tone="danger">
              <Camera size={16} />
            </IconChip>
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleReceiptCapture}
            className="hidden"
          />
          <div className="grid grid-cols-3 gap-2">
            {receiptUrls.map((url) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-border">
                <Image src={url} alt="Recibo" fill className="object-cover" unoptimized />
                <button
                  type="button"
                  onClick={() => removeReceipt(url)}
                  aria-label="Quitar recibo"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingReceipt}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-text-muted transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
            >
              {uploadingReceipt ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Camera size={20} />
              )}
              <span className="text-[11px] font-medium">
                {uploadingReceipt ? 'Subiendo...' : 'Tomar Foto'}
              </span>
            </button>
          </div>
        </Collapsible>

        <Collapsible
          title="Notas"
          summary={notes ? notes.slice(0, 60) : 'Opcional'}
          icon={
            <IconChip tone="neutral">
              <StickyNote size={16} />
            </IconChip>
          }
        >
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Calidad del clearance, competencia, secciones que valen la pena..."
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            rows={3}
          />
        </Collapsible>

        {/* Desktop save */}
        <div className="hidden md:block">
          <Button
            fullWidth
            size="lg"
            onClick={saveVisit}
            loading={saving}
            disabled={!rating}
            className="gap-2"
          >
            <Save size={18} />
            Guardar Visita
          </Button>
        </div>
      </div>

      {/* Sticky save bar — mobile */}
      <div className="fixed inset-x-0 bottom-[56px] z-40 border-t border-border bg-surface/95 p-3 backdrop-blur-md safe-bottom md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">
              {rating ? 'Utilidad' : 'Falta calificar'}
            </p>
            <p
              className={`text-lg font-bold leading-tight tabular ${projectedProfit >= 0 ? 'text-success' : 'text-danger'}`}
            >
              ${projectedProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              {liveROI !== 0 && (
                <span className="ml-1 text-xs font-semibold text-text-muted">{liveROI}%</span>
              )}
            </p>
          </div>
          <Button
            size="lg"
            onClick={saveVisit}
            loading={saving}
            disabled={!rating}
            className="shrink-0 gap-2"
          >
            <Save size={18} />
            Guardar
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
