import React from 'react';
import { Calendar } from 'lucide-react';
import { FINANCE_PERIOD_OPTIONS, FinancePeriodMode } from '../utils/financeAnalytics';

interface Props {
  value: FinancePeriodMode;
  onChange: (mode: FinancePeriodMode) => void;
}

export default function FinancePeriodSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      <div className="hidden items-center gap-1.5 px-3 text-[11px] font-black uppercase tracking-wide text-slate-400 sm:flex">
        <Calendar size={14} />
        Περίοδος
      </div>
      {FINANCE_PERIOD_OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onChange(option.mode)}
          className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${
            value === option.mode
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
