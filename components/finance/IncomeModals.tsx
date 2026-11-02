import React, { useMemo, useState } from 'react';
import { Check, HandCoins, Percent, RotateCcw } from 'lucide-react';
import type { LegalDocument } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import { formatEuro, normalizeSplit, PAYMENT_METHOD_LABELS, roundMoney, splitExpected, toIsoDate } from '../../features/finance/financeMath';
import type { CustomerBalance, OrderIncome } from '../../features/finance/incomeLedger';
import type { FinanceBillingMode, FinanceCustomerTerms, FinanceOrderBilling, FinancePaymentMethod } from '../../features/finance/types';
import { AmountInput, amountToInput, Field, FinanceModal, inputClass, parseAmount, SaveButton, secondaryButton, SplitBar } from './financeUi';

/** Mode buttons + Τ% slider, shared by order and customer terms. */
export function SplitEditor({ mode, tPercent, onChange }: { mode: FinanceBillingMode; tPercent: number; onChange: (mode: FinanceBillingMode, tPercent: number) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {([['T', 'Όλο Τ', 'με τιμολόγιο'], ['split', 'Μικτό', 'Τ + Χ'], ['X', 'Όλο Χ', 'χωρίς παραστατικό']] as Array<[FinanceBillingMode, string, string]>).map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key, key === 'T' ? 100 : key === 'X' ? 0 : (tPercent > 0 && tPercent < 100 ? tPercent : 50))}
            className={`rounded-2xl border-2 p-3 text-left transition ${mode === key
              ? key === 'T' ? 'border-indigo-500 bg-indigo-50' : key === 'X' ? 'border-amber-400 bg-amber-50' : 'border-slate-900 bg-slate-50'
              : 'border-slate-100 hover:border-slate-200'}`}
          >
            <div className="text-sm font-black text-slate-900">{label}</div>
            <div className="text-[11px] font-semibold text-slate-500">{hint}</div>
          </button>
        ))}
      </div>
      {mode === 'split' && (
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-black">
            <span className="text-indigo-700">Τ {Math.round(tPercent)}%</span>
            <span className="text-amber-700">Χ {Math.round(100 - tPercent)}%</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={tPercent} onChange={(event) => onChange('split', Number(event.target.value))} className="w-full accent-indigo-600" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[30, 50, 60, 70, 80].map((value) => (
              <button key={value} type="button" onClick={() => onChange('split', value)} className={`rounded-lg px-2 py-1 text-[11px] font-black ${tPercent === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                {value}/{100 - value}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrderBillingModal({ income, onClose }: { income: OrderIncome; onClose: () => void }) {
  const { showToast } = useUI();
  const [mode, setMode] = useState<FinanceBillingMode>(income.split.mode);
  const [tPercent, setTPercent] = useState(income.split.tPercent);
  const [agreed, setAgreed] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const preview = splitExpected(income.net, income.vatRate, normalizeSplit(mode, tPercent), agreed ? parseAmount(agreed) : null);

  const save = useFinanceMutation((billing: FinanceOrderBilling) => financeRepository.saveOrderBilling(billing));
  const reset = useFinanceMutation(() => financeRepository.deleteOrderBilling(income.order.id));

  const submit = async () => {
    try {
      await save.mutateAsync({ order_id: income.order.id, mode, t_percent: tPercent, agreed_total: agreed ? parseAmount(agreed) : null, due_date: dueDate || null, notes: notes || null });
      showToast('Οι όροι Χ/Τ της παραγγελίας αποθηκεύτηκαν.', 'success');
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  return (
    <FinanceModal
      icon={Percent}
      eyebrow={`Παραγγελία ${income.order.id}`}
      title={income.customerName}
      onClose={onClose}
      busy={save.isPending}
      footer={(
        <>
          {income.explicitSplit && (
            <button type="button" onClick={() => reset.mutateAsync(undefined).then(onClose).catch((error) => showToast(error.message, 'error'))} className={`${secondaryButton} mr-auto`}>
              <RotateCcw size={15} /> Όπως ο πελάτης
            </button>
          )}
          <SaveButton busy={save.isPending} onClick={submit}><Check size={16} /> Αποθήκευση</SaveButton>
        </>
      )}
    >
      <div className="space-y-4">
        <SplitEditor mode={mode} tPercent={tPercent} onChange={(nextMode, nextPercent) => { setMode(nextMode); setTPercent(nextPercent); }} />
        <div className="rounded-2xl border border-slate-100 p-3">
          <div className="mb-2 flex justify-between text-sm font-black">
            <span className="text-indigo-700">Τ {formatEuro(preview.T)}</span>
            <span className="text-amber-700">Χ {formatEuro(preview.X)}</span>
          </div>
          <SplitBar t={preview.T} x={preview.X} collectedT={income.collected.T} collectedX={income.collected.X} height="h-3" />
          <p className="mt-2 text-[11px] font-semibold text-slate-500">Καθαρή αξία {formatEuro(income.net)}. Το Τ επιβαρύνεται με ΦΠΑ {Math.round(income.vatRate * 100)}%, το Χ όχι.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Συμφωνημένο σύνολο (προαιρετικό)" hint="Αν συμφωνήθηκε στρογγυλό ποσό.">
            <AmountInput value={agreed} onChange={setAgreed} placeholder={amountToInput(income.expected.T + income.expected.X)} />
          </Field>
          <Field label="Ημ. εξόφλησης"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} /></Field>
        </div>
        <Field label="Σημείωση"><input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} /></Field>
      </div>
    </FinanceModal>
  );
}

export function CustomerTermsModal({ customerId, customerName, terms, onClose }: { customerId: string; customerName: string; terms?: FinanceCustomerTerms; onClose: () => void }) {
  const { showToast } = useUI();
  const [mode, setMode] = useState<FinanceBillingMode>(terms?.default_mode || 'T');
  const [tPercent, setTPercent] = useState(terms?.t_percent ?? 100);
  const [notes, setNotes] = useState(terms?.notes || '');
  const save = useFinanceMutation((value: FinanceCustomerTerms) => financeRepository.saveCustomerTerms(value));

  const submit = async () => {
    try {
      await save.mutateAsync({ customer_id: customerId, default_mode: mode, t_percent: tPercent, notes: notes || null });
      showToast('Οι όροι του πελάτη αποθηκεύτηκαν.', 'success');
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  return (
    <FinanceModal icon={Percent} eyebrow="Προεπιλογή Χ/Τ πελάτη" title={customerName} onClose={onClose} busy={save.isPending}
      footer={<SaveButton busy={save.isPending} onClick={submit}><Check size={16} /> Αποθήκευση</SaveButton>}>
      <div className="space-y-4">
        <SplitEditor mode={mode} tPercent={tPercent} onChange={(nextMode, nextPercent) => { setMode(nextMode); setTPercent(nextPercent); }} />
        <p className="text-xs font-semibold text-slate-500">Ισχύει για κάθε παραγγελία και προσφορά του πελάτη που δεν έχει δικούς της όρους.</p>
        <Field label="Σημείωση"><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="π.χ. πληρώνει πάντα με επιταγή" className={inputClass} /></Field>
      </div>
    </FinanceModal>
  );
}

/** Είσπραξη for one order (or on account for a customer), split Τ/Χ in one step. */
export function ReceiptModal({ income, balance, legalDocuments = [], onClose }: {
  income?: OrderIncome;
  balance?: CustomerBalance;
  legalDocuments?: LegalDocument[];
  onClose: () => void;
}) {
  const { showToast } = useUI();
  const open = income
    ? { T: Math.max(0, income.remaining.T), X: Math.max(0, income.remaining.X) }
    : { T: Math.max(0, balance?.balance.T || 0), X: Math.max(0, balance?.balance.X || 0) };
  const delivered = income ? { T: Math.max(0, income.outstanding.T), X: Math.max(0, income.outstanding.X) } : open;
  const [tInput, setTInput] = useState(amountToInput(delivered.T));
  const [xInput, setXInput] = useState(amountToInput(delivered.X));
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [method, setMethod] = useState<FinancePaymentMethod>('cash');
  const [legalDocumentId, setLegalDocumentId] = useState('');
  const [notes, setNotes] = useState('');
  const orderDocuments = useMemo(
    () => legalDocuments.filter((document) => income && document.order_id === income.order.id && document.document_kind !== 'delivery_note'),
    [legalDocuments, income],
  );
  const customerId = income?.customerId || balance?.customerId || null;

  const save = useFinanceMutation(async () => {
    const base = { customer_id: customerId && !customerId.startsWith('name:') ? customerId : null, order_id: income?.order.id || null, received_at: date, method, notes: notes || null };
    const t = roundMoney(parseAmount(tInput));
    const x = roundMoney(parseAmount(xInput));
    if (t > 0) await financeRepository.saveReceipt({ ...base, amount: t, billing: 'T', legal_document_id: legalDocumentId || null });
    if (x > 0) await financeRepository.saveReceipt({ ...base, amount: x, billing: 'X' });
  });

  const total = parseAmount(tInput) + parseAmount(xInput);
  const submit = async () => {
    if (total <= 0) { showToast('Συμπληρώστε ποσό.', 'error'); return; }
    try {
      await save.mutateAsync(undefined);
      showToast(`Είσπραξη ${formatEuro(total)} καταχωρίστηκε.`, 'success');
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const quick = (t: number, x: number) => { setTInput(amountToInput(t)); setXInput(amountToInput(x)); };

  return (
    <FinanceModal
      icon={HandCoins}
      eyebrow={income ? `Είσπραξη · ${income.order.id}` : 'Είσπραξη έναντι'}
      title={income?.customerName || balance?.customerName || 'Πελάτης'}
      onClose={onClose}
      busy={save.isPending}
      footer={<SaveButton busy={save.isPending} onClick={submit}><Check size={16} /> Είσπραξη {formatEuro(total)}</SaveButton>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-indigo-50 p-3"><div className="text-[11px] font-black uppercase text-indigo-600">Υπόλοιπο Τ</div><div className="text-lg font-black tabular-nums text-indigo-900">{formatEuro(open.T)}</div></div>
          <div className="rounded-2xl bg-amber-50 p-3"><div className="text-[11px] font-black uppercase text-amber-600">Υπόλοιπο Χ</div><div className="text-lg font-black tabular-nums text-amber-900">{formatEuro(open.X)}</div></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => quick(open.T, open.X)} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-black text-white">Όλο το υπόλοιπο</button>
          {income && (delivered.T !== open.T || delivered.X !== open.X) && (
            <button type="button" onClick={() => quick(delivered.T, delivered.X)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-black text-slate-700">Μόνο παραδομένα</button>
          )}
          <button type="button" onClick={() => quick(open.T, 0)} className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-black text-indigo-700">Μόνο Τ</button>
          <button type="button" onClick={() => quick(0, open.X)} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-black text-amber-700">Μόνο Χ</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Τ · με παραστατικό"><AmountInput value={tInput} onChange={setTInput} className="text-lg" /></Field>
          <Field label="Χ · χωρίς παραστατικό"><AmountInput value={xInput} onChange={setXInput} className="text-lg" /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(PAYMENT_METHOD_LABELS) as FinancePaymentMethod[]).map((key) => (
            <button key={key} type="button" onClick={() => setMethod(key)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${method === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{PAYMENT_METHOD_LABELS[key]}</button>
          ))}
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${inputClass} ml-auto w-auto py-1.5`} />
        </div>
        {orderDocuments.length > 0 && parseAmount(tInput) > 0 && (
          <Field label="Παραστατικό Τ">
            <select value={legalDocumentId} onChange={(event) => setLegalDocumentId(event.target.value)} className={inputClass}>
              <option value="">— Χωρίς σύνδεση —</option>
              {orderDocuments.map((document) => (
                <option key={document.id} value={document.id}>{document.series}{document.aa ? ` ${document.aa}` : ''} · {formatEuro(Number(document.totals?.gross || 0))}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Σημείωση"><input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} /></Field>
      </div>
    </FinanceModal>
  );
}
