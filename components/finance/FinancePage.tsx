import React, { useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Handshake, HandCoins, LayoutDashboard, Plus, Receipt, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { GlobalSettings, Product } from '../../types';
import type { AdminPage } from '../../surfaces/pageIds';
import DesktopPageHeader from '../DesktopPageHeader';
import AnalyticsView from '../AnalyticsView';
import IliosLoader from '../ui/IliosLoader';
import PageErrorState from '../ui/PageErrorState';
import { useFinanceHub } from '../../hooks/api/useFinanceHub';
import { legalKeys } from '../../features/legal/keys';
import { legalRepository } from '../../features/legal/repository';
import { addMonths, resolvePeriod, toIsoDate, type FinancePeriodPreset } from '../../features/finance/financeMath';
import type { FinanceBilling, FinanceExpense } from '../../features/finance/types';
import type { InsightTarget } from '../../features/finance/insights';
import ExpenseEditor from './ExpenseEditor';
import ExpensesTab from './ExpensesTab';
import IncomeTab from './IncomeTab';
import OverviewTab from './OverviewTab';
import PartnersTab from './PartnersTab';
import { BillingToggle, primaryButton } from './financeUi';

export type FinanceTab = 'overview' | 'income' | 'expenses' | 'partners' | 'analytics';

const TABS: Array<[FinanceTab, string, typeof Wallet]> = [
  ['overview', 'Επισκόπηση', LayoutDashboard],
  ['income', 'Έσοδα', HandCoins],
  ['expenses', 'Έξοδα', Receipt],
  ['partners', 'Συνεργάτες & Πληρωμές', Handshake],
  ['analytics', 'Αναλύσεις Πωλήσεων', BarChart3],
];

const PRESETS: Array<[FinancePeriodPreset, string, number]> = [
  ['month', 'Μήνας', 1],
  ['quarter', 'Τρίμηνο', 3],
  ['year', 'Έτος', 12],
  ['last12', '12 μήνες', 1],
];

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];

function periodLabel(preset: FinancePeriodPreset, anchor: string): string {
  const year = anchor.slice(0, 4);
  const month = Number(anchor.slice(5, 7)) - 1;
  if (preset === 'month') return `${MONTHS[month]} ${year}`;
  if (preset === 'quarter') return `${Math.floor(month / 3) + 1}ο τρίμηνο ${year}`;
  if (preset === 'year') return year;
  return `Έως ${MONTHS[month]} ${year}`;
}

interface Props {
  products: Product[];
  settings?: GlobalSettings | null;
  initialTab?: FinanceTab;
  onNavigate: (page: AdminPage) => void;
  onPrintAnalytics: (data: any) => void;
}

