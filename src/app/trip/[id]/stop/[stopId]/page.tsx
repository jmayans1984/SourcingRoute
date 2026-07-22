'use client';

import { useEffect, useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StopStatusBadge } from '@/components/ui/badge';
import { buildWazeUrl, buildGoogleMapsStopUrl } from '@/utils/navigation';
import type { TripStop, Store, StoreRating, WifiSignal } from '@/types/database';
import {
  Navigation,
  ExternalLink,
  Star,
  Save,
  Wifi,
  WifiOff,
  SignalMedium,
  Camera,
  X,
  Loader2,
  FileSpreadsheet,
  Store as StoreIcon,
  DollarSign,
  TrendingUp,
  Sparkles,
  Package,
} from 'lucide-react';

interface StopWithStore extends TripStop {
  store: Store;
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

const emptyProduct: ProductEntry = {
  product_name: '',
  buy_cost: 0,
  estimated_sale_price: 0,
  quantity_found: 1,
  quantity_bought: 0,
  notes: '',
};

const wifiOptions: { value: WifiSignal; label: string; icon: typeof Wifi }[] = [
  { value: 'bad', label: 'Sin señal', icon: WifiOff },
  { value: 'regular', label: 'Débil', icon: SignalMedium },
  { value: 'good', label: 'Buena', icon: Wifi },
];

export default function StopDetailPage({
  params,
}: {
  params: Promise<{ id: string; stopId: string }>;
}) {
  const { id, stopId } = use(params);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stop, setStop] = useState<StopWithStore | null>(null);
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
    loadStop();
  }, [stopId]);

  async function loadStop() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('trip_stops')
      .select('*, store:stores(*)')
      .eq('id', stopId)
      .single();

    if (error) {
      console.error('[loadStop] trip_stops select failed:', error);
    }

    if (data) {
      const stopData = data as StopWithStore;
      setStop(stopData);
      setRating(stopData.user_rating);
      setWifiSignal(stopData.wifi_signal);
      setNotes(stopData.notes || '');
      setTotalSpent(stopData.total_spent || 0);
      setTotalItemsBought(stopData.total_items_bought || 0);
      setProjectedProfit(stopData.estimated_profit || 0);
      setProjectedSales(stopData.projected_sales || 0);
      setReceiptUrls(stopData.receipt_photo_urls || []);

      // Load previously saved products for this stop (e.g. viewing a completed visit)
      const { data: savedProducts } = await supabase
        .from('found_products')
        .select('product_name, upc, buy_cost, estimated_sale_price, quantity_found, quantity_bought, estimated_profit, notes')
        .eq('trip_stop_id', stopId);

      if (savedProducts && savedProducts.length > 0) {
        setProducts(
          savedProducts.map((p) => ({
            product_name: p.product_name,
            upc: p.upc || undefined,
            buy_cost: p.buy_cost || 0,
            estimated_sale_price: p.estimated_sale_price || 0,
            quantity_found: p.quantity_found || 0,
            quantity_bought: p.quantity_bought || 0,
            total_cost: (p.buy_cost || 0) * (p.quantity_bought || 0),
            total_sales: (p.estimated_sale_price || 0) * (p.quantity_bought || 0),
            total_profit: p.estimated_profit || 0,
            notes: p.notes || '',
          }))
        );
      }
    }
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
      const res = await fetch('/api/sheets/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error importing');

      if (!data.rowCount) {
        alert(
          'No se encontraron filas con datos en la hoja (001-01, desde la fila 2). La hoja NO fue borrada. Revisa que los datos estén en las columnas correctas.'
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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al importar del Sheet');
    } finally {
      setImporting(false);
    }
  }

  async function loadHistoricalQty(names: string[]) {
    if (names.length === 0) return;
    const supabase = createClient();
    // Sum units bought of each product at OTHER stops within this same trip
    const { data } = await supabase
      .from('found_products')
      .select('product_name, quantity_bought')
      .eq('trip_id', id)
      .neq('trip_stop_id', stopId)
      .in('product_name', names);

    if (!data) return;
    const totals: Record<string, number> = {};
    for (const row of data) {
      totals[row.product_name] = (totals[row.product_name] ?? 0) + (row.quantity_bought ?? 0);
    }
    setHistoricalQty(totals);
  }

  function addProduct() {
    setProducts((prev) => [...prev, { ...emptyProduct }]);
  }

  function updateProduct(index: number, updates: Partial<ProductEntry>) {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
  }

  function removeProduct(index: number) {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleReceiptCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !stop) return;

    setUploadingReceipt(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUploadingReceipt(false);
      return;
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/${stop.store.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('receipts').upload(path, file, {
      contentType: file.type,
    });

    if (!error) {
      const { data: urlData } = await supabase.storage
        .from('receipts')
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (urlData?.signedUrl) {
        setReceiptUrls((prev) => [...prev, urlData.signedUrl]);
      }
    }

    setUploadingReceipt(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeReceipt(url: string) {
    setReceiptUrls((prev) => prev.filter((u) => u !== url));
  }

  async function saveAndComplete() {
    if (!stop) return;
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const productsProfit = products.reduce(
      (sum, p) => sum + (p.estimated_sale_price - p.buy_cost) * p.quantity_bought,
      0
    );
    // Prefer projected profit from Google Sheets import; fall back to manual products
    const finalProfit = projectedProfit > 0 ? projectedProfit : productsProfit;

    const { error: updateError } = await supabase
      .from('trip_stops')
      .update({
        status: 'completed',
        user_rating: rating,
        wifi_signal: wifiSignal,
        notes,
        found_products_count: totalItemsBought || products.length,
        estimated_profit: finalProfit,
        projected_sales: projectedSales,
        total_spent: totalSpent,
        total_items_bought: totalItemsBought,
        receipt_photo_urls: receiptUrls,
        actual_departure_at: new Date().toISOString(),
      })
      .eq('id', stopId);

    if (updateError) {
      console.error('[saveAndComplete] trip_stops update failed:', updateError);
      alert(`Error al guardar: ${updateError.message}`);
      setSaving(false);
      return;
    }

    if (rating) {
      await supabase.from('store_visits').insert({
        user_id: user.id,
        store_id: stop.store.id,
        trip_id: id,
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
      });
    }

    if (products.length > 0) {
      // Avoid duplicating rows if re-saving an already-completed stop
      await supabase.from('found_products').delete().eq('trip_stop_id', stopId);

      const productRecords = products
        .filter((p) => p.product_name)
        .map((p) => ({
          user_id: user.id,
          store_id: stop.store.id,
          trip_id: id,
          trip_stop_id: stopId,
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

    router.push(`/trip/${id}`);
  }

  if (!stop) {
    return (
      <AppShell>
        <Header title="Cargando..." showBack />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  const liveROI = totalSpent > 0 ? Math.round((projectedProfit / totalSpent) * 100) : 0;

  return (
    <AppShell>
      <Header title={stop.store.name} showBack />

      <div className="space-y-4 p-4 pb-28 md:mx-auto md:max-w-2xl md:p-0 md:pb-10">
        {/* Store hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 text-white shadow-xl shadow-indigo-500/25">
          <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 right-16 h-52 w-52 rounded-full bg-fuchsia-400/20 blur-3xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                  <StoreIcon size={18} />
                </span>
                <StopStatusBadge status={stop.status} />
              </div>
              <h2 className="mt-3 truncate text-xl font-extrabold leading-tight">{stop.store.name}</h2>
              <p className="mt-0.5 text-sm text-indigo-100/90">{stop.store.address}</p>
            </div>
          </div>

          <div className="relative mt-4 flex gap-2">
            <a
              href={buildWazeUrl(stop.store.lat, stop.store.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <button className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-indigo-700 shadow-md transition-colors hover:bg-blue-50">
                <Navigation size={15} />
                Waze
              </button>
            </a>
            <a
              href={buildGoogleMapsStopUrl(stop.store.lat, stop.store.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <button className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
                <ExternalLink size={15} />
                Maps
              </button>
            </a>
          </div>
        </div>

        {/* Live P&L summary — mirrors the totals below, updates as you type */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <Card className="!rounded-2xl !p-3 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20">
              <DollarSign size={15} />
            </div>
            <p className="mt-1.5 text-base font-extrabold leading-tight">
              ${totalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">Gastado</p>
          </Card>
          <Card className="!rounded-2xl !p-3 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20">
              <TrendingUp size={15} />
            </div>
            <p className="mt-1.5 text-base font-extrabold leading-tight">
              ${projectedSales.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">Venta Proy.</p>
          </Card>
          <Card className="!rounded-2xl !p-3 text-center">
            <div
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-md ${
                projectedProfit >= 0
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20'
                  : 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/20'
              }`}
            >
              <Sparkles size={15} />
            </div>
            <p
              className={`mt-1.5 text-base font-extrabold leading-tight ${projectedProfit >= 0 ? 'text-emerald-600' : 'text-danger'}`}
            >
              ${projectedProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-text-muted">
              Utilidad{liveROI !== 0 ? ` · ${liveROI}%` : ''}
            </p>
          </Card>
        </div>

        {/* Rating */}
        <Card className="!rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Star size={16} />
            </span>
            <CardTitle>Califica esta tienda</CardTitle>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([1, 2, 3] as StoreRating[]).map((r) => {
              const selected = rating === r;
              const sel =
                r === 3
                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                  : r === 2
                    ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25'
                    : 'border-rose-500 bg-rose-500 text-white shadow-md shadow-rose-500/25';
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRating(r)}
                  className={`rounded-2xl border-2 py-3.5 text-center text-sm font-semibold transition-all ${
                    selected ? sel : 'border-border text-text-muted hover:border-primary/40'
                  }`}
                >
                  <Star size={22} className={`mx-auto mb-1 ${selected ? 'fill-current' : ''}`} />
                  {r === 3 ? 'Buena' : r === 2 ? 'Regular' : 'Mala'}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Wifi / data signal */}
        <Card className="!rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <Wifi size={16} />
            </span>
            <CardTitle>Señal de Internet / Datos</CardTitle>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Una señal mala hace difícil trabajar la tienda — baja mucho su puntaje.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {wifiOptions.map((opt) => {
              const Icon = opt.icon;
              const selected = wifiSignal === opt.value;
              const sel =
                opt.value === 'good'
                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                  : opt.value === 'regular'
                    ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25'
                    : 'border-rose-500 bg-rose-500 text-white shadow-md shadow-rose-500/25';
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWifiSignal(opt.value)}
                  className={`rounded-2xl border-2 py-3.5 text-center text-sm font-semibold transition-all ${
                    selected ? sel : 'border-border text-text-muted hover:border-primary/40'
                  }`}
                >
                  <Icon size={22} className="mx-auto mb-1" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Purchase totals */}
        <Card className="!rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <DollarSign size={16} />
            </span>
            <CardTitle>Totales de Compra</CardTitle>
          </div>

          {/* Import CTA — the fast path from the Amazon calculator sheet */}
          <button
            type="button"
            onClick={importFromSheets}
            disabled={importing}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 text-left transition-colors hover:from-emerald-100 hover:to-teal-100 disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
                {importing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={18} />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  {importing ? 'Importando...' : 'Importar desde Google Sheets'}
                </p>
                <p className="text-xs text-emerald-700/70">Calculadora de Amazon · autocompleta los totales</p>
              </div>
            </div>
            <ExternalLink size={16} className="shrink-0 text-emerald-600" />
          </button>

          {importResult && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">✓</span>
              Importado — <strong>{importResult.rowCount} producto{importResult.rowCount !== 1 ? 's' : ''}</strong> · hoja limpiada
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Input
              label="Gastado"
              type="number"
              step="0.01"
              min="0"
              value={totalSpent || ''}
              onChange={(e) => handleSpentChange(Number(e.target.value))}
              placeholder="$0.00"
            />
            <Input
              label="Artículos Comprados"
              type="number"
              min="0"
              value={totalItemsBought || ''}
              onChange={(e) => handleItemsChange(Number(e.target.value))}
              placeholder="0"
            />
            <Input
              label="Venta Proyectada"
              type="number"
              step="0.01"
              min="0"
              value={projectedSales || ''}
              onChange={(e) => setProjectedSales(Number(e.target.value))}
              placeholder="$0.00"
            />
            <Input
              label="Utilidad Proyectada"
              type="number"
              step="0.01"
              min="0"
              value={projectedProfit || ''}
              onChange={(e) => setProjectedProfit(Number(e.target.value))}
              placeholder="$0.00"
            />
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Al editar «Gastado» o «Artículos», la venta y utilidad se recalculan proporcionalmente.
          </p>
        </Card>

        {/* Products */}
        {products.length > 0 && (
          <Card className="!rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                <Package size={16} />
              </span>
              <CardTitle>Productos Importados</CardTitle>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Agrupado por código · Hist. = qty comprada en otras tiendas de esta ruta.
            </p>
            <div className="mt-3 overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary text-text-muted">
                    <th className="rounded-l-lg px-2 py-2 text-left font-semibold">Producto</th>
                    <th className="px-2 py-2 text-right font-semibold">Qty</th>
                    <th className="px-2 py-2 text-right font-semibold">COGS</th>
                    <th className="px-2 py-2 text-right font-semibold">Venta</th>
                    <th className="px-2 py-2 text-right font-semibold">Hist.</th>
                    <th className="rounded-r-lg px-2 py-2 text-right font-semibold">Utilidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((p, i) => {
                    const cogs    = p.total_cost    ?? p.buy_cost * p.quantity_bought;
                    const sales   = p.total_sales   ?? p.estimated_sale_price * p.quantity_bought;
                    const profit  = p.total_profit  ?? (p.estimated_sale_price - p.buy_cost) * p.quantity_bought;
                    const hist    = historicalQty[p.product_name] ?? 0;
                    const code    = p.upc || p.asin || '';
                    return (
                      <tr key={i} className="text-text">
                        <td className="px-2 py-2 pr-3 max-w-[160px]">
                          <p className="truncate font-medium">{p.product_name}</p>
                          {code && <p className="text-text-muted truncate">{code}</p>}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">{p.quantity_bought}</td>
                        <td className="px-2 py-2 text-right">${cogs.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right">${sales.toFixed(2)}</td>
                        <td className={`px-2 py-2 text-right font-semibold ${hist > 0 ? 'text-amber-600' : 'text-text-muted'}`}>
                          {hist > 0 ? hist : '—'}
                        </td>
                        <td className={`px-2 py-2 text-right font-medium ${profit > 0 ? 'text-green-600' : 'text-danger'}`}>
                          ${profit.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border font-bold text-text">
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
                    <td className="px-2 py-2 text-right text-green-600">
                      ${products.reduce((s, p) => s + (p.total_profit ?? (p.estimated_sale_price - p.buy_cost) * p.quantity_bought), 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Receipt photos */}
        <Card className="!rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
              <Camera size={16} />
            </span>
            <CardTitle>Recibos</CardTitle>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleReceiptCapture}
            className="hidden"
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {receiptUrls.map((url) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-border">
                <Image src={url} alt="Recibo" fill className="object-cover" unoptimized />
                <button
                  type="button"
                  onClick={() => removeReceipt(url)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingReceipt}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-text-muted transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
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
        </Card>

        {/* Notes */}
        <Card className="!rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <FileSpreadsheet size={16} />
            </span>
            <CardTitle>Notas</CardTitle>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Calidad del clearance, competencia, secciones que valen la pena..."
            className="mt-3 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            rows={3}
          />
        </Card>

        {/* Desktop save button (mobile uses the sticky bar below) */}
        <div className="hidden md:block">
          <Button fullWidth size="lg" onClick={saveAndComplete} loading={saving} className="gap-2">
            <Save size={18} />
            Guardar y Completar Visita
          </Button>
        </div>
      </div>

      {/* Sticky save bar — mobile, sits above the bottom nav */}
      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-surface/95 p-3 backdrop-blur-md safe-bottom md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">Utilidad proyectada</p>
            <p className={`text-lg font-extrabold leading-tight ${projectedProfit >= 0 ? 'text-emerald-600' : 'text-danger'}`}>
              ${projectedProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              {liveROI !== 0 && <span className="ml-1 text-xs font-semibold text-text-muted">{liveROI}%</span>}
            </p>
          </div>
          <Button size="lg" onClick={saveAndComplete} loading={saving} className="shrink-0 gap-2">
            <Save size={18} />
            Completar
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
