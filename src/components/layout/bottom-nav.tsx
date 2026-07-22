'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Route, Store, User } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/route/create', label: 'Nueva', icon: Route },
  { href: '/stores', label: 'Tiendas', icon: Store },
  { href: '/profile', label: 'Perfil', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md safe-bottom md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors"
            >
              <span
                className={`flex h-9 w-14 items-center justify-center rounded-2xl transition-all ${
                  isActive
                    ? 'bg-brand-gradient text-white shadow-md shadow-indigo-500/30'
                    : 'text-text-muted'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </span>
              <span className={isActive ? 'font-semibold text-primary' : 'text-text-muted'}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
