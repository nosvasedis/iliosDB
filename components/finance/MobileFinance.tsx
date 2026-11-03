import React, { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Camera, CheckCircle2, HandCoins, Info, Landmark, Receipt, Scale, Wallet } from 'lucide-react';
import type { GlobalSettings, Product } from '../../types';
import MobileScreenHeader from '../mobile/MobileScreenHeader';
import IliosLoader from '../ui/IliosLoader';
import { useFinanceHub } from '../../hooks/api/useFinanceHub';
import { formatEuro, inPeriod, resolvePeriod, toIsoDate, type FinancePeriodPreset } from '../../features/finance/financeMath';
import BookedResourceQuantitiesPanel from './BookedResourceQuantitiesPanel';
import type { OrderIncome } from '../../features/finance/incomeLedger';
import ExpenseEditor from './ExpenseEditor';
import ResourceQuantitiesPanel from './ResourceQuantitiesPanel';
import { ReceiptModal } from './IncomeModals';
import { BillingToggle, SplitBar } from './financeUi';
import type { FinanceBilling } from '../../features/finance/types';

const TONES = {
  good: { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-900' },
  warn: { icon: AlertTriangle, tone: 'bg-amber-50 text-amber-900' },
  bad: { icon: AlertTriangle, tone: 'bg-rose-50 text-rose-900' },
  info: { icon: Info, tone: 'bg-sky-50 text-sky-900' },
};

/** Phone view: the numbers that matter, quick expense with camera, quick είσπραξη. */
export default function MobileFinance({ products, settings, onOpenAnalytics }: { products: Product[]; settings?: GlobalSettings | null; onOpenAnalytics: () => void }) {
  const [preset, setPreset] = useState<FinancePeriodPreset>('month');
  const [billingFilter, setBillingFilter] = useState<FinanceBilling | 'all'>('all');
  const [addingExpense, setAddingExpense] = useState(false);
  const [receiptFor, setReceiptFor] = useState<OrderIncome | null>(null);
  const period = resolvePeriod(preset, toIsoDate(new Date()));
  const hub = useFinanceHub({ products, settings, period, billingFilter });
  const derived = hub.derived;
  const purchaseExpenses = useMemo(() => (hub.workspace?.expenses || []).filter((expense) => inPeriod(expense.expense_date, period) && (billingFilter === 'all' || expense.billing === billingFilter)), [hub.workspace?.expenses, period.from, period.to, billingFilter]);

  const owed = derived?.orderIncome
    .filter((income) => income.outstanding.T + income.outstanding.X > 0.01)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 12) || [];

  return (
    <div className="min-h-full bg-linear-to-b from-slate-50 to-slate-100/80 pb-28">
      <MobileScreenHeader icon={Wallet} title="Οικονομικός Έλεγχος" subtitle="Έσοδα Χ/Τ · Έξοδα" iconClassName="text-amber-600" />
      <div className="space-y-4 px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-white p-0.5 text-xs font-black shadow-xs ring-1 ring-slate-200">
            {([['month', 'Μήνας'], ['quarter', 'Τρίμηνο'], ['year', 'Έτος']] as Array<[FinancePeriodPreset, string]>).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setPreset(key)} className={`rounded-lg px-3 py-1.5 ${preset === key ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
          <BillingToggle value={billingFilter} onChange={setBillingFilter} allowAll />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!hub.workspace} onClick={() => setAddingExpense(true)} className="flex items-center justify-center gap-2 rounded-2xl bg-[#060b00] py-3.5 text-sm font-black text-white shadow-xs active:scale-[0.98]">
            <Camera size={17} /> Νέο έξοδο
          </button>
          <button type="button" onClick={onOpenAnalytics} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-black text-slate-800 shadow-xs ring-1 ring-slate-200 active:scale-[0.98]">
            <BarChart3 size={17} /> Αναλύσεις
          </button>
        </div>

        {!derived || !hub.workspace ? (
          <div className="flex justify-center py-16"><IliosLoader /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: HandCoins, label: 'Εισπράξεις', value: derived.receiptSummary.total, split: derived.receiptSummary.byBilling, tone: 'text-cyan-700' },
                { icon: Receipt, label: 'Έξοδα', value: derived.expenseSummary.total, split: derived.expenseSummary.byBilling, tone: 'text-rose-700' },
                { icon: Scale, label: 'Αποτέλεσμα', value: derived.receiptSummary.total - derived.expenseSummary.total, tone: 'text-slate-900' },
                { icon: Landmark, label: 'Απαιτήσεις', value: derived.customerBalances.reduce((sum, balance) => sum + Math.max(0, balance.total), 0), tone: 'text-amber-700' },
              ].map(({ icon: Icon, label, value, split, tone }) => (
                <div key={label} className="rounded-2xl bg-white p-3 shadow-xs ring-1 ring-slate-100">
                  <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500"><Icon size={13} /> {label}</div>
                  <div className={`mt-1 text-lg font-black tabular-nums ${tone}`}>{formatEuro(value, 0)}</div>
                  {split && <div className="mt-1.5"><SplitBar t={split.T} x={split.X} collectedT={split.T} collectedX={split.X} height="h-1.5" /></div>}
                </div>
              ))}
            </div>

            {hub.resourcesError ? <button type="button" onClick={hub.refetchResources} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Δεν φορτώθηκαν οι ποσότητες υλικών · Επανάληψη</button> : hub.resourcesLoading ? <p className="p-3 text-sm text-slate-500">Φόρτωση ποσοτήτων υλικών…</p> : <ResourceQuantitiesPanel realized={hub.resourceQuantities.realized} backlog={hub.resourceQuantities.backlog} periodLabel={`${period.from} – ${period.to}`} note="Οι φυσικές ποσότητες περιλαμβάνουν Χ και Τ, ανεξάρτητα από το φίλτρο ποσών." />}

            <details className="rounded-2xl bg-white shadow-xs ring-1 ring-slate-200"><summary className="cursor-pointer p-4 text-sm font-black text-slate-800">Ποσότητες καταγεγραμμένων αγορών ▾</summary><BookedResourceQuantitiesPanel expenses={purchaseExpenses} categories={hub.workspace.categories} materials={hub.materials} products={products} periodLabel={`${period.from} – ${period.to} · τρέχον φίλτρο Χ/Τ`} /></details>

            {derived.insights.slice(0, 4).map((insight) => {
              const meta = TONES[insight.tone];
              const Icon = meta.icon;
              return (
                <div key={insight.id} className={`flex items-start gap-2.5 rounded-2xl p-3 ${meta.tone}`}>
                  <Icon size={16} className="mt-0.5 shrink-0" />
                  <div><div className="text-sm font-black">{insight.title}</div><div className="text-xs font-semibold opacity-80">{insight.detail}</div></div>
                </div>
              );
            })}

            <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-slate-100">
              <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-black text-slate-900">Οφειλές πελατών</h3>
              {owed.length === 0 ? <p className="px-4 py-6 text-center text-sm font-semibold text-slate-400">Καμία ανοιχτή οφειλή</p> : owed.map((income) => (
                <button key={income.order.id} type="button" onClick={() => setReceiptFor(income)} className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-left active:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">{income.customerName}</span>
                    <span className={`text-xs font-semibold ${income.daysOverdue > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{income.order.id}{income.daysOverdue > 0 ? ` · ${income.daysOverdue} ημ.` : ''}</span>
                  </span>
                  <span className="text-right text-xs font-black tabular-nums">
                    <span className="block text-slate-900">{formatEuro(income.outstanding.T + income.outstanding.X, 0)}</span>
                    <span className="text-indigo-600">Τ {formatEuro(income.outstanding.T, 0)}</span> · <span className="text-amber-600">Χ {formatEuro(income.outstanding.X, 0)}</span>
                  </span>
                </button>
              ))}
            </section>

            <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-slate-100">
              <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-black text-slate-900">Επόμενες κινήσεις</h3>
              {derived.forecast.events.slice(0, 8).map((event, index) => (
                <div key={`${event.label}-${index}`} className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{event.label}</span>
                  <span className={`text-xs font-semibold ${event.overdue ? 'text-rose-600' : 'text-slate-400'}`}>{event.overdue ? 'ληξιπρ.' : event.date.slice(5)}</span>
                  <span className={`font-black tabular-nums ${event.kind === 'collection' ? 'text-cyan-700' : 'text-slate-900'}`}>{event.kind === 'collection' ? '+' : '−'}{formatEuro(event.amount, 0)}</span>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      {addingExpense && hub.workspace && <ExpenseEditor workspace={hub.workspace} parties={hub.parties} settings={settings} onClose={() => setAddingExpense(false)} />}
      {receiptFor && <ReceiptModal income={receiptFor} onClose={() => setReceiptFor(null)} />}
    </div>
  );
}
