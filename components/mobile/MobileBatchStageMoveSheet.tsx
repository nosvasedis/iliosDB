import React from 'react';
import { createPortal } from 'react-dom';
import {
    Boxes,
    CheckCircle,
    Gem,
    Hammer,
    Layers,
    LucideIcon,
    Package,
    Tag,
    Truck,
    X,
} from 'lucide-react';
import { ProductionBatch, ProductionStage } from '../../types';
import { PRODUCTION_STAGES, ProductionStageColorKey } from '../../utils/productionStages';
import SkuColorizedText from '../SkuColorizedText';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';

const STAGE_ICONS: Record<ProductionStage, LucideIcon> = {
    [ProductionStage.AwaitingDelivery]: Package,
    [ProductionStage.Waxing]: Layers,
    [ProductionStage.Casting]: Hammer,
    [ProductionStage.Setting]: Gem,
    [ProductionStage.Polishing]: Package,
    [ProductionStage.Assembly]: Boxes,
    [ProductionStage.Labeling]: Tag,
    [ProductionStage.Ready]: CheckCircle,
};

const SHEET_STYLES: Record<
    ProductionStageColorKey,
    { card: string; iconWrap: string; ring: string }
> = {
    indigo: {
        card: 'border-indigo-300/80 bg-gradient-to-br from-indigo-500/[0.14] to-indigo-600/[0.08] active:from-indigo-500/25 active:to-indigo-600/15',
        iconWrap: 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25',
        ring: 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-white',
    },
    slate: {
        card: 'border-slate-300/80 bg-gradient-to-br from-slate-500/[0.12] to-slate-600/[0.06] active:from-slate-500/20 active:to-slate-600/12',
        iconWrap: 'bg-slate-700 text-white shadow-lg shadow-slate-700/20',
        ring: 'ring-2 ring-slate-500 ring-offset-2 ring-offset-white',
    },
    orange: {
        card: 'border-orange-300/80 bg-gradient-to-br from-orange-500/[0.16] to-amber-600/[0.08] active:from-orange-500/25 active:to-amber-600/15',
        iconWrap: 'bg-orange-600 text-white shadow-lg shadow-orange-600/25',
        ring: 'ring-2 ring-orange-500 ring-offset-2 ring-offset-white',
    },
    purple: {
        card: 'border-purple-300/80 bg-gradient-to-br from-purple-500/[0.14] to-violet-600/[0.08] active:from-purple-500/22 active:to-violet-600/14',
        iconWrap: 'bg-purple-600 text-white shadow-lg shadow-purple-600/25',
        ring: 'ring-2 ring-purple-500 ring-offset-2 ring-offset-white',
    },
    blue: {
        card: 'border-sky-300/80 bg-gradient-to-br from-sky-500/[0.12] to-blue-600/[0.08] active:from-sky-500/20 active:to-blue-600/14',
        iconWrap: 'bg-sky-600 text-white shadow-lg shadow-sky-600/25',
        ring: 'ring-2 ring-sky-500 ring-offset-2 ring-offset-white',
    },
    pink: {
        card: 'border-pink-300/80 bg-gradient-to-br from-pink-500/[0.14] to-rose-600/[0.08] active:from-pink-500/22 active:to-rose-600/14',
        iconWrap: 'bg-pink-600 text-white shadow-lg shadow-pink-600/25',
        ring: 'ring-2 ring-pink-500 ring-offset-2 ring-offset-white',
    },
    yellow: {
        card: 'border-amber-300/80 bg-gradient-to-br from-amber-400/[0.18] to-yellow-600/[0.08] active:from-amber-400/28 active:to-yellow-600/14',
        iconWrap: 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/30',
        ring: 'ring-2 ring-amber-500 ring-offset-2 ring-offset-white',
    },
    emerald: {
        card: 'border-emerald-300/80 bg-gradient-to-br from-emerald-500/[0.14] to-teal-600/[0.08] active:from-emerald-500/22 active:to-teal-600/14',
        iconWrap: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25',
        ring: 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white',
    },
};

