'use client';

import { useEffect, useMemo, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { ScoreBadge } from '@/components/ui/badge';
import { LocationInput } from '@/components/route/location-input';
import { BrandCombobox } from '@/components/ui/brand-combobox';
import { RoutePlannerMap, type RouteStats } from '@/components/maps/route-planner-map';
import { KNOWN_BRANDS, normalizeBrand } from '@/utils/brands';
import { toast } from '@/components/ui/toast';
import type { SourcingTrip, TripStop, Store } from '@/types/database';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Search,
  Plus,
  Save,
  Clock,
  Route as RouteIcon,
} from 'lucide-react';

interface EditableStop {
  store_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  score: number;
  planned_duration_minutes: number;
  // The stop number as it was when the editor was opened. Kept stable so
  // removing stop #4 doesn't relabel #7 as #6 mid-session and cause confusion
  // about which one you meant to delete. Null for stores added in this session
  // (they don't have an assigned position yet).
  original_order: number | null;
}

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

export default function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [notEditable, setNotEditable] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [startAddress, setStartAddress] = useState('');
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [endAddress, setEndAddress] = useState('');
  const [endLat, setEndLat] = useState<number | null>(null);
  const [endLng, setEndLng] = useState<number | null>(null);
  const [endMode, setEndMode] = useState<'return' | 'custom' | 'none'>('return');
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(40);

  const [stops, setStops] = useState<EditableStop[]>([]);
  const [originalStoreIds, setOriginalStoreIds] = useState<Set<string>>(new Set());
  const [removingOnly, setRemovingOnly] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FindResult[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Manual add (same flow as Crear Ruta): store name + address with Google
  // Places autocomplete, so you can add a store you know the address of
  // without depending on the text search finding it.
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualPlace, setManualPlace] = useState<{
    place_id: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [addingManual, setAddingManual] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const [mapStats, setMapStats] = useState<RouteStats | null>(null);

  // Stable reference so the map only redraws when the stops actually change.
  const mapStops = useMemo(
    () =>
      stops.map((s) => ({
        place_id: s.store_id,
        name: s.name,
        brand: normalizeBrand(s.name),
        address: s.address,
        lat: s.lat,
        lng: s.lng,
      })),
    [stops]
  );

  useEffect(() => {
    loadTrip();
  }, [id]);

  // Attach Google Places autocomplete to the manual address field once the
  // Maps JS bundle (loaded in the root layout) is available.
  useEffect(() => {
    if (loading || notEditable) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let listener: any;

    function tryInit() {
      if (cancelled || !addressInputRef.current) return;
      if (!window.google?.maps?.places) {
        setTimeout(tryInit, 200);
        return;
      }

      const autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ['place_id', 'formatted_address', 'geometry', 'name'],
      });

      listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return;
        setManualAddress(place.formatted_address || '');
        setManualPlace({
          place_id: place.place_id || `manual-${Date.now()}`,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
        // Prefill the store name from the place when the user left it blank
        setManualName((prev) => prev || place.name || '');
      });
    }

    tryInit();
    return () => {
      cancelled = true;
      if (listener) window.google?.maps?.event?.removeListener(listener);
    };
  }, [loading, notEditable]);

  async function loadTrip() {
    const supabase = createClient();

    const [{ data: tripData }, { data: stopsData }] = await Promise.all([
      supabase.from('sourcing_trips').select('*').eq('id', id).single(),
      supabase
        .from('trip_stops')
        .select('*, store:stores(*)')
        .eq('trip_id', id)
        .order('stop_order', { ascending: true }),
    ]);

    if (!tripData) {
      setLoading(false);
      return;
    }

    const trip = tripData as SourcingTrip;

    if (trip.status !== 'planning') {
      setNotEditable(true);
      setLoading(false);
      return;
    }

    setName(trip.name || '');
    setTripDate(trip.trip_date);
    setStartAddress(trip.start_address);
    setStartLat(trip.start_lat);
    setStartLng(trip.start_lng);
    setEndAddress(trip.end_address);
    setEndLat(trip.end_lat);
    setEndLng(trip.end_lng);
    setAvoidTolls(trip.avoid_tolls);
    setAvoidHighways(trip.avoid_highways);
    setDefaultDuration(trip.default_store_duration_minutes);

    if (stopsData) {
      const typedStops = stopsData as (TripStop & { store: Store })[];

      // Work out how the route currently ends. An open-ended route was saved
      // with the last stop as its destination, so matching coordinates there
      // means "sin destino" rather than a real custom endpoint.
      const lastStop = typedStops[typedStops.length - 1];
      const endsAtLastStop =
        !!lastStop &&
        trip.end_lat === lastStop.store.lat &&
        trip.end_lng === lastStop.store.lng;

      if (trip.start_address === trip.end_address) {
        setEndMode('return');
      } else if (endsAtLastStop) {
        setEndMode('none');
      } else {
        setEndMode('custom');
      }

      setStops(
        typedStops.map((s) => ({
          store_id: s.store.id,
          name: s.store.name,
          address: s.store.address,
          lat: s.store.lat,
          lng: s.store.lng,
          score: s.score,
          planned_duration_minutes: s.planned_duration_minutes,
          original_order: s.stop_order,
        }))
      );
      setOriginalStoreIds(new Set(typedStops.map((s) => s.store.id)));
    }

    setLoading(false);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);

    try {
      const response = await fetch('/api/stores/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, lat: startLat, lng: startLng }),
      });
      const data = await response.json();
      const results: FindResult[] = data.results || [];
      setSearchResults(results);
      if (results.length === 0) {
        toast.info('No se encontraron tiendas. Prueba escribiendo la dirección arriba.');
      }
    } finally {
      setSearching(false);
    }
  }

  async function addStore(result: FindResult) {
    setAddingId(result.google_place_id);
    try {
      const response = await fetch('/api/stores/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      const data = await response.json();
      if (data.store_id) {
        if (stops.some((s) => s.store_id === data.store_id)) {
          toast.info('Esa tienda ya está en la ruta.');
          return;
        }
        toast.success(`${result.name} agregada a la ruta`);
        setStops((prev) => [
          ...prev,
          {
            store_id: data.store_id,
            name: result.name,
            address: result.address,
            lat: result.lat,
            lng: result.lng,
            score: 0,
            planned_duration_minutes: defaultDuration,
            original_order: null,
          },
        ]);
        setSearchResults((prev) => prev.filter((r) => r.google_place_id !== result.google_place_id));
      }
    } finally {
      setAddingId(null);
    }
  }

  // Adds a store typed by hand (name + address). Persists it first so it has a
  // real store id to attach to the trip when you save.
  async function addManualStore() {
    if (!manualAddress.trim()) return;
    if (!manualPlace) {
      toast.error('Elige una dirección de la lista de sugerencias de Google.');
      return;
    }

    const finalName = manualName.trim() || normalizeBrand(manualAddress) || manualAddress;

    if (stops.some((s) => s.address === manualAddress)) {
      toast.info('Esa tienda ya está en la ruta.');
      return;
    }

    setAddingManual(true);
    try {
      const response = await fetch('/api/stores/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_place_id: manualPlace.place_id,
          name: finalName,
          address: manualAddress,
          lat: manualPlace.lat,
          lng: manualPlace.lng,
        }),
      });
      const data = await response.json();
      if (!data.store_id) {
        toast.error('No se pudo guardar la tienda. Intenta de nuevo.');
        return;
      }

      if (stops.some((s) => s.store_id === data.store_id)) {
        toast.info('Esa tienda ya está en la ruta.');
        return;
      }

      setStops((prev) => [
        ...prev,
        {
          store_id: data.store_id,
          name: finalName,
          address: manualAddress,
          lat: manualPlace.lat,
          lng: manualPlace.lng,
          score: 0,
          planned_duration_minutes: defaultDuration,
          original_order: null,
        },
      ]);
      toast.success(`${finalName} agregada a la ruta`);
      setManualName('');
      setManualAddress('');
      setManualPlace(null);
      if (addressInputRef.current) addressInputRef.current.value = '';
    } finally {
      setAddingManual(false);
    }
  }

  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStop(index: number, direction: -1 | 1) {
    setStops((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const removedStoreIds = [...originalStoreIds].filter(
    (storeId) => !stops.some((s) => s.store_id === storeId)
  );

  // Just deletes the removed stops from the DB — no route recalculation, no
  // reordering, no touching the trip's saved distance/time/polyline. Use this
  // when all you did was remove stores and want that persisted without
  // triggering a full recalculate (which previously could resurface stops that
  // failed to delete due to a missing RLS policy — now fixed, but this path is
  // also just simpler/cheaper for a pure removal).
  async function handleRemoveOnly() {
    if (removedStoreIds.length === 0) return;
    setRemovingOnly(true);

    try {
      const response = await fetch('/api/route/remove-stops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: id, store_ids: removedStoreIds }),
      });

      if (response.ok) {
        setOriginalStoreIds((prev) => {
          const next = new Set(prev);
          removedStoreIds.forEach((storeId) => next.delete(storeId));
          return next;
        });
        toast.success('Paradas quitadas de la ruta');
      } else {
        toast.error('No se pudieron quitar las paradas');
      }
    } finally {
      setRemovingOnly(false);
    }
  }

  async function handleSave() {
    if (stops.length === 0 || !startLat || !startLng) return;
    setSaving(true);

    if (endMode === 'custom' && (endLat == null || endLng == null)) {
      toast.error('Elige una dirección válida para el punto final.');
      setSaving(false);
      return;
    }

    // Open-ended sends the last stop as the endpoint; the API resolves the real
    // destination from the stop list either way.
    const lastStop = stops[stops.length - 1];
    const finalEndAddress =
      endMode === 'return' ? startAddress : endMode === 'custom' ? endAddress : lastStop.address;
    const finalEndLat =
      endMode === 'return' ? startLat : endMode === 'custom' ? endLat : lastStop.lat;
    const finalEndLng =
      endMode === 'return' ? startLng : endMode === 'custom' ? endLng : lastStop.lng;

    try {
      const response = await fetch('/api/route/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: id,
          name: name || null,
          trip_date: tripDate,
          start_address: startAddress,
          start_lat: startLat,
          start_lng: startLng,
          end_address: finalEndAddress,
          end_lat: finalEndLat,
          end_lng: finalEndLng,
          open_ended: endMode === 'none',
          avoid_tolls: avoidTolls,
          avoid_highways: avoidHighways,
          default_store_duration_minutes: defaultDuration,
          stops: stops.map((s) => ({
            store_id: s.store_id,
            planned_duration_minutes: s.planned_duration_minutes,
          })),
        }),
      });

      if (response.ok) {
        toast.success('Ruta actualizada');
        router.push(`/trip/${id}`);
      } else {
        toast.error('No se pudo guardar la ruta. Intenta de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center p-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (notEditable) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg p-8 text-center">
          <p className="font-medium">Esta ruta ya no se puede editar</p>
          <p className="mt-1 text-sm text-text-muted">
            Solo las rutas que aún no han iniciado se pueden cambiar manualmente.
          </p>
          <Link href={`/trip/${id}`} className="mt-4 inline-block">
            <Button variant="outline">Volver a la ruta</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-0">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/trip/${id}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft size={16} />
            Volver
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Editar Ruta</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_1.3fr]">
        {/* Left column: trip details */}
        <div className="space-y-4">
          <Card>
            <CardTitle>Info de la Ruta</CardTitle>
            <div className="mt-3 space-y-3">
              <Input
                label="Nombre"
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
            <CardTitle>Ubicación</CardTitle>
            <div className="mt-3 space-y-3">
              <LocationInput
                label="Punto de inicio"
                value={startAddress}
                onChange={(val, lat, lng) => {
                  setStartAddress(val);
                  if (lat != null) setStartLat(lat);
                  if (lng != null) setStartLng(lng);
                }}
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
                      className={`min-h-[60px] rounded-xl border p-2.5 text-center transition-colors ${
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
                    Ideal para viajes de varios días — no cuenta el regreso a casa ni suma
                    distancia innecesaria.
                  </p>
                )}
              </div>

              {endMode === 'custom' && (
                <LocationInput
                  label="Punto final"
                  value={endAddress}
                  onChange={(val, lat, lng) => {
                    setEndAddress(val);
                    if (lat != null) setEndLat(lat);
                    if (lng != null) setEndLng(lng);
                  }}
                  placeholder="Destino diferente"
                />
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Ajustes</CardTitle>
            <div className="mt-3 space-y-3">
              <Input
                label="Tiempo por tienda (minutos)"
                type="number"
                min={10}
                max={120}
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(Number(e.target.value))}
              />
              <Toggle label="Evitar peajes" checked={avoidTolls} onChange={setAvoidTolls} />
              <Toggle label="Evitar autopistas" checked={avoidHighways} onChange={setAvoidHighways} />
            </div>
          </Card>

          <Button
            fullWidth
            size="lg"
            onClick={handleSave}
            loading={saving}
            disabled={stops.length === 0}
            className="gap-2"
          >
            <Save size={18} />
            Guardar y Recalcular Ruta
          </Button>
        </div>

        {/* Right column: stops list + add store */}
        <div className="space-y-4">
          <Card padding={false} className="overflow-hidden">
            <div className="p-4 pb-3">
              <CardTitle>Mapa de la Ruta</CardTitle>
              <p className="mt-0.5 text-xs text-text-muted">
                Vista previa en vivo. Se actualiza al agregar, quitar o reordenar paradas.
              </p>
            </div>
            <RoutePlannerMap
              startLat={startLat}
              startLng={startLng}
              endLat={endMode === 'return' ? startLat : endMode === 'custom' ? endLat : null}
              endLng={endMode === 'return' ? startLng : endMode === 'custom' ? endLng : null}
              openEnded={endMode === 'none'}
              stops={mapStops}
              onStats={setMapStats}
            />
            {mapStats && (
              <div className="flex items-center gap-4 border-t border-border px-4 py-3 text-sm">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <RouteIcon size={15} className="text-primary" />
                  <span className="tabular font-semibold text-text">
                    {mapStats.distanceMiles}
                  </span>{' '}
                  mi
                </span>
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <Clock size={15} className="text-primary" />
                  <span className="tabular font-semibold text-text">
                    {Math.floor(mapStats.driveMinutes / 60)}h {mapStats.driveMinutes % 60}m
                  </span>{' '}
                  manejando
                </span>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>Agregar una Tienda</CardTitle>

            <div className="mt-3 space-y-2.5">
              <div>
                <BrandCombobox
                  label="Marca / Nombre de Tienda"
                  brands={KNOWN_BRANDS}
                  value={manualName}
                  onChange={setManualName}
                  onEnter={() => addressInputRef.current?.focus()}
                  placeholder='Ej: "Ross", "Marshalls", "TJ Maxx"'
                />
                {manualName.trim() && (
                  <p className="mt-1 text-xs text-text-muted">
                    Marca:{' '}
                    <span className="font-semibold text-primary">
                      {normalizeBrand(manualName)}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    ref={addressInputRef}
                    label="Dirección"
                    value={manualAddress}
                    onChange={(e) => {
                      setManualAddress(e.target.value);
                      setManualPlace(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManualStore();
                      }
                    }}
                    placeholder="Busca una dirección..."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={addManualStore}
                    loading={addingManual}
                    disabled={!manualAddress.trim()}
                    className="gap-1"
                  >
                    <Plus size={16} />
                    Agregar
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-text-muted">
                ¿No sabes la dirección? Búscala por nombre
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Ej: Ross Kissimmee"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleSearch}
                  loading={searching}
                  className="shrink-0 px-3"
                >
                  <Search size={18} />
                </Button>
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map((result) => (
                  <div
                    key={result.google_place_id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{result.name}</p>
                      <p className="text-xs text-text-muted truncate">{result.address}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addStore(result)}
                      loading={addingId === result.google_place_id}
                      className="shrink-0 gap-1"
                    >
                      <Plus size={14} />
                      Agregar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Paradas ({stops.length})</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemoveOnly}
                loading={removingOnly}
                disabled={removedStoreIds.length === 0}
                className="gap-1 shrink-0"
                title="Elimina solo las paradas quitadas — deja todo lo demás igual, sin recalcular"
              >
                <Trash2 size={14} />
                Guardar solo quitadas
              </Button>
            </div>

            {stops.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                Sin paradas aún. Busca arriba para agregar tiendas a esta ruta.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {stops.map((stop, index) => (
                  <div
                    key={`${stop.store_id}-${index}`}
                    className="flex items-center gap-2 rounded-xl border border-border p-2.5"
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      title={stop.original_order == null ? 'New stop — not yet saved' : `Original position ${stop.original_order}`}
                    >
                      {stop.original_order ?? '+'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{stop.name}</p>
                        {stop.score > 0 && <ScoreBadge score={stop.score} />}
                      </div>
                      <p className="text-xs text-text-muted truncate">{stop.address}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => moveStop(index, -1)}
                        disabled={index === 0}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary disabled:opacity-30"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        onClick={() => moveStop(index, 1)}
                        disabled={index === stops.length - 1}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary disabled:opacity-30"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        onClick={() => removeStop(index)}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
    </AppShell>
  );
}
