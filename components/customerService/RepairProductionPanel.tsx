import React from 'react';
import {
  Archive,
  ArchiveRestore,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { ProductionBatch, ProductionStage, RepairItem } from '../../types';
import { StageFlowRail } from '../production/StageFlowRail';
import { BTN_SECONDARY } from '../ui/designTokens';

const DANGER_BUTTON =
  'inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition-all hover:bg-rose-100';

interface Props {
  item: RepairItem;
  batch?: ProductionBatch | null;
  isSeller: boolean;
  isMoving?: boolean;
  onMoveToStage: (stage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
  onHold: () => void;
  onRemove: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onReturnToProduction: () => void;
}

export default function RepairProductionPanel({
  item,
  batch,
  isSeller,
  isMoving = false,
  onMoveToStage,
  onHold,
  onRemove,
  onDelete,
  onArchive,
  onReturnToProduction,
}: Props) {
  if (isSeller) return null;

  const archived = item.is_archived === true;
  const closed = ['delivered', 'irreparable', 'cancelled'].includes(item.status);
  const held = !!batch?.on_hold || item.status === 'on_hold';
  const canReturn = !batch && ['received', 'on_hold', 'in_production'].includes(item.status) && !archived && !closed;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-400">Παραγωγή</h4>
        {archived && (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">Αρχείο</span>
        )}
      </div>

      {batch && (
        <StageFlowRail
          batch={batch}
          disabled={isMoving || held || archived || closed}
          onMove={(stage, options) => onMoveToStage(stage, options)}
        />
      )}

      {canReturn && (
        <button type="button" className={`${BTN_SECONDARY} mb-3`} onClick={onReturnToProduction}>
          <RotateCcw size={14} /> Επιστροφή στην Παραγωγή
        </button>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!closed && batch && (
          <>
            <button type="button" className={BTN_SECONDARY} onClick={onHold} disabled={isMoving || archived}>
              {held ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
              {held ? 'Συνέχεια' : 'Σε αναμονή'}
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={onRemove} disabled={isMoving || archived}>
              <Undo2 size={14} /> Αφαίρεση από Παραγωγή
            </button>
          </>
        )}
        <button type="button" className={BTN_SECONDARY} onClick={onArchive} disabled={isMoving}>
          {archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          {archived ? 'Ανάκτηση από Αρχείο' : 'Αρχειοθέτηση'}
        </button>
        <button type="button" className={DANGER_BUTTON} onClick={onDelete} disabled={isMoving}>
          <Trash2 size={14} /> Διαγραφή
        </button>
      </div>
    </section>
  );
}
