'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Store, User, Route } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/route/create', label: 'Nueva Ruta', icon: Route },
  { href: '/stores', label: 'Tiendas', icon: Store },
  { href: '/profile', label: 'Perfil', icon: User },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden shrink-0 border-r border-border bg-surface md:flex md:w-60 md:flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
          <Route size={18} />
        </div>
        <span className="text-base font-bold tracking-tight">SourcingRoute</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-xs text-text-muted">
        <p className="font-medium text-text-secondary">SourcingRoute</p>
        <p>Planificador de sourcing</p>
      </div>
    </aside>
  );
}
