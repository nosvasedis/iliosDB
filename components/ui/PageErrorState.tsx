import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface PageErrorStateProps {
  title?: string;
  message: string;
  /** Technical detail (usually `error.message`), shown in monospace. */
  detail?: string;
  onRetry?: () => void;
  className?: string;
}

/** Shared load-failure card used by desktop pages. */
export default function PageErrorState({
  title = 'Σφάλμα φόρτωσης',
  message,
  detail,
  onRetry,
  className = '',
}: PageErrorStateProps) {
  return (
    <div
      role="alert"
      className={`max-w-2xl rounded-3xl border border-red-100 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-100">
          <AlertTriangle size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-slate-900">{title}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-600">{message}</p>
          {detail ? (
            <p className="mt-3 break-words rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 font-mono text-xs text-red-700">
              {detail}
            </p>
          ) : null}
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.98]"
            >
              <RefreshCw size={15} /> Ανανέωση
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
