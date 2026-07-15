'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Crosshair, Loader2 } from 'lucide-react';
import { getCurrentPosition } from '@/utils/geo';

interface LocationInputProps {
  label: string;
  value: string;
  onChange: (value: string, lat?: number, lng?: number) => void;
  lat?: number;
  lng?: number;
  placeholder?: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
  }
}

export function LocationInput({ label, value, onChange, placeholder }: LocationInputProps) {
  const [locating, setLocating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Wires up Google's address autocomplete on the underlying input so users can
  // search and pick a precise address instead of relying on "use my location"
  // (which desktop browsers often deny or resolve very imprecisely).
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let listener: any;

    function tryInit() {
      if (cancelled || !inputRef.current) return;
      if (!window.google?.maps?.places) {
        setTimeout(tryInit, 200);
        return;
      }

      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'geometry'],
      });

      listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry?.location) {
          onChange(
            place.formatted_address || inputRef.current!.value,
            place.geometry.location.lat(),
            place.geometry.location.lng()
          );
        }
      });
    }

    tryInit();

    return () => {
      cancelled = true;
      if (listener) window.google.maps.event.removeListener(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;

      const response = await fetch(
        `/api/geocode/reverse?lat=${latitude}&lng=${longitude}`
      );
      const data = await response.json();

      onChange(data.address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude);
    } catch {
      onChange(value);
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-text">{label}</label>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Search for an address...'}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={useCurrentLocation}
          disabled={locating}
          className="shrink-0 px-3"
          title="Use current location"
        >
          {locating ? <Loader2 size={18} className="animate-spin" /> : <Crosshair size={18} />}
        </Button>
      </div>
    </div>
  );
}
