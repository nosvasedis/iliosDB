import React, { useMemo, useState } from 'react';
import { CalendarClock, Check, Trash2 } from 'lucide-react';
import type { Supplier } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import { buildCategoryTree, flattenTree } from '../../features/finance/categoryTree';
import { formatEuro, toIsoDate } from '../../features/finance/financeMath';
import { FREQUENCY_LABELS, suggestedEstimate } from '../../features/finance/recurring';
import type { FinanceBilling, FinanceRecurring, FinanceRecurringFrequency, FinanceWorkspace } from '../../features/finance/types';
import { AmountInput, amountToInput, BillingToggle, Field, FinanceModal, inputClass, parseAmount, SaveButton, secondaryButton } from './financeUi';

export default function RecurringEditor({ workspace, parties, initial = {}, onClose }: {
  workspace: FinanceWorkspace;
  parties: Supplier[];
  initial?: Partial<FinanceRecurring>;
  onClose: () => void;
}) {
  const { showToast, confirm } = useUI();
  const flat = useMemo(() => flattenTree(buildCategoryTree(workspace.categories)), [workspace.categories]);
  const [categoryId, setCategoryId] = useState(initial.category_id || '');
  const [partyId, setPartyId] = useState(initial.party_id || '');
  const [description, setDescription] = useState(initial.description || '');
  const [amount, setAmount] = useState(amountToInput(initial.estimated_amount));
  const [billing, setBilling] = useState<FinanceBilling>(initial.billing || 'T');
  const [frequency, setFrequency] = useState<FinanceRecurringFrequency>(initial.frequency || 'monthly');
  const [start, setStart] = useState(initial.next_due || toIsoDate(new Date()));
  const [active, setActive] = useState(initial.is_active ?? true);
  const suggestion = initial.id ? suggestedEstimate(initial as FinanceRecurring, workspace.expenses) : null;

  const save = useFinanceMutation(() => financeRepository.saveRecurring({
    ...(initial.id ? { id: initial.id } : {}),
    category_id: categoryId,
    party_id: partyId || null,
    description: description.trim() || null,
    estimated_amount: parseAmount(amount),
    billing,
    frequency,
    next_due: start,
    day_of_period: Number(start.slice(8, 10)),
    is_active: active,
  }));
  const remove = useFinanceMutation(() => financeRepository.deleteRecurring(initial.id!));

  const submit = async () => {
    if (!categoryId) { showToast('Επιλέξτε κατηγορία.', 'error'); return; }
    try {
      await save.mutateAsync(undefined);
      showToast('Το επαναλαμβανόμενο έξοδο αποθηκεύτηκε.', 'success');
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({ title: 'Διαγραφή', message: 'Τα ήδη καταχωρημένα έξοδα παραμένουν.', confirmText: 'Διαγραφή', isDestructive: true });
    if (ok) await remove.mutateAsync(undefined).then(onClose).catch((error) => showToast(error.message, 'error'));
  };

  return (
    <FinanceModal
      icon={CalendarClock}
      eyebrow="Επαναλαμβανόμενο έξοδο"
      title={description || 'Νέο επαναλαμβανόμενο'}
      onClose={onClose}
      busy={save.isPending}
      footer={(
        <>
          {initial.id && <button type="button" onClick={handleDelete} className={`${secondaryButton} mr-auto text-rose-600`}><Trash2 size={15} /> Διαγραφή</button>}
          <SaveButton busy={save.isPending} onClick={submit}><Check size={16} /> Αποθήκευση</SaveButton>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
          Λίγες μέρες πριν τη λήξη εμφανίζεται «αναμενόμενος λογαριασμός» με την εκτίμηση. Όταν έρθει, συμπληρώνετε το πραγματικό ποσό.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Κατηγορία">
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}>
              <option value="">— Επιλογή —</option>
              {flat.map((node) => <option key={node.category.id} value={node.category.id}>{'  '.repeat(node.depth)}{node.category.name}</option>)}
            </select>
          </Field>
          <Field label="Πάροχος / Συνεργάτης">
            <select value={partyId} onChange={(event) => setPartyId(event.target.value)} className={inputClass}>
              <option value="">— Χωρίς —</option>
              {parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Περιγραφή"><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="π.χ. ΔΕΗ μαγαζιού" className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Εκτίμηση ποσού" hint={suggestion ? <button type="button" className="font-black text-sky-700" onClick={() => setAmount(amountToInput(suggestion))}>Μ.Ο. τελευταίων: {formatEuro(suggestion)}</button> : undefined}>
            <AmountInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Συχνότητα">
            <select value={frequency} onChange={(event) => setFrequency(event.target.value as FinanceRecurringFrequency)} className={inputClass}>
              {(Object.keys(FREQUENCY_LABELS) as FinanceRecurringFrequency[]).map((key) => <option key={key} value={key}>{FREQUENCY_LABELS[key]}</option>)}
            </select>
          </Field>
          <Field label="Πρώτη λήξη"><input type="date" value={start} onChange={(event) => setStart(event.target.value)} className={inputClass} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BillingToggle value={billing} onChange={setBilling} />
          <label className="ml-auto flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-emerald-600" /> Ενεργό
          </label>
        </div>
      </div>
    </FinanceModal>
  );
}
