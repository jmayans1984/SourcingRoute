import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: boolean;
}

export function Card({ children, padding = true, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface shadow-sm ${padding ? 'p-4' : ''} ${className}`}
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
  return <h3 className={`text-lg font-semibold text-text ${className}`}>{children}</h3>;
}
