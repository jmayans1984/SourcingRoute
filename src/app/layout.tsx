import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Toaster } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'SourcingRoute — Retail Arbitrage Route Planner',
  description: 'Plan optimized sourcing routes for retail arbitrage. Find stores, create routes, track visits, and maximize profit.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SourcingRoute',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1014' },
  ],
};

// Runs before first paint so the saved theme is applied without a flash.
const THEME_INIT = `
try {
  var t = localStorage.getItem('theme');
  if (t !== 'dark' && t !== 'light') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=geometry,places`}
          strategy="beforeInteractive"
        />
      </head>
      <body className="h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
