'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MapPin, Store, User } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/route/create', label: 'New Route', icon: MapPin },
  { href: '/stores', label: 'Stores', icon: Store },
  { href: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface safe-bottom md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors ${
                isActive ? 'text-primary' : 'text-text-muted'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={isActive ? 'font-medium' : ''}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
