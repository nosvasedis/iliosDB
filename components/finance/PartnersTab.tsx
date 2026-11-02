import React, { useMemo, useState } from 'react';
import { Check, ClipboardList, Handshake, Plus, ReceiptText, Search, Tags, Wallet } from 'lucide-react';
import type { GlobalSettings, Material, Product, ProductionBatch, Supplier } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import { newCommissionSourceId, type SellerCommission } from '../../features/finance/commissions';
import { buildPartyStatement, type PartyBalance } from '../../features/finance/expenseLedger';
import { formatEuro, roundMoney, toIsoDate } from '../../features/finance/financeMath';
import type { FinanceBilling, FinanceExpense, FinancePartyKind, FinanceWorkspace } from '../../features/finance/types';
import ExpenseEditor from './ExpenseEditor';
import PaymentModal from './PaymentModal';
import RateCardEditor from './RateCardEditor';
import StatementBuilder from './StatementBuilder';
import BookedResourceQuantitiesPanel from './BookedResourceQuantitiesPanel';
import { SupplierAvatar } from '../suppliers/SupplierCard';
import {
  AmountInput,
  amountToInput,
  BillingBadge,
  BillingToggle,
  EmptyNote,
  Field,
  FinanceModal,
  inputClass,
  parseAmount,
  PARTY_KIND_META,
  primaryButton,
  SaveButton,
  SectionCard,
  secondaryButton,
} from './financeUi';

type DetailView = 'statement' | 'rates' | 'settlement';

