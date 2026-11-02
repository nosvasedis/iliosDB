import React, { useMemo, useState } from 'react';
import { AlertTriangle, FileWarning, HandCoins, Percent, Search, Trash2, Users } from 'lucide-react';
import { OrderStatus, type LegalDocument } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import { formatEuro, inPeriod, PAYMENT_METHOD_LABELS } from '../../features/finance/financeMath';
import {
  AGING_LABELS,
  type AgingBucket,
  type CustomerBalance,
  type InvoiceGap,
  type OrderIncome,
} from '../../features/finance/incomeLedger';
import type { FinanceBilling, FinancePeriod, FinanceWorkspace } from '../../features/finance/types';
import { CustomerTermsModal, OrderBillingModal, ReceiptModal } from './IncomeModals';
import { BillingBadge, EmptyNote, ghostButton, inputClass, SectionCard, SplitBar } from './financeUi';

type View = 'orders' | 'customers' | 'receipts' | 'invoices';
type OrderFilter = 'owed' | 'open' | 'settled' | 'all';

const STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.Pending]: 'Εκκρεμεί',
  [OrderStatus.InProduction]: 'Παραγωγή',
  [OrderStatus.Ready]: 'Έτοιμη',
  [OrderStatus.PartiallyDelivered]: 'Μερική παράδοση',
  [OrderStatus.Delivered]: 'Παραδόθηκε',
};

const AGING_TONES: Record<AgingBucket, string> = {
  current: 'bg-emerald-50 text-emerald-700',
  d30: 'bg-lime-50 text-lime-700',
  d60: 'bg-amber-50 text-amber-700',
  d90: 'bg-orange-50 text-orange-700',
  d90plus: 'bg-rose-50 text-rose-700',
};

const splitLabel = (income: OrderIncome) =>
  income.split.mode === 'T' ? 'Τ' : income.split.mode === 'X' ? 'Χ' : `${Math.round(income.split.tPercent)}/${Math.round(100 - income.split.tPercent)}`;

