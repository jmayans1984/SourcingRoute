'use client';

import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-text">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full rounded-xl border bg-surface px-4 py-2.5 text-text
            placeholder:text-text-muted
            focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
            disabled:bg-surface-secondary disabled:text-text-muted
            ${error ? 'border-danger' : 'border-border'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        {hint && !error && <p className="text-sm text-text-muted">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
