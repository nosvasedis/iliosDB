import React, { useMemo, useState } from 'react';
import { Plus, Tags, Wallet } from 'lucide-react';
import type { Product, Supplier } from '../../types';
import BookedResourceQuantitiesPanel from './BookedResourceQuantitiesPanel';
import { useAuth } from '../AuthContext';
import { useFinanceWorkspace } from '../../hooks/api/useFinance';
import { useMaterials } from '../../hooks/api/useMaterials';
import { useSettings } from '../../hooks/api/useSettings';
import { useSuppliers } from '../../hooks/api/useSuppliers';
import { buildPartyBalances, buildPartyStatement } from '../../features/finance/expenseLedger';
import { formatEuro, toIsoDate } from '../../features/finance/financeMath';
import type { FinanceExpense } from '../../features/finance/types';
import ExpenseEditor from './ExpenseEditor';
import PaymentModal from './PaymentModal';
import RateCardEditor from './RateCardEditor';
import { BillingBadge, EmptyNote, primaryButton, secondaryButton } from './financeUi';

/** «Οικονομικά» tab of a supplier: balance, καρτέλα, payment and (for partners) rate card. */
export default function SupplierFinancePanel({ supplier, products }: { supplier: Supplier; products: Product[] }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const workspaceQuery = useFinanceWorkspace(isAdmin);
  const suppliersQuery = useSuppliers();
  const materialsQuery = useMaterials();
  const settingsQuery = useSettings();
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState<Partial<FinanceExpense> | null>(null);
  const workspace = workspaceQuery.data;
  const parties = suppliersQuery.data || [];

  const balance = useMemo(() => {
    if (!workspace) return null;
    return buildPartyBalances(workspace.expenses, workspace.expensePayments, parties, toIsoDate(new Date()))
      .find((row) => row.partyId === supplier.id)
      || { partyId: supplier.id, party: supplier, billed: 0, paid: 0, balance: 0, credit: 0, open: [], overdue: 0 };
  }, [workspace, parties, supplier]);
  const statement = useMemo(() => (workspace ? buildPartyStatement(supplier.id, workspace.expenses, workspace.expensePayments, workspace.categories) : []), [workspace, supplier.id]);
  const purchaseExpenses = useMemo(() => workspace?.expenses.filter((expense) => expense.party_id === supplier.id) || [], [workspace, supplier.id]);

  if (!isAdmin) return <EmptyNote title="Μόνο για διαχειριστές" />;
  if (!workspace || !balance) return <div className="py-10 text-center text-sm font-semibold text-slate-400">Φόρτωση…</div>;

  return (
    <div className="space-y-5 animate-in fade-in">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[['Χρεώσεις', balance.billed, 'text-slate-900'], ['Πληρωμές', balance.paid, 'text-emerald-700'], ['Υπόλοιπο', balance.balance, balance.balance > 0.01 ? 'text-rose-700' : 'text-slate-900'], ['Ληξιπρόθεσμα', balance.overdue, balance.overdue > 0.01 ? 'text-rose-700' : 'text-slate-400']].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
            <div className={`text-lg font-black tabular-nums ${tone}`}>{formatEuro(value as number)}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing({ party_id: supplier.id, category_id: supplier.default_category_id || undefined, billing: supplier.default_billing || undefined })} className={secondaryButton}><Plus size={15} /> Νέο έξοδο</button>
        <button type="button" onClick={() => setPaying(true)} className={primaryButton}><Wallet size={15} /> Πληρωμή</button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <h4 className="border-b border-slate-100 px-4 py-2.5 text-sm font-black text-slate-900">Καρτέλα</h4>
        {statement.length === 0 ? <div className="p-4"><EmptyNote title="Καμία κίνηση ακόμη" /></div> : (
          <div className="divide-y divide-slate-50">
            {[...statement].reverse().slice(0, 50).map((row) => (
              <div key={`${row.kind}-${row.refId}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto_6rem] items-center gap-2 px-4 py-2 text-sm">
                <span className="text-xs font-semibold text-slate-500">{row.date}</span>
                <span className="truncate font-semibold text-slate-800">{row.label}</span>
                <BillingBadge billing={row.billing} compact />
                <span className={`text-right font-black tabular-nums ${row.kind === 'payment' ? 'text-emerald-700' : 'text-slate-900'}`}>{row.kind === 'payment' ? '−' : ''}{formatEuro(row.debit || row.credit)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {materialsQuery.isSuccess && <BookedResourceQuantitiesPanel expenses={purchaseExpenses} categories={workspace.categories} materials={materialsQuery.data} products={products} periodLabel="Όλες οι καταγεγραμμένες αγορές αυτού του προμηθευτή" />}

      {supplier.kind === 'worker' && (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Tags size={15} /> Τιμοκατάλογος συνεργάτη</h4>
          <RateCardEditor partyId={supplier.id} cards={workspace.rateCards.filter((card) => card.party_id === supplier.id)} materials={materialsQuery.data || []} />
        </section>
      )}

      {paying && <PaymentModal balance={balance} party={supplier} onClose={() => setPaying(false)} />}
      {editing && <ExpenseEditor workspace={workspace} parties={parties} settings={settingsQuery.data} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
