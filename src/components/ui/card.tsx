import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: boolean;
}

export function Card({ children, padding = true, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface shadow-soft ${padding ? 'p-4' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-3 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-base font-semibold text-text ${className}`}>{children}</h3>;
}

/**
 * Section heading used above groups of cards — a small accent bar plus a label,
 * with optional trailing content (counts, actions).
 */
export function SectionTitle({
  children,
  action,
  className = '',
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        <span className="h-3.5 w-1 rounded-full bg-primary" />
        {children}
      </h3>
      {action}
    </div>
  );
}

/** Small tinted icon container used in card headers. */
export function IconChip({
  children,
  tone = 'primary',
}: {
  children: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}) {
  const tones: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-info/10 text-info',
    neutral: 'bg-surface-secondary text-text-secondary',
  };
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
      {children}
    </span>
  );
}
