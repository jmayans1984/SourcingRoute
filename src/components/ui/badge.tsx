import type { ReactNode } from 'react';
import type { StopStatus, StoreRating, WifiSignal, TripStatus } from '@/types/database';
import { Wifi, WifiOff } from 'lucide-react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  muted: 'bg-gray-100 text-gray-500',
};

export function Badge({
  children,
  variant = 'default',
  className = '',
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

const stopStatusConfig: Record<StopStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pendiente', variant: 'muted' },
  on_the_way: { label: 'En camino', variant: 'info' },
  arrived: { label: 'Llegué', variant: 'warning' },
  completed: { label: 'Completada', variant: 'success' },
  skipped: { label: 'Saltada', variant: 'muted' },
};

export function StopStatusBadge({ status }: { status: StopStatus }) {
  const config = stopStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function ScoreBadge({ score }: { score: number }) {
  let variant: BadgeVariant = 'danger';
  if (score >= 75) variant = 'success';
  else if (score >= 50) variant = 'warning';
  else if (score >= 25) variant = 'default';
  return <Badge variant={variant}>Pts {score}</Badge>;
}

const ratingLabels: Record<StoreRating, { label: string; variant: BadgeVariant }> = {
  1: { label: 'Mala', variant: 'danger' },
  2: { label: 'Regular', variant: 'warning' },
  3: { label: 'Buena', variant: 'success' },
};

export function RatingBadge({ rating }: { rating: StoreRating }) {
  const config = ratingLabels[rating];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const wifiConfig: Record<WifiSignal, { label: string; variant: BadgeVariant }> = {
  bad: { label: 'Sin señal', variant: 'danger' },
  regular: { label: 'Señal débil', variant: 'warning' },
  good: { label: 'Buena señal', variant: 'success' },
};

export function WifiBadge({ signal }: { signal: WifiSignal }) {
  const config = wifiConfig[signal];
  const Icon = signal === 'bad' ? WifiOff : Wifi;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={11} />
      {config.label}
    </Badge>
  );
}

const tripStatusConfig: Record<TripStatus, { label: string; variant: BadgeVariant }> = {
  planning: { label: 'Planeando', variant: 'muted' },
  active: { label: 'En ruta', variant: 'info' },
  completed: { label: 'Completada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const config = tripStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