export type StageMoveBatch = ProductionBatch & {
    customer_name?: string;
    requires_setting?: boolean;
    requires_assembly?: boolean;
    product_details?: { gender?: string };
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    batch: StageMoveBatch;
    onMove: (targetStage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
};

export default function MobileBatchStageMoveSheet({ isOpen, onClose, batch, onMove }: Props) {
    const currentStageIndex = PRODUCTION_STAGES.findIndex((s) => s.id === batch.current_stage);

    const isStageDisabled = (stageId: ProductionStage): boolean => {
        if (stageId === ProductionStage.Setting && batch.requires_setting === false) return true;
        if (stageId === ProductionStage.Assembly && batch.requires_assembly === false) return true;
        return false;
    };

    const tryMove = (targetStage: ProductionStage, options?: { pendingDispatch?: boolean }) => {
        if (isStageDisabled(targetStage)) return;

        if (targetStage === ProductionStage.Polishing && batch.current_stage === ProductionStage.Polishing) {
            const wantPending = options?.pendingDispatch === true;
            if (wantPending && batch.pending_dispatch) return;
            if (!wantPending && !batch.pending_dispatch) return;
        } else if (targetStage === batch.current_stage && targetStage !== ProductionStage.Polishing) {
            return;
        }

        onClose();
        onMove(targetStage, options);
    };

    if (!isOpen) return null;

    const isSpecialCreation = isSpecialCreationSku(batch.sku);

    const overlay = (
        <div
            className="fixed inset-0 z-[300] flex flex-col justify-end bg-slate-950/75 backdrop-blur-[2px] animate-in fade-in duration-150"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="flex max-h-[min(92dvh,880px)] flex-col rounded-t-[1.75rem] bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_40px_rgba(15,23,42,0.18)] animate-in slide-in-from-bottom duration-200 ease-out"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex shrink-0 flex-col px-5 pb-3 pt-3">
                    <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-slate-200" aria-hidden />
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Στάδιο</p>
                            <div className="mt-1">
                                <SkuColorizedText
                                    sku={batch.sku}
                                    suffix={batch.variant_suffix || ''}
                                    gender={batch.product_details?.gender}
                                    className="text-lg font-black tracking-tight"
                                    masterClassName={isSpecialCreation ? 'text-violet-900' : 'text-slate-900'}
                                />
                            </div>
                            {batch.customer_name ? (
                                <p className="mt-1 truncate text-xs font-bold text-slate-500">{batch.customer_name}</p>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onClose();
                            }}
                            className="shrink-0 rounded-full bg-slate-100 p-2.5 text-slate-600 active:scale-95"
                            aria-label="Κλείσιμο"
                        >
                            <X size={20} strokeWidth={2.25} />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px)+0.75rem)] pt-1">
                    {PRODUCTION_STAGES.map((stage, index) => {
                        const isDisabled = isStageDisabled(stage.id);
                        const isPast = index < currentStageIndex;
                        const isCurrent = stage.id === batch.current_stage;
                        const styles = SHEET_STYLES[stage.colorKey];

                        if (stage.id === ProductionStage.Polishing) {
                            const isCurrentPending = isCurrent && batch.pending_dispatch;
                            const isCurrentDispatched = isCurrent && !batch.pending_dispatch;

                            return (
                                <div key={stage.id} className="space-y-2">
                                    <p className="px-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{stage.label}</p>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <button
                                            type="button"
                                            disabled={isDisabled}
                                            onClick={() => tryMove(ProductionStage.Polishing, { pendingDispatch: true })}
                                            className={`flex min-h-[100px] flex-col items-start justify-between rounded-2xl border-2 p-3.5 text-left transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${
                                                isCurrentPending
                                                    ? 'border-teal-500 bg-gradient-to-br from-teal-500/20 to-emerald-600/10 shadow-md ' +
                                                      'ring-2 ring-teal-500 ring-offset-2 ring-offset-white'
                                                    : isPast && !isCurrent
                                                      ? 'border-teal-200/60 bg-teal-50/40'
                                                      : 'border-teal-300/70 bg-gradient-to-br from-teal-500/12 to-emerald-600/6'
                                            }`}
                                        >
                                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/30">
                                                <Package size={22} strokeWidth={2.25} />
                                            </span>
                                            <span>
                                                <span className="block text-sm font-black leading-tight text-teal-950">Αναμονή αποστολής</span>
                                                <span className="mt-0.5 block text-[10px] font-bold leading-snug text-teal-800/80">
                                                    Πριν την παράδοση στον τεχνίτη
                                                </span>
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isDisabled}
                                            onClick={() => tryMove(ProductionStage.Polishing, { pendingDispatch: false })}
                                            className={`flex min-h-[100px] flex-col items-start justify-between rounded-2xl border-2 p-3.5 text-left transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${
                                                isCurrentDispatched
                                                    ? 'border-sky-500 bg-gradient-to-br from-sky-500/18 to-blue-600/10 shadow-md ' +
                                                      'ring-2 ring-sky-500 ring-offset-2 ring-offset-white'
                                                    : isPast && !isCurrent
                                                      ? 'border-sky-200/60 bg-sky-50/40'
                                                      : 'border-sky-300/70 bg-gradient-to-br from-sky-500/12 to-blue-600/6'
                                            }`}
                                        >
                                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/30">
                                                <Truck size={22} strokeWidth={2.25} />
                                            </span>
                                            <span>
                                                <span className="block text-sm font-black leading-tight text-sky-950">Στον τεχνίτη</span>
                                                <span className="mt-0.5 block text-[10px] font-bold leading-snug text-sky-900/75">
                                                    Έχει παραδοθεί για εργασία
                                                </span>
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            );
                        }

                        const Icon = STAGE_ICONS[stage.id];

                        return (
                            <button
                                key={stage.id}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => tryMove(stage.id)}
                                className={`flex w-full min-h-[64px] items-center gap-3.5 rounded-2xl border-2 p-3.5 text-left transition-transform active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 ${styles.card} ${
                                    isCurrent ? styles.ring : ''
                                } ${isPast && !isCurrent ? 'opacity-80' : ''}`}
                            >
                                <span
                                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
                                >
                                    <Icon size={22} strokeWidth={2.25} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className="text-[15px] font-black text-slate-900">{stage.label}</span>
                                        {isCurrent ? (
                                            <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                                                Τρέχον
                                            </span>
                                        ) : null}
                                    </span>
                                    {isDisabled ? (
                                        <span className="mt-0.5 block text-[11px] font-bold text-slate-500">Δεν εφαρμόζεται</span>
                                    ) : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(overlay, document.body) : null;
}
