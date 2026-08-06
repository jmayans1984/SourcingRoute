'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

// Module-level store so `toast.success(...)` works from anywhere without
// threading a context through every component.
let items: ToastItem[] = [];
let listeners: ((next: ToastItem[]) => void)[] = [];
let nextId = 1;

function emit() {
  const snapshot = [...items];
  listeners.forEach((l) => l(snapshot));
}

function dismiss(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}

function push(type: ToastType, message: string, duration: number) {
  const id = nextId++;
  items = [...items, { id, type, message }];
  emit();
  setTimeout(() => dismiss(id), duration);
  return id;
}

export const toast = {
  success: (message: string) => push('success', message, 3500),
  error: (message: string) => push('error', message, 7000),
  info: (message: string) => push('info', message, 4000),
  dismiss,
};

const styles: Record<ToastType, { icon: typeof CheckCircle2; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'text-success' },
  error: { icon: AlertCircle, accent: 'text-danger' },
  info: { icon: Info, accent: 'text-info' },
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (next: ToastItem[]) => setToasts(next);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 md:left-auto md:right-4 md:items-end">
      {toasts.map((t) => {
        const { icon: Icon, accent } = styles[t.type];
        return (
          <div
            key={t.id}
            role="status"
            className="animate-slide-up pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-soft-lg"
          >
            <Icon size={19} className={`mt-0.5 shrink-0 ${accent}`} />
            <p className="flex-1 text-sm leading-snug text-text">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar"
              className="shrink-0 rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
