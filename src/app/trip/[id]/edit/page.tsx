'use client';

import { useEffect, useState, use } from 'react';
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
import type { SourcingTrip, TripStop, Store } from '@/types/database';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Search,
  Plus,
  Save,
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
  const [roundTrip, setRoundTrip] = useState(true);
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

  useEffect(() => {
    loadTrip();
  }, [id]);

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
    setRoundTrip(trip.start_address === trip.end_address);
    setAvoidTolls(trip.avoid_tolls);
    setAvoidHighways(trip.avoid_highways);
    setDefaultDuration(trip.default_store_duration_minutes);

    if (stopsData) {
      const typedStops = stopsData as (TripStop & { store: Store })[];
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
      setSearchResults(data.results || []);
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
      }
    } finally {
      setRemovingOnly(false);
    }
  }

  async function handleSave() {
    if (stops.length === 0 || !startLat || !startLng) return;
    setSaving(true);

    const finalEndAddress = roundTrip ? startAddress : endAddress;
    const finalEndLat = roundTrip ? startLat : endLat;
    const finalEndLng = roundTrip ? startLng : endLng;

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
        router.push(`/trip/${id}`);
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
          <p className="font-medium">This route can no longer be edited</p>
          <p className="mt-1 text-sm text-text-muted">
            Only routes that haven&apos;t started yet can be changed manually.
          </p>
          <Link href={`/trip/${id}`} className="mt-4 inline-block">
            <Button variant="outline">Back to trip</Button>
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
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Edit Route</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_1.3fr]">
        {/* Left column: trip details */}
        <div className="space-y-4">
          <Card>
            <CardTitle>Route Info</CardTitle>
            <div className="mt-3 space-y-3">
              <Input
                label="Route Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Orlando Saturday Run"
              />
              <Input
                label="Route Date"
                type="date"
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
              />
            </div>
          </Card>

          <Card>
            <CardTitle>Location</CardTitle>
            <div className="mt-3 space-y-3">
              <LocationInput
                label="Starting Point"
                value={startAddress}
                onChange={(val, lat, lng) => {
                  setStartAddress(val);
                  if (lat != null) setStartLat(lat);
                  if (lng != null) setStartLng(lng);
                }}
              />
              <Toggle
                label="Return to start"
                description="Use starting point as final destination"
                checked={roundTrip}
                onChange={setRoundTrip}
              />
              {!roundTrip && (
                <LocationInput
                  label="End Point"
                  value={endAddress}
                  onChange={(val, lat, lng) => {
                    setEndAddress(val);
                    if (lat != null) setEndLat(lat);
                    if (lng != null) setEndLng(lng);
                  }}
                />
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Settings</CardTitle>
            <div className="mt-3 space-y-3">
              <Input
                label="Default Time per Store (minutes)"
                type="number"
                min={10}
                max={120}
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(Number(e.target.value))}
              />
              <Toggle label="Avoid Tolls" checked={avoidTolls} onChange={setAvoidTolls} />
              <Toggle label="Avoid Highways" checked={avoidHighways} onChange={setAvoidHighways} />
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
            Save & Recalculate Route
          </Button>
        </div>

        {/* Right column: stops list + add store */}
        <div className="space-y-4">
          <Card>
            <CardTitle>Add a Store</CardTitle>
            <div className="mt-3 flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by name, e.g. Ross Kissimmee"
              />
              <Button onClick={handleSearch} loading={searching} className="shrink-0 px-3">
                <Search size={18} />
              </Button>
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
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Stops ({stops.length})</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemoveOnly}
                loading={removingOnly}
                disabled={removedStoreIds.length === 0}
                className="gap-1 shrink-0"
                title="Delete only the removed stops — keeps everything else exactly as-is, no recalculation"
              >
                <Trash2 size={14} />
                Save removals only
              </Button>
            </div>

            {stops.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                No stops yet. Search above to add stores to this route.
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
                        className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-danger"
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
