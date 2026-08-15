'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  action?: ReactNode;
  /** Hide the light/dark switch (e.g. when the screen has its own actions). */
  hideThemeToggle?: boolean;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  action,
  hideThemeToggle = false,
}: HeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur-md md:static md:bg-transparent md:backdrop-blur-none">
      <div className="mx-auto flex h-[68px] max-w-xl items-center gap-2 px-5 md:h-auto md:max-w-none md:px-0 md:pb-6 md:pt-1">
        {showBack && (
          <button
            onClick={() => router.back()}
            aria-label="Volver"
            className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold md:text-2xl">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs text-text-muted md:text-sm">{subtitle}</p>
          )}
        </div>
        {action}
        {!hideThemeToggle && <ThemeToggleButton className="-mr-1 shrink-0" />}
      </div>
    </header>
  );
}
