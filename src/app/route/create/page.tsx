'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StopPicker, type ManualStop } from '@/components/route/stop-picker';
import { LocationInput } from '@/components/route/location-input';
import { RoutePlannerMap, type RouteStats } from '@/components/maps/route-planner-map';
import { formatDistance, formatDuration } from '@/utils/geo';
import { Route, MapPin, Clock, Store, Timer } from 'lucide-react';

export default function CreateRoutePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [tripDate, setTripDate] = useState(new Date().toISOString().split('T')[0]);
  const [startAddress, setStartAddress] = useState('');
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [endMode, setEndMode] = useState<'return' | 'custom' | 'none'>('return');
  const [endAddress, setEndAddress] = useState('');
  const [endLat, setEndLat] = useState<number | null>(null);
  const [endLng, setEndLng] = useState<number | null>(null);
  const [stops, setStops] = useState<ManualStop[]>([]);
  const [storeDurationMinutes, setStoreDurationMinutes] = useState(40);
  const [brands, setBrands] = useState<string[]>([]);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);

  // Stops are visited in the order you arrange them; tolls/highways use defaults.
  const optimizeOrder = false;
  const avoidTolls = false;
  const avoidHighways = false;

  useEffect(() => {
    loadUserPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadUserPreferences() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setPageLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('users_profile')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profile) {
      setStoreDurationMinutes(profile.default_store_duration_minutes || 40);
      if (profile.preferred_chains?.length) setBrands(profile.preferred_chains);
      if (profile.home_address) {
        setStartAddress(profile.home_address);
        setStartLat(profile.home_lat);
        setStartLng(profile.home_lng);
      }
    }

    setPageLoading(false);
  }

  const canSubmit = startAddress.length > 0 && stops.length > 0;
  const timeInStoresMinutes = stops.length * storeDurationMinutes;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/route/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trip_date: tripDate,
          start_address: startAddress,
          start_lat: startLat,
          start_lng: startLng,
          end_address:
            endMode === 'return' ? startAddress : endMode === 'custom' ? endAddress : '',
          end_lat: endMode === 'return' ? startLat : endMode === 'custom' ? endLat : null,
          end_lng: endMode === 'return' ? startLng : endMode === 'custom' ? endLng : null,
          open_ended: endMode === 'none',
          manual_stops: stops,
          optimize_order: optimizeOrder,
          default_store_duration_minutes: storeDurationMinutes,
          avoid_tolls: avoidTolls,
          avoid_highways: avoidHighways,
        }),
      });

      const data = await response.json();
      if (data.trip_id) {
        router.push(`/trip/${data.trip_id}`);
        return;
      }
      setError(data.error || 'No se pudo crear la ruta. Intenta de nuevo.');
      setLoading(false);
    } catch {
      setError('No se pudo crear la ruta. Intenta de nuevo.');
      setLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <AppShell>
        <Header title="Crear Ruta" showBack />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Header title="Crear Ruta" showBack />

      <form onSubmit={handleSubmit} className="p-4 md:p-0">
        <div className="gap-5 space-y-4 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:items-start lg:space-y-0">
          {/* Left column: the form */}
          <div className="space-y-4">
            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-secondary text-xs text-text-secondary">1</span>
                Detalles de la Ruta
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Nombre (opcional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Sábado en Orlando"
                />
                <Input
                  label="Fecha"
                  type="date"
                  value={tripDate}
                  onChange={(e) => setTripDate(e.target.value)}
                />
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-secondary text-xs text-text-secondary">2</span>
                Inicio y Fin
              </h3>
              <div className="space-y-3">
                <LocationInput
                  label="Punto de inicio"
                  value={startAddress}
                  onChange={(val, lat, lng) => {
                    setStartAddress(val);
                    setStartLat(lat ?? null);
                    setStartLng(lng ?? null);
                  }}
                  placeholder="Tu dirección de inicio"
                />

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">
                    Fin de la ruta
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'return', label: 'Volver al inicio', hint: 'Ida y vuelta' },
                      { value: 'custom', label: 'Otro destino', hint: 'Punto final distinto' },
                      { value: 'none', label: 'Sin destino', hint: 'Termina en la última tienda' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEndMode(opt.value)}
                        className={`min-h-[60px] rounded-lg border p-2.5 text-center transition-colors ${
                          endMode === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-text-secondary hover:border-primary/40'
                        }`}
                      >
                        <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                        <p className="mt-0.5 text-[10px] leading-tight text-text-muted">{opt.hint}</p>
                      </button>
                    ))}
                  </div>
                  {endMode === 'none' && (
                    <p className="mt-2 text-xs text-text-muted">
                      Ideal para viajes de varios días — no cuenta el regreso a casa ni suma distancia
                      innecesaria.
                    </p>
                  )}
                </div>

                {endMode === 'custom' && (
                  <LocationInput
                    label="Punto final"
                    value={endAddress}
                    onChange={(val, lat, lng) => {
                      setEndAddress(val);
                      setEndLat(lat ?? null);
                      setEndLng(lng ?? null);
                    }}
                    placeholder="Destino diferente"
                  />
                )}
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-secondary text-xs text-text-secondary">3</span>
                Tiendas a Visitar
              </h3>
              <StopPicker stops={stops} onChange={setStops} brands={brands} />
            </Card>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {error}
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
              disabled={!canSubmit}
              className="gap-2"
            >
              <Route size={20} />
              Crear Ruta ({stops.length} {stops.length === 1 ? 'parada' : 'paradas'})
            </Button>
          </div>

          {/* Right column: live map + KPIs */}
          <div className="space-y-3 lg:sticky lg:top-4">
            <RoutePlannerMap
              startLat={startLat}
              startLng={startLng}
              endLat={endMode === 'return' ? startLat : endMode === 'custom' ? endLat : null}
              endLng={endMode === 'return' ? startLng : endMode === 'custom' ? endLng : null}
              openEnded={endMode === 'none'}
              stops={stops}
              optimizeOrder={optimizeOrder}
              onStats={setRouteStats}
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="text-center">
                <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <MapPin size={16} />
                </span>
                <p className="mt-2 text-lg font-semibold tabular">
                  {routeStats ? formatDistance(routeStats.distanceMiles) : '--'}
                </p>
                <p className="text-[11px] text-text-muted">Distancia</p>
              </Card>
              <Card className="text-center">
                <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
                  <Clock size={16} />
                </span>
                <p className="mt-2 text-lg font-semibold tabular">
                  {routeStats ? formatDuration(routeStats.driveMinutes + timeInStoresMinutes) : '--'}
                </p>
                <p className="text-[11px] text-text-muted">Tiempo Total</p>
              </Card>
              <Card className="text-center">
                <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
                  <Timer size={16} />
                </span>
                <p className="mt-2 text-lg font-semibold tabular">
                  {stops.length > 0 ? formatDuration(timeInStoresMinutes) : '--'}
                </p>
                <p className="text-[11px] text-text-muted">En Tiendas</p>
              </Card>
              <Card className="text-center">
                <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
                  <Store size={16} />
                </span>
                <p className="mt-2 text-lg font-semibold tabular">{stops.length}</p>
                <p className="text-[11px] text-text-muted">Paradas</p>
              </Card>
            </div>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
