'use client';

import type { ReactNode } from 'react';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full bg-bg">
      <Sidebar />
      <div className="flex min-h-full flex-1 flex-col">
        <main className="flex-1 pb-24 md:pb-10">
          <div className="mx-auto w-full max-w-lg md:max-w-7xl md:px-8 md:py-6">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
