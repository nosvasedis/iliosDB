import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Check, ChevronDown, CornerDownRight, FolderTree, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
  categoryPath,
  descendantIds,
  flattenTree,
  wouldCreateCycle,
} from '../../features/finance/categoryTree';
import type { FinanceCategory, FinanceCategoryLinkKind, FinanceWorkspace } from '../../features/finance/types';
import { searchCategoryIcons } from './categoryIcons';
import {
  amountToInput,
  CATEGORY_COLORS,
  CategoryGlyph,
  Field,
  FinanceModal,
  ghostButton,
  inputClass,
  parseAmount,
  SaveButton,
  secondaryButton,
} from './financeUi';

export const LINK_KIND_LABELS: Record<FinanceCategoryLinkKind, string> = {
  materials: 'Υλικά (Προμηθευτές)',
  stones: 'Πέτρες',
  metal: 'Μέταλλο',
  stx: 'Εξαρτήματα STX',
  worker: 'Εργασία συνεργάτη (Παραγωγή)',
  seller_commission: 'Προμήθειες πλασιέ',
  travel: 'Ταξίδια',
  utility: 'Λογαριασμοί / πάροχοι',
};

type Draft = Partial<FinanceCategory> & { budgetInput: string };

const toDraft = (category: Partial<FinanceCategory>): Draft => ({ ...category, budgetInput: amountToInput(category.monthly_budget) });

export interface CategoryFormProps {
  workspace: FinanceWorkspace;
  parties: Supplier[];
  /** An existing category, or `{ parent_id }` (and optionally `name`) for a new one. */
  initial: Partial<FinanceCategory>;
  onSaved?: (category: FinanceCategory) => void;
  onCancel?: () => void;
  /** Opens another category (child or parent) in the same editor. */
  onNavigate?: (category: Partial<FinanceCategory>) => void;
  onDeleted?: () => void;
}

/**
 * Everything about one Είδος / Ενότητα / Υποενότητα: name, place in the tree, icon,
 * colour, budget and defaults, plus its own subsections with one-line quick add.
 */
