'use client';

import { type SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-text">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            w-full rounded-xl border bg-surface px-4 py-2.5 text-text
            focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
            disabled:bg-surface-secondary disabled:text-text-muted
            ${error ? 'border-danger' : 'border-border'}
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
