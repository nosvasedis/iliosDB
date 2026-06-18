import React from 'react';
import { Lock, Unlock, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDecimal, formatCurrency } from '../../utils/pricingEngine';

export interface LaborCostFormulaRowProps {
  icon: React.ReactNode;
  label: string;
  rate: number;
  weightBasis: number;
  total: number;
  isOverridden: boolean;
  onRateChange: (rate: number) => void;
  onWeightChange: (weight: number) => void;
  onTotalChange: (total: number) => void;
  onToggleOverride: () => void;
  weightUnit?: string;
  hint?: string;
  /** When true, weight input is read-only (e.g. derived from recipe). */
  weightReadOnly?: boolean;
  /** Read-only preview row (no lock / inputs disabled). */
  readOnly?: boolean;
  /** Compact ‹ finish › switcher in the header. */
  carousel?: {
    finishLabel: string;
    finishCode: string;
    index: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  };
  /** Extra badge next to auto/manual (e.g. master, προεπισκόπηση). */
  statusBadge?: string;
}

export const LaborCostFormulaRow: React.FC<LaborCostFormulaRowProps> = React.memo(({
  icon,
  label,
  rate,
  weightBasis,
  total,
  isOverridden,
  onRateChange,
  onWeightChange,
  onTotalChange,
  onToggleOverride,
  weightUnit = 'g',
  hint,
  weightReadOnly = false,
  readOnly = false,
  carousel,
  statusBadge,
}) => {
  const parseNum = (raw: string) => parseFloat(raw.replace(',', '.')) || 0;
  const inputsDisabled = readOnly;

  return (
    <div className={`p-3 bg-white rounded-xl border transition-all group ${isOverridden && !readOnly ? 'border-amber-200/80 shadow-sm' : readOnly ? 'border-slate-100/80 bg-slate-50/30' : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm text-slate-600 font-medium flex items-center gap-2 min-w-0">
          <span className="text-slate-400 group-hover:text-slate-500 transition-colors shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
          {carousel && (
            <span className="inline-flex items-center gap-0.5 shrink-0 ml-0.5">
              <button
                type="button"
                onClick={carousel.onPrev}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Προηγούμενο φινίρισμα"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap min-w-[4.5rem] text-center">
                {carousel.finishLabel}
                {carousel.finishCode ? ` (${carousel.finishCode})` : ''}
              </span>
              <button
                type="button"
                onClick={carousel.onNext}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Επόμενο φινίρισμα"
              >
                <ChevronRight size={14} />
              </button>
              <span className="text-[9px] text-slate-300 font-medium tabular-nums">{carousel.index + 1}/{carousel.total}</span>
            </span>
          )}
        </span>
        {!readOnly && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleOverride}
            title={isOverridden ? 'Επιστροφή σε αυτόματο υπολογισμό' : 'Χειροκίνητη επεξεργασία'}
            className={`p-1 rounded-md transition-all ${isOverridden ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}
          >
            {isOverridden ? <Unlock size={14} /> : <Lock size={14} />}
          </button>
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isOverridden ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
            {isOverridden ? 'χειροκίνητο' : 'αυτόματο'}
          </span>
          {statusBadge && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
              {statusBadge}
            </span>
          )}
        </div>
        )}
        {readOnly && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 shrink-0">
            {statusBadge || 'προεπισκόπηση'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm">
        <input
          type="number"
          step="0.01"
          value={rate}
          disabled={inputsDisabled}
          onChange={(e) => onRateChange(parseNum(e.target.value))}
          className={`w-[4.5rem] text-center border rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-400 transition-all ${inputsDisabled ? 'bg-slate-50/80 border-slate-100 text-slate-500 cursor-default' : isOverridden ? 'bg-amber-50/50 border-amber-200 text-amber-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-700 font-semibold'}`}
        />
        <span className="text-slate-400 font-bold px-0.5">×</span>
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            step="0.01"
            value={weightBasis}
            readOnly={weightReadOnly || inputsDisabled}
            disabled={inputsDisabled && !weightReadOnly}
            onChange={weightReadOnly || inputsDisabled ? undefined : (e) => onWeightChange(parseNum(e.target.value))}
            className={`w-[4.5rem] text-center border rounded-lg p-1.5 outline-none transition-all ${weightReadOnly || inputsDisabled ? 'bg-slate-50/80 border-slate-100 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-amber-500/10 focus:border-amber-400'} ${!weightReadOnly && !inputsDisabled && isOverridden ? 'font-bold' : ''}`}
        />
          <span className="text-[10px] text-slate-400 font-bold">{weightUnit}</span>
        </div>
        <span className="text-slate-400 font-bold px-0.5">=</span>
        <input
          type="number"
          step="0.01"
          value={total}
          disabled={inputsDisabled}
          onChange={(e) => onTotalChange(parseNum(e.target.value))}
          className={`min-w-[4.5rem] flex-1 text-right border rounded-lg p-1.5 outline-none focus:ring-2 transition-all font-black ${inputsDisabled ? 'bg-slate-50/80 border-slate-100 text-slate-600 cursor-default' : isOverridden ? 'bg-emerald-50 border-emerald-200 text-emerald-800 focus:ring-emerald-500/10 focus:border-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-amber-500/10 focus:border-amber-400'}`}
        />
        <span className="text-xs text-slate-400 font-medium shrink-0">€</span>
      </div>

      {hint && (
        <p className="text-[10px] text-slate-400 mt-2 leading-snug">{hint}</p>
      )}
      {!hint && isOverridden && !readOnly && (
        <p className="text-[10px] text-amber-600/80 mt-2">
          Σύνολο: {formatCurrency(total)} ({formatDecimal(rate, 2)} × {formatDecimal(weightBasis, 2)}{weightUnit})
        </p>
      )}
    </div>
  );
});

LaborCostFormulaRow.displayName = 'LaborCostFormulaRow';
