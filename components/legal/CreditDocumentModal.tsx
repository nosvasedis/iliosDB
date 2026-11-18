import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { formatNumber } from '../../utils/numberFormat';
import React, { useState, useEffect, useRef } from 'react';
import { X, Undo2, Info, Loader2, XCircle } from 'lucide-react';
import type { LegalDocument, LegalDocumentLine } from '../../types';
import { buildCreditDraft } from '../../features/legal/sbz';
import { getLegalDocumentDisplayNumber } from '../../utils/legalDocuments';

const money = (value: number) => value.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

/** Per-line problem with the requested credit quantity, or null when it is valid. */
const quantityProblem = (quantity: number, available: number): string | null => {
  if (!Number.isFinite(quantity) || quantity < 0) return 'Μη έγκυρη ποσότητα.';
  if (quantity > available) return `Έως ${formatNumber(available)} διαθέσιμα.`;
  return null;
};

export default function CreditDocumentModal({ original, lines, available, reservedLines, onClose, onCreate }: {
  original: LegalDocument;
  lines: LegalDocumentLine[];
  available: Record<string, number>;
  reservedLines: LegalDocumentLine[];
  onClose: () => void;
  onCreate: (bundle: ReturnType<typeof buildCreditDraft>) => Promise<void>;
}) {
  const [quantities, setQuantities] = useState(available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useRestartDraft('Πιστωτικό παραστατικό', quantities, { busy });

  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);

  const problems = Object.fromEntries(lines.map((line) => [line.id, quantityProblem(Number(quantities[line.id] ?? 0), available[line.id] || 0)]));
  const hasProblems = Object.values(problems).some(Boolean);
  const selectedQuantity = lines.reduce((sum, line) => sum + (Number(quantities[line.id]) || 0), 0);
  const availableQuantity = lines.reduce((sum, line) => sum + (available[line.id] || 0), 0);
  const estimatedGross = lines.reduce((sum, line) => {
    const quantity = Number(quantities[line.id]) || 0;
    return line.quantity > 0 ? sum + (line.gross_value / line.quantity) * quantity : sum;
  }, 0);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      if (hasProblems) throw new Error('Επιλέξτε ποσότητες μέχρι το διαθέσιμο υπόλοιπο.');
      if (selectedQuantity <= 0) throw new Error('Επιλέξτε τουλάχιστον μία ποσότητα για πίστωση.');
      await onCreate(buildCreditDraft(original, lines, quantities, reservedLines));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onClose();
    }
    if (event.key === 'Tab') {
      const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const setAll = (mode: 'all' | 'none') => setQuantities(Object.fromEntries(lines.map((line) => [line.id, mode === 'all' ? available[line.id] || 0 : 0])));

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-xs sm:p-6">
      <section ref={dialog} tabIndex={-1} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-labelledby="credit-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><Undo2 size={19} /></span>
            <div className="min-w-0">
              <h2 id="credit-title" className="text-lg font-black tracking-tight text-slate-950">Έκδοση πιστωτικού</h2>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-500">Για το τιμολόγιο <span className="font-black text-slate-700">{getLegalDocumentDisplayNumber(original)}</span> · {original.counterpart.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Κλείσιμο" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-medium text-emerald-950">
            <Info size={16} className="mt-0.5 shrink-0 text-emerald-700" />
            <span>Έχουν επιλεγεί όλες οι διαθέσιμες ποσότητες. Μειώστε τις για μερική πίστωση. Οι αρχικές τιμές, εκπτώσεις και φόροι διατηρούνται. Δημιουργείται προσχέδιο· τίποτα δεν εκδίδεται πριν τον έλεγχο.</span>
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
              <span>Είδος</span>
              <span className="flex items-center gap-2 normal-case tracking-normal">
                <button type="button" onClick={() => setAll('all')} disabled={busy} className="rounded-md px-1.5 py-0.5 text-[11px] font-black text-emerald-700 hover:bg-emerald-50">Όλα</button>
                <button type="button" onClick={() => setAll('none')} disabled={busy} className="rounded-md px-1.5 py-0.5 text-[11px] font-black text-slate-500 hover:bg-white">Κανένα</button>
                <span className="text-[10px] font-black uppercase tracking-wide">Ποσότητα πίστωσης</span>
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {lines.map((line) => {
                const problem = problems[line.id];
                const lineAvailable = available[line.id] || 0;
                return (
                  <label key={line.id} className={`flex items-start justify-between gap-4 px-4 py-3 transition ${problem ? 'bg-red-50/50' : lineAvailable === 0 ? 'opacity-60' : 'hover:bg-slate-50/70'}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-800">{line.description}</span>
                      <span className="text-xs font-medium text-slate-500">
                        Διαθέσιμα για πίστωση: {formatNumber(lineAvailable)}
                        {line.quantity > 0 ? ` · ${money(line.gross_value / line.quantity)}/τεμ.` : ''}
                      </span>
                      {problem ? <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-red-700"><XCircle size={12} /> {problem}</span> : null}
                    </span>
                    <input
                      aria-label={`Ποσότητα πίστωσης ${line.description}`}
                      aria-invalid={!!problem || undefined}
                      type="number"
                      min={0}
                      max={lineAvailable}
                      step="any"
                      value={quantities[line.id] ?? 0}
                      disabled={lineAvailable === 0}
                      onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: Number(event.target.value) }))}
                      className={`h-10 w-24 shrink-0 rounded-lg border bg-white px-2 text-right text-sm font-bold tabular-nums text-slate-800 outline-hidden transition focus:ring-2 disabled:bg-slate-50 ${problem ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-100'}`}
                    />
                  </label>
                );
              })}
            </div>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-xs font-bold text-slate-500">
            Επιλογή: <span className="font-black tabular-nums text-slate-800">{formatNumber(selectedQuantity)}</span> από {formatNumber(availableQuantity)} τεμ.
            <span className="ml-2">≈ <span className="font-black tabular-nums text-slate-800">{money(estimatedGross)}</span></span>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Πίσω</button>
            <button type="button" disabled={busy || hasProblems || selectedQuantity <= 0} onClick={() => void create()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Αποθηκεύεται…' : 'Δημιουργία προσχεδίου'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
