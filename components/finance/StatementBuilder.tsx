import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardList, Factory, Plus, Trash2 } from 'lucide-react';
import { ProductionStage, type Material, type Product, type ProductionBatch, type Supplier } from '../../types';
import { useUI } from '../UIProvider';
import { useFinanceMutation } from '../../hooks/api/useFinance';
import { financeRepository } from '../../features/finance/repository';
import { buildCategoryTree, flattenTree } from '../../features/finance/categoryTree';
import { addDays, formatEuro, roundMoney, toIsoDate } from '../../features/finance/financeMath';
import { BILLABLE_STAGES, recalcLine, stageLabel, suggestStatement } from '../../features/finance/workerStatements';
import type { FinanceBilling, FinanceStatementLine, FinanceWorkspace } from '../../features/finance/types';
import { BillingToggle, EmptyNote, Field, ghostButton, inputClass, parseAmount, SaveButton, secondaryButton } from './financeUi';

const STAGE_ORDER: string[] = [
  ProductionStage.AwaitingDelivery, ProductionStage.Waxing, ProductionStage.Casting, ProductionStage.Setting,
  ProductionStage.Polishing, ProductionStage.Assembly, ProductionStage.Labeling, ProductionStage.Ready,
];

/** Batches that have reached a stage (and need it) but have no partner assigned for it yet. */
function candidateBatches(batches: readonly ProductionBatch[], stage: string, assigned: ReadonlySet<string>, since: string): ProductionBatch[] {
  const stageIndex = STAGE_ORDER.indexOf(stage);
  return batches.filter((batch) => {
    if (assigned.has(`${batch.id}:${stage}`)) return false;
    if ((batch.updated_at || batch.created_at).slice(0, 10) < since) return false;
    if (stage === ProductionStage.Setting && !batch.requires_setting) return false;
    if (stage === ProductionStage.Assembly && !batch.requires_assembly) return false;
    const current = STAGE_ORDER.indexOf(batch.current_stage);
    if (stageIndex < 0) return true;
    return current >= stageIndex && !(current === stageIndex && stage === ProductionStage.Polishing && batch.pending_dispatch);
  });
}

