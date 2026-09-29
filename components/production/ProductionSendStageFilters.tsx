import React from 'react';
import {
  PRODUCTION_SEND_STAGE_FILTER_ALL,
  type ProductionSendStageFilter,
  type ProductionSendStageFilterColorKey,
  type ProductionSendStageFilterOption,
} from '../../features/production/productionSendStageFilter';

const CHIP_STYLES: Record<ProductionSendStageFilterColorKey, { idle: string; active: string; dot: string; countIdle: string }> = {
  indigo: {
    idle: 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300',
    active: 'bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-500/25',
    dot: 'bg-indigo-500',
    countIdle: 'bg-white/80 text-indigo-700',
  },
  slate: {
    idle: 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200 hover:border-slate-300',
    active: 'bg-slate-700 text-white border-slate-800 shadow-md shadow-slate-700/20',
    dot: 'bg-slate-500',
    countIdle: 'bg-white/80 text-slate-700',
  },
  orange: {
    idle: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100 hover:border-orange-300',
    active: 'bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/25',
    dot: 'bg-orange-500',
    countIdle: 'bg-white/80 text-orange-700',
  },
  purple: {
    idle: 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100 hover:border-purple-300',
    active: 'bg-purple-600 text-white border-purple-700 shadow-md shadow-purple-500/25',
    dot: 'bg-purple-500',
    countIdle: 'bg-white/80 text-purple-700',
  },
  teal: {
    idle: 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100 hover:border-teal-300',
    active: 'bg-teal-600 text-white border-teal-700 shadow-md shadow-teal-500/25',
    dot: 'bg-teal-500',
    countIdle: 'bg-white/80 text-teal-700',
  },
  blue: {
    idle: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 hover:border-blue-300',
    active: 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-500/25',
    dot: 'bg-blue-500',
    countIdle: 'bg-white/80 text-blue-700',
  },
  pink: {
    idle: 'bg-pink-50 text-pink-800 border-pink-200 hover:bg-pink-100 hover:border-pink-300',
    active: 'bg-pink-600 text-white border-pink-700 shadow-md shadow-pink-500/25',
    dot: 'bg-pink-500',
    countIdle: 'bg-white/80 text-pink-700',
  },
  yellow: {
    idle: 'bg-yellow-50 text-yellow-900 border-yellow-200 hover:bg-yellow-100 hover:border-yellow-300',
    active: 'bg-yellow-500 text-yellow-950 border-yellow-600 shadow-md shadow-yellow-500/20',
    dot: 'bg-yellow-400',
    countIdle: 'bg-white/80 text-yellow-800',
  },
  emerald: {
    idle: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300',
    active: 'bg-emerald-600 text-white border-emerald-700 shadow-md shadow-emerald-500/25',
    dot: 'bg-emerald-500',
    countIdle: 'bg-white/80 text-emerald-700',
  },
};

interface ProductionSendStageFiltersProps {
  options: ProductionSendStageFilterOption[];
  value: ProductionSendStageFilter;
  onChange: (next: ProductionSendStageFilter) => void;
}

export const ProductionSendStageFilters = React.memo(function ProductionSendStageFilters({
  options,
  value,
  onChange,
}: ProductionSendStageFiltersProps) {
  if (options.length === 0) return null;

  const isAll = value === PRODUCTION_SEND_STAGE_FILTER_ALL;

  return (
    <div
      role="group"
      aria-label="Φίλτρο σταδίου παραγωγής"
      className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-xl border border-slate-100 shrink-0"
    >
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-1.5 hidden sm:inline">
        Στάδιο
      </span>

      <button
        type="button"
        aria-pressed={isAll}
        title="Όλα τα στάδια"
        onClick={() => onChange(PRODUCTION_SEND_STAGE_FILTER_ALL)}
        className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all whitespace-nowrap ${
          isAll
            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
            : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800 hover:bg-white'
        }`}
      >
        Όλα
      </button>

      {options.map((option) => {
        const active = value === option.key;
        const styles = CHIP_STYLES[option.colorKey];
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            title={`${option.label}: ${option.quantity} τεμ.`}
            onClick={() => onChange(active ? PRODUCTION_SEND_STAGE_FILTER_ALL : option.key)}
            className={`flex items-center gap-1 pl-1.5 pr-1 py-1 rounded-lg text-[10px] font-black border transition-all whitespace-nowrap active:scale-[0.97] ${
              active ? styles.active : styles.idle
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-white/85' : styles.dot}`} />
            <span>{option.chipLabel}</span>
            <span
              className={`min-w-[1.1rem] px-1 py-px rounded-md text-[9px] font-black tabular-nums text-center ${
                active ? 'bg-black/15 text-current' : styles.countIdle
              }`}
            >
              {option.quantity}
            </span>
          </button>
        );
      })}
    </div>
  );
});
