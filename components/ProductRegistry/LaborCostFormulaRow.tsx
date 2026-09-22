import React from 'react';
import { Lock, Unlock } from 'lucide-react';
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
  /** Read-only row (e.g. technician rule for selected non-D variant). */
  readOnly?: boolean;
  /** Shown after label — e.g. finish name from header variant selection. */
  contextLabel?: string;
  footer?: React.ReactNode;
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
  contextLabel,
  footer,
}) => {
  const parseNum = (raw: string) => parseFloat(raw.replace(',', '.')) || 0;
  const inputsDisabled = readOnly;

  return (
    <div className={`rounded-lg border px-3 py-2.5 transition-colors ${isOverridden && !readOnly ? 'border-amber-200 bg-amber-50/30' : readOnly ? 'border-slate-100 bg-slate-50/40' : 'border-slate-100 bg-slate-50/40 hover:border-slate-200 hover:bg-slate-50'}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
          <span className="shrink-0 text-slate-400">{icon}</span>
          <span className="truncate">{label}</span>
          {contextLabel && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              · {contextLabel}
            </span>
          )}
        </span>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleOverride}
              title={isOverridden ? 'Επιστροφή σε αυτόματο υπολογισμό' : 'Χειροκίνητη επεξεργασία'}
              className={`rounded-md p-1 transition-all ${isOverridden ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' : 'text-slate-300 hover:bg-amber-50 hover:text-amber-500'}`}
            >
              {isOverridden ? <Unlock size={14} /> : <Lock size={14} />}
            </button>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${isOverridden ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
              {isOverridden ? 'χειροκίνητο' : 'αυτόματο'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm">
        <input
          type="number"
          step="0.01"
          value={rate}
          disabled={inputsDisabled}
          onChange={(e) => onRateChange(parseNum(e.target.value))}
          className={`w-[4.5rem] rounded-md border p-1.5 text-center outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-500/10 ${inputsDisabled ? 'cursor-default border-slate-100 bg-slate-50/80 text-slate-500' : isOverridden ? 'border-amber-200 bg-amber-50/50 font-bold text-amber-900' : 'border-slate-200 bg-white font-semibold text-slate-700'}`}
        />
        <span className="px-0.5 font-bold text-slate-400">×</span>
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            step="0.01"
            value={weightBasis}
            readOnly={weightReadOnly || inputsDisabled}
            disabled={inputsDisabled && !weightReadOnly}
            onChange={weightReadOnly || inputsDisabled ? undefined : (e) => onWeightChange(parseNum(e.target.value))}
            className={`w-[4.5rem] rounded-md border p-1.5 text-center outline-none transition-all ${weightReadOnly || inputsDisabled ? 'border-slate-100 bg-slate-50/80 text-slate-500' : 'border-slate-200 bg-white text-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/10'} ${!weightReadOnly && !inputsDisabled && isOverridden ? 'font-bold' : ''}`}
          />
          <span className="text-[10px] font-bold text-slate-400">{weightUnit}</span>
        </div>
        <span className="px-0.5 font-bold text-slate-400">=</span>
        <input
          type="number"
          step="0.01"
          value={total}
          disabled={inputsDisabled}
          onChange={(e) => onTotalChange(parseNum(e.target.value))}
          className={`min-w-[4.5rem] flex-1 rounded-md border p-1.5 text-right font-black outline-none transition-all focus:ring-2 ${inputsDisabled ? 'cursor-default border-slate-100 bg-slate-50/80 text-slate-600' : isOverridden ? 'border-emerald-200 bg-emerald-50 text-emerald-800 focus:border-emerald-400 focus:ring-emerald-500/10' : 'border-slate-200 bg-white text-slate-800 focus:border-amber-400 focus:ring-amber-500/10'}`}
        />
        <span className="shrink-0 text-xs font-medium text-slate-400">€</span>
      </div>

      {hint && (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{hint}</p>
      )}
      {!hint && isOverridden && !readOnly && (
        <p className="mt-1.5 text-[10px] text-amber-600/80">
          Σύνολο: {formatCurrency(total)} ({formatDecimal(rate, 2)} × {formatDecimal(weightBasis, 2)}{weightUnit})
        </p>
      )}
      {footer && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          {footer}
        </div>
      )}
    </div>
  );
});

LaborCostFormulaRow.displayName = 'LaborCostFormulaRow';
