import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, EyeOff, MapPinned, Radar, Search, ShieldCheck, X } from 'lucide-react';
import {
  customerName,
  findAllOverlaps,
  formatDistance,
  formatRadius,
  ignoreCollectionKey,
  ignoreSkuKey,
  RADIUS_OPTIONS,
  SEVERITY_META,
  WINDOW_OPTIONS,
  type AssortmentIndex,
  type OverlapSeverity,
} from '../../features/customers/customerAssortment';
import { placeKey } from '../../features/customers/customerLocation';
import { formatNumber } from '../../utils/numberFormat';
import SkuColorizedText from '../SkuColorizedText';
import { ProductThumb } from './customerUi';
import { useTerritoryPrefs } from './useCustomerTerritory';

interface Props {
  index: AssortmentIndex;
  onClose: () => void;
  onOpenCustomer: (customerId: string) => void;
  /** Narrow the directory to these customers. */
  onFilterCustomers?: (ids: string[]) => void;
  /** A customer card is open above the panel: let it handle Esc. */
  paused?: boolean;
}

const SEVERITIES: OverlapSeverity[] = ['critical', 'high', 'medium'];
const PAGE = 60;

/** Every pair of nearby customers whose assortments overlap — the «be alerted» view. */
export default function CustomerOverlapsPanel({ index, onClose, onOpenCustomer, onFilterCustomers, paused }: Props) {
  const prefs = useTerritoryPrefs();
  const [severity, setSeverity] = useState<OverlapSeverity | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, paused]);

  const overlaps = useMemo(
    () => findAllOverlaps(index, { radiusKm: prefs.radiusKm, window: prefs.window, ignored: prefs.ignoredSet }),
    [index, prefs.radiusKm, prefs.window, prefs.ignoredSet],
  );
  const counts = useMemo(() => {
    const c: Record<OverlapSeverity, number> = { critical: 0, high: 0, medium: 0 };
    overlaps.forEach(o => { c[o.severity] += 1; });
    return c;
  }, [overlaps]);

  const visible = useMemo(() => {
    const q = placeKey(query);
    return overlaps.filter(o => (!severity || o.severity === severity)
      && (!q || placeKey(`${customerName(index, o.aId)} ${customerName(index, o.bId)} ${o.town ?? ''} ${o.sharedSkus.map(s => s.sku).join(' ')} ${o.sharedCollections.map(c => c.name).join(' ')}`).includes(q)));
  }, [overlaps, severity, query, index]);

  const involvedIds = useMemo(() => [...new Set(visible.flatMap(o => [o.aId, o.bId]))], [visible]);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="flex h-full w-full max-w-[760px] flex-col bg-slate-50 shadow-2xl animate-in slide-in-from-right-8 duration-200" role="dialog" aria-modal="true" aria-labelledby="overlaps-title">
        <header className="shrink-0 space-y-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Radar size={20} /></span>
            <div className="min-w-0 flex-1">
              <h2 id="overlaps-title" className="text-lg font-black text-slate-900">Επικαλύψεις περιοχής</h2>
              <p className="text-xs text-slate-500">Γειτονικοί πελάτες (σε {formatRadius(prefs.radiusKm)}) που έχουν πάρει τους ίδιους κωδικούς ή συλλογές — {WINDOW_OPTIONS.find(o => o.id === prefs.window)?.label.toLowerCase()}.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label="Κλείσιμο"><X size={20} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-500">
              Ακτίνα
              <select value={prefs.radiusKm} onChange={e => prefs.setRadius(Number(e.target.value))} className="bg-transparent font-black text-slate-800 outline-none">
                {RADIUS_OPTIONS.map(r => <option key={r} value={r}>{formatRadius(r)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-500">
              Περίοδος
              <select value={prefs.window} onChange={e => prefs.setWindow(e.target.value as typeof prefs.window)} className="bg-transparent font-black text-slate-800 outline-none">
                {WINDOW_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.short}</option>)}
              </select>
            </label>
            <div className="relative min-w-[10rem] flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Πελάτης, πόλη, κωδικός, συλλογή…" className="w-full rounded-xl border border-slate-200 py-1.5 pl-8 pr-2 text-xs font-semibold outline-none focus:border-slate-400" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setSeverity(null)} className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${!severity ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
              Όλες <span className="opacity-60">{formatNumber(overlaps.length)}</span>
            </button>
            {SEVERITIES.map(s => (
              <button key={s} type="button" onClick={() => { setSeverity(severity === s ? null : s); setLimit(PAGE); }} title={SEVERITY_META[s].hint}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${severity === s ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
                <span className={`h-2 w-2 rounded-full ${SEVERITY_META[s].dot}`} /> {SEVERITY_META[s].label} <span className="opacity-60">{formatNumber(counts[s])}</span>
              </button>
            ))}
            {prefs.ignored.length > 0 && (
              <button type="button" onClick={prefs.clearIgnored} className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">{formatNumber(prefs.ignored.length)} αγνοημένα · επαναφορά</button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 custom-scrollbar">
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
              <Radar size={30} className="mx-auto text-slate-300" />
              <p className="mt-2 text-sm font-black text-slate-700">Καμία επικάλυψη</p>
              <p className="mt-1 text-xs text-slate-500">Δοκιμάστε μεγαλύτερη ακτίνα ή περίοδο. Πελάτες χωρίς διεύθυνση/ΤΚ δεν μπορούν να συγκριθούν.</p>
            </div>
          ) : visible.slice(0, limit).map(o => {
            const meta = SEVERITY_META[o.severity];
            const aName = customerName(index, o.aId);
            const bName = customerName(index, o.bId);
            return (
              <article key={o.id} className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  <button type="button" onClick={() => onOpenCustomer(o.aId)} className="max-w-[40%] truncate text-sm font-black text-slate-900 hover:text-sky-700">{aName}</button>
                  <span className="text-xs font-bold text-slate-300">↔</span>
                  <button type="button" onClick={() => onOpenCustomer(o.bId)} className="max-w-[40%] truncate text-sm font-black text-slate-900 hover:text-sky-700">{bName}</button>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${meta.tone}`}>{meta.label}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 pl-[18px] text-[11px] font-semibold text-slate-400">
                  <span className="inline-flex items-center gap-1"><MapPinned size={11} /> {formatDistance(o.distanceKm)}{o.town ? ` · ${o.town}` : ''}</span>
                  {(o.aPlace !== 'Φορολογική έδρα' || o.bPlace !== 'Φορολογική έδρα') && <span className="truncate">{o.aPlace} ↔ {o.bPlace}</span>}
                </div>
                {o.breaches.map((b, i) => (
                  <div key={i} className="mt-2 flex items-start gap-1.5 rounded-xl bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-900">
                    <ShieldCheck size={13} className="mt-px shrink-0" />
                    <span><b>{customerName(index, b.holderId)}</b> έχει αποκλειστικότητα ({b.scope}) — {customerName(index, b.otherId)} πήρε <span className="font-mono font-bold">{b.skus.slice(0, 6).join(', ')}{b.skus.length > 6 ? ` +${b.skus.length - 6}` : ''}</span></span>
                  </div>
                ))}
                {o.sharedSkus.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-[18px]">
                    {o.sharedSkus.slice(0, 8).map(s => (
                      <span key={s.sku} className="group inline-flex items-center gap-1.5 rounded-xl bg-slate-50 py-1 pl-1 pr-1.5 ring-1 ring-slate-100" title={`${s.description ?? ''} · ${aName}: ${s.aQty} τεμ. · ${bName}: ${s.bQty} τεμ.`}>
                        <ProductThumb src={s.image} size={22} />
                        <SkuColorizedText sku={s.sku} className="text-[11px] font-black" />
                        <span className="text-[10px] font-bold tabular-nums text-slate-400">{s.aQty}/{s.bQty}</span>
                        <button type="button" onClick={() => prefs.toggleIgnored(ignoreSkuKey(s.sku))} className="rounded p-0.5 text-slate-300 opacity-0 transition hover:text-slate-600 group-hover:opacity-100" title="Αγνόηση κωδικού στους ελέγχους"><EyeOff size={11} /></button>
                      </span>
                    ))}
                    {o.sharedSkus.length > 8 && <span className="self-center text-[11px] font-bold text-slate-400">+{formatNumber(o.sharedSkus.length - 8)} κωδικοί</span>}
                  </div>
                )}
                {o.sharedCollections.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 pl-[18px]">
                    {o.sharedCollections.slice(0, 8).map(c => (
                      <span key={c.id} className="group inline-flex items-center gap-1 rounded-full bg-violet-50 py-0.5 pl-2 pr-1 text-[10px] font-bold text-violet-700 ring-1 ring-violet-100">
                        {c.name}
                        <button type="button" onClick={() => prefs.toggleIgnored(ignoreCollectionKey(c.id))} className="rounded-full p-0.5 opacity-0 transition hover:bg-violet-100 group-hover:opacity-100" title="Αγνόηση συλλογής στους ελέγχους"><EyeOff size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
          {visible.length > limit && (
            <button type="button" onClick={() => setLimit(l => l + PAGE)} className="w-full rounded-xl bg-white py-2.5 text-xs font-bold text-sky-700 ring-1 ring-slate-100 hover:bg-sky-50">
              Περισσότερες ({formatNumber(visible.length - limit)})
            </button>
          )}
        </div>

        {onFilterCustomers && involvedIds.length > 0 && (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
            <button type="button" onClick={() => { onFilterCustomers(involvedIds); onClose(); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#060b00] py-2.5 text-xs font-bold text-white hover:bg-black">
              Εμφάνιση των {formatNumber(involvedIds.length)} πελατών στη λίστα / στον χάρτη <ArrowRight size={13} />
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