export default function IncomeTab({ workspace, orderIncome, customerBalances, invoiceGaps, legalDocuments, period, billingFilter }: {
  workspace: FinanceWorkspace;
  orderIncome: OrderIncome[];
  customerBalances: CustomerBalance[];
  invoiceGaps: InvoiceGap[];
  legalDocuments: LegalDocument[];
  period: FinancePeriod;
  billingFilter: FinanceBilling | 'all';
}) {
  const { showToast, confirm } = useUI();
  const [view, setView] = useState<View>('orders');
  const [filter, setFilter] = useState<OrderFilter>('owed');
  const [search, setSearch] = useState('');
  const [receiptFor, setReceiptFor] = useState<{ income?: OrderIncome; balance?: CustomerBalance } | null>(null);
  const [billingFor, setBillingFor] = useState<OrderIncome | null>(null);
  const [termsFor, setTermsFor] = useState<CustomerBalance | null>(null);
  const removeReceipt = useFinanceMutation((id: string) => financeRepository.deleteReceipt(id));

  const term = search.trim().toLocaleLowerCase('el');
  const pick = (value: { T: number; X: number }) => (billingFilter === 'all' ? value.T + value.X : value[billingFilter]);

  const orders = useMemo(() => orderIncome
    .filter((income) => {
      const owed = pick(income.outstanding);
      const remaining = pick(income.remaining);
      if (filter === 'owed' && owed <= 0.01) return false;
      if (filter === 'open' && remaining <= 0.01) return false;
      if (filter === 'settled' && remaining > 0.01) return false;
      if (!term) return true;
      return `${income.order.id} ${income.customerName}`.toLocaleLowerCase('el').includes(term);
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.order.created_at.localeCompare(a.order.created_at)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [orderIncome, filter, term, billingFilter]);

  const customers = customerBalances.filter((balance) => Math.abs(balance.total) > 0.01 && (!term || balance.customerName.toLocaleLowerCase('el').includes(term)));
  const receipts = workspace.receipts
    .filter((receipt) => inPeriod(receipt.received_at, period) && (billingFilter === 'all' || receipt.billing === billingFilter))
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
  const incomeByOrder = useMemo(() => new Map(orderIncome.map((income) => [income.order.id, income])), [orderIncome]);

  const deleteReceipt = async (id: string) => {
    const ok = await confirm({ title: 'Διαγραφή είσπραξης', message: 'Η είσπραξη θα αφαιρεθεί από το υπόλοιπο του πελάτη.', confirmText: 'Διαγραφή', isDestructive: true });
    if (ok) await removeReceipt.mutateAsync(id).catch((error) => showToast(error.message, 'error'));
  };

  const views: Array<[View, string, number]> = [
    ['orders', 'Παραγγελίες', orderIncome.filter((income) => income.outstanding.T + income.outstanding.X > 0.01).length],
    ['customers', 'Πελάτες', customerBalances.filter((balance) => balance.total > 0.01).length],
    ['receipts', 'Εισπράξεις', receipts.length],
    ['invoices', 'Τ & Παραστατικά', invoiceGaps.length],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1">
          {views.map(([key, label, count]) => (
            <button key={key} type="button" onClick={() => setView(key)} className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-black ${view === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {label}{count > 0 && <span className={`rounded-md px-1.5 text-[10px] ${key === 'invoices' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>{count}</span>}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Πελάτης ή παραγγελία…" className={`${inputClass} w-56 py-2 pl-8 text-xs`} />
        </div>
      </div>

      {view === 'orders' && (
        <SectionCard
          title="Χ/Τ ανά παραγγελία"
          subtitle="Η μπάρα δείχνει Τ (μπλε) και Χ (κίτρινο)· το έντονο χρώμα είναι ό,τι έχει εισπραχθεί."
          icon={HandCoins}
          actions={(
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-black">
              {([['owed', 'Οφειλόμενες'], ['open', 'Με υπόλοιπο'], ['settled', 'Εξοφλημένες'], ['all', 'Όλες']] as Array<[OrderFilter, string]>).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-lg px-2.5 py-1.5 ${filter === key ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
          )}
          bodyClassName="p-0"
        >
          {orders.length === 0 ? <div className="p-4"><EmptyNote title="Καμία παραγγελία σε αυτό το φίλτρο" /></div> : (
            <div className="divide-y divide-slate-100">
              {orders.slice(0, 300).map((income) => (
                <div key={income.order.id} className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7rem_auto]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-900">{income.customerName}</span>
                      {income.daysOverdue > 0 && <span className="flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-black text-rose-700"><AlertTriangle size={10} /> {income.daysOverdue} ημ.</span>}
                    </div>
                    <div className="truncate text-xs font-semibold text-slate-500">
                      {income.order.id} · {income.order.created_at.slice(0, 10)} · {STATUS_LABELS[income.order.status] || income.order.status}
                      {income.deliveredRatio > 0 && income.deliveredRatio < 1 ? ` · ${Math.round(income.deliveredRatio * 100)}% παραδομένο` : ''}
                    </div>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <SplitBar t={income.expected.T} x={income.expected.X} collectedT={income.collected.T} collectedX={income.collected.X} />
                    <div className="flex justify-between text-[11px] font-bold tabular-nums">
                      <span className="text-indigo-700">Τ {formatEuro(income.collected.T, 0)} / {formatEuro(income.expected.T, 0)}</span>
                      <span className="text-amber-700">Χ {formatEuro(income.collected.X, 0)} / {formatEuro(income.expected.X, 0)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black uppercase text-slate-400">Οφείλει</div>
                    <div className={`text-sm font-black tabular-nums ${pick(income.outstanding) > 0.01 ? 'text-slate-900' : 'text-emerald-600'}`}>{formatEuro(Math.max(0, pick(income.outstanding)))}</div>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => setBillingFor(income)} title="Όροι Χ/Τ" className={`rounded-lg px-2 py-1.5 text-xs font-black ring-1 ${income.explicitSplit ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
                      <Percent size={11} className="mr-1 inline" />{splitLabel(income)}
                    </button>
                    <button type="button" onClick={() => setReceiptFor({ income })} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-emerald-700">Είσπραξη</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {view === 'customers' && (
        <SectionCard title="Υπόλοιπα πελατών" subtitle="Ενηλικίωση οφειλών με βάση την ημερομηνία παράδοσης και τις ημέρες πίστωσης" icon={Users} bodyClassName="p-0">
          {customers.length === 0 ? <div className="p-4"><EmptyNote title="Κανένα ανοιχτό υπόλοιπο" /></div> : (
            <div className="divide-y divide-slate-100">
              {customers.map((balance) => (
                <div key={balance.customerId} className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_8rem_auto]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-900">{balance.customerName}</span>
                      {balance.overCreditLimit && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-black text-rose-700">Πάνω από όριο</span>}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {balance.orders.length} παραγγελίες{balance.lastReceiptAt ? ` · τελ. είσπραξη ${balance.lastReceiptAt}` : ' · καμία είσπραξη'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(AGING_LABELS) as AgingBucket[]).filter((bucket) => balance.aging[bucket] > 0.01).map((bucket) => (
                      <span key={bucket} className={`rounded-lg px-2 py-0.5 text-[11px] font-black tabular-nums ${AGING_TONES[bucket]}`}>{AGING_LABELS[bucket]} {formatEuro(balance.aging[bucket], 0)}</span>
                    ))}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black tabular-nums text-slate-900">{formatEuro(billingFilter === 'all' ? balance.total : balance.balance[billingFilter])}</div>
                    <div className="text-[11px] font-bold tabular-nums"><span className="text-indigo-700">Τ {formatEuro(balance.balance.T, 0)}</span> · <span className="text-amber-700">Χ {formatEuro(balance.balance.X, 0)}</span></div>
                  </div>
                  <div className="flex justify-end gap-1">
                    {!balance.customerId.startsWith('name:') && <button type="button" onClick={() => setTermsFor(balance)} className={ghostButton}><Percent size={12} /> Όροι</button>}
                    <button type="button" onClick={() => setReceiptFor({ balance })} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-emerald-700">Είσπραξη</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {view === 'receipts' && (
        <SectionCard title="Εισπράξεις περιόδου" subtitle={`${receipts.length} κινήσεις · ${formatEuro(receipts.reduce((sum, receipt) => sum + receipt.amount, 0))}`} icon={HandCoins} bodyClassName="p-0">
          {receipts.length === 0 ? <div className="p-4"><EmptyNote title="Καμία είσπραξη στην περίοδο" /></div> : (
            <div className="divide-y divide-slate-100">
              {receipts.map((receipt) => {
                const income = receipt.order_id ? incomeByOrder.get(receipt.order_id) : undefined;
                const customer = customerBalances.find((balance) => balance.customerId === receipt.customer_id);
                return (
                  <div key={receipt.id} className="flex items-center gap-3 px-4 py-2.5">
                    <BillingBadge billing={receipt.billing} compact />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-slate-900">{income?.customerName || customer?.customerName || '—'}</div>
                      <div className="truncate text-xs font-semibold text-slate-500">{receipt.received_at} · {PAYMENT_METHOD_LABELS[receipt.method]}{receipt.order_id ? ` · ${receipt.order_id}` : ' · έναντι'}{receipt.notes ? ` · ${receipt.notes}` : ''}</div>
                    </div>
                    <span className="text-sm font-black tabular-nums text-emerald-700">+{formatEuro(receipt.amount)}</span>
                    <button type="button" onClick={() => deleteReceipt(receipt.id)} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="Διαγραφή"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {view === 'invoices' && (
        <SectionCard title="Τ χωρίς παραστατικό" subtitle="Παραδομένες παραγγελίες όπου το Τ μέρος ξεπερνά τα εκδοθέντα τιμολόγια" icon={FileWarning} bodyClassName="p-0">
          {invoiceGaps.length === 0 ? <div className="p-4"><EmptyNote title="Όλα τα Τ έχουν παραστατικό" detail="Σύγκριση με τα εκδοθέντα Παραστατικά της εφαρμογής." /></div> : (
            <div className="divide-y divide-slate-100">
              {invoiceGaps.map(({ income, missing }) => (
                <div key={income.order.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-900">{income.customerName}</div>
                    <div className="text-xs font-semibold text-slate-500">{income.order.id} · Τ παραδομένο {formatEuro(income.due.T)} · τιμολογημένο {formatEuro(income.invoicedT)}</div>
                  </div>
                  <span className="text-sm font-black tabular-nums text-amber-700">{formatEuro(missing)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {receiptFor && <ReceiptModal income={receiptFor.income} balance={receiptFor.balance} legalDocuments={legalDocuments} onClose={() => setReceiptFor(null)} />}
      {billingFor && <OrderBillingModal income={billingFor} onClose={() => setBillingFor(null)} />}
      {termsFor && (
        <CustomerTermsModal
          customerId={termsFor.customerId}
          customerName={termsFor.customerName}
          terms={workspace.customerTerms.find((terms) => terms.customer_id === termsFor.customerId)}
          onClose={() => setTermsFor(null)}
        />
      )}
    </div>
  );
}
