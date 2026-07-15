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
  pending: { label: 'Pending', variant: 'muted' },
  on_the_way: { label: 'On the way', variant: 'info' },
  arrived: { label: 'Arrived', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  skipped: { label: 'Skipped', variant: 'muted' },
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
  return <Badge variant={variant}>Score {score}</Badge>;
}

const ratingLabels: Record<StoreRating, { label: string; variant: BadgeVariant }> = {
  1: { label: 'Bad', variant: 'danger' },
  2: { label: 'OK', variant: 'warning' },
  3: { label: 'Good', variant: 'success' },
};

export function RatingBadge({ rating }: { rating: StoreRating }) {
  const config = ratingLabels[rating];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const wifiConfig: Record<WifiSignal, { label: string; variant: BadgeVariant }> = {
  bad: { label: 'No signal', variant: 'danger' },
  regular: { label: 'Weak signal', variant: 'warning' },
  good: { label: 'Good signal', variant: 'success' },
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
  planning: { label: 'Planning', variant: 'muted' },
  active: { label: 'Active', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const config = tripStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
