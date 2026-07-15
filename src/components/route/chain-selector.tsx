'use client';

import { STORE_CHAINS } from '@/types/database';

interface ChainSelectorProps {
  selected: string[];
  onChange: (chains: string[]) => void;
}

export function ChainSelector({ selected, onChange }: ChainSelectorProps) {
  function toggleChain(chain: string) {
    if (selected.includes(chain)) {
      onChange(selected.filter((c) => c !== chain));
    } else {
      onChange([...selected, chain]);
    }
  }

  function selectAll() {
    onChange([...STORE_CHAINS]);
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-text">Store Chains</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-primary hover:underline"
          >
            All
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-text-muted hover:underline"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {STORE_CHAINS.map((chain) => {
          const isSelected = selected.includes(chain);
          return (
            <button
              key={chain}
              type="button"
              onClick={() => toggleChain(chain)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-secondary hover:border-primary/50'
              }`}
            >
              {chain}
            </button>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-danger">Select at least one chain</p>
      )}
    </div>
  );
}
