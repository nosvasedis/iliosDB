import React from 'react';
import { CheckCircle2, FlaskConical, Loader2, ShieldCheck } from 'lucide-react';
import type { LegalEnvironment } from '../../types';

interface EnvironmentStatus {
  configured?: boolean;
  ready?: boolean;
}

const OPTIONS: Array<{ id: LegalEnvironment; title: string; detail: string; icon: typeof ShieldCheck }> = [
  { id: 'dev', title: 'Δοκιμές', detail: 'Δοκιμαστικό myDATA/SBZ. Ξεχωριστή αρίθμηση, χωρίς φορολογική ισχύ. Για ελέγχους πριν από πραγματική έκδοση.', icon: FlaskConical },
  { id: 'prod', title: 'Παραγωγή', detail: 'Πραγματικά παραστατικά με ΜΑΡΚ στη myDATA μέσω SBZ. Ό,τι εκδίδεται εδώ ισχύει φορολογικά.', icon: ShieldCheck },
];

/**
 * The single place where the issuing environment changes. Each switch is confirmed and saved
 * immediately (not with the rest of the settings form), so the screen and the server never disagree.
 */
export default function EnvironmentSwitch({
  current,
  status,
  busy,
  readOnly,
  onSwitch,
}: {
  current: LegalEnvironment;
  status?: Partial<Record<LegalEnvironment, EnvironmentStatus>> | null;
  busy?: boolean;
  readOnly?: boolean;
  onSwitch: (next: LegalEnvironment) => void;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border bg-white shadow-xs ${current === 'dev' ? 'border-amber-300' : 'border-emerald-200'}`}>
      <div className={`flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 ${current === 'dev' ? 'border-amber-100 bg-linear-to-br from-amber-50 to-white' : 'border-emerald-100 bg-linear-to-br from-emerald-50 to-white'}`}>
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight text-slate-900">Περιβάλλον έκδοσης</h2>
          <p className="mt-0.5 max-w-3xl text-sm font-medium leading-5 text-slate-500">
            Ορίζει πού διαβιβάζονται τα νέα παραστατικά. Η αλλαγή αποθηκεύεται αμέσως, μετά από επιβεβαίωση, και φαίνεται σε όλες τις καρτέλες.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${current === 'dev' ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-emerald-300 bg-emerald-100 text-emerald-900'}`}>
          <span className={`h-2 w-2 rounded-full ${current === 'dev' ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden />
          Τώρα: {current === 'dev' ? 'Δοκιμές' : 'Παραγωγή'}
        </span>
      </div>
      <div role="radiogroup" aria-label="Περιβάλλον έκδοσης" className="grid gap-3 p-5 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.id === current;
          const state = status?.[option.id];
          const tone = option.id === 'dev' ? 'amber' : 'emerald';
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy || readOnly || active}
              onClick={() => onSwitch(option.id)}
              className={`group relative flex min-h-28 flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition disabled:cursor-default ${
                active
                  ? tone === 'amber' ? 'border-amber-400 bg-amber-50/70' : 'border-emerald-500 bg-emerald-50/70'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-2 text-sm font-black ${active ? (tone === 'amber' ? 'text-amber-900' : 'text-emerald-900') : 'text-slate-800'}`}>
                  <Icon size={16} /> {option.title}
                </span>
                {active ? <CheckCircle2 size={18} className={tone === 'amber' ? 'text-amber-600' : 'text-emerald-600'} /> : busy ? <Loader2 size={16} className="animate-spin text-slate-400" /> : (
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 group-hover:bg-white">Μετάβαση</span>
                )}
              </div>
              <p className="text-xs font-medium leading-5 text-slate-600">{option.detail}</p>
              <span className={`mt-auto text-[11px] font-bold ${state?.ready ? 'text-emerald-700' : 'text-slate-400'}`}>
                {state?.ready ? 'Σύνδεση SBZ έτοιμη' : state?.configured ? 'Σύνδεση SBZ ρυθμισμένη · αναμένει ενεργοποίηση' : 'Χωρίς κλειδί SBZ'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
