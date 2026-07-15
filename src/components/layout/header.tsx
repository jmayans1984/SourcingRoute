'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  action?: ReactNode;
}

export function Header({ title, showBack = false, action }: HeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-sm md:static md:border-0 md:bg-transparent md:backdrop-blur-none">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4 md:h-auto md:max-w-none md:px-0 md:pb-4">
        {showBack && (
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center rounded-lg p-1.5 text-text-secondary hover:bg-surface-secondary"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="flex-1 truncate text-lg font-semibold md:text-2xl md:font-bold">{title}</h1>
        {action}
      </div>
    </header>
  );
}
