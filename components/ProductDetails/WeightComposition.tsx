import React from 'react';
import { Puzzle } from 'lucide-react';
import { formatRegistryWeight, type ProductCardWeightPresentation } from '../../features/products/productCardPresentation';
import type { InvoiceTotalWeightResult } from '../../utils/invoiceTotalWeight';

/** Short one-line weight summary, same reading as the registry card (κύριο + δευτ. + STX = μέταλλο). */
export function describeWeightBreakdown(view: ProductCardWeightPresentation, secondaryLabel = 'δευτ.'): string {
    if (view.skipCasting) {
        return view.stxWeight > 0 ? `Χωρίς χύτευση · STX ${formatRegistryWeight(view.stxWeight)} g` : 'Χωρίς χύτευση';
    }
    if (!view.hasWeightBreakdown) return 'Ασήμι 925';
    const parts = [`${formatRegistryWeight(view.baseWeight)} κύριο`];
    if (view.secondaryWeight > 0) parts.push(`${formatRegistryWeight(view.secondaryWeight)} ${secondaryLabel}`);
    if (view.stxWeight > 0) parts.push(`${formatRegistryWeight(view.stxWeight)} STX`);
    return parts.join(' + ');
}

export function invoiceSourceLabel(invoice: InvoiceTotalWeightResult) {
    return invoice.source === 'manual' ? 'Χειροκίνητο' : invoice.source === 'automatic' ? 'Αυτόματο' : 'Ελλιπές';
}

function Segment({ label, value, tone = 'slate', strong = false }: { label: string; value: string; tone?: 'slate' | 'blue' | 'teal'; strong?: boolean }) {
    const tones = {
        slate: 'bg-white text-slate-800 ring-slate-200',
        blue: 'bg-blue-50 text-blue-700 ring-blue-200',
        teal: 'bg-teal-600 text-white ring-teal-600',
    };
    return (
        <div className={`min-w-[5.5rem] rounded-lg px-3 py-1.5 ring-1 ring-inset ${tones[tone]}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wide ${tone === 'teal' ? 'text-teal-50' : tone === 'blue' ? 'text-blue-500' : 'text-slate-400'}`}>{label}</div>
            <div className={`font-mono text-sm tabular-nums ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</div>
        </div>
    );
}

const Op = ({ children }: { children: React.ReactNode }) => (
    <span className="px-0.5 text-sm font-bold text-slate-300" aria-hidden="true">{children}</span>
);

/**
 * Weight composition for the SKU card: the metal equation (κύριο + δευτερεύον + STX from the
 * recipe) and, when it differs, the full invoice weight including all recipe materials.
 */
export default function WeightComposition({
    view,
    invoice,
    showInvoiceTotal,
    secondaryLabel,
    stxComponents,
}: {
    view: ProductCardWeightPresentation;
    invoice: InvoiceTotalWeightResult;
    showInvoiceTotal: boolean;
    secondaryLabel: string;
    /** STX recipe lines that contribute weight, for the explanation under the equation. */
    stxComponents: { sku: string; quantity: number; weight: number }[];
}) {
    const metalShare = (value: number) => (view.totalWeight > 0 ? `${(value / view.totalWeight) * 100}%` : '0%');

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
                {view.skipCasting ? (
                    <Segment label="Κύριο" value="Χωρίς χύτευση" />
                ) : (
                    <Segment label="Κύριο" value={`${formatRegistryWeight(view.baseWeight)} g`} />
                )}
                {view.secondaryWeight > 0 && (
                    <><Op>+</Op><Segment label={secondaryLabel} value={`${formatRegistryWeight(view.secondaryWeight)} g`} /></>
                )}
                {view.stxWeight > 0 && (
                    <><Op>+</Op><Segment label="STX συνταγής" value={`${formatRegistryWeight(view.stxWeight)} g`} tone="blue" /></>
                )}
                <Op>=</Op>
                <Segment label="Μέταλλο" value={`${formatRegistryWeight(view.totalWeight)} g`} tone="teal" strong />
                {showInvoiceTotal && (
                    <div className={`ml-auto rounded-lg px-3 py-1.5 ring-1 ring-inset ${invoice.source === 'missing' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-slate-200'}`}>
                        <div className={`text-[10px] font-semibold uppercase tracking-wide ${invoice.source === 'missing' ? 'text-amber-600' : 'text-slate-400'}`}>
                            Σύνολο με υλικά · {invoiceSourceLabel(invoice)}
                        </div>
                        <div className={`font-mono text-sm font-bold tabular-nums ${invoice.source === 'missing' ? 'text-amber-700' : 'text-slate-900'}`}>
                            {invoice.value === null ? '—' : `${formatRegistryWeight(invoice.value)} g`}
                        </div>
                    </div>
                )}
            </div>

            {view.hasWeightBreakdown && view.totalWeight > 0 && (
                <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70" aria-hidden="true">
                    <div className="h-full bg-slate-500" style={{ width: metalShare(view.skipCasting ? 0 : view.baseWeight) }} />
                    <div className="h-full bg-teal-400" style={{ width: metalShare(view.secondaryWeight) }} />
                    <div className="h-full bg-blue-400" style={{ width: metalShare(view.stxWeight) }} />
                </div>
            )}

            {stxComponents.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <Puzzle size={11} className="text-blue-400" />
                    {stxComponents.map(c => (
                        <span key={c.sku}>
                            <span className="font-mono font-semibold text-blue-600">{c.sku}</span>
                            {c.quantity !== 1 ? ` ×${c.quantity}` : ''} {formatRegistryWeight(c.weight * c.quantity)} g
                        </span>
                    ))}
                    <span className="text-slate-400">· από τη συνταγή, αλλάζει μόνο στο εξάρτημα</span>
                </p>
            )}
        </div>
    );
}
