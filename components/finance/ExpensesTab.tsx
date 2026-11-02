import React, { useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, FolderTree, Paperclip, Plus, Repeat, Search } from 'lucide-react';
import type { GlobalSettings, Supplier } from '../../types';
import {
  buildCategoryTree,
  categoryBreadcrumb,
  categoryColor,
  descendantIds,
  type FinanceCategoryNode,
} from '../../features/finance/categoryTree';
import type { ExpensePeriodSummary } from '../../features/finance/expenseLedger';
import { formatEuro, inPeriod } from '../../features/finance/financeMath';
import { FREQUENCY_LABELS } from '../../features/finance/recurring';
import type { FinanceBilling, FinanceExpense, FinancePeriod, FinanceRecurring, FinanceWorkspace } from '../../features/finance/types';
import CategoryManager from './CategoryManager';
import ExpenseEditor from './ExpenseEditor';
import RecurringEditor from './RecurringEditor';
import AttachmentViewer from './AttachmentViewer';
import { BillingBadge, CategoryGlyph, EmptyNote, ghostButton, inputClass, primaryButton, ProgressBar, SectionCard, secondaryButton } from './financeUi';

type StatusFilter = 'all' | 'open' | 'expected' | 'paid';

const STATUS_META: Record<FinanceExpense['status'], { label: string; tone: string }> = {
  unpaid: { label: 'Απλήρωτο', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
  partial: { label: 'Μερικώς', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  paid: { label: 'Εξοφλημένο', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  expected: { label: 'Αναμενόμενο', tone: 'bg-sky-50 text-sky-700 ring-sky-100' },
};

export default function ExpensesTab({ workspace, summary, parties, settings, period, billingFilter }: {
  workspace: FinanceWorkspace;
  summary: ExpensePeriodSummary;
  parties: Supplier[];
  settings?: GlobalSettings | null;
  period: FinancePeriod;
  billingFilter: FinanceBilling | 'all';
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<FinanceExpense> | null>(null);
  const [recurringEditing, setRecurringEditing] = useState<Partial<FinanceRecurring> | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildCategoryTree(workspace.categories), [workspace.categories]);
  const partyById = useMemo(() => new Map(parties.map((party) => [party.id, party])), [parties]);
  const scope = useMemo(() => (selectedCategory ? descendantIds(selectedCategory, workspace.categories) : null), [selectedCategory, workspace.categories]);
  const expected = workspace.expenses.filter((expense) => expense.status === 'expected').sort((a, b) => a.expense_date.localeCompare(b.expense_date));

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('el');
    return workspace.expenses
      .filter((expense) => {
        if (scope && !scope.has(expense.category_id)) return false;
        if (billingFilter !== 'all' && expense.billing !== billingFilter) return false;
        if (status === 'open') { if (!['unpaid', 'partial'].includes(expense.status)) return false; }
        else if (status === 'expected') { if (expense.status !== 'expected') return false; }
        else if (status === 'paid') { if (expense.status !== 'paid' || !inPeriod(expense.expense_date, period)) return false; }
        else if (!inPeriod(expense.expense_date, period) || expense.status === 'expected') return false;
        if (!term) return true;
        const haystack = [
          expense.description, expense.doc_ref, expense.notes,
          partyById.get(expense.party_id || '')?.name,
          categoryBreadcrumb(expense.category_id, workspace.categories),
        ].join(' ').toLocaleLowerCase('el');
        return haystack.includes(term);
      })
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date));
  }, [workspace.expenses, workspace.categories, scope, billingFilter, status, period, search, partyById]);

  const rowsTotal = rows.reduce((sum, expense) => sum + expense.amount_gross, 0);
  const rootTotal = Math.max(1, ...tree.map((node) => summary.byCategory.get(node.category.id) || 0));

  const renderNode = (node: FinanceCategoryNode): React.ReactNode => {
    const { category } = node;
    const total = summary.byCategory.get(category.id) || 0;
    const color = categoryColor(category.id, workspace.categories);
    const isSelected = selectedCategory === category.id;
    const isCollapsed = collapsed.has(category.id);
    const budget = (category.monthly_budget || 0) * Math.max(1, summary.byMonth.length);
    return (
      <div key={category.id}>
        <div className={`group flex items-center gap-1 rounded-xl pr-2 transition ${isSelected ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`} style={{ paddingLeft: 4 + node.depth * 16 }}>
          <button
            type="button"
            onClick={() => setCollapsed((previous) => { const next = new Set(previous); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}
            className={`rounded p-0.5 ${node.children.length ? '' : 'invisible'} ${isSelected ? 'text-white/70' : 'text-slate-400'}`}
            aria-label="Ανάπτυξη"
          >
            <ChevronRight size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
          </button>
          <button type="button" onClick={() => setSelectedCategory(isSelected ? null : category.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
            <CategoryGlyph icon={category.icon} color={isSelected ? '#fbbf24' : color} size="sm" />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${node.depth === 0 ? 'font-black' : 'font-semibold'} ${isSelected ? '' : 'text-slate-800'}`}>{category.name}</span>
              {node.depth === 0 && total > 0 && (
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full" style={{ width: `${(total / rootTotal) * 100}%`, backgroundColor: color }} />
                </span>
              )}
              {budget > 0 && <span className="mt-1 block"><ProgressBar ratio={total / budget} /></span>}
            </span>
            <span className={`text-xs font-black tabular-nums ${total > 0 ? '' : 'opacity-30'}`}>{formatEuro(total, 0)}</span>
          </button>
        </div>
        {!isCollapsed && node.children.map(renderNode)}
      </div>
    );
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
      <SectionCard
        title="Κατηγορίες"
        subtitle={`${formatEuro(summary.total)} στην περίοδο`}
        icon={FolderTree}
        actions={<button type="button" onClick={() => setManagingCategories(true)} className={ghostButton}>Διαχείριση</button>}
        bodyClassName="p-2"
        className="self-start xl:sticky xl:top-0"
      >
        <button type="button" onClick={() => setSelectedCategory(null)} className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-black ${!selectedCategory ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
          Όλα τα έξοδα <span className="tabular-nums">{formatEuro(summary.total, 0)}</span>
        </button>
        <div className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-1 custom-scrollbar">{tree.map(renderNode)}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 p-2 text-xs font-bold text-slate-500">
          <div>Πάγια <div className="text-sm font-black text-slate-800 tabular-nums">{formatEuro(summary.fixed, 0)}</div></div>
          <div>Μεταβλητά <div className="text-sm font-black text-slate-800 tabular-nums">{formatEuro(summary.variable, 0)}</div></div>
        </div>
      </SectionCard>

      <div className="min-w-0 space-y-5">
        {expected.length > 0 && (
          <section className="rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-sky-900"><CalendarClock size={16} /> Αναμενόμενοι λογαριασμοί</div>
            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {expected.map((expense) => (
                <button key={expense.id} type="button" onClick={() => setEditing(expense)} className="min-w-[12rem] rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-sky-100 transition hover:ring-sky-300">
                  <div className="truncate text-sm font-black text-slate-900">{expense.description}</div>
                  <div className="text-xs font-semibold text-slate-500">{expense.expense_date} · ~{formatEuro(expense.amount_gross)}</div>
                  <div className="mt-2 text-xs font-black text-sky-700">Επιβεβαίωση ποσού →</div>
                </button>
              ))}
            </div>
          </section>
        )}

        <SectionCard
          title={selectedCategory ? categoryBreadcrumb(selectedCategory, workspace.categories) : 'Καταχωρίσεις'}
          subtitle={`${rows.length} εγγραφές · ${formatEuro(rowsTotal)}`}
          actions={(
            <>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Αναζήτηση…" className={`${inputClass} w-44 py-1.5 pl-8 text-xs`} />
              </div>
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-black">
                {([['all', 'Περιόδου'], ['open', 'Ανοιχτά'], ['expected', 'Αναμενόμενα'], ['paid', 'Εξοφλημένα']] as Array<[StatusFilter, string]>).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setStatus(key)} className={`rounded-lg px-2.5 py-1.5 ${status === key ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
              <button type="button" onClick={() => setEditing(selectedCategory ? { category_id: selectedCategory } : {})} className={primaryButton}><Plus size={15} /> Νέο έξοδο</button>
            </>
          )}
          bodyClassName="p-0"
        >
          {rows.length === 0 ? (
            <div className="p-4"><EmptyNote title="Καμία καταχώριση" detail="Πατήστε «Νέο έξοδο» για γρήγορη καταχώριση." /></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((expense) => {
                const category = workspace.categories.find((row) => row.id === expense.category_id);
                const color = categoryColor(expense.category_id, workspace.categories);
                const party = partyById.get(expense.party_id || '');
                return (
                  <div key={expense.id} role="button" tabIndex={0} onClick={() => setEditing(expense)} onKeyDown={(event) => { if (event.key === 'Enter') setEditing(expense); }} className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                    <CategoryGlyph icon={category?.icon} color={color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-black text-slate-900">{expense.description || category?.name || 'Έξοδο'}</span>
                        {expense.attachment_key && (
                          <button type="button" onClick={(event) => { event.stopPropagation(); setViewingAttachment(expense.attachment_key!); }} className="text-slate-400 hover:text-slate-700" aria-label="Προβολή παραστατικού"><Paperclip size={13} /></button>
                        )}
                      </div>
                      <div className="truncate text-xs font-semibold text-slate-500">
                        {expense.expense_date} · {categoryBreadcrumb(expense.category_id, workspace.categories)}{party ? ` · ${party.name}` : ''}{expense.doc_ref ? ` · ${expense.doc_ref}` : ''}
                      </div>
                    </div>
                    <BillingBadge billing={expense.billing} compact />
                    <span className={`hidden rounded-lg px-2 py-0.5 text-[10px] font-black ring-1 sm:inline ${STATUS_META[expense.status].tone}`}>{STATUS_META[expense.status].label}</span>
                    <span className="w-24 text-right text-sm font-black tabular-nums text-slate-900">{formatEuro(expense.amount_gross)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Επαναλαμβανόμενα έξοδα"
          subtitle="Ρεύμα, τηλέφωνα, ενοίκια: εμφανίζονται αυτόματα πριν λήξουν"
          icon={Repeat}
          actions={<button type="button" onClick={() => setRecurringEditing({})} className={secondaryButton}><Plus size={15} /> Νέο</button>}
          bodyClassName="p-3"
        >
          {workspace.recurring.length === 0 ? (
            <EmptyNote icon={Repeat} title="Κανένα επαναλαμβανόμενο έξοδο" detail="Π.χ. ΔΕΗ κάθε 2 μήνες, κινητό κάθε μήνα." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {workspace.recurring.map((template) => {
                const category = workspace.categories.find((row) => row.id === template.category_id);
                return (
                  <button key={template.id} type="button" onClick={() => setRecurringEditing(template)} className={`flex items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left transition hover:border-slate-200 hover:bg-slate-50 ${template.is_active ? '' : 'opacity-50'}`}>
                    <CategoryGlyph icon={category?.icon} color={categoryColor(template.category_id, workspace.categories)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-900">{template.description || category?.name}</span>
                      <span className="block text-xs font-semibold text-slate-500">{FREQUENCY_LABELS[template.frequency]} · ~{formatEuro(template.estimated_amount)}</span>
                    </span>
                    <BillingBadge billing={template.billing} compact />
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {editing && <ExpenseEditor workspace={workspace} parties={parties} settings={settings} initial={editing} onClose={() => setEditing(null)} />}
      {recurringEditing && <RecurringEditor workspace={workspace} parties={parties} initial={recurringEditing} onClose={() => setRecurringEditing(null)} />}
      {managingCategories && <CategoryManager workspace={workspace} parties={parties} onClose={() => setManagingCategories(false)} />}
      {viewingAttachment && <AttachmentViewer attachmentKey={viewingAttachment} onClose={() => setViewingAttachment(null)} />}
    </div>
  );
}