/** Οικονομικός Έλεγχος: Έσοδα Χ/Τ, Έξοδα, Συνεργάτες, Αναλύσεις — one admin hub. */
export default function FinancePage({ products, settings, initialTab = 'overview', onNavigate, onPrintAnalytics }: Props) {
  const [tab, setTab] = useState<FinanceTab>(initialTab);
  const [preset, setPreset] = useState<FinancePeriodPreset>('month');
  const [anchor, setAnchor] = useState(toIsoDate(new Date()));
  const [billingFilter, setBillingFilter] = useState<FinanceBilling | 'all'>('all');
  const [quickExpense, setQuickExpense] = useState<Partial<FinanceExpense> | null>(null);
  const period = resolvePeriod(preset, anchor);
  const hub = useFinanceHub({ products, settings, period, billingFilter });
  const legalQuery = useQuery({ queryKey: legalKeys.documents(), queryFn: legalRepository.getDocuments });

  const isAnalytics = tab === 'analytics';
  const step = PRESETS.find(([key]) => key === preset)![2];
  const shift = (direction: -1 | 1) => setAnchor(addMonths(anchor, direction * step, 1));

  return (
    <div className="flex flex-col gap-5 pb-20">
      <DesktopPageHeader
        icon={Wallet}
        title="Οικονομικός Έλεγχος"
        subtitle="Έσοδα Χ/Τ, έξοδα, συνεργάτες και ταμειακή ροή σε ένα σημείο."
        tail={(
          <>
            <span className={isAnalytics ? 'invisible' : ''} aria-hidden={isAnalytics || undefined}><BillingToggle value={billingFilter} onChange={setBillingFilter} allowAll /></span>
            <button type="button" onClick={() => setQuickExpense({})} className={primaryButton} disabled={!hub.workspace}>
              <Plus size={16} /> Νέο έξοδο
            </button>
          </>
        )}
        below={(
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0"><FinanceTabs tab={tab} onChange={setTab} /></div>
            {/* Presets and the ‹ period › navigator stay on one line; tabs scroll instead of squeezing them. */}
            <div className={`flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap ${isAnalytics ? 'invisible' : ''}`} aria-hidden={isAnalytics || undefined}>
              <div className="inline-flex shrink-0 rounded-xl bg-slate-100 p-0.5 text-xs font-black">
                {PRESETS.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setPreset(key)} className={`rounded-lg px-2.5 py-1.5 ${preset === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-1 py-0.5 shadow-sm">
                <button type="button" onClick={() => shift(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Προηγούμενη περίοδος"><ChevronLeft size={16} /></button>
                <span className="min-w-[8.5rem] whitespace-nowrap text-center text-sm font-black text-slate-800">{periodLabel(preset, anchor)}</span>
                <button type="button" onClick={() => shift(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Επόμενη περίοδος"><ChevronRight size={16} /></button>
              </div>
              {anchor.slice(0, 7) !== hub.today.slice(0, 7) && (
                <button type="button" onClick={() => setAnchor(hub.today)} className="shrink-0 whitespace-nowrap text-xs font-black text-slate-500 hover:text-slate-900">Σήμερα</button>
              )}
            </div>
          </div>
        )}
      />

      {isAnalytics ? (
        // Same page header as every other tab; analytics brings only its own toolbar.
        <AnalyticsView products={products} onNavigate={onNavigate} onPrint={onPrintAnalytics} embedded />
      ) : hub.error ? (
        <PageErrorState title="Ο Οικονομικός Έλεγχος δεν φορτώθηκε" message={(hub.error as Error).message} onRetry={hub.refetch} />
      ) : hub.isLoading || !hub.workspace || !hub.derived ? (
        <div className="flex justify-center py-24"><IliosLoader /></div>
      ) : (
        <>
          {tab === 'overview' && (
            <OverviewTab
              workspace={hub.workspace}
              receiptSummary={hub.derived.receiptSummary}
              previousReceiptSummary={hub.derived.previousReceiptSummary}
              expenseSummary={hub.derived.expenseSummary}
              previousExpenseSummary={hub.derived.previousExpenseSummary}
              delivered={hub.derived.delivered}
              pipeline={hub.derived.pipeline}
              customerBalances={hub.derived.customerBalances}
              partyBalances={hub.derived.partyBalances}
              paidOut={hub.derived.paidOut}
              forecast={hub.derived.forecast}
              insights={hub.derived.insights}
              billingFilter={billingFilter}
              today={hub.today}
              onNavigate={(target: InsightTarget) => setTab(target === 'overview' ? 'overview' : target)}
            />
          )}
          {tab === 'income' && (
            <IncomeTab
              workspace={hub.workspace}
              orderIncome={hub.derived.orderIncome}
              customerBalances={hub.derived.customerBalances}
              invoiceGaps={hub.derived.invoiceGaps}
              legalDocuments={legalQuery.data || []}
              period={period}
              billingFilter={billingFilter}
            />
          )}
          {tab === 'expenses' && (
            <ExpensesTab
              workspace={hub.workspace}
              summary={hub.derived.expenseSummary}
              parties={hub.parties}
              settings={settings}
              period={period}
              billingFilter={billingFilter}
            />
          )}
          {tab === 'partners' && (
            <PartnersTab
              workspace={hub.workspace}
              parties={hub.parties}
              partyBalances={hub.derived.partyBalances}
              commissions={hub.derived.commissions}
              products={products}
              materials={hub.materials}
              batches={hub.batches}
              settings={settings}
            />
          )}
        </>
      )}

      {quickExpense && hub.workspace && (
        <ExpenseEditor workspace={hub.workspace} parties={hub.parties} settings={settings} initial={quickExpense} onClose={() => setQuickExpense(null)} />
      )}
    </div>
  );
}

function FinanceTabs({ tab, onChange }: { tab: FinanceTab; onChange: (tab: FinanceTab) => void }) {
  return (
    <div className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50 p-1.5`}>
      {TABS.map(([key, label, Icon]) => (
        <button key={key} type="button" onClick={() => onChange(key)} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-all ${tab === key ? 'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}>
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}
