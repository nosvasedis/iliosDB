import React, { useMemo } from 'react';
import { Copy, Globe2, Lightbulb, MapPinned, Plus, Star, Store, Trash2 } from 'lucide-react';
import type { Customer, CustomerBranch } from '../../types';
import {
  AADE_VAT_EXEMPTION_CATEGORY_OPTIONS,
  listLegalCountryOptions,
  parseLegalPartyAddress,
} from '../../utils/legalDocuments';
import { isDomesticCountry, normalizeCountry, resolveBranchLocation } from '../../features/customers/customerLocation';
import { RegionPill } from './customerUi';

const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export const isEuCountry = (country?: string | null) => EU_COUNTRIES.has(normalizeCountry(country));

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400';

/** Country of the fiscal seat (or of a shop). */
export function CountrySelect({ value, onChange, className = '', disabled }: {
  value?: string | null; onChange: (code: string) => void; className?: string; disabled?: boolean;
}) {
  const options = useMemo(() => listLegalCountryOptions(value), [value]);
  return (
    <select
      className={`${fieldClass} cursor-pointer ${className}`}
      value={normalizeCountry(value)}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

/** Explains / applies the usual VAT treatment for overseas customers (never automatic). */
export function OverseasVatSuggestion({ customer, onChange }: { customer: Customer; onChange: (c: Customer) => void }) {
  if (isDomesticCountry(customer.country)) return null;
  const eu = isEuCountry(customer.country);
  const category = eu ? 14 : 8;
  const option = AADE_VAT_EXEMPTION_CATEGORY_OPTIONS.find(o => o.category === category);
  const applied = (customer.vat_rate ?? 0.24) === 0 && customer.vat_exemption_category === category;
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-xs text-violet-950">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-violet-500" />
      <div className="min-w-0 flex-1">
        <div className="font-black">{eu ? 'Πελάτης άλλου κράτους μέλους ΕΕ' : 'Πελάτης εκτός ΕΕ'}</div>
        <div className="mt-0.5 leading-snug text-violet-800">
          {eu
            ? 'Για πώληση αγαθών σε επιχείρηση με έγκυρο VAT (VIES) συνήθως εφαρμόζεται 0% — ενδοκοινοτική παράδοση. Για ιδιώτες ισχύει ο ελληνικός ΦΠΑ (ή OSS).'
            : 'Για εξαγωγή αγαθών εκτός ΕΕ με αποδεικτικά εξαγωγής συνήθως εφαρμόζεται 0% — εξαγωγή.'}
        </div>
      </div>
      {applied ? (
        <span className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-black text-violet-700 ring-1 ring-violet-200">Εφαρμόζεται ✓</span>
      ) : (
        <button
          type="button"
          onClick={() => onChange({ ...customer, vat_rate: 0, vat_exemption_category: category, vat_exemption_legal_note: option?.description ?? null })}
          className="rounded-lg bg-violet-700 px-3 py-1.5 text-[11px] font-black text-white shadow-sm hover:bg-violet-800"
        >
          Εφαρμογή 0% · κατ. {category}
        </button>
      )}
    </div>
  );
}

const newBranchId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

/** Keeps exactly one main shop. */
function withPrimary(branches: CustomerBranch[], primaryId?: string): CustomerBranch[] {
  if (branches.length === 0) return branches;
  const target = primaryId ?? branches.find(b => b.is_primary)?.id ?? branches[0].id;
  return branches.map(b => ({ ...b, is_primary: b.id === target }));
}

const ADDRESS_KEYS: Array<keyof CustomerBranch> = ['street', 'postal_code', 'city', 'country'];

/** Editor for the customer's shops (υποκαταστήματα). The fiscal seat is edited separately. */
export function CustomerBranchesEditor({ customer, onChange, disabled, disabledReason }: {
  customer: Customer;
  onChange: (branches: CustomerBranch[]) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const branches = Array.isArray(customer.branches) ? customer.branches : [];

  const update = (id: string, patch: Partial<CustomerBranch>) => {
    onChange(branches.map((b) => {
      if (b.id !== id) return b;
      const next = { ...b, ...patch };
      // The address changed → a manual pin would point to the old place.
      if (ADDRESS_KEYS.some(key => key in patch && patch[key] !== b[key])) {
        next.latitude = null;
        next.longitude = null;
      }
      return next;
    }));
  };

  const add = (seed?: Partial<CustomerBranch>) => {
    const branch: CustomerBranch = {
      id: newBranchId(),
      label: seed?.label ?? (branches.length === 0 ? 'Κεντρικό κατάστημα' : `Κατάστημα ${branches.length + 1}`),
      street: seed?.street ?? '',
      postal_code: seed?.postal_code ?? '',
      city: seed?.city ?? '',
      country: normalizeCountry(customer.country),
      phone: null,
      contact_person: null,
      notes: null,
      latitude: null,
      longitude: null,
      is_primary: branches.length === 0,
    };
    onChange(withPrimary([...branches, branch]));
  };

  const copyFromFiscal = () => {
    const parsed = parseLegalPartyAddress(customer.address);
    add({
      label: 'Κατάστημα έδρας',
      street: parsed ? [parsed.street, parsed.number].filter(Boolean).join(' ') : customer.address ?? '',
      postal_code: parsed?.postal_code ?? '',
      city: parsed?.city ?? '',
    });
  };

  const remove = (id: string) => onChange(withPrimary(branches.filter(b => b.id !== id)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-md text-[11px] leading-snug text-slate-500">
          Τα πραγματικά σημεία πώλησης του πελάτη. Εμφανίζονται στον χάρτη και στα φίλτρα περιοχής· το <b>κύριο</b> κατάστημα
          προτείνεται ως τόπος παράδοσης στα δελτία αποστολής. Τα παραστατικά εκδίδονται πάντα στη φορολογική έδρα.
        </p>
        <div className="flex gap-2">
          {customer.address && (
            <button type="button" disabled={disabled} onClick={copyFromFiscal} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40" title="Νέο κατάστημα στη διεύθυνση της έδρας">
              <Copy size={13} /> Από έδρα
            </button>
          )}
          <button type="button" disabled={disabled} onClick={() => add()} className="flex items-center gap-1.5 rounded-xl bg-[#060b00] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-black disabled:opacity-40">
            <Plus size={14} /> Κατάστημα
          </button>
        </div>
      </div>

      {disabled && disabledReason && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">{disabledReason}</div>
      )}

      {branches.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-500">
          <Store size={20} className="shrink-0 text-slate-300" />
          Δεν έχουν καταχωρηθεί καταστήματα — στον χάρτη χρησιμοποιείται η φορολογική έδρα.
        </div>
      ) : (
        branches.map((branch) => {
          const location = resolveBranchLocation(customer, branch);
          return (
            <div key={branch.id} className={`rounded-2xl border p-3.5 transition ${branch.is_primary ? 'border-sky-200 bg-sky-50/40' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-2">
                <Store size={16} className={branch.is_primary ? 'shrink-0 text-sky-600' : 'shrink-0 text-slate-400'} />
                <input
                  className={`${fieldClass} flex-1 font-black`}
                  value={branch.label}
                  disabled={disabled}
                  onChange={e => update(branch.id, { label: e.target.value })}
                  placeholder="Όνομα καταστήματος (π.χ. Κατάστημα Οίας)"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(withPrimary(branches, branch.id))}
                  className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-black transition ${branch.is_primary ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  title="Κύριο κατάστημα (προεπιλεγμένος τόπος παράδοσης)"
                >
                  <Star size={12} className={branch.is_primary ? 'fill-white' : ''} /> {branch.is_primary ? 'Κύριο' : 'Ορισμός κύριου'}
                </button>
                <button type="button" disabled={disabled} onClick={() => remove(branch.id)} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40" aria-label="Αφαίρεση καταστήματος">
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-6">
                <input className={`${fieldClass} sm:col-span-3`} disabled={disabled} value={branch.street ?? ''} onChange={e => update(branch.id, { street: e.target.value })} placeholder="Οδός & αριθμός" />
                <input className={`${fieldClass} sm:col-span-1`} disabled={disabled} value={branch.postal_code ?? ''} onChange={e => update(branch.id, { postal_code: e.target.value })} placeholder="ΤΚ" />
                <input className={`${fieldClass} sm:col-span-2`} disabled={disabled} value={branch.city ?? ''} onChange={e => update(branch.id, { city: e.target.value })} placeholder="Πόλη / νησί" />
                <div className="sm:col-span-2">
                  <CountrySelect disabled={disabled} value={branch.country || customer.country} onChange={code => update(branch.id, { country: code })} />
                </div>
                <input className={`${fieldClass} sm:col-span-2`} disabled={disabled} value={branch.phone ?? ''} onChange={e => update(branch.id, { phone: e.target.value || null })} placeholder="Τηλέφωνο καταστήματος" />
                <input className={`${fieldClass} sm:col-span-2`} disabled={disabled} value={branch.contact_person ?? ''} onChange={e => update(branch.id, { contact_person: e.target.value || null })} placeholder="Υπεύθυνος" />
                <input className={`${fieldClass} sm:col-span-6`} disabled={disabled} value={branch.notes ?? ''} onChange={e => update(branch.id, { notes: e.target.value || null })} placeholder="Σημείωση (ωράριο, πρόσβαση, παραλαβή…)" />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><MapPinned size={12} /> Περιοχή:</span>
                <RegionPill location={location} />
                {typeof branch.latitude === 'number' && <span className="font-semibold text-emerald-600">· χειροκίνητη πινέζα</span>}
                {!isDomesticCountry(branch.country || customer.country) && <span className="flex items-center gap-1 font-semibold text-violet-600"><Globe2 size={12} /> εξωτερικό</span>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