export function CategoryForm({ workspace, parties, initial, onSaved, onCancel, onNavigate, onDeleted }: CategoryFormProps) {
  const { showToast, confirm } = useUI();
  const categories = workspace.categories;
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [iconSearch, setIconSearch] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newChild, setNewChild] = useState('');
  // Reset only when another category opens or its saved version changes, never mid-edit.
  const resetKey = `${initial.id || 'new'}:${initial.updated_at || ''}:${initial.parent_id || ''}:${initial.id ? '' : initial.name || ''}`;
  useEffect(() => { setDraft(toDraft(initial)); setIconSearch(''); setNewChild(''); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isNew = !draft.id;
  const parentPath = categoryPath(draft.parent_id, categories);
  const depth = parentPath.length;
  const inheritedColor = categoryColor(draft.parent_id, categories, CATEGORY_COLORS[categories.filter((row) => !row.parent_id).length % CATEGORY_COLORS.length]);
  const color = draft.color || inheritedColor;
  const inheritedIcon = categoryIconKey(draft.parent_id, categories);
  const icon = draft.icon || inheritedIcon;
  const iconGroups = useMemo(() => searchCategoryIcons(iconSearch), [iconSearch]);
  const children = useMemo(
    () => (draft.id ? categories.filter((row) => row.parent_id === draft.id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'el')) : []),
    [categories, draft.id],
  );
  const parentOptions = useMemo(() => {
    const flat = flattenTree(buildCategoryTree(categories));
    return draft.id ? flat.filter((node) => !descendantIds(draft.id!, categories).has(node.category.id)) : flat;
  }, [categories, draft.id]);
  const usage = useMemo(() => {
    if (!draft.id) return 0;
    const ids = descendantIds(draft.id, categories);
    return workspace.expenses.filter((expense) => ids.has(expense.category_id)).length
      + workspace.recurring.filter((template) => ids.has(template.category_id)).length;
  }, [draft.id, categories, workspace.expenses, workspace.recurring]);

  const save = useFinanceMutation((category: Partial<FinanceCategory> & { name: string }) => financeRepository.saveCategory(category));
  const remove = useFinanceMutation((id: string) => financeRepository.deleteCategory(id));

  const set = (patch: Partial<Draft>) => setDraft((previous) => ({ ...previous, ...patch }));

  const submit = async () => {
    const name = (draft.name || '').trim();
    if (!name) { showToast('Δώστε όνομα.', 'error'); return; }
    if (draft.id && wouldCreateCycle(draft.id, draft.parent_id ?? null, categories)) {
      showToast('Δεν μπορεί να μπει μέσα σε δική της υποκατηγορία.', 'error');
      return;
    }
    const { budgetInput, ...category } = draft;
    const siblings = categories.filter((row) => row.parent_id === (draft.parent_id ?? null) && row.id !== draft.id);
    try {
      const saved = await save.mutateAsync({
        ...category,
        name,
        parent_id: draft.parent_id ?? null,
        // Moving under a new parent puts it last among its new siblings.
        position: isNew || initial.parent_id !== draft.parent_id ? siblings.length : (draft.position ?? 0),
        nature: draft.nature || (inheritedNature(draft.parent_id) ?? 'variable'),
        monthly_budget: parseAmount(budgetInput) || null,
      } as FinanceCategory);
      showToast(isNew ? `Η «${name}» δημιουργήθηκε.` : 'Οι αλλαγές αποθηκεύτηκαν.', 'success');
      onSaved?.(saved as FinanceCategory);
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const inheritedNature = (parentId: string | null | undefined) => categoryPath(parentId, categories).reverse().find((row) => row.nature)?.nature;

  const addChild = async () => {
    const name = newChild.trim();
    if (!name || !draft.id) return;
    if (children.some((child) => child.name.localeCompare(name, 'el', { sensitivity: 'base' }) === 0)) {
      showToast(`Υπάρχει ήδη «${name}».`, 'error');
      return;
    }
    try {
      await save.mutateAsync({ parent_id: draft.id, name, nature: draft.nature || 'variable', position: children.length, link_kind: draft.link_kind ?? null });
      setNewChild('');
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const toggleArchive = async () => {
    if (!draft.id) return;
    try {
      const saved = await save.mutateAsync({ ...(initial as FinanceCategory), is_archived: !draft.is_archived });
      set({ is_archived: (saved as FinanceCategory).is_archived });
      showToast(draft.is_archived ? 'Επανήλθε.' : 'Αρχειοθετήθηκε· δεν εμφανίζεται σε νέες καταχωρίσεις.', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!draft.id) return;
    if (usage > 0) {
      showToast(`Χρησιμοποιείται σε ${usage} καταχωρίσεις. Αρχειοθετήστε την αντί για διαγραφή.`, 'error');
      return;
    }
    const nested = descendantIds(draft.id, categories).size - 1;
    const ok = await confirm({
      title: 'Διαγραφή κατηγορίας',
      message: `Θα διαγραφεί η «${draft.name}»${nested ? ` μαζί με ${nested} υποκατηγορίες` : ''}.`,
      confirmText: 'Διαγραφή',
      isDestructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(draft.id);
      showToast('Η κατηγορία διαγράφηκε.', 'success');
      onDeleted?.();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Live preview */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-3">
        <CategoryGlyph icon={icon} color={color} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            {isNew ? `Νέα ${categoryLevelLabel(depth).toLocaleLowerCase('el')}` : categoryLevelLabel(depth)}
            {draft.is_archived ? ' · αρχειοθετημένη' : ''}
          </div>
          <div className="truncate text-lg font-black text-slate-900">{draft.name?.trim() || 'Χωρίς όνομα'}</div>
          <div className="truncate text-xs font-semibold text-slate-500">
            {parentPath.length ? `${parentPath.map((row) => row.name).join(' › ')} › ` : ''}{draft.name?.trim() || '…'}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Όνομα">
          <input
            autoFocus
            value={draft.name || ''}
            onChange={(event) => set({ name: event.target.value })}
            onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
            placeholder={depth === 0 ? 'π.χ. Πρώτες Ύλες' : depth === 1 ? 'π.χ. Δέρματα' : 'π.χ. Θεσσαλονίκη'}
            className={`${inputClass} font-bold`}
          />
        </Field>
        <Field label="Ανήκει σε">
          <select value={draft.parent_id || ''} onChange={(event) => set({ parent_id: event.target.value || null })} className={inputClass}>
            <option value="">— Κορυφή (Είδος) —</option>
            {parentOptions.map((node) => (
              <option key={node.category.id} value={node.category.id}>{'   '.repeat(node.depth)}{node.category.name}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Icon */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Εικονίδιο</span>
          <div className="relative w-48">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={iconSearch} onChange={(event) => setIconSearch(event.target.value)} placeholder="π.χ. ταξίδι, ρεύμα, δέρμα" className={`${inputClass} py-1.5 pl-8 text-xs`} />
          </div>
        </div>
        <div className="max-h-56 space-y-3 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-3 custom-scrollbar">
          {depth > 0 && !iconSearch && (
            <button type="button" onClick={() => set({ icon: null })} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-black ${!draft.icon ? 'bg-white text-slate-900 ring-2 ring-slate-900' : 'text-slate-500 hover:bg-white'}`}>
              <CategoryGlyph icon={inheritedIcon} color={color} size="sm" /> Όπως το ανώτερο επίπεδο
            </button>
          )}
          {iconGroups.length === 0 && <p className="text-xs font-semibold text-slate-400">Δεν βρέθηκε εικονίδιο.</p>}
          {iconGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{group.label}</div>
              <div className="flex flex-wrap gap-1">
                {group.icons.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    title={entry.words}
                    onClick={() => set({ icon: entry.key })}
                    className={`rounded-xl p-0.5 transition ${draft.icon === entry.key ? 'ring-2 ring-slate-900 ring-offset-1' : 'hover:ring-1 hover:ring-slate-300'}`}
                  >
                    <CategoryGlyph icon={entry.key} color={color} size="sm" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Colour */}
      <div>
        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Χρώμα</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {depth > 0 && (
            <button
              type="button"
              onClick={() => set({ color: null })}
              title="Όπως το ανώτερο επίπεδο"
              className={`flex h-7 items-center gap-1 rounded-full border border-dashed border-slate-300 pl-1 pr-2 text-[10px] font-black text-slate-500 ${!draft.color ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
            >
              <span className="h-5 w-5 rounded-full" style={{ backgroundColor: inheritedColor }} /> Αυτόματο
            </button>
          )}
          {CATEGORY_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => set({ color: swatch })}
              className={`h-7 w-7 rounded-full ring-2 ring-offset-2 transition ${draft.color === swatch ? 'ring-slate-900' : 'ring-transparent hover:ring-slate-200'}`}
              style={{ backgroundColor: swatch }}
              aria-label={swatch}
            />
          ))}
          <label className={`relative flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-1 pr-2.5 text-[10px] font-black text-slate-600 ${draft.color && !CATEGORY_COLORS.includes(draft.color) ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}>
            <span className="h-5 w-5 rounded-full bg-[conic-gradient(#ef4444,#eab308,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)]" />
            Δικό σας
            <input type="color" value={color} onChange={(event) => set({ color: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Φύση">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-0.5 text-xs font-black">
            {([['fixed', 'Πάγιο'], ['variable', 'Μεταβλητό']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => set({ nature: value })} className={`rounded-lg py-2 ${(draft.nature || inheritedNature(draft.parent_id) || 'variable') === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
        </Field>
        <Field label="Προϋπολογισμός / μήνα">
          <input inputMode="decimal" value={draft.budgetInput} onChange={(event) => set({ budgetInput: event.target.value })} placeholder="Χωρίς όριο" className={inputClass} />
        </Field>
      </div>

      <div>
        <button type="button" onClick={() => setShowAdvanced((value) => !value)} className={ghostButton}>
          <ChevronDown size={13} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} /> Προεπιλογές καταχώρισης
        </button>
        {showAdvanced && (
          <div className="mt-2 grid gap-3 rounded-2xl border border-slate-100 p-3 sm:grid-cols-2">
            <Field label="Προεπιλεγμένος συνεργάτης">
              <select value={draft.default_party_id || ''} onChange={(event) => set({ default_party_id: event.target.value || null })} className={inputClass}>
                <option value="">— Από το ανώτερο / κανένας —</option>
                {parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
              </select>
            </Field>
            <Field label="Προεπιλογή Χ/Τ">
              <select value={draft.default_billing || ''} onChange={(event) => set({ default_billing: (event.target.value || null) as FinanceCategory['default_billing'] })} className={inputClass}>
                <option value="">Από το ανώτερο επίπεδο</option>
                <option value="T">Τ · Με παραστατικό</option>
                <option value="X">Χ · Χωρίς παραστατικό</option>
              </select>
            </Field>
            <Field label="Σύνδεση με εφαρμογή" hint="Για αυτόματη καταχώριση από Προμηθευτές, Παραγωγή, Πλασιέ." className="sm:col-span-2">
              <select value={draft.link_kind || ''} onChange={(event) => set({ link_kind: (event.target.value || null) as FinanceCategoryLinkKind | null })} className={inputClass}>
                <option value="">— Καμία —</option>
                {(Object.keys(LINK_KIND_LABELS) as FinanceCategoryLinkKind[]).map((key) => <option key={key} value={key}>{LINK_KIND_LABELS[key]}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>

      {/* Subsections */}
      {!isNew && (
        <div className="rounded-2xl border border-slate-100 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
            <FolderTree size={15} className="text-slate-400" /> {categoryLevelLabel(depth + 1) === 'Υποενότητα' ? 'Υποενότητες' : 'Ενότητες'}
            <span className="text-xs font-bold text-slate-400">{children.length || ''}</span>
          </div>
          <div className="space-y-1">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onNavigate?.(child)}
                className={`group flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50 ${child.is_archived ? 'opacity-50' : ''}`}
              >
                <CornerDownRight size={13} className="text-slate-300" />
                <CategoryGlyph icon={categoryIconKey(child.id, categories)} color={categoryColor(child.id, categories)} size="sm" />
                <span className="flex-1 truncate text-sm font-semibold text-slate-800">{child.name}</span>
                <span className="text-[11px] font-bold text-slate-400">{categories.filter((row) => row.parent_id === child.id).length || ''}</span>
                <Pencil size={13} className="text-slate-300 opacity-0 transition group-hover:opacity-100" />
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newChild}
              onChange={(event) => setNewChild(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChild(); } }}
              placeholder={`Νέα ${categoryLevelLabel(depth + 1).toLocaleLowerCase('el')} στην «${draft.name || '…'}» — Enter για προσθήκη`}
              className={`${inputClass} py-2 text-xs`}
            />
            <button type="button" onClick={addChild} disabled={!newChild.trim() || save.isPending} className={secondaryButton}><Plus size={14} /></button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {!isNew && (
          <>
            <button type="button" onClick={toggleArchive} className={secondaryButton}>
              {draft.is_archived ? <><ArchiveRestore size={15} /> Επαναφορά</> : <><Archive size={15} /> Αρχειοθέτηση</>}
            </button>
            <button type="button" onClick={handleDelete} className={`${secondaryButton} text-rose-600`} title={usage ? `Χρησιμοποιείται σε ${usage} καταχωρίσεις` : undefined}>
              <Trash2 size={15} /> Διαγραφή
            </button>
            {draft.parent_id && onNavigate && (
              <button type="button" onClick={() => onNavigate(categories.find((row) => row.id === draft.parent_id)!)} className={ghostButton}>↑ {parentPath[parentPath.length - 1]?.name}</button>
            )}
          </>
        )}
        <div className="ml-auto flex gap-2">
          {onCancel && <button type="button" onClick={onCancel} className={secondaryButton}>Άκυρο</button>}
          <SaveButton busy={save.isPending} onClick={submit}><Check size={16} /> {isNew ? 'Δημιουργία' : 'Αποθήκευση'}</SaveButton>
        </div>
      </div>
    </div>
  );
}

/** Modal wrapper: create or edit a category from anywhere (tree, quick entry). */
export default function CategoryEditorModal({ workspace, parties, initial, onClose, onSaved }: {
  workspace: FinanceWorkspace;
  parties: Supplier[];
  initial: Partial<FinanceCategory>;
  onClose: () => void;
  onSaved?: (category: FinanceCategory) => void;
}) {
  const [current, setCurrent] = useState<Partial<FinanceCategory>>(initial);
  // Keep the open category in sync with saves and realtime updates.
  const live = current.id ? workspace.categories.find((row) => row.id === current.id) || current : current;
  return (
    <FinanceModal
      icon={FolderTree}
      eyebrow="Κατηγορίες εξόδων"
      title={live.id ? categoryBreadcrumb(live.id, workspace.categories) : 'Νέα κατηγορία'}
      onClose={onClose}
      size="lg"
    >
      <CategoryForm
        workspace={workspace}
        parties={parties}
        initial={live}
        onCancel={onClose}
        onNavigate={setCurrent}
        onDeleted={onClose}
        onSaved={(saved) => {
          if (onSaved) onSaved(saved);
          else if (!live.id) setCurrent(saved);
          else onClose();
        }}
      />
    </FinanceModal>
  );
}
