import React, { useState, useEffect } from 'react';
import { X, Trophy } from 'lucide-react';

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className ?? ''}`} />;
}

export function ModalListSkeleton() {
  return (
    <div className="space-y-3 px-1 py-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4">
          <Shimmer className="h-8 w-8 shrink-0 rounded-lg" />
          <Shimmer className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Shimmer className="h-4 w-3/5" />
            <Shimmer className="h-3 w-1/4" />
            <div className="grid grid-cols-4 gap-2 pt-1">
              {Array.from({ length: 4 }).map((__, j) => (
                <Shimmer key={j} className="h-10 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModalDetailSkeleton() {
  return (
    <div className="flex h-full flex-col p-5">
      <Shimmer className="mb-3 h-6 w-2/5" />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-7 w-16 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Shimmer key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Shimmer className="mt-4 h-24 rounded-xl" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

interface ModalShellProps {
  periodLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function SkuModalShell({ periodLabel, onClose, children }: ModalShellProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Λεπτομερής κατάταξη κορυφαίων SKU"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-slate-50 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
                <Trophy size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">Κορυφαία SKU</h2>
                <p className="mt-0.5 text-sm font-medium text-slate-500">
                  Ανάλυση πωλήσεων · {periodLabel.toLowerCase()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-700"
              aria-label="Κλείσιμο"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {children}

        <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-5 py-3 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-black sm:w-auto"
          >
            Κλείσιμο
          </button>
        </div>
      </div>
    </div>
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
