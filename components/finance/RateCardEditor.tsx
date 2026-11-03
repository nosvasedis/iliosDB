import React, { useState } from 'react';
import { Plus, Save, Tags, Trash2 } from 'lucide-react';
import { MaterialType, type Material } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import { BILLABLE_STAGES, RATE_UNIT_LABELS } from '../../features/finance/workerStatements';
import type { FinanceRateCard, FinanceRateUnit } from '../../features/finance/types';
import { EmptyNote, ghostButton, inputClass, parseAmount, secondaryButton } from './financeUi';

type Row = Partial<FinanceRateCard> & { rateInput: string; dirty?: boolean };

const toRow = (card: FinanceRateCard): Row => ({ ...card, rateInput: String(card.rate).replace('.', ',') });

/**
 * Free price list per partner: e.g. Καρφωτής Α — Ζιργκόν 2mm 0,12 €/πέτρα, βαριά δαχτυλίδια 0,80 €/τεμ.
 * The most specific active card wins (priority breaks ties).
 */
export default function RateCardEditor({ partyId, cards, materials }: { partyId: string; cards: FinanceRateCard[]; materials: Material[] }) {
  const { showToast, confirm } = useUI();
  const [rows, setRows] = useState<Row[]>(() => cards.map(toRow));
  const stones = materials.filter((material) => material.type === MaterialType.Stone);
  const save = useFinanceMutation((card: Partial<FinanceRateCard> & Pick<FinanceRateCard, 'party_id' | 'label'>) => financeRepository.saveRateCard(card));
  const remove = useFinanceMutation((id: string) => financeRepository.deleteRateCard(id));

  React.useEffect(() => {
    setRows((previous) => {
      const drafts = previous.filter((row) => !row.id || row.dirty);
      const draftIds = new Set(drafts.map((row) => row.id));
      return [...cards.filter((card) => !draftIds.has(card.id)).map(toRow), ...drafts.filter((row) => !row.id || cards.some((card) => card.id === row.id))];
    });
  }, [cards]);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((previous) => previous.map((row, position) => (position === index ? { ...row, ...patch, dirty: true } : row)));
  const updateMatch = (index: number, key: keyof FinanceRateCard['match'], value: string) =>
    setRows((previous) => previous.map((row, position) => (position === index ? { ...row, match: { ...(row.match || {}), [key]: value || undefined }, dirty: true } : row)));

  const persist = async (row: Row, index: number) => {
    if (!row.label?.trim()) { showToast('Δώστε περιγραφή τιμής.', 'error'); return; }
    try {
      const saved = await save.mutateAsync({
        ...(row.id ? { id: row.id } : {}),
        party_id: partyId,
        label: row.label.trim(),
        unit: row.unit || 'per_piece',
        rate: parseAmount(row.rateInput),
        match: Object.fromEntries(Object.entries(row.match || {}).filter(([, value]) => value)),
        priority: Number(row.priority || 0),
        is_active: row.is_active ?? true,
      });
      setRows((previous) => previous.map((item, position) => (position === index ? toRow(saved as FinanceRateCard) : item)));
      showToast('Η τιμή αποθηκεύτηκε.', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const drop = async (row: Row, index: number) => {
    if (row.id) {
      const ok = await confirm({ title: 'Διαγραφή τιμής', message: `Θα διαγραφεί η «${row.label}».`, confirmText: 'Διαγραφή', isDestructive: true });
      if (!ok) return;
      await remove.mutateAsync(row.id).catch((error) => showToast(error.message, 'error'));
    }
    setRows((previous) => previous.filter((_, position) => position !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs font-semibold text-slate-500">
          Ορίστε ελεύθερα τις τιμές του συνεργάτη. Για καρφωτή επιλέξτε «€ / πέτρα» και προαιρετικά την πέτρα — η εφαρμογή μετρά τις πέτρες από τη συνταγή κάθε κωδικού.
        </p>
        <button type="button" onClick={() => setRows((previous) => [...previous, { label: '', unit: 'per_stone', rateInput: '', match: { stage: 'Setting' }, priority: 0, is_active: true, dirty: true }])} className={secondaryButton}>
          <Plus size={15} /> Νέα τιμή
        </button>
      </div>
      {rows.length === 0 ? <EmptyNote icon={Tags} title="Χωρίς τιμοκατάλογο" detail="Προσθέστε π.χ. «Ζιργκόν έως 2mm — 0,12 €/πέτρα»." /> : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id || `new-${index}`} className={`rounded-2xl border p-3 ${row.dirty ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100'} ${row.is_active === false ? 'opacity-60' : ''}`}>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_9rem_7rem_auto]">
                <input value={row.label || ''} onChange={(event) => update(index, { label: event.target.value })} placeholder="Περιγραφή (π.χ. Ζιργκόν 2mm)" className={`${inputClass} py-2 font-bold`} />
                <select value={row.unit || 'per_piece'} onChange={(event) => update(index, { unit: event.target.value as FinanceRateUnit })} className={`${inputClass} py-2`}>
                  {(Object.keys(RATE_UNIT_LABELS) as FinanceRateUnit[]).map((unit) => <option key={unit} value={unit}>{RATE_UNIT_LABELS[unit]}</option>)}
                </select>
                <input inputMode="decimal" value={row.rateInput} onChange={(event) => update(index, { rateInput: event.target.value })} placeholder="0,00 €" className={`${inputClass} py-2 text-right font-black`} />
                <div className="flex items-center gap-1">
                  {row.dirty && <button type="button" onClick={() => persist(row, index)} className="rounded-lg bg-slate-900 p-2 text-white" aria-label="Αποθήκευση"><Save size={14} /></button>}
                  <button type="button" onClick={() => drop(row, index)} className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="Διαγραφή"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
                <select value={row.match?.stage || ''} onChange={(event) => updateMatch(index, 'stage', event.target.value)} className={`${inputClass} py-1.5 text-xs`}>
                  <option value="">Κάθε στάδιο</option>
                  {BILLABLE_STAGES.map((stage) => <option key={stage.stage} value={stage.stage}>{stage.label}</option>)}
                </select>
                {row.unit === 'per_stone' ? (
                  <select value={row.match?.material_id || ''} onChange={(event) => updateMatch(index, 'material_id', event.target.value)} className={`${inputClass} py-1.5 text-xs`}>
                    <option value="">Κάθε πέτρα</option>
                    {stones.map((stone) => <option key={stone.id} value={stone.id}>{stone.name}{stone.description ? ` ${stone.description}` : ''}</option>)}
                  </select>
                ) : (
                  <input value={row.match?.category || ''} onChange={(event) => updateMatch(index, 'category', event.target.value)} title="Η κύρια κατηγορία περιλαμβάνει τις υποκατηγορίες της. Στην ίδια προτεραιότητα υπερισχύει ο πιο συγκεκριμένος κανόνας." placeholder="Κατηγορία ή υποκατηγορία" className={`${inputClass} py-1.5 text-xs`} />
                )}
                <input value={row.match?.sku_prefix || ''} onChange={(event) => updateMatch(index, 'sku_prefix', event.target.value)} placeholder="Πρόθεμα κωδικού" className={`${inputClass} py-1.5 text-xs`} />
                <input value={row.match?.stone_code || ''} onChange={(event) => updateMatch(index, 'stone_code', event.target.value)} placeholder="Κωδ. πέτρας παραλλαγής" className={`${inputClass} py-1.5 text-xs`} />
                <div className="flex items-center gap-2">
                  <input type="number" value={row.priority ?? 0} onChange={(event) => update(index, { priority: Number(event.target.value) })} title="Προτεραιότητα" className={`${inputClass} w-16 py-1.5 text-xs`} />
                  <label className="flex items-center gap-1 font-bold text-slate-500">
                    <input type="checkbox" checked={row.is_active ?? true} onChange={(event) => update(index, { is_active: event.target.checked })} className="accent-emerald-600" /> Ενεργή
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {rows.some((row) => row.dirty) && (
        <button type="button" onClick={() => rows.forEach((row, index) => row.dirty && persist(row, index))} className={ghostButton}><Save size={13} /> Αποθήκευση όλων</button>
      )}
    </div>
  );
}
