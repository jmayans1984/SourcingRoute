'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // Suppress transitions for one frame: elements transitioning a var-driven
  // color otherwise stay stuck on the previous theme's value.
  root.classList.add('theme-switching');
  root.dataset.theme = theme;
  void root.offsetHeight; // force the new colors to be committed

  window.requestAnimationFrame(() => {
    root.classList.remove('theme-switching');
  });

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / storage disabled — the theme still applies for this session
  }
}

/** Reads the theme already set on <html> by the pre-paint script in the layout. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    setThemeState(readTheme());
  }, []);

  function setTheme(next: Theme) {
    applyTheme(next);
    setThemeState(next);
  }

  return [theme, setTheme];
}

/** Compact icon button — used in the app header. */
export function ThemeToggleButton({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className={`flex h-10 w-10 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text ${className}`}
    >
      {isDark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

/** Segmented control — used in the profile screen. */
export function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
  ];

  return (
    <div className="inline-flex w-full gap-1 rounded-xl bg-surface-secondary p-1">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              active
                ? 'bg-surface text-text shadow-soft'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            <Icon size={16} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
