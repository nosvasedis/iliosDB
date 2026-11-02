import React, { useCallback, useState } from 'react';
import { HardHat } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProductionBatch } from '../../types';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIProvider';
import { useSuppliers } from '../../hooks/api/useSuppliers';
import { financeKeys } from '../../features/finance/keys';
import { financeRepository } from '../../features/finance/repository';
import { stageLabel } from '../../features/finance/workerStatements';
import { FinanceModal, secondaryButton } from './financeUi';

const LAST_WORKER_KEY = (stage: string) => `ilios:finance:last-worker:${stage}`;

function readLastWorker(stage: string): string | null {
  try { return localStorage.getItem(LAST_WORKER_KEY(stage)); } catch { return null; }
}

function rememberWorker(stage: string, partyId: string): void {
  try { localStorage.setItem(LAST_WORKER_KEY(stage), partyId); } catch { /* storage unavailable */ }
}

/**
 * After batches go to an outside partner (Καρφωτής, Τεχνίτης), asks once which partner
 * took them, so their work is ready for Εκκαθάριση in the finance hub. Admin only; skippable.
 */
export function useStageAssignmentPrompt() {
  const { profile } = useAuth();
  const { showToast } = useUI();
  const queryClient = useQueryClient();
  const suppliersQuery = useSuppliers();
  const [pending, setPending] = useState<{ batches: ProductionBatch[]; stage: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const workers = (suppliersQuery.data || []).filter((party) => party.kind === 'worker' && party.is_active !== false);
  const enabled = profile?.role === 'admin' && workers.length > 0;

  const promptAssignment = useCallback((batches: ProductionBatch[], stage: string) => {
    if (!enabled || batches.length === 0) return;
    setPending({ batches, stage });
  }, [enabled]);

  const assign = async (partyId: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await financeRepository.saveAssignments(pending.batches.map((batch) => ({
        batch_id: batch.id,
        stage: pending.stage,
        party_id: partyId,
        sku: batch.sku,
        variant_suffix: batch.variant_suffix || null,
        quantity: batch.quantity,
        statement_id: null,
        notes: null,
      })));
      rememberWorker(pending.stage, partyId);
      await queryClient.invalidateQueries({ queryKey: financeKeys.all });
      showToast(`Χρεώθηκαν ${pending.batches.length} παρτίδες στον ${workers.find((worker) => worker.id === partyId)?.name}.`, 'success');
      setPending(null);
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const lastWorker = pending ? readLastWorker(pending.stage) : null;
  const ordered = [...workers].sort((a, b) => (a.id === lastWorker ? -1 : b.id === lastWorker ? 1 : a.name.localeCompare(b.name, 'el')));
  const pieces = pending?.batches.reduce((sum, batch) => sum + batch.quantity, 0) || 0;

  const assignmentPrompt = pending ? (
    <FinanceModal
      icon={HardHat}
      eyebrow={`${stageLabel(pending.stage)} · ${pending.batches.length} παρτίδες · ${pieces} τεμ.`}
      title="Σε ποιον συνεργάτη πήγαν;"
      onClose={() => setPending(null)}
      busy={busy}
      size="sm"
      footer={<button type="button" onClick={() => setPending(null)} className={secondaryButton}>Παράλειψη</button>}
    >
      <div className="grid gap-2">
        {ordered.map((worker) => (
          <button
            key={worker.id}
            type="button"
            disabled={busy}
            onClick={() => assign(worker.id)}
            className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition hover:border-slate-900 ${worker.id === lastWorker ? 'border-amber-300 bg-amber-50' : 'border-slate-100'}`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><HardHat size={17} /></span>
            <span className="flex-1 text-sm font-black text-slate-900">{worker.name}</span>
            {worker.id === lastWorker && <span className="text-[10px] font-black uppercase text-amber-700">Τελευταίος</span>}
          </button>
        ))}
        <p className="pt-1 text-xs font-semibold text-slate-500">Η εργασία εμφανίζεται στην «Εκκαθάριση εργασιών» του Οικονομικού Ελέγχου.</p>
      </div>
    </FinanceModal>
  ) : null;

  return { promptAssignment, assignmentPrompt };
}