/** Εκκαθάριση συνεργάτη: pick work from Παραγωγή, price it with the rate card, confirm into an expense. */
export default function StatementBuilder({ party, workspace, products, materials, batches }: {
  party: Supplier;
  workspace: FinanceWorkspace;
  products: Product[];
  materials: Material[];
  batches: ProductionBatch[];
}) {
  const { showToast } = useUI();
  const cards = workspace.rateCards.filter((card) => card.party_id === party.id);
  const partyAssignments = workspace.assignments.filter((assignment) => assignment.party_id === party.id && !assignment.statement_id);
  const defaultStage = cards.find((card) => card.match?.stage)?.match.stage || 'Setting';
  const [stage, setStage] = useState(defaultStage);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, Partial<FinanceStatementLine>>>({});
  const [billing, setBilling] = useState<FinanceBilling>(party.default_billing || 'X');
  const flat = useMemo(() => flattenTree(buildCategoryTree(workspace.categories)), [workspace.categories]);
  const workerCategories = flat.filter((node) => node.category.link_kind === 'worker');
  const stageName = stageLabel(stage);
  const guessCategory = party.default_category_id
    || workerCategories.find((node) => node.category.name.localeCompare(stageName, 'el', { sensitivity: 'base' }) === 0)?.category.id
    || workerCategories[0]?.category.id || '';
  const [categoryId, setCategoryId] = useState(guessCategory);

  const assignedKeys = useMemo(() => new Set(workspace.assignments.map((assignment) => `${assignment.batch_id}:${assignment.stage}`)), [workspace.assignments]);
  const candidates = useMemo(() => candidateBatches(batches, stage, assignedKeys, addDays(toIsoDate(new Date()), -120)), [batches, stage, assignedKeys]);

  const suggestion = useMemo(() => suggestStatement({ assignments: partyAssignments, rateCards: cards, products, materials, batches }), [partyAssignments, cards, products, materials, batches]);
  const lines = suggestion.lines.map((line, index) => recalcLine({ ...line, ...overrides[index] }));
  const total = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));

  const assign = useFinanceMutation(() => financeRepository.saveAssignments(
    candidates.filter((batch) => picked.has(batch.id)).map((batch) => ({
      batch_id: batch.id, stage, party_id: party.id, sku: batch.sku, variant_suffix: batch.variant_suffix || null, quantity: batch.quantity, statement_id: null, notes: null,
    })),
  ));
  const unassign = useFinanceMutation((id: string) => financeRepository.deleteAssignment(id));
  const confirmStatement = useFinanceMutation(async () => {
    const dates = partyAssignments.map((assignment) => assignment.assigned_at.slice(0, 10)).sort();
    const statement = await financeRepository.saveStatement({
      party_id: party.id,
      period_from: dates[0] || null,
      period_to: dates[dates.length - 1] || null,
      status: 'draft',
      lines,
      total,
    });
    return financeRepository.confirmStatement(statement.id, categoryId, billing, toIsoDate(new Date()));
  });

  const addPicked = async () => {
    try {
      await assign.mutateAsync(undefined);
      setPicked(new Set());
      showToast('Οι παρτίδες χρεώθηκαν στον συνεργάτη.', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const confirm = async () => {
    if (!categoryId) { showToast('Επιλέξτε κατηγορία εξόδου.', 'error'); return; }
    if (lines.length === 0) { showToast('Δεν υπάρχουν γραμμές προς εκκαθάριση.', 'error'); return; }
    try {
      await confirmStatement.mutateAsync(undefined);
      setOverrides({});
      showToast(`Η εκκαθάριση ${formatEuro(total)} καταχωρίστηκε ως έξοδο.`, 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Factory size={16} className="text-slate-500" />
          <span className="text-sm font-black text-slate-900">Εργασία από Παραγωγή</span>
          <select value={stage} onChange={(event) => { setStage(event.target.value); setPicked(new Set()); }} className={`${inputClass} ml-auto w-auto py-1.5 text-xs`}>
            {BILLABLE_STAGES.filter((entry) => STAGE_ORDER.includes(entry.stage)).map((entry) => <option key={entry.stage} value={entry.stage}>{entry.label}</option>)}
          </select>
        </div>
        {candidates.length === 0 ? (
          <p className="text-xs font-semibold text-slate-500">Καμία παρτίδα σε «{stageName}» χωρίς συνεργάτη τις τελευταίες 120 ημέρες.</p>
        ) : (
          <>
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {candidates.map((batch) => (
                <label key={batch.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(batch.id)} onChange={() => setPicked((previous) => { const next = new Set(previous); if (next.has(batch.id)) next.delete(batch.id); else next.add(batch.id); return next; })} className="accent-amber-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{batch.sku}{batch.variant_suffix || ''}</span>
                  <span className="text-xs font-semibold text-slate-500">{batch.quantity} τεμ. · {(batch.updated_at || batch.created_at).slice(0, 10)}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => setPicked(new Set(candidates.map((batch) => batch.id)))} className={ghostButton}>Όλες</button>
              <button type="button" disabled={picked.size === 0 || assign.isPending} onClick={addPicked} className={`${secondaryButton} ml-auto`}><Plus size={14} /> Χρέωση {picked.size || ''} στον {party.name}</button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
          <ClipboardList size={16} className="text-slate-500" />
          <span className="flex-1 text-sm font-black text-slate-900">Προς εκκαθάριση</span>
          <span className="text-sm font-black tabular-nums text-slate-900">{formatEuro(total)}</span>
        </div>
        {lines.length === 0 && suggestion.unmatched.length === 0 ? (
          <div className="p-3"><EmptyNote icon={ClipboardList} title="Τίποτα αχρέωτο" detail="Χρεώστε παρτίδες από την Παραγωγή παραπάνω." /></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {lines.map((line, index) => (
              <div key={`${line.assignment_id}-${line.rate_card_id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_5rem_5.5rem_6rem] items-center gap-2 px-3 py-2">
                <span className="truncate text-sm font-semibold text-slate-700">{line.label}</span>
                <input inputMode="decimal" value={String(line.units).replace('.', ',')} onChange={(event) => setOverrides((previous) => ({ ...previous, [index]: { ...previous[index], units: parseAmount(event.target.value) } }))} className={`${inputClass} py-1 text-right text-xs`} />
                <input inputMode="decimal" value={String(line.rate).replace('.', ',')} onChange={(event) => setOverrides((previous) => ({ ...previous, [index]: { ...previous[index], rate: parseAmount(event.target.value) } }))} className={`${inputClass} py-1 text-right text-xs`} />
                <span className="text-right text-sm font-black tabular-nums">{formatEuro(line.amount)}</span>
              </div>
            ))}
            {suggestion.unmatched.map(({ assignment, reason }) => (
              <div key={assignment.id} className="flex items-center gap-2 bg-amber-50/60 px-3 py-2 text-xs">
                <AlertTriangle size={14} className="text-amber-600" />
                <span className="flex-1 font-semibold text-amber-900">{assignment.sku}{assignment.variant_suffix || ''} · {assignment.quantity} τεμ. — {reason}</span>
                <button type="button" onClick={() => unassign.mutateAsync(assignment.id).catch((error) => showToast(error.message, 'error'))} className="rounded-sm p-1 text-amber-700 hover:bg-amber-100" aria-label="Αφαίρεση"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="grid items-end gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Κατηγορία εξόδου">
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}>
              <option value="">— Επιλογή —</option>
              {flat.map((node) => <option key={node.category.id} value={node.category.id}>{'  '.repeat(node.depth)}{node.category.name}</option>)}
            </select>
          </Field>
          <BillingToggle value={billing} onChange={setBilling} />
          <SaveButton busy={confirmStatement.isPending} onClick={confirm}><Check size={16} /> Εκκαθάριση {formatEuro(total)}</SaveButton>
        </div>
      )}
    </div>
  );
}
