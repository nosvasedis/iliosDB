import { formatNumber } from '../../utils/numberFormat';

import React, { useMemo, useState } from 'react';
import SpecialCreationNote from '../SpecialCreationNote';
import SkuColorizedText from '../SkuColorizedText';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productionKeys, productionRepository } from '../../features/production';
import { api } from '../../lib/supabase';
import { ProductionBatch, ProductionStage } from '../../types';
import { CheckCircle, Clock, Factory, Hammer, Layers, Loader2, MoveRight, Tag } from 'lucide-react';
import { useUI } from '../UIProvider';
import { formatOrderId } from '../../utils/orderUtils';
import { invalidateOrdersAndBatches } from '../../lib/queryInvalidation';
import IliosLoader from '../ui/IliosLoader';
import PageHeader from '../shell/PageHeader';
import { useViewport } from '../shell/viewport';

type ColumnKey = 'arriving' | 'assembly' | 'packaging' | 'ready';

interface ColumnDef {
    key: ColumnKey;
    stage: ProductionStage;
    title: string;
    short: string;
    empty: string;
    icon: React.ElementType;
    tone: { panel: string; title: string; count: string; tab: string };
}

// Store clerks handle: Polishing → Labeling (receive), Assembly → Labeling, Labeling → Ready.
const COLUMNS: ColumnDef[] = [
    { key: 'arriving', stage: ProductionStage.Polishing, title: 'Αναμονή από τεχνίτη', short: 'Αναμονή', empty: 'Κανένα προϊόν σε αναμονή.', icon: Hammer,
      tone: { panel: 'border-blue-100 bg-blue-50/50', title: 'text-blue-800', count: 'text-blue-700', tab: 'bg-blue-600' } },
    { key: 'assembly', stage: ProductionStage.Assembly, title: 'Συναρμολόγηση', short: 'Συναρμ.', empty: 'Κανένα προϊόν προς συναρμολόγηση.', icon: Layers,
      tone: { panel: 'border-pink-100 bg-pink-50/50', title: 'text-pink-800', count: 'text-pink-700', tab: 'bg-pink-600' } },
    { key: 'packaging', stage: ProductionStage.Labeling, title: 'Συσκευασία & barcode', short: 'Συσκευασία', empty: 'Κανένα προϊόν στη συσκευασία.', icon: Tag,
      tone: { panel: 'border-amber-100 bg-amber-50/50', title: 'text-amber-800', count: 'text-amber-700', tab: 'bg-amber-500' } },
    { key: 'ready', stage: ProductionStage.Ready, title: 'Έτοιμα για παράδοση', short: 'Έτοιμα', empty: 'Τίποτα έτοιμο ακόμη.', icon: CheckCircle,
      tone: { panel: 'border-emerald-100 bg-emerald-50/50', title: 'text-emerald-800', count: 'text-emerald-700', tab: 'bg-emerald-600' } },
];

const READY_LIMIT = 12;

const NEXT_ACTION: Partial<Record<ProductionStage, { target: ProductionStage; label: string }>> = {
    [ProductionStage.Assembly]: { target: ProductionStage.Labeling, label: 'Ολοκλήρωση συναρμολόγησης' },
    [ProductionStage.Polishing]: { target: ProductionStage.Labeling, label: 'Παραλαβή για συσκευασία' },
    [ProductionStage.Labeling]: { target: ProductionStage.Ready, label: 'Έτοιμο για παράδοση' },
};

const ClerkBatchCard = React.memo<{ batch: ProductionBatch; busy: boolean; onMove: (b: ProductionBatch, target: ProductionStage) => void }>(({ batch, busy, onMove }) => {
    const action = NEXT_ACTION[batch.current_stage];
    return (
        <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <SkuColorizedText sku={batch.sku} suffix={batch.variant_suffix || ''} className="block truncate text-[15px] leading-tight" />
                    <SpecialCreationNote sku={batch.sku} note={batch.notes} compact className="mt-1" />
                </div>
                <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">{formatNumber(batch.quantity)} τεμ.</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
                <span className="inline-flex items-center gap-1"><Clock size={11} /> {new Date(batch.updated_at).toLocaleDateString('el-GR')}</span>
                {batch.order_id && <span className="truncate font-mono">#{formatOrderId(batch.order_id)}</span>}
            </div>
            {action && (
                <button
                    type="button"
                    onClick={() => onMove(batch, action.target)}
                    disabled={busy}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#060b00] px-3 text-[12px] font-bold text-white transition-colors hover:bg-black active:scale-[0.98] disabled:opacity-50"
                >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <MoveRight size={14} className="text-amber-300" />}
                    {action.label}
                </button>
            )}
        </div>
    );
});
ClerkBatchCard.displayName = 'ClerkBatchCard';

