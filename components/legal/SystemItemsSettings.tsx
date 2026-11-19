import React, { useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Power, Scale, Trash2, X } from 'lucide-react';
import type { LegalSystemItem } from '../../types';
import { formatNumber } from '../../utils/numberFormat';
import { LEGAL_LINE_UNITS, getLegalLineUnitMeta, type LegalLineUnit } from '../../utils/legalUnits';
import { LEGAL_BUILTIN_SYSTEM_ITEMS, normalizeLegalSystemCode, validateLegalSystemItem } from '../../utils/legalSystemItems';
import { ActionButton, Chip, SelectInput, TextInput } from './issue/ui';

interface Draft {
  originalCode: string | null;
  code: string;
  description: string;
  unit: LegalLineUnit;
  price: string;
  is_active: boolean;
}

const emptyDraft = (): Draft => ({ originalCode: null, code: '', description: '', unit: 'pcs', price: '', is_active: true });

const toDraft = (item: LegalSystemItem): Draft => ({
  originalCode: item.code,
  code: item.code,
  description: item.description,
  unit: item.unit,
  price: item.default_price === null || item.default_price === undefined ? '' : String(item.default_price),
  is_active: item.is_active,
});

const unitHint = (unit: LegalLineUnit) => unit === 'g'
  ? 'Στο παραστατικό σε γραμμάρια· στη myDATA/SBZ ως Κιλά (κωδ. 2).'
  : `myDATA κωδ. ${getLegalLineUnitMeta(unit).aadeCode}`;

/**
 * Free system codes for document lines (ΑΦΟΣ, ΜΠΟΚ…). Saved straight to
 * `legal_settings.system_items`, independently of the rest of the settings form.
 */
