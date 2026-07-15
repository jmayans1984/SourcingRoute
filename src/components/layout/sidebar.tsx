'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MapPin, Store, User, Route } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/route/create', label: 'New Route', icon: Route },
  { href: '/stores', label: 'Stores', icon: Store },
  { href: '/profile', label: 'Profile', icon: User },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden shrink-0 border-r border-border bg-surface md:flex md:w-60 md:flex-col">
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
          <MapPin size={18} />
        </div>
        <span className="text-lg font-bold">SourcingRoute</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
