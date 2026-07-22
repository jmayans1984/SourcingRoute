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
    <aside className="hidden shrink-0 border-r border-border bg-surface/80 backdrop-blur-sm md:flex md:w-64 md:flex-col">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md shadow-indigo-500/30">
          <Route size={18} />
        </div>
        <span className="text-lg font-extrabold tracking-tight text-brand-gradient">
          SourcingRoute
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-brand-gradient text-white shadow-md shadow-indigo-500/25'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-xs text-text-muted">
        <p className="font-semibold text-text-secondary">SourcingRoute</p>
        <p>Retail arbitrage planner</p>
      </div>
    </aside>
  );
}
