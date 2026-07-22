'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BrandCombobox } from '@/components/ui/brand-combobox';
import { ChevronUp, ChevronDown, MapPin, Trash2, Plus } from 'lucide-react';
import { KNOWN_BRANDS, normalizeBrand } from '@/utils/brands';

export interface ManualStop {
  place_id: string;
  name: string;
  brand: string;
  address: string;
  lat: number;
  lng: number;
}

interface StopPickerProps {
  stops: ManualStop[];
  onChange: (stops: ManualStop[]) => void;
  // The user's own brand list (from Store History → Por Marca). Falls back to
  // the built-in defaults when the user hasn't created any yet.
  brands?: string[];
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
  }
}

export function StopPicker({ stops, onChange, brands }: StopPickerProps) {
  const brandOptions = brands && brands.length > 0 ? brands : KNOWN_BRANDS;
  const [storeName, setStoreName] = useState('');
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [addressValue, setAddressValue] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<{ lat: number; lng: number } | null>(null);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
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
        fields: ['place_id', 'formatted_address', 'geometry'],
      });

      listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return;

        setAddressValue(place.formatted_address || '');
        setSelectedPlace({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      });
    }

    tryInit();

    return () => {
      cancelled = true;
      if (listener) window.google.maps.event.removeListener(listener);
    };
  }, []);

  function removeStop(placeId: string) {
    onChange(stops.filter((s) => s.place_id !== placeId));
  }

  function moveStop(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function handleAddClick() {
    if (!addressValue.trim()) return;

    const finalName = storeName.trim() || addressValue;
    const brand = normalizeBrand(storeName) || normalizeBrand(finalName);
    const newStop: ManualStop = {
      place_id: `manual-${Date.now()}`,
      name: finalName,
      brand,
      address: addressValue,
      lat: selectedPlace?.lat ?? 0,
      lng: selectedPlace?.lng ?? 0,
    };

    if (!stopsRef.current.some((s) => s.address === newStop.address)) {
      onChangeRef.current([...stopsRef.current, newStop]);
      setStoreName('');
      setAddressValue('');
      setSelectedPlace(null);
      if (addressInputRef.current) addressInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <BrandCombobox
            label="Marca / Nombre de Tienda"
            brands={brandOptions}
            value={storeName}
            onChange={setStoreName}
            onEnter={() => addressInputRef.current?.focus()}
            placeholder='Ej: "Ross", "Marshalls", "TJ Maxx"'
          />
          {storeName.trim() && (
            <p className="mt-1 text-xs text-text-muted">
              Marca:{' '}
              <span className="font-semibold text-primary">{normalizeBrand(storeName)}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              ref={addressInputRef}
              label="Dirección"
              value={addressValue}
              onChange={(e) => setAddressValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddClick();
                }
              }}
              placeholder="Busca una dirección..."
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleAddClick}
              disabled={!addressValue.trim()}
              className="gap-1"
            >
              <Plus size={16} />
              Agregar
            </Button>
          </div>
        </div>
      </div>

      {stops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <MapPin size={20} className="mx-auto text-text-muted" />
          <p className="mt-1 text-sm text-text-muted">
            Ingresa el nombre y la dirección de la tienda. Aparecerán en el mapa.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stops.map((stop, index) => (
            <div
              key={stop.place_id}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2.5"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => moveStop(index, -1)}
                  disabled={index === 0}
                  className="rounded p-0.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-primary disabled:opacity-30"
                  title="Subir"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => moveStop(index, 1)}
                  disabled={index === stops.length - 1}
                  className="rounded p-0.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-primary disabled:opacity-30"
                  title="Bajar"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{stop.name}</p>
                  {stop.brand && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {stop.brand}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-text-muted">{stop.address}</p>
              </div>
              <button
                type="button"
                onClick={() => removeStop(stop.place_id)}
                className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-danger"
                title="Remove stop"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
