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

export default function TripReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<SourcingTrip | null>(null);
  const [stops, setStops] = useState<StopWithStore[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);

  useEffect(() => {
    loadReport();
  }, [id]);

  async function loadReport() {
    const supabase = createClient();

    const [{ data: tripData }, { data: stopsData }, { data: expensesData }] = await Promise.all([
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
    ]);

    if (expensesData) setExpenses(expensesData);

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
        <Header title="Loading..." showBack />
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
      <Header title="Trip Report" showBack />

      <div className="space-y-4 p-4 md:mx-auto md:max-w-2xl md:p-0">
        <div className="text-center">
          <h2 className="text-xl font-bold">Sourcing Day Complete!</h2>
          <p className="text-sm text-text-muted">
            {new Date(trip.trip_date).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <MapPin size={20} className="mx-auto text-primary" />
            <p className="mt-1 text-2xl font-bold">{visitedStops.length}</p>
            <p className="text-xs text-text-muted">Stores Visited</p>
          </Card>
          <Card className="text-center">
            <Package size={20} className="mx-auto text-accent" />
            <p className="mt-1 text-2xl font-bold">{totalItemsBought}</p>
            <p className="text-xs text-text-muted">Items Bought</p>
          </Card>
          <Card className="text-center">
            <DollarSign size={20} className="mx-auto text-secondary" />
            <p className="mt-1 text-2xl font-bold text-secondary">
              ${totalSpent.toFixed(0)}
            </p>
            <p className="text-xs text-text-muted">Total Spent</p>
          </Card>
        </div>

        {/* P&L: product profit − route expenses = real profit */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={18} className="text-green-600" />
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
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Trophy size={18} className="text-accent" />
              <CardTitle>Highest Spend</CardTitle>
            </div>
            <p className="font-medium">{topSpendStore.store.name}</p>
            <p className="text-sm text-text-muted">
              ${(topSpendStore.total_spent || 0).toFixed(0)} spent ·{' '}
              {topSpendStore.total_items_bought || 0} items
            </p>
          </Card>
        )}

        {/* All stops detail */}
        <Card>
          <CardTitle>All Stops</CardTitle>
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
                          <SkipForward size={12} /> Skipped
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
                    <p className="text-xs text-text-muted">{stop.total_items_bought || 0} items</p>
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
