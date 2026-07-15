'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ChevronDown } from 'lucide-react';

interface BrandComboboxProps {
  brands: string[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  onEnter?: () => void;
}

// A styled autocomplete for picking a brand, replacing the native <datalist>
// (which renders unstyled, browser-default dropdowns).
export function BrandCombobox({
  brands,
  value,
  onChange,
  label,
  placeholder,
  onEnter,
}: BrandComboboxProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? brands.filter((b) => b.toLowerCase().includes(query))
    : brands;

  return (
    <div ref={wrapRef} className="relative">
      <Input
        label={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            setOpen(false);
            onEnter?.();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
      />
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 bottom-3 text-text-muted"
      />

      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
          {filtered.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                onChange(b);
                setOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-text transition-colors hover:bg-surface-secondary"
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
