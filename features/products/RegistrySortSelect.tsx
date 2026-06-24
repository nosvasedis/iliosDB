import React from 'react';
import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { REGISTRY_SORT_OPTIONS, RegistrySortMode } from './productRegistryViewModels';

interface Props {
  value: RegistrySortMode;
  onChange: (value: RegistrySortMode) => void;
  className?: string;
  compact?: boolean;
}

export default function RegistrySortSelect({ value, onChange, className = '', compact = false }: Props) {
  const isNonDefault = value !== 'sku_asc';

  return (
    <div className={`relative min-w-0 ${className}`}>
      <ArrowUpDown
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${
          compact ? 'left-2.5' : 'left-3'
        } ${isNonDefault ? 'text-white/80' : 'text-slate-400'}`}
        size={compact ? 14 : 16}
      />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as RegistrySortMode)}
        className={`w-full appearance-none rounded-xl border font-bold outline-none transition-all focus:ring-4 focus:ring-emerald-500/10 ${
          compact ? 'py-3 pl-8 pr-8 text-xs' : 'py-3 pl-9 pr-9 text-sm'
        } ${
          isNonDefault
            ? 'border-[#060b00] bg-[#060b00] text-white'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
        aria-label="Ταξινόμηση κωδικών"
      >
        {REGISTRY_SORT_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} · {option.helper}
          </option>
        ))}
      </select>
      <ChevronDown
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${
          compact ? 'right-2' : 'right-2.5'
        } ${isNonDefault ? 'text-white/70' : 'text-slate-400'}`}
        size={compact ? 14 : 16}
      />
    </div>
  );
}