export default function SystemItemsSettings({
  items,
  productSkus,
  onSave,
  saving,
  readOnly,
}: {
  items: LegalSystemItem[];
  productSkus: string[];
  onSave: (next: LegalSystemItem[]) => Promise<void>;
  saving: boolean;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skuSet = useMemo(() => productSkus, [productSkus]);

  const save = async (next: LegalSystemItem[]) => {
    setError(null);
    try {
      await onSave(next);
      setDraft(null);
    } catch (saveError: any) {
      setError(saveError?.message || 'Δεν αποθηκεύτηκαν οι κωδικοί.');
    }
  };

  const submitDraft = async () => {
    if (!draft) return;
    const price = draft.price.trim() === '' ? null : Number(draft.price.replace(',', '.'));
    const item: LegalSystemItem = {
      code: normalizeLegalSystemCode(draft.code),
      description: draft.description.trim(),
      unit: draft.unit,
      default_price: price,
      is_active: draft.is_active,
    };
    const others = items.filter((existing) => normalizeLegalSystemCode(existing.code) !== normalizeLegalSystemCode(draft.originalCode));
    const problem = validateLegalSystemItem(item, others, skuSet);
    if (problem) { setError(problem); return; }
    const next = draft.originalCode
      ? items.map((existing) => normalizeLegalSystemCode(existing.code) === normalizeLegalSystemCode(draft.originalCode) ? item : existing)
      : [...items, item];
    await save(next);
  };

  const toggleActive = (code: string) => save(items.map((item) => item.code === code ? { ...item, is_active: !item.is_active } : item));
  const remove = (code: string) => {
    if (!window.confirm(`Διαγραφή του κωδικού ${code}; Τα παραστατικά που τον έχουν ήδη δεν επηρεάζονται.`)) return;
    void save(items.filter((item) => item.code !== code));
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Κωδικός</th>
              <th className="px-3 py-2 text-left">Περιγραφή</th>
              <th className="px-3 py-2 text-left">Μονάδα</th>
              <th className="px-3 py-2 text-right">Προεπ. τιμή</th>
              <th className="px-3 py-2 text-right"><span className="sr-only">Ενέργειες</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {LEGAL_BUILTIN_SYSTEM_ITEMS.map((item) => (
              <tr key={item.code} className="bg-slate-50/50 text-slate-500">
                <td className="px-3 py-2 font-mono text-xs font-black">{item.code}</td>
                <td className="px-3 py-2">
                  <div className="font-semibold text-slate-700">{item.description}</div>
                  <div className="text-[11px]">{item.note}</div>
                </td>
                <td className="px-3 py-2 text-xs font-bold">{getLegalLineUnitMeta(item.unit).label}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{formatNumber(item.default_price ?? 0)} €</td>
                <td className="px-3 py-2 text-right"><Chip tone="slate"><Lock size={11} /> Σύστημα</Chip></td>
              </tr>
            ))}
            {items.map((item) => {
              const meta = getLegalLineUnitMeta(item.unit);
              return (
                <tr key={item.code} className={item.is_active ? '' : 'opacity-55'}>
                  <td className="px-3 py-2 font-mono text-xs font-black text-slate-900">{item.code}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{item.description}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-black ${item.unit === 'pcs' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'}`} title={unitHint(item.unit)}>
                      {item.unit !== 'pcs' && <Scale size={11} />}{meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                    {item.default_price === null || item.default_price === undefined ? <span className="text-slate-400">—</span> : `${formatNumber(item.default_price)} € / ${meta.short}`}
                  </td>
                  <td className="px-3 py-2">
                    {!readOnly && (
                      <div className="flex justify-end gap-1">
                        <button type="button" disabled={saving} onClick={() => { setError(null); setDraft(toDraft(item)); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="Επεξεργασία"><Pencil size={14} /></button>
                        <button type="button" disabled={saving} onClick={() => void toggleActive(item.code)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title={item.is_active ? 'Απενεργοποίηση (δεν εμφανίζεται στην επιλογή ειδών)' : 'Ενεργοποίηση'}><Power size={14} /></button>
                        <button type="button" disabled={saving} onClick={() => remove(item.code)} className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600" title="Διαγραφή"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-5 text-center text-sm font-medium text-slate-400">Δεν υπάρχουν δικοί σας κωδικοί ακόμα.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {draft ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">{draft.originalCode ? `Επεξεργασία ${draft.originalCode}` : 'Νέος κωδικός'}</h3>
            <button type="button" onClick={() => { setDraft(null); setError(null); }} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Κλείσιμο"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[8rem_1fr_12rem_9rem]">
            <TextInput label="Κωδικός" value={draft.code} onChange={(code) => setDraft((current) => current && { ...current, code })} placeholder="π.χ. ΑΦΟΣ" help="Γράμματα (ελληνικά ή λατινικά), αριθμοί, τελεία, παύλα. Μπαίνει ως κωδικός είδους στη myDATA." />
            <TextInput label="Περιγραφή" value={draft.description} onChange={(description) => setDraft((current) => current && { ...current, description })} placeholder="π.χ. Ασήμι 999°" />
            <SelectInput label="Μονάδα μέτρησης" value={draft.unit} onChange={(unit) => setDraft((current) => current && { ...current, unit: unit as LegalLineUnit })} help={unitHint(draft.unit)}>
              {LEGAL_LINE_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
            </SelectInput>
            <TextInput label={`Τιμή / ${getLegalLineUnitMeta(draft.unit).short}`} value={draft.price} onChange={(price) => setDraft((current) => current && { ...current, price })} inputMode="decimal" placeholder="Προαιρετικά" help="Προτεινόμενη τιμή ανά μονάδα. Αλλάζει ελεύθερα σε κάθε γραμμή." />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={draft.is_active} onChange={(event) => setDraft((current) => current && { ...current, is_active: event.target.checked })} />
              Ενεργός στην επιλογή ειδών
            </label>
            <ActionButton onClick={() => void submitDraft()} disabled={saving}>{draft.originalCode ? 'Αποθήκευση' : 'Προσθήκη κωδικού'}</ActionButton>
          </div>
        </div>
      ) : !readOnly && (
        <ActionButton variant="secondary" onClick={() => { setError(null); setDraft(emptyDraft()); }} disabled={saving}>
          <Plus size={16} /> Νέος κωδικός
        </ActionButton>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
