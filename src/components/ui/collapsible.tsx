'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from './card';

/** Collapsed-by-default section so a long form stays short by default. */
export function Collapsible({
  title,
  icon,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card padding={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-surface-secondary hover:bg-surface-secondary"
      >
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">{title}</p>
          {summary && <p className="truncate text-xs text-text-muted">{summary}</p>}
        </div>
        <ChevronDown
          size={19}
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </Card>
  );
}
