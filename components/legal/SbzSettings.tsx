import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';
import { api } from '../../lib/supabase';
import { legalKeys } from '../../features/legal/keys';
import { LegalEnvironment } from '../../types';

export const sbzStatusKey = ['legal_sbz_status'];
export function useSbzStatus() { return useQuery({queryKey:sbzStatusKey,queryFn:()=>api.callSbz('/sbz/status'),retry:false}); }

const environmentLabel = (environment: LegalEnvironment) => environment === 'dev' ? 'Δοκιμές' : 'Παραγωγή';

export default function SbzSettings({ environment, onEnvironmentChange }: {
  environment: LegalEnvironment;
  onEnvironmentChange: (environment: LegalEnvironment) => void;
}) {
  const { data: status, error } = useSbzStatus();
  const cache = useQueryClient();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { setKey(''); setMessage(''); }, [environment]);
  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage(success);
      await cache.invalidateQueries({ queryKey: sbzStatusKey });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight text-slate-900">Ηλεκτρονική τιμολόγηση · SBZ</h2>
            <p className="mt-0.5 max-w-3xl text-sm font-medium leading-5 text-slate-500">
              Τα παραστατικά αποστέλλονται αποκλειστικά στον πάροχο. Οι δοκιμές έχουν ανεξάρτητο αρχείο και αρίθμηση.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['dev', 'prod'] as const).map((item) => {
            const ready = !!status?.[item]?.ready;
            const configured = !!status?.[item]?.configured;
            return (
              <div key={item} className={`rounded-2xl border p-4 ${ready ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-black text-slate-900">{item === 'dev' ? 'Δοκιμαστικό περιβάλλον' : 'Πραγματικά παραστατικά'}</p>
                  <CheckCircle2 size={18} className={ready ? 'text-emerald-600' : 'text-slate-300'} />
                </div>
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {ready ? 'Διαθέσιμο για έκδοση' : configured ? 'Η σύνδεση έχει ρυθμιστεί · αναμένει ενεργοποίηση' : 'Αναμένει στοιχεία σύνδεσης'}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] md:items-end">
          <label className="block min-w-0">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500">Περιβάλλον σύνδεσης</span>
            <select
              disabled={busy}
              value={environment}
              onChange={(e) => onEnvironmentChange(e.target.value as LegalEnvironment)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="dev">Δοκιμές</option>
              <option value="prod">Παραγωγή</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500">Κλειδί σύνδεσης SBZ</span>
            <input
              disabled={busy}
              type="password"
              autoComplete="new-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !key.trim()}
            onClick={() => void run(async () => {
              await api.callSbz('/sbz/configure', { environment, apiKey: key });
              setKey('');
              await cache.invalidateQueries({ queryKey: legalKeys.settings() });
            }, `Η σύνδεση αποθηκεύτηκε στο περιβάλλον «${environmentLabel(environment)}». Ελέγξτε την παρακάτω.`)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Αποθήκευση
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => api.callSbz('/sbz/check', { environment }), 'Η σύνδεση με την SBZ επαληθεύτηκε.')}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Έλεγχος σύνδεσης
          </button>
        </div>

        {status?.unresolved?.length > 0 && (
          <details className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <summary className="cursor-pointer font-black text-amber-950">Παλιά παραστατικά που χρειάζονται έλεγχο ({status.unresolved.length})</summary>
            <p className="my-3 text-sm text-amber-900">Επιβεβαιώστε από το αρχικό αρχείο αν πρόκειται για δοκιμή ή πραγματικό παραστατικό. Η επιλογή καταγράφεται στο ιστορικό.</p>
            {status.unresolved.map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 border-t border-amber-200 py-2 text-sm">
                <span className="mr-auto font-medium">{d.series}–{d.aa} · {d.issue_date}</span>
                {(['dev', 'prod'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => api.callSbz('/sbz/legacy-environment', { documentId: d.id, environment: item }), 'Το περιβάλλον επιβεβαιώθηκε.')}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700"
                  >
                    {item === 'dev' ? 'Ήταν δοκιμή' : 'Ήταν πραγματικό'}
                  </button>
                ))}
              </div>
            ))}
          </details>
        )}

        {(message || error) && (
          <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
            {message || (error as Error)?.message}
          </p>
        )}
      </div>
    </section>
  );
}
