import React, { useMemo, useState } from 'react';
import { Check, Wallet } from 'lucide-react';
import type { Supplier } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import type { PartyBalance } from '../../features/finance/expenseLedger';
import { formatEuro, PAYMENT_METHOD_LABELS, roundMoney, toIsoDate } from '../../features/finance/financeMath';
import type { FinanceBilling, FinancePaymentMethod } from '../../features/finance/types';
import { AmountInput, amountToInput, BillingBadge, BillingToggle, Field, FinanceModal, inputClass, parseAmount, SaveButton } from './financeUi';

/**
 * Pays a party. Selecting bills settles them one by one (oldest first);
 * any remainder is kept as a payment on account.
 */
export default function PaymentModal({ balance, party, onClose }: { balance: PartyBalance; party?: Supplier; onClose: () => void }) {
  const { showToast } = useUI();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(balance.open.map((row) => row.expense.id)));
  const selectedTotal = useMemo(() => roundMoney(balance.open.filter((row) => selected.has(row.expense.id)).reduce((sum, row) => sum + row.open, 0)), [balance.open, selected]);
  const [amountInput, setAmountInput] = useState(amountToInput(selectedTotal || balance.balance));
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [method, setMethod] = useState<FinancePaymentMethod>('bank');
  const [billing, setBilling] = useState<FinanceBilling>(party?.default_billing || balance.open[0]?.expense.billing || 'T');
  const [notes, setNotes] = useState('');

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    setAmountInput(amountToInput(balance.open.filter((row) => next.has(row.expense.id)).reduce((sum, row) => sum + row.open, 0)));
  };

  const pay = useFinanceMutation(async () => {
    let remaining = parseAmount(amountInput);
    for (const row of balance.open.filter((item) => selected.has(item.expense.id))) {
      if (remaining <= 0.004) break;
      const amount = roundMoney(Math.min(row.open, remaining));
      await financeRepository.savePayment({ expense_id: row.expense.id, party_id: balance.partyId, amount, paid_at: date, method, billing: row.expense.billing, notes: notes || null });
      remaining = roundMoney(remaining - amount);
    }
    if (remaining > 0.004) {
      await financeRepository.savePayment({ party_id: balance.partyId, amount: remaining, paid_at: date, method, billing, notes: notes || 'Πληρωμή έναντι' });
    }
  });

  const submit = async () => {
    if (parseAmount(amountInput) <= 0) { showToast('Συμπληρώστε ποσό.', 'error'); return; }
    try {
      await pay.mutateAsync(undefined);
      showToast('Η πληρωμή καταχωρίστηκε.', 'success');
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  return (
    <FinanceModal
      icon={Wallet}
      eyebrow="Πληρωμή"
      title={party?.name || 'Συνεργάτης'}
      onClose={onClose}
      busy={pay.isPending}
      footer={<SaveButton busy={pay.isPending} onClick={submit}><Check size={16} /> Πληρωμή {formatEuro(parseAmount(amountInput))}</SaveButton>}
    >
      <div className="space-y-4">
        {balance.open.length > 0 ? (
          <div className="space-y-1.5">
            <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Ανοιχτοί λογαριασμοί</span>
            {balance.open.map((row) => (
              <label key={row.expense.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(row.expense.id)} onChange={() => toggle(row.expense.id)} className="h-4 w-4 accent-emerald-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{row.expense.description || row.expense.doc_ref || 'Έξοδο'}</span>
                  <span className="text-xs font-semibold text-slate-500">{row.expense.expense_date} · λήξη {row.dueDate}</span>
                </span>
                <BillingBadge billing={row.expense.billing} compact />
                <span className="text-sm font-black tabular-nums text-slate-900">{formatEuro(row.open)}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">Δεν υπάρχουν ανοιχτοί λογαριασμοί. Η πληρωμή θα καταχωριστεί έναντι.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ποσό" hint={selectedTotal ? `Επιλεγμένα: ${formatEuro(selectedTotal)}` : undefined}>
            <AmountInput value={amountInput} onChange={setAmountInput} className="text-lg" />
          </Field>
          <Field label="Ημερομηνία"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(PAYMENT_METHOD_LABELS) as FinancePaymentMethod[]).map((key) => (
            <button key={key} type="button" onClick={() => setMethod(key)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${method === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {PAYMENT_METHOD_LABELS[key]}
            </button>
          ))}
          <span className="ml-auto"><BillingToggle value={billing} onChange={setBilling} /></span>
        </div>
        <Field label="Σημείωση"><input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} /></Field>
      </div>
    </FinanceModal>
  );
}
