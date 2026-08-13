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
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors ${
                isActive ? 'text-text' : 'text-text-muted active:bg-surface-secondary'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.4 : 1.9} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
