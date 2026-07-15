'use client';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

export function Toggle({ label, checked, onChange, description }: ToggleProps) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <div>
        <span className="text-sm font-medium text-text">{label}</span>
        {description && <p className="text-xs text-text-muted">{description}</p>}
      </div>
      <button
        role="switch"
        type="button"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
          transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-primary
          ${checked ? 'bg-primary' : 'bg-gray-300'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm
            ring-0 transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </label>
  );
}
