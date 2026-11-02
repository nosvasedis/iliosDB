import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, FolderPlus, FolderTree, Plus, Search } from 'lucide-react';
import type { Supplier } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import {
  buildCategoryTree,
  categoryBreadcrumb,
  categoryColor,
  categoryIconKey,
  categoryLevelLabel,
  reorderSiblings,
  type FinanceCategoryNode,
} from '../../features/finance/categoryTree';
import { formatEuro } from '../../features/finance/financeMath';
import type { FinanceCategory, FinanceWorkspace } from '../../features/finance/types';
import { CategoryForm } from './CategoryEditor';
import { CategoryGlyph, FinanceModal, inputClass, secondaryButton } from './financeUi';

/** Full tree editor: every Είδος, Ενότητα and Υποενότητα with add / edit / reorder at hand. */
export default function CategoryManager({ workspace, parties, onClose, initialSelection }: {
  workspace: FinanceWorkspace;
  parties: Supplier[];
  onClose: () => void;
  initialSelection?: Partial<FinanceCategory>;
}) {
  const { showToast } = useUI();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Partial<FinanceCategory> | null>(initialSelection || null);
  const tree = useMemo(() => buildCategoryTree(workspace.categories, showArchived), [workspace.categories, showArchived]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    workspace.expenses.forEach((expense) => counts.set(expense.category_id, (counts.get(expense.category_id) || 0) + 1));
    return counts;
  }, [workspace.expenses]);
  const reorder = useFinanceMutation((updates: Array<Pick<FinanceCategory, 'id' | 'parent_id' | 'position'>>) => financeRepository.saveCategoryOrder(updates));

  const live = editing?.id ? workspace.categories.find((row) => row.id === editing.id) || editing : editing;
  const term = search.trim().toLocaleLowerCase('el');
  const matches = (node: FinanceCategoryNode): boolean =>
    !term || categoryBreadcrumb(node.category.id, workspace.categories).toLocaleLowerCase('el').includes(term) || node.children.some(matches);

  const move = async (category: FinanceCategory, direction: -1 | 1) => {
    const updates = reorderSiblings(category.id, direction, workspace.categories);
    if (updates.length) await reorder.mutateAsync(updates).catch((error) => showToast(error.message, 'error'));
  };

  const renderNode = (node: FinanceCategoryNode): React.ReactNode => {
    if (!matches(node)) return null;
    const { category } = node;
    const active = live?.id === category.id;
    const isCollapsed = collapsed.has(category.id) && !term;
    const count = usage.get(category.id) || 0;
    return (
      <div key={category.id}>
        <div
          className={`group flex items-center gap-1 rounded-xl py-1 pr-1 transition ${active ? 'bg-amber-50 ring-1 ring-amber-200' : 'hover:bg-slate-50'} ${category.is_archived ? 'opacity-50' : ''}`}
          style={{ paddingLeft: 2 + node.depth * 20 }}
        >
          <button
            type="button"
            onClick={() => setCollapsed((previous) => { const next = new Set(previous); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}
            className={`rounded p-0.5 text-slate-400 ${node.children.length ? '' : 'invisible'}`}
            aria-label={isCollapsed ? 'Ανάπτυξη' : 'Σύμπτυξη'}
          >
            <ChevronRight size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
          </button>
          <button type="button" onClick={() => setEditing(category)} className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left">
            <CategoryGlyph icon={categoryIconKey(category.id, workspace.categories)} color={categoryColor(category.id, workspace.categories)} size="sm" />
            <span className={`truncate text-sm ${node.depth === 0 ? 'font-black text-slate-900' : 'font-semibold text-slate-700'}`}>{category.name}</span>
            {category.monthly_budget ? <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500 sm:inline">{formatEuro(category.monthly_budget, 0)}/μ</span> : null}
            {count > 0 && <span className="text-[10px] font-bold text-slate-400">{count}</span>}
          </button>
          <div className={`flex items-center transition ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>
            <button type="button" title={`Νέα ${categoryLevelLabel(node.depth + 1).toLocaleLowerCase('el')} μέσα στην «${category.name}»`} onClick={() => setEditing({ parent_id: category.id })} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900"><Plus size={14} /></button>
            <button type="button" title="Πάνω" onClick={() => move(category, -1)} className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-900 sm:block"><ArrowUp size={13} /></button>
            <button type="button" title="Κάτω" onClick={() => move(category, 1)} className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-900 sm:block"><ArrowDown size={13} /></button>
          </div>
        </div>
        {!isCollapsed && node.children.map(renderNode)}
      </div>
    );
  };

  return (
    <FinanceModal icon={FolderTree} eyebrow="Οικονομικός Έλεγχος" title="Κατηγορίες εξόδων" onClose={onClose} size="xl">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setEditing({ parent_id: null })} className={secondaryButton}><FolderPlus size={15} /> Νέο Είδος</button>
            <div className="relative min-w-[10rem] flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Αναζήτηση…" className={`${inputClass} py-2 pl-8 text-xs`} />
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-slate-700" />
              Αρχειοθετημένες
            </label>
          </div>
          <p className="mb-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
            Είδος › Ενότητα › Υποενότητα, σε όσο βάθος θέλετε. Πατήστε μια κατηγορία για όνομα, εικονίδιο, χρώμα και ρυθμίσεις· το <b>+</b> προσθέτει υποκατηγορία μέσα της.
          </p>
          <div className="max-h-[62vh] space-y-0.5 overflow-y-auto pr-1 custom-scrollbar">{tree.map(renderNode)}</div>
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm lg:max-h-[72vh] lg:overflow-y-auto custom-scrollbar">
          {live ? (
            <CategoryForm
              workspace={workspace}
              parties={parties}
              initial={live}
              onNavigate={setEditing}
              onDeleted={() => setEditing(null)}
              onCancel={() => setEditing(null)}
              onSaved={(saved) => setEditing(saved)}
            />
          ) : (
            <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-2 text-center text-sm font-semibold text-slate-400">
              <FolderTree size={30} className="text-slate-300" />
              Επιλέξτε κατηγορία για επεξεργασία ή πατήστε «Νέο Είδος».
            </div>
          )}
        </div>
      </div>
    </FinanceModal>
  );
}
