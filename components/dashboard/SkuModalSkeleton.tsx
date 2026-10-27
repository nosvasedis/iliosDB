import React, { useState, useEffect } from 'react';
import { Printer, Trophy } from 'lucide-react';
import FinancePeriodSelector from '../FinancePeriodSelector';
import { FinancePeriodMode } from '../../utils/financeAnalytics';
import { DashboardDialog } from './DashboardKit';

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className ?? ''}`} />;
}

export function ModalListSkeleton() {
  return (
    <div className="space-y-2 p-3 sm:p-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/60">
          <Shimmer className="h-7 w-7 shrink-0 rounded-lg" />
          <Shimmer className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Shimmer className="h-4 w-2/5" />
            <Shimmer className="h-2 w-full rounded-full" />
          </div>
          <div className="hidden w-40 space-y-2 sm:block">
            <Shimmer className="h-4 w-full" />
            <Shimmer className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModalDetailSkeleton() {
  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <Shimmer className="mb-3 h-7 w-2/5" />
      <Shimmer className="mb-5 h-4 w-1/4" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Shimmer key={i} className="h-[4.5rem] rounded-2xl" />
        ))}
      </div>
      <Shimmer className="mt-5 h-28 rounded-2xl" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

interface ModalShellProps {
  periodLabel: string;
  periodMode?: FinancePeriodMode;
  onPeriodChange?: (mode: FinancePeriodMode) => void;
  onPrint?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function SkuModalShell({ periodLabel, periodMode, onPeriodChange, onPrint, onClose, children }: ModalShellProps) {
  return (
    <DashboardDialog
      title="Κορυφαία SKU"
      subtitle={`Ανάλυση πωλήσεων ανά κωδικό · ${periodLabel}`}
      icon={Trophy}
      size="xl"
      fixedHeight
      ariaLabel="Λεπτομερής κατάταξη κορυφαίων SKU"
      onClose={onClose}
      actions={(
        <>
          {periodMode && onPeriodChange ? <FinancePeriodSelector value={periodMode} onChange={onPeriodChange} /> : null}
          {onPrint ? (
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Printer size={14} />
              Εκτύπωση PDF
            </button>
          ) : null}
        </>
      )}
    >
      {children}
    </DashboardDialog>
  );
}

/** Defers mounting heavy children until after the modal shell paints. */
export function useDeferredModalMount(delayMs = 0) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = () => { if (!cancelled) setMounted(true); };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 80 });
      return () => { cancelled = true; window.cancelIdleCallback(id); };
    }

    const id = window.setTimeout(start, delayMs);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [delayMs]);

  return mounted;
}
