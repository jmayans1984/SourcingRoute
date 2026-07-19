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
  Plus,
  Trash2,
  Save,
  Wifi,
  WifiOff,
  SignalMedium,
  Camera,
  X,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';

interface StopWithStore extends TripStop {
  store: Store;
}

interface ProductEntry {
  product_name: string;
  asin?: string;
  buy_cost: number;
  estimated_sale_price: number;
  quantity_found: number;
  quantity_bought: number;
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
  { value: 'bad', label: 'No Signal', icon: WifiOff },
  { value: 'regular', label: 'Weak', icon: SignalMedium },
  { value: 'good', label: 'Good', icon: Wifi },
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
    const { data } = await supabase
      .from('trip_stops')
      .select('*, store:stores(*)')
      .eq('id', stopId)
      .single();

    if (data) {
      const stopData = data as StopWithStore;
      setStop(stopData);
      setRating(stopData.user_rating);
      setWifiSignal(stopData.wifi_signal);
      setNotes(stopData.notes || '');
      setTotalSpent(stopData.total_spent || 0);
      setTotalItemsBought(stopData.total_items_bought || 0);
      setReceiptUrls(stopData.receipt_photo_urls || []);
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

    await supabase
      .from('trip_stops')
      .update({
        status: 'completed',
        user_rating: rating,
        wifi_signal: wifiSignal,
        notes,
        found_products_count: totalItemsBought || products.length,
        estimated_profit: finalProfit,
        total_spent: totalSpent,
        total_items_bought: totalItemsBought,
        receipt_photo_urls: receiptUrls,
        actual_departure_at: new Date().toISOString(),
      })
      .eq('id', stopId);

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
      const productRecords = products
        .filter((p) => p.product_name)
        .map((p) => ({
          user_id: user.id,
          store_id: stop.store.id,
          trip_id: id,
          trip_stop_id: stopId,
          product_name: p.product_name,
          buy_cost: p.buy_cost,
          estimated_sale_price: p.estimated_sale_price,
          estimated_profit: (p.estimated_sale_price - p.buy_cost) * p.quantity_bought,
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
        <Header title="Loading..." showBack />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Header title={stop.store.name} showBack />

      <div className="space-y-4 p-4 md:mx-auto md:max-w-2xl md:p-0">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{stop.store.name}</p>
              <p className="text-sm text-text-muted">{stop.store.address}</p>
            </div>
            <StopStatusBadge status={stop.status} />
          </div>

          <div className="mt-3 flex gap-2">
            <a
              href={buildWazeUrl(stop.store.lat, stop.store.lng)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="primary" className="gap-1">
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
                Google Maps
              </Button>
            </a>
          </div>
        </Card>

        {/* Rating */}
        <Card>
          <CardTitle>Rate this store</CardTitle>
          <div className="mt-2 flex gap-2">
            {([1, 2, 3] as StoreRating[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRating(r)}
                className={`flex-1 rounded-xl border-2 py-3 text-center text-sm font-medium transition-colors ${
                  rating === r
                    ? r === 3
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : r === 2
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                    : 'border-border text-text-muted hover:border-primary/30'
                }`}
              >
                <Star
                  size={20}
                  className={`mx-auto mb-1 ${rating === r ? 'fill-current' : ''}`}
                />
                {r === 3 ? 'Good' : r === 2 ? 'OK' : 'Bad'}
              </button>
            ))}
          </div>
        </Card>

        {/* Wifi / data signal */}
        <Card>
          <CardTitle>Internet / Data Signal</CardTitle>
          <p className="text-xs text-text-muted mt-0.5">
            Poor signal makes a store hard to work — it will be scored down heavily.
          </p>
          <div className="mt-2 flex gap-2">
            {wifiOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = wifiSignal === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWifiSignal(opt.value)}
                  className={`flex-1 rounded-xl border-2 py-3 text-center text-sm font-medium transition-colors ${
                    isSelected
                      ? opt.value === 'good'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : opt.value === 'regular'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-border text-text-muted hover:border-primary/30'
                  }`}
                >
                  <Icon size={20} className="mx-auto mb-1" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Purchase totals */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Purchase Totals</CardTitle>
              <p className="text-xs text-text-muted mt-0.5">
                Ingresa manualmente o importa desde tu calculadora de Amazon.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={importFromSheets}
              disabled={importing}
              className="gap-1.5 shrink-0 border-green-500 text-green-700 hover:bg-green-50"
            >
              {importing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={14} />
              )}
              {importing ? 'Importando...' : 'Importar Sheet'}
            </Button>
          </div>

          {importResult && (
            <div className="mt-3 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
              ✓ Importado — <strong>{importResult.rowCount} producto{importResult.rowCount !== 1 ? 's' : ''}</strong> · hoja limpiada
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
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
        </Card>

        {/* Receipt photos */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Receipts</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingReceipt}
              className="gap-1"
            >
              {uploadingReceipt ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
              {uploadingReceipt ? 'Uploading...' : 'Take Photo'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleReceiptCapture}
              className="hidden"
            />
          </div>

          {receiptUrls.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">No receipts saved yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {receiptUrls.map((url) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                  <Image src={url} alt="Receipt" fill className="object-cover" unoptimized />
                  <button
                    type="button"
                    onClick={() => removeReceipt(url)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Notes */}
        <Card>
          <CardTitle>Notes</CardTitle>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Clearance quality, competition, sections worth checking..."
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            rows={3}
          />
        </Card>

        {/* Products */}
        {products.length > 0 && (
          <Card>
            <CardTitle>Productos Importados</CardTitle>
            <p className="text-xs text-text-muted mt-0.5">
              Hist. = unidades de este producto ya compradas en otras tiendas de esta misma ruta.
            </p>
            <div className="mt-3 overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="pb-2 text-left font-medium">Producto</th>
                    <th className="pb-2 text-right font-medium">Costo</th>
                    <th className="pb-2 text-right font-medium">Venta</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Hist.</th>
                    <th className="pb-2 text-right font-medium">Utilidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((p, i) => {
                    const profit = (p.estimated_sale_price - p.buy_cost) * p.quantity_bought;
                    const hist = historicalQty[p.product_name] ?? 0;
                    return (
                      <tr key={i} className="text-text">
                        <td className="py-2 pr-3 max-w-[160px]">
                          <p className="truncate font-medium">{p.product_name}</p>
                          {p.asin && <p className="text-text-muted truncate">{p.asin}</p>}
                        </td>
                        <td className="py-2 text-right">${p.buy_cost.toFixed(2)}</td>
                        <td className="py-2 text-right">${p.estimated_sale_price.toFixed(2)}</td>
                        <td className="py-2 text-right font-medium">{p.quantity_bought}</td>
                        <td className={`py-2 text-right font-semibold ${hist > 0 ? 'text-amber-600' : 'text-text-muted'}`}>
                          {hist > 0 ? hist : '—'}
                        </td>
                        <td className={`py-2 text-right font-medium ${profit > 0 ? 'text-green-600' : 'text-danger'}`}>
                          ${profit.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Button fullWidth size="lg" onClick={saveAndComplete} loading={saving} className="gap-2">
          <Save size={18} />
          Save & Complete Visit
        </Button>
      </div>
    </AppShell>
  );
}
