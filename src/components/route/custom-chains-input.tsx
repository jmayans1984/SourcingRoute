'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface CustomChainsInputProps {
  chains: string[];
  onChange: (chains: string[]) => void;
}

export function CustomChainsInput({ chains, onChange }: CustomChainsInputProps) {
  const [inputValue, setInputValue] = useState('');

  function addChain() {
    const newChain = inputValue.trim();
    if (newChain && !chains.includes(newChain)) {
      onChange([...chains, newChain]);
      setInputValue('');
    }
  }

  function removeChain(chain: string) {
    onChange(chains.filter((c) => c !== chain));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addChain();
            }
          }}
          placeholder="Add a store (e.g., Kohl's, Target, Macy's)"
          className="flex-1"
        />
        <Button
          type="button"
          onClick={addChain}
          disabled={!inputValue.trim()}
          variant="outline"
          className="gap-1"
        >
          <Plus size={16} />
          Add
        </Button>
      </div>

      {chains.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chains.map((chain) => (
            <div
              key={chain}
              className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
            >
              <span>{chain}</span>
              <button
                type="button"
                onClick={() => removeChain(chain)}
                className="hover:text-primary/70 transition-colors"
                title={`Remove ${chain}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">No stores added yet</p>
      )}
    </div>
  );
}
