'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Plus, Store, User } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/route/create', label: 'Crear', icon: Plus },
  { href: '/stores', label: 'Tiendas', icon: Store },
  { href: '/profile', label: 'Perfil', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-transparent px-4 pb-3 safe-bottom md:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-4 rounded-2xl border border-border bg-surface/95 px-1.5 py-1.5 shadow-soft-lg backdrop-blur-md">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors ${
                isActive ? 'bg-primary/10 text-primary' : 'text-text-muted active:bg-surface-secondary'
              }`}
            >
              <span className={item.href === '/route/create' ? 'flex h-9 w-9 -translate-y-1 items-center justify-center rounded-full bg-primary text-white shadow-sm' : ''}>
                <Icon size={item.href === '/route/create' ? 20 : 21} strokeWidth={isActive ? 2.5 : 2} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