export default function PartnersTab({ workspace, parties, partyBalances, commissions, products, materials, batches, settings }: {
  workspace: FinanceWorkspace;
  parties: Supplier[];
  partyBalances: PartyBalance[];
  commissions: SellerCommission[];
  products: Product[];
  materials: Material[];
  batches: ProductionBatch[];
  settings?: GlobalSettings | null;
}) {
  const [kind, setKind] = useState<FinancePartyKind | 'all' | 'owed'>('owed');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<DetailView>('statement');
  const [paying, setPaying] = useState<PartyBalance | null>(null);
  const [editing, setEditing] = useState<Partial<FinanceExpense> | null>(null);
  const [payingCommission, setPayingCommission] = useState<SellerCommission | null>(null);

  const balanceById = useMemo(() => new Map(partyBalances.map((balance) => [balance.partyId, balance])), [partyBalances]);
  const unbilledByParty = useMemo(() => {
    const counts = new Map<string, number>();
    workspace.assignments.filter((assignment) => !assignment.statement_id).forEach((assignment) => counts.set(assignment.party_id, (counts.get(assignment.party_id) || 0) + 1));
    return counts;
  }, [workspace.assignments]);

  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('el');
    return parties
      .filter((party) => {
        const balance = balanceById.get(party.id);
        if (kind === 'owed' && !((balance?.balance || 0) > 0.01 || unbilledByParty.has(party.id))) return false;
        if (kind !== 'all' && kind !== 'owed' && (party.kind || 'supplier') !== kind) return false;
        return !term || party.name.toLocaleLowerCase('el').includes(term);
      })
      .sort((a, b) => (balanceById.get(b.id)?.balance || 0) - (balanceById.get(a.id)?.balance || 0) || a.name.localeCompare(b.name, 'el'));
  }, [parties, balanceById, unbilledByParty, kind, search]);

  const selected = parties.find((party) => party.id === selectedId) || list[0];
  const selectedBalance: PartyBalance | undefined = selected ? (balanceById.get(selected.id) || { partyId: selected.id, party: selected, billed: 0, paid: 0, balance: 0, credit: 0, open: [], overdue: 0 }) : undefined;
  const statement = useMemo(() => (selected ? buildPartyStatement(selected.id, workspace.expenses, workspace.expensePayments, workspace.categories) : []), [selected, workspace]);
  const totalOwed = partyBalances.reduce((sum, balance) => sum + Math.max(0, balance.balance), 0);
  const isWorker = (selected?.kind || 'supplier') === 'worker';

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <SectionCard title="Συνεργάτες & Προμηθευτές" subtitle={`Υποχρεώσεις ${formatEuro(totalOwed)}`} icon={Handshake} bodyClassName="p-2" className="self-start">
          <div className="space-y-2 p-1">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Αναζήτηση…" className={`${inputClass} py-2 pl-8 text-xs`} />
            </div>
            <div className="flex flex-wrap gap-1">
              {([['owed', 'Με υπόλοιπο'], ['all', 'Όλοι'], ...Object.entries(PARTY_KIND_META).map(([key, meta]) => [key, meta.label])] as Array<[string, string]>).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setKind(key as typeof kind)} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${kind === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto p-1 custom-scrollbar">
            {list.length === 0 && <EmptyNote title="Κανείς σε αυτό το φίλτρο" detail="Νέους συνεργάτες (π.χ. καρφωτή, ΔΕΗ) προσθέτετε από τους Προμηθευτές." />}
            {list.map((party) => {
              const balance = balanceById.get(party.id);
              const meta = PARTY_KIND_META[party.kind || 'supplier'];
              const KindIcon = meta.icon;
              const unbilled = unbilledByParty.get(party.id) || 0;
              return (
                <button key={party.id} type="button" onClick={() => setSelectedId(party.id)} className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition ${selected?.id === party.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                  {party.logo_url
                    ? <SupplierAvatar name={party.name} logoUrl={party.logo_url} size="sm" />
                    : <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${selected?.id === party.id ? 'bg-white/10 text-amber-300 ring-white/10' : meta.tone}`}><KindIcon size={16} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{party.name}</span>
                    <span className={`block text-[11px] font-semibold ${selected?.id === party.id ? 'text-white/60' : 'text-slate-500'}`}>
                      {meta.label}{unbilled ? ` · ${unbilled} αχρέωτες` : ''}{balance?.overdue ? ` · ληξιπρόθ. ${formatEuro(balance.overdue, 0)}` : ''}
                    </span>
                  </span>
                  <span className="text-sm font-black tabular-nums">{formatEuro(balance?.balance || 0, 0)}</span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {selected && selectedBalance ? (
          <div className="min-w-0 space-y-4">
            <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <SupplierAvatar name={selected.name} logoUrl={selected.logo_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">{PARTY_KIND_META[selected.kind || 'supplier'].label}</p>
                  <h2 className="truncate text-2xl font-black text-slate-900">{selected.name}</h2>
                  <p className="text-xs font-semibold text-slate-500">
                    {[selected.vat_number && `ΑΦΜ ${selected.vat_number}`, selected.iban && `IBAN ${selected.iban}`, selected.payment_terms_days ? `Πίστωση ${selected.payment_terms_days} ημ.` : null].filter(Boolean).join(' · ') || 'Συμπληρώστε ΑΦΜ / IBAN / όρους από τους Προμηθευτές.'}
                  </p>
                </div>
                <button type="button" onClick={() => setEditing({ party_id: selected.id, category_id: selected.default_category_id || undefined, billing: selected.default_billing || undefined })} className={secondaryButton}><Plus size={15} /> Έξοδο</button>
                <button type="button" onClick={() => setPaying(selectedBalance)} className={primaryButton}><Wallet size={15} /> Πληρωμή</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Χρεώσεις', selectedBalance.billed, 'text-slate-900'],
                  ['Πληρωμές', selectedBalance.paid, 'text-emerald-700'],
                  ['Υπόλοιπο', selectedBalance.balance, selectedBalance.balance > 0.01 ? 'text-rose-700' : 'text-slate-900'],
                  ['Ληξιπρόθεσμα', selectedBalance.overdue, selectedBalance.overdue > 0.01 ? 'text-rose-700' : 'text-slate-400'],
                ].map(([label, value, tone]) => (
                  <div key={label as string} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                    <div className={`text-lg font-black tabular-nums ${tone}`}>{formatEuro(value as number)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="inline-flex rounded-2xl bg-slate-100 p-1">
              {([['statement', 'Καρτέλα', ReceiptText], ['rates', 'Τιμοκατάλογος', Tags], ['settlement', 'Εκκαθάριση εργασιών', ClipboardList]] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" onClick={() => setView(key)} className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-black ${view === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                  <Icon size={14} /> {label}
                  {key === 'settlement' && (unbilledByParty.get(selected.id) || 0) > 0 && <span className="rounded-md bg-amber-100 px-1.5 text-[10px] text-amber-800">{unbilledByParty.get(selected.id)}</span>}
                </button>
              ))}
            </div>

            {view === 'statement' && (
              <SectionCard title="Καρτέλα" subtitle="Χρεώσεις και πληρωμές με τρέχον υπόλοιπο" bodyClassName="p-0">
                {statement.length === 0 ? <div className="p-4"><EmptyNote title="Καμία κίνηση" /></div> : (
                  <div className="divide-y divide-slate-50">
                    {[...statement].reverse().map((row) => (
                      <div
                        key={`${row.kind}-${row.refId}`}
                        role={row.kind === 'expense' ? 'button' : undefined}
                        onClick={() => row.kind === 'expense' && setEditing(workspace.expenses.find((expense) => expense.id === row.refId) || null)}
                        className={`grid grid-cols-[5.5rem_minmax(0,1fr)_auto_6rem_6rem_6.5rem] items-center gap-2 px-4 py-2 text-sm ${row.kind === 'expense' ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                      >
                        <span className="text-xs font-semibold text-slate-500">{row.date}</span>
                        <span className="truncate font-semibold text-slate-800">{row.label}</span>
                        <BillingBadge billing={row.billing} compact />
                        <span className="text-right tabular-nums text-slate-800">{row.debit ? formatEuro(row.debit) : ''}</span>
                        <span className="text-right tabular-nums text-emerald-700">{row.credit ? formatEuro(row.credit) : ''}</span>
                        <span className="text-right font-black tabular-nums">{formatEuro(row.balance)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
            {view === 'rates' && (
              <SectionCard title="Τιμοκατάλογος συνεργάτη" icon={Tags}>
                {!isWorker && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Ο τιμοκατάλογος χρησιμοποιείται για εξωτερικούς συνεργάτες (καρφωτής, τεχνίτης, χρυσωτής). Ορίστε τον τύπο «Συνεργάτης» στους Προμηθευτές.</p>}
                <RateCardEditor partyId={selected.id} cards={workspace.rateCards.filter((card) => card.party_id === selected.id)} materials={materials} />
              </SectionCard>
            )}
            {view === 'statement' && <BookedResourceQuantitiesPanel expenses={workspace.expenses.filter((expense) => expense.party_id === selected.id)} categories={workspace.categories} materials={materials} products={products} periodLabel="Όλες οι καταγεγραμμένες αγορές αυτού του συνεργάτη / προμηθευτή" />}
            {view === 'settlement' && (
              <SectionCard title="Εκκαθάριση εργασιών" subtitle="Παρτίδες Παραγωγής × τιμοκατάλογος = έξοδο" icon={ClipboardList}>
                <StatementBuilder party={selected} workspace={workspace} products={products} materials={materials} batches={batches} />
              </SectionCard>
            )}
          </div>
        ) : (
          <EmptyNote icon={Handshake} title="Επιλέξτε συνεργάτη" />
        )}
      </div>

      <SectionCard title="Προμήθειες πλασιέ" subtitle="Κερδισμένες σε παραδόσεις (καθαρή αξία) μείον όσες έχουν πληρωθεί" icon={Handshake} bodyClassName="p-0">
        {commissions.length === 0 ? <div className="p-4"><EmptyNote title="Καμία προμήθεια" /></div> : (
          <div className="divide-y divide-slate-100">
            {commissions.map((commission) => (
              <div key={commission.sellerId} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(4,7rem)_auto]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-900">{commission.sellerName}</div>
                  <div className="text-xs font-semibold text-slate-500">{commission.lastPaidAt ? `Τελ. πληρωμή ${commission.lastPaidAt}` : 'Καμία πληρωμή'}</div>
                </div>
                {[['Κερδισμένη', commission.earned, 'text-slate-900'], ['Σε αναμονή', commission.pending, 'text-slate-400'], ['Πληρωμένη', commission.paid, 'text-emerald-700'], ['Οφείλεται', commission.owed, commission.owed > 0.01 ? 'text-rose-700' : 'text-slate-400']].map(([label, value, tone]) => (
                  <div key={label as string} className="text-right">
                    <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
                    <div className={`text-sm font-black tabular-nums ${tone}`}>{formatEuro(value as number)}</div>
                  </div>
                ))}
                <button type="button" disabled={commission.owed <= 0.01} onClick={() => setPayingCommission(commission)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-30">Πληρωμή</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {paying && <PaymentModal balance={paying} party={paying.party || parties.find((party) => party.id === paying.partyId)} onClose={() => setPaying(null)} />}
      {editing && <ExpenseEditor workspace={workspace} parties={parties} settings={settings} initial={editing} onClose={() => setEditing(null)} />}
      {payingCommission && <CommissionPayModal commission={payingCommission} workspace={workspace} onClose={() => setPayingCommission(null)} />}
    </div>
  );
}

function CommissionPayModal({ commission, workspace, onClose }: { commission: SellerCommission; workspace: FinanceWorkspace; onClose: () => void }) {
  const { showToast } = useUI();
  const category = workspace.categories.find((row) => row.link_kind === 'seller_commission' && !row.is_archived);
  const [amount, setAmount] = useState(amountToInput(commission.owed));
  const [billing, setBilling] = useState<FinanceBilling>('T');
  const [date, setDate] = useState(toIsoDate(new Date()));
  const pay = useFinanceMutation(async () => {
    const gross = roundMoney(parseAmount(amount));
    const expense = await financeRepository.saveExpense({
      category_id: category!.id,
      expense_date: date,
      description: `Προμήθεια ${commission.sellerName}`,
      amount_net: gross,
      vat_rate: 0,
      vat_amount: 0,
      amount_gross: gross,
      billing,
      source_kind: 'commission',
      source_id: newCommissionSourceId(commission.sellerId),
      lines: [],
    });
    await financeRepository.savePayment({ expense_id: expense.id, amount: gross, paid_at: date, method: 'bank', billing });
  });

  const submit = async () => {
    if (!category) { showToast('Δημιουργήστε κατηγορία με σύνδεση «Προμήθειες πλασιέ».', 'error'); return; }
    try {
      await pay.mutateAsync(undefined);
      showToast('Η προμήθεια πληρώθηκε.', 'success');
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  return (
    <FinanceModal icon={Handshake} eyebrow="Πληρωμή προμήθειας" title={commission.sellerName} onClose={onClose} busy={pay.isPending} size="sm"
      footer={<SaveButton busy={pay.isPending} onClick={submit}><Check size={16} /> Πληρωμή</SaveButton>}>
      <div className="space-y-4">
        <Field label="Ποσό" hint={`Οφειλόμενη: ${formatEuro(commission.owed)}`}><AmountInput value={amount} onChange={setAmount} className="text-lg" /></Field>
        <Field label="Ημερομηνία"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></Field>
        <BillingToggle value={billing} onChange={setBilling} />
        <p className="text-xs font-semibold text-slate-500">Καταχωρίζεται ως έξοδο στην «{category?.name || '—'}» και ως εξοφλημένο.</p>
      </div>
    </FinanceModal>
  );
}
