import React, { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, FolderTree, Plus, Trash2 } from 'lucide-react';
import type { Supplier } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import {
  buildCategoryTree,
  categoryColor,
  categoryLevelLabel,
  descendantIds,
  flattenTree,
  reorderSiblings,
  wouldCreateCycle,
  type FinanceCategoryNode,
} from '../../features/finance/categoryTree';
import { formatEuro } from '../../features/finance/financeMath';
import type { FinanceCategory, FinanceCategoryLinkKind, FinanceWorkspace } from '../../features/finance/types';
import {
  amountToInput,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CategoryGlyph,
  Field,
  FinanceModal,
  ghostButton,
  inputClass,
  parseAmount,
  SaveButton,
  secondaryButton,
} from './financeUi';

const LINK_KIND_LABELS: Record<FinanceCategoryLinkKind, string> = {
  materials: 'Υλικά (Προμηθευτές)',
  stones: 'Πέτρες',
  metal: 'Μέταλλο',
  stx: 'Εξαρτήματα STX',
  worker: 'Εργασία συνεργάτη (Παραγωγή)',
  seller_commission: 'Προμήθειες πλασιέ',
  travel: 'Ταξίδια',
  utility: 'Λογαριασμοί / πάροχοι',
};

type Draft = Partial<FinanceCategory> & { budgetInput?: string };

