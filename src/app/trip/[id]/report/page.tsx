'use client';

import { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardTitle } from '@/components/ui/card';
import { RatingBadge } from '@/components/ui/badge';
import type { SourcingTrip, TripStop, Store } from '@/types/database';
import {
  Trophy,
  MapPin,
  Package,
  DollarSign,
  SkipForward,
  TrendingUp,
  Wallet,
} from 'lucide-react';

interface StopWithStore extends TripStop {
  store: Store;
}

interface TripExpense {
  id: string;
  category_name: string;
  amount: number;
}

interface GroupedProduct {
  code: string;
  product_name: string;
  quantity: number;
  totalCost: number;
  totalSales: number;
  totalProfit: number;
}

export default function TripReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<SourcingTrip | null>(null);
  const [stops, setStops] = useState<StopWithStore[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [products, setProducts] = useState<GroupedProduct[]>([]);

  useEffect(() => {
    loadReport();
  }, [id]);

  async function loadReport() {
    const supabase = createClient();

    const [{ data: tripData }, { data: stopsData }, { data: expensesData }, { data: productsData }] =
      await Promise.all([
        supabase.from('sourcing_trips').select('*').eq('id', id).single(),
        supabase
          .from('trip_stops')
          .select('*, store:stores(*)')
          .eq('trip_id', id)
          .order('stop_order', { ascending: true }),
        supabase
          .from('trip_expenses')
          .select('id, category_name, amount')
          .eq('trip_id', id),
        supabase
          .from('found_products')
          .select('product_name, upc, quantity_bought, buy_cost, estimated_sale_price, estimated_profit')
          .eq('trip_id', id),
      ]);

    if (expensesData) setExpenses(expensesData);

    // Group products by UPC/code
    if (productsData && productsData.length > 0) {
      const grouped = new Map<string, GroupedProduct>();
      for (const row of productsData as any[]) {
        const code = row.upc || row.product_name;
        const qty = row.quantity_bought ?? 0;
        const cost = row.buy_cost ?? 0;
        const sale = row.estimated_sale_price ?? 0;
        const profit = row.estimated_profit ?? 0;

        const existing = grouped.get(code);
        if (existing) {
          existing.quantity += qty;
          existing.totalCost += cost * qty;
          existing.totalSales += sale * qty;
          existing.totalProfit += profit;
        } else {
          grouped.set(code, {
            code,
            product_name: row.product_name,
            quantity: qty,
            totalCost: cost * qty,
            totalSales: sale * qty,
            totalProfit: profit,
          });
        }
      }
      const sorted = Array.from(grouped.values()).sort((a, b) => b.quantity - a.quantity);
      setProducts(sorted);
    }

    if (tripData) {
      setTrip(tripData);
      if (tripData.status !== 'completed') {
        await supabase
          .from('sourcing_trips')
          .update({ status: 'completed' })
          .eq('id', id);
      }
    }
    if (stopsData) setStops(stopsData as StopWithStore[]);
  }

  if (!trip) {
    return (
      <AppShell>
        <Header title="Cargando..." showBack />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  const visitedStops = stops.filter((s) => s.status === 'completed');
  const totalSpent = visitedStops.reduce((sum, s) => sum + (s.total_spent || 0), 0);
  const totalItemsBought = visitedStops.reduce((sum, s) => sum + (s.total_items_bought || 0), 0);
  const totalProfit = visitedStops.reduce((sum, s) => sum + (s.estimated_profit || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const realProfit = totalProfit - totalExpenses;
  const roiPercent = totalSpent > 0 ? Math.round((realProfit / totalSpent) * 100) : 0;

  // Group expenses by category for the P&L breakdown
  const expensesByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category_name] = (acc[e.category_name] ?? 0) + (e.amount || 0);
    return acc;
  }, {});

  const topSpendStore = visitedStops.length > 0
    ? visitedStops.reduce((top, s) => ((s.total_spent || 0) > (top.total_spent || 0) ? s : top))
    : null;

  return (
    <AppShell>
      <Header title="Reporte de la Ruta" showBack />

      <div className="space-y-4 p-4 md:mx-auto md:max-w-2xl md:p-0">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-6 text-center text-white shadow-xl shadow-emerald-500/25">
          <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <Trophy size={26} className="text-amber-300" />
            </div>
            <h2 className="mt-3 text-2xl font-extrabold">¡Día de sourcing completado!</h2>
            <p className="mt-1 text-sm text-emerald-100">
              {new Date(trip.trip_date).toLocaleDateString('es-CO', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="!rounded-2xl text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20">
              <MapPin size={18} />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold">{visitedStops.length}</p>
            <p className="text-xs text-text-muted">Tiendas</p>
          </Card>
          <Card className="!rounded-2xl text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20">
              <Package size={18} />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold">{totalItemsBought}</p>
            <p className="text-xs text-text-muted">Artículos</p>
          </Card>
          <Card className="!rounded-2xl text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20">
              <DollarSign size={18} />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold">${totalSpent.toFixed(0)}</p>
            <p className="text-xs text-text-muted">Gastado</p>
          </Card>
        </div>

        {/* P&L: product profit − route expenses = real profit */}
        <Card className="!rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <TrendingUp size={16} />
            </span>
            <CardTitle>Resultado de la Ruta</CardTitle>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>Utilidad proyectada (productos)</span>
              <span className="font-medium">
                ${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {Object.entries(expensesByCategory).map(([name, amount]) => (
              <div key={name} className="flex justify-between text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <Wallet size={12} className="text-amber-600" />
                  {name}
                </span>
                <span className="text-danger">
                  −${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}

            {totalExpenses > 0 && (
              <div className="flex justify-between border-t border-border pt-1.5 text-text-secondary">
                <span>Total gastos de ruta</span>
                <span className="font-medium text-danger">
                  −${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl bg-surface-secondary px-3 py-2.5 mt-2">
              <span className="font-bold">Utilidad Real</span>
              <div className="text-right">
                <p className={`text-lg font-bold leading-tight ${realProfit >= 0 ? 'text-green-600' : 'text-danger'}`}>
                  ${realProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                {roiPercent !== 0 && (
                  <p className="text-xs text-text-muted">{roiPercent}% ROI sobre lo gastado</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Top spending store */}
        {topSpendStore && (
          <Card className="!rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Trophy size={16} />
              </span>
              <CardTitle>Mayor Gasto</CardTitle>
            </div>
            <p className="font-medium">{topSpendStore.store.name}</p>
            <p className="text-sm text-text-muted">
              ${(topSpendStore.total_spent || 0).toFixed(0)} gastado ·{' '}
              {topSpendStore.total_items_bought || 0} artículos
            </p>
          </Card>
        )}

        {/* Products table */}
        {products.length > 0 && (
          <Card className="!rounded-2xl">
            <CardTitle>Productos Comprados</CardTitle>
            <div className="mt-3 overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="pb-2 text-left font-medium">Producto</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">COGS</th>
                    <th className="pb-2 text-right font-medium">Venta</th>
                    <th className="pb-2 text-right font-medium">Utilidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((p) => (
                    <tr key={p.code} className="text-text">
                      <td className="py-2 pr-3 max-w-[160px]">
                        <p className="truncate font-medium">{p.product_name}</p>
                        {p.code && <p className="text-text-muted truncate text-[10px]">{p.code}</p>}
                      </td>
                      <td className="py-2 text-right font-semibold">{p.quantity}</td>
                      <td className="py-2 text-right">
                        ${p.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 text-right">
                        ${p.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`py-2 text-right font-medium ${
                          p.totalProfit >= 0 ? 'text-green-600' : 'text-danger'
                        }`}
                      >
                        ${p.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-bold text-text">
                    <td className="py-2 pr-3">Total</td>
                    <td className="py-2 text-right">
                      {products.reduce((s, p) => s + p.quantity, 0)}
                    </td>
                    <td className="py-2 text-right">
                      $
                      {products
                        .reduce((s, p) => s + p.totalCost, 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 text-right">
                      $
                      {products
                        .reduce((s, p) => s + p.totalSales, 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 text-right text-green-600">
                      $
                      {products
                        .reduce((s, p) => s + p.totalProfit, 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* All stops detail */}
        <Card className="!rounded-2xl">
          <CardTitle>Todas las Paradas</CardTitle>
          <div className="mt-2 space-y-3">
            {stops.map((stop) => (
              <div key={stop.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-muted w-5">
                    {stop.stop_order}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{stop.store.name}</p>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      {stop.status === 'completed' && stop.user_rating && (
                        <RatingBadge rating={stop.user_rating} />
                      )}
                      {stop.status === 'skipped' && (
                        <span className="flex items-center gap-1">
                          <SkipForward size={12} /> Saltada
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {stop.status === 'completed' && (
                  <div className="text-right">
                    <p className="text-sm font-medium text-secondary">
                      ${(stop.total_spent || 0).toFixed(0)}
                    </p>
                    <p className="text-xs text-text-muted">{stop.total_items_bought || 0} artículos</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