export default function EmployeeProduction() {
    const { data: batches, isLoading } = useQuery({
        queryKey: productionKeys.batches(),
        queryFn: productionRepository.getProductionBatches,
    });
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const { isDesktop } = useViewport();
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [activeColumn, setActiveColumn] = useState<ColumnKey>('arriving');

    const grouped = useMemo(() => {
        const map: Record<ColumnKey, ProductionBatch[]> = { arriving: [], assembly: [], packaging: [], ready: [] };
        const byStage = new Map(COLUMNS.map((c) => [c.stage, c.key]));
        (batches || []).forEach((b) => {
            const key = byStage.get(b.current_stage);
            if (key) map[key].push(b);
        });
        return map;
    }, [batches]);

    const handleMoveStage = React.useCallback(async (batch: ProductionBatch, targetStage: ProductionStage) => {
        setProcessingId(batch.id);
        try {
            await api.updateBatchStage(batch.id, targetStage);
            await invalidateOrdersAndBatches(queryClient);
            showToast('Η κατάσταση ενημερώθηκε.', 'success');
        } catch (e) {
            showToast('Σφάλμα ενημέρωσης.', 'error');
        } finally {
            setProcessingId(null);
        }
    }, [queryClient, showToast]);

    if (isLoading && !batches) return <IliosLoader variant="section" detail="Παραγωγή" className="h-full" />;

    const renderColumnBody = (col: ColumnDef) => {
        const items = grouped[col.key];
        if (items.length === 0) return <div className="py-10 text-center text-sm font-medium text-slate-400">{col.empty}</div>;
        if (col.key === 'ready') {
            return (
                <div className="space-y-2">
                    {items.slice(0, READY_LIMIT).map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2">
                            <SkuColorizedText sku={b.sku} suffix={b.variant_suffix || ''} className="truncate text-[13px]" />
                            <span className="shrink-0 text-[11px] font-bold tabular-nums text-emerald-700">{formatNumber(b.quantity)} τεμ.</span>
                        </div>
                    ))}
                    {items.length > READY_LIMIT && <div className="text-center text-xs font-semibold text-slate-400">…και {formatNumber(items.length - READY_LIMIT)} ακόμη</div>}
                </div>
            );
        }
        return (
            <div className="space-y-2">
                {items.map((b) => <ClerkBatchCard key={b.id} batch={b} busy={processingId === b.id} onMove={handleMoveStage} />)}
            </div>
        );
    };

    const stageTabs = (
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1">
            {COLUMNS.map((col) => {
                const active = col.key === activeColumn;
                const count = grouped[col.key].length;
                return (
                    <button
                        key={col.key}
                        type="button"
                        onClick={() => setActiveColumn(col.key)}
                        className={`flex min-w-0 flex-col items-center rounded-xl px-1 py-1.5 transition-colors ${active ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'text-slate-500'}`}
                    >
                        <span className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-black tabular-nums text-white ${count > 0 ? col.tone.tab : 'bg-slate-300'}`}>{formatNumber(count)}</span>
                        <span className={`mt-0.5 w-full truncate text-center text-[10px] font-bold ${active ? 'text-slate-900' : ''}`}>{col.short}</span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <PageHeader
                icon={Factory}
                title="Ροή Παραγωγής"
                subtitle="Παραλαβή, συναρμολόγηση, συσκευασία καταστήματος"
                below={isDesktop ? undefined : stageTabs}
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                {isDesktop ? (
                    <div className="grid grid-cols-4 gap-4 pt-4">
                        {COLUMNS.map((col) => {
                            const Icon = col.icon;
                            return (
                                <section key={col.key} className={`rounded-2xl border p-3 ${col.tone.panel}`}>
                                    <h3 className={`mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide ${col.tone.title}`}>
                                        <Icon size={15} /> <span className="truncate">{col.title}</span>
                                        <span className={`ml-auto rounded-full bg-white px-2 py-0.5 shadow-sm ${col.tone.count}`}>{formatNumber(grouped[col.key].length)}</span>
                                    </h3>
                                    {renderColumnBody(col)}
                                </section>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-2 min-[400px]:p-3">
                        {renderColumnBody(COLUMNS.find((c) => c.key === activeColumn)!)}
                    </div>
                )}
            </div>
        </div>
    );
}