export default function CategoryManager({ workspace, parties, onClose }: { workspace: FinanceWorkspace; parties: Supplier[]; onClose: () => void }) {
  const { showToast, confirm } = useUI();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const tree = useMemo(() => buildCategoryTree(workspace.categories, showArchived), [workspace.categories, showArchived]);
  const flat = useMemo(() => flattenTree(buildCategoryTree(workspace.categories)), [workspace.categories]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    workspace.expenses.forEach((expense) => counts.set(expense.category_id, (counts.get(expense.category_id) || 0) + 1));
    return counts;
  }, [workspace.expenses]);

  const save = useFinanceMutation((category: Partial<FinanceCategory> & { name: string }) => financeRepository.saveCategory(category));
  const reorder = useFinanceMutation((updates: Array<Pick<FinanceCategory, 'id' | 'parent_id' | 'position'>>) => financeRepository.saveCategoryOrder(updates));
  const remove = useFinanceMutation((id: string) => financeRepository.deleteCategory(id));

  const startNew = (parent: FinanceCategory | null) => {
    const siblings = workspace.categories.filter((category) => category.parent_id === (parent?.id ?? null));
    setDraft({
      parent_id: parent?.id ?? null,
      name: '',
      nature: parent?.nature || 'variable',
      position: siblings.length,
      icon: parent ? null : 'receipt',
      color: parent ? null : CATEGORY_COLORS[workspace.categories.filter((category) => !category.parent_id).length % CATEGORY_COLORS.length],
    });
  };

  const submit = async () => {
    if (!draft?.name?.trim()) { showToast('Δώστε όνομα.', 'error'); return; }
    if (draft.id && wouldCreateCycle(draft.id, draft.parent_id ?? null, workspace.categories)) {
      showToast('Δεν μπορεί να μπει μέσα σε δική της υποκατηγορία.', 'error');
      return;
    }
    const { budgetInput, ...category } = draft;
    try {
      await save.mutateAsync({
        ...category,
        name: draft.name.trim(),
        monthly_budget: budgetInput !== undefined ? (parseAmount(budgetInput) || null) : category.monthly_budget ?? null,
      } as FinanceCategory);
      showToast('Η κατηγορία αποθηκεύτηκε.', 'success');
      setDraft(null);
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const move = async (category: FinanceCategory, direction: -1 | 1) => {
    const updates = reorderSiblings(category.id, direction, workspace.categories);
    if (updates.length) await reorder.mutateAsync(updates).catch((error) => showToast(error.message, 'error'));
  };

  const toggleArchive = async (category: FinanceCategory) => {
    await save.mutateAsync({ ...category, is_archived: !category.is_archived }).catch((error) => showToast(error.message, 'error'));
  };

  const handleDelete = async (category: FinanceCategory) => {
    const ids = descendantIds(category.id, workspace.categories);
    const used = [...ids].reduce((sum, id) => sum + (usage.get(id) || 0), 0);
    if (used > 0) {
      showToast(`Υπάρχουν ${used} έξοδα σε αυτή την κατηγορία. Αρχειοθετήστε την αντί για διαγραφή.`, 'error');
      return;
    }
    const ok = await confirm({ title: 'Διαγραφή κατηγορίας', message: `Θα διαγραφεί η «${category.name}»${ids.size > 1 ? ` μαζί με ${ids.size - 1} υποκατηγορίες` : ''}.`, confirmText: 'Διαγραφή', isDestructive: true });
    if (!ok) return;
    await remove.mutateAsync(category.id).then(() => setDraft(null)).catch((error) => showToast(error.message, 'error'));
  };

  const renderNode = (node: FinanceCategoryNode): React.ReactNode => {
    const { category } = node;
    const color = categoryColor(category.id, workspace.categories);
    const active = draft?.id === category.id;
    return (
      <div key={category.id}>
        <div
          className={`group flex items-center gap-2 rounded-xl py-1.5 pr-1 transition ${active ? 'bg-amber-50 ring-1 ring-amber-200' : 'hover:bg-slate-50'} ${category.is_archived ? 'opacity-50' : ''}`}
          style={{ paddingLeft: 6 + node.depth * 22 }}
        >
          <button type="button" onClick={() => setDraft({ ...category, budgetInput: amountToInput(category.monthly_budget) })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <CategoryGlyph icon={category.icon} color={color} size="sm" />
            <span className={`truncate text-sm ${node.depth === 0 ? 'font-black text-slate-900' : 'font-semibold text-slate-700'}`}>{category.name}</span>
            <span className="hidden text-[10px] font-black uppercase tracking-wide text-slate-300 sm:inline">{categoryLevelLabel(node.depth)}</span>
            {category.monthly_budget ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{formatEuro(category.monthly_budget, 0)}/μήνα</span> : null}
          </button>
          <div className="flex items-center opacity-0 transition group-hover:opacity-100">
            <button type="button" title="Νέα υποκατηγορία" onClick={() => startNew(category)} className={ghostButton}><Plus size={13} /></button>
            <button type="button" title="Πάνω" onClick={() => move(category, -1)} className={ghostButton}><ArrowUp size={13} /></button>
            <button type="button" title="Κάτω" onClick={() => move(category, 1)} className={ghostButton}><ArrowDown size={13} /></button>
            <button type="button" title={category.is_archived ? 'Επαναφορά' : 'Αρχειοθέτηση'} onClick={() => toggleArchive(category)} className={ghostButton}>
              {category.is_archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            </button>
          </div>
        </div>
        {node.children.map(renderNode)}
      </div>
    );
  };

  const parentOptions = draft?.id
    ? flat.filter((node) => !descendantIds(draft.id!, workspace.categories).has(node.category.id))
    : flat;

  return (
    <FinanceModal icon={FolderTree} eyebrow="Οικονομικός Έλεγχος" title="Κατηγορίες εξόδων" onClose={onClose} size="xl">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => startNew(null)} className={secondaryButton}><Plus size={15} /> Νέο Είδος</button>
            <label className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-500">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-slate-700" />
              Αρχειοθετημένες
            </label>
          </div>
          <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
            Είδος › Ενότητα › Υποενότητα, σε όσο βάθος χρειάζεται. Πατήστε μια κατηγορία για επεξεργασία ή το + για υποκατηγορία.
          </p>
          <div className="space-y-0.5">{tree.map(renderNode)}</div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-4">
          {!draft ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center text-sm font-semibold text-slate-400">
              <FolderTree size={28} className="text-slate-300" />
              Επιλέξτε κατηγορία ή δημιουργήστε νέα.
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-900">{draft.id ? 'Επεξεργασία' : 'Νέα κατηγορία'}</h3>
              <Field label="Όνομα">
                <input autoFocus value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="π.χ. Κινητό Αλέκου" className={inputClass} />
              </Field>
              <Field label="Ανήκει σε">
                <select value={draft.parent_id || ''} onChange={(event) => setDraft({ ...draft, parent_id: event.target.value || null })} className={inputClass}>
                  <option value="">— Κορυφή (Είδος) —</option>
                  {parentOptions.map((node) => (
                    <option key={node.category.id} value={node.category.id}>{'  '.repeat(node.depth)}{node.category.name}</option>
                  ))}
                </select>
              </Field>
              <div>
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Εικονίδιο</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(CATEGORY_ICONS).map((key) => (
                    <button key={key} type="button" onClick={() => setDraft({ ...draft, icon: key })} className={`rounded-xl p-0.5 ring-2 ${draft.icon === key ? 'ring-slate-900' : 'ring-transparent'}`}>
                      <CategoryGlyph icon={key} color={draft.color || categoryColor(draft.parent_id, workspace.categories)} size="sm" />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Χρώμα {draft.parent_id ? '(κενό = από το Είδος)' : ''}</span>
                <div className="flex flex-wrap gap-1.5">
                  {draft.parent_id && (
                    <button type="button" onClick={() => setDraft({ ...draft, color: null })} className={`h-7 rounded-full border border-dashed border-slate-300 px-2 text-[10px] font-black text-slate-500 ${!draft.color ? 'ring-2 ring-slate-900' : ''}`}>Αυτόματο</button>
                  )}
                  {CATEGORY_COLORS.map((color) => (
                    <button key={color} type="button" onClick={() => setDraft({ ...draft, color })} className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ${draft.color === color ? 'ring-slate-900' : 'ring-transparent'}`} style={{ backgroundColor: color }} aria-label={color} />
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Φύση">
                  <select value={draft.nature || 'variable'} onChange={(event) => setDraft({ ...draft, nature: event.target.value as FinanceCategory['nature'] })} className={inputClass}>
                    <option value="fixed">Πάγιο</option>
                    <option value="variable">Μεταβλητό</option>
                  </select>
                </Field>
                <Field label="Προϋπολογισμός / μήνα">
                  <input inputMode="decimal" value={draft.budgetInput ?? ''} onChange={(event) => setDraft({ ...draft, budgetInput: event.target.value })} placeholder="Χωρίς" className={inputClass} />
                </Field>
                <Field label="Προεπιλεγμένος συνεργάτης">
                  <select value={draft.default_party_id || ''} onChange={(event) => setDraft({ ...draft, default_party_id: event.target.value || null })} className={inputClass}>
                    <option value="">— Κανένας —</option>
                    {parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                  </select>
                </Field>
                <Field label="Προεπιλογή Χ/Τ">
                  <select value={draft.default_billing || ''} onChange={(event) => setDraft({ ...draft, default_billing: (event.target.value || null) as FinanceCategory['default_billing'] })} className={inputClass}>
                    <option value="">Από το ανώτερο επίπεδο</option>
                    <option value="T">Τ · Με παραστατικό</option>
                    <option value="X">Χ · Χωρίς παραστατικό</option>
                  </select>
                </Field>
              </div>
              <Field label="Σύνδεση με εφαρμογή" hint="Βοηθά την αυτόματη καταχώριση από Προμηθευτές, Παραγωγή και Πλασιέ.">
                <select value={draft.link_kind || ''} onChange={(event) => setDraft({ ...draft, link_kind: (event.target.value || null) as FinanceCategoryLinkKind | null })} className={inputClass}>
                  <option value="">— Καμία —</option>
                  {(Object.keys(LINK_KIND_LABELS) as FinanceCategoryLinkKind[]).map((key) => <option key={key} value={key}>{LINK_KIND_LABELS[key]}</option>)}
                </select>
              </Field>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {draft.id && (
                  <button type="button" onClick={() => handleDelete(draft as FinanceCategory)} className={`${secondaryButton} text-rose-600`}><Trash2 size={15} /> Διαγραφή</button>
                )}
                <button type="button" onClick={() => setDraft(null)} className={`${secondaryButton} ml-auto`}>Άκυρο</button>
                <SaveButton busy={save.isPending} onClick={submit}><Check size={16} /> Αποθήκευση</SaveButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </FinanceModal>
  );
}
