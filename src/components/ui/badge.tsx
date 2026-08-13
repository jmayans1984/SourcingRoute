import type { ReactNode } from 'react';
import type { StopStatus, StoreRating, WifiSignal, TripStatus } from '@/types/database';
import { Wifi, WifiOff } from 'lucide-react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

// Tinted with the semantic token at low opacity so badges read correctly in
// both light and dark themes without a second palette.
const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-secondary text-text-secondary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/12 text-info',
  muted: 'bg-surface-secondary text-text-muted',
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
      className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold ${variantStyles[variant]} ${className}`}
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
