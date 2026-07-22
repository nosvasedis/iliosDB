import React, { ReactNode } from 'react';
import { StickyNote } from 'lucide-react';
import { getSpecialCreationDisplayNote, isSpecialCreationSku } from '../utils/specialCreationSku';

/** Print CSS — footer flows with items via column-span; no flex stretch in print. */
export const CUSTOMER_PRINT_CSS = `
  @media print {
    .customer-print-page {
      display: block !important;
      min-height: auto !important;
      box-shadow: none !important;
    }
    .customer-print-main {
      display: block !important;
      flex: none !important;
      min-height: 0 !important;
    }
    .customer-print-column-span {
      column-span: all;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .customer-print-summary {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`;

export const CUSTOMER_PRINT_PAGE_CLASS =
    'customer-print-page bg-white text-black font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:min-h-0 print:p-6 page-break-after-always flex flex-col print:block relative';

export const CUSTOMER_PRINT_MAIN_CLASS = 'customer-print-main flex-1 min-h-0 relative print:flex-none';

function formatEuro(value: number) {
    return `${value.toFixed(2).replace('.', ',')}€`;
}

export interface CustomerPrintSummaryFooterProps {
    notes?: string | null;
    notesFallback?: string;
    totalPieces?: number;
    subtotalLabel?: string;
    subtotal: number;
    discountPercent?: number;
    discountAmount?: number;
    vatRate: number;
    vatAmount: number;
    grandTotal: number;
    trailing?: ReactNode;
}

export function CustomerPrintSummaryFooter({
    notes,
    notesFallback = 'Δεν υπάρχουν σημειώσεις.',
    totalPieces,
    subtotalLabel = 'Καθαρή Αξία:',
    subtotal,
    discountPercent = 0,
    discountAmount = 0,
    vatRate,
    vatAmount,
    grandTotal,
    trailing,
}: CustomerPrintSummaryFooterProps) {
    return (
        <div className="customer-print-summary customer-print-column-span mt-1.5 border-t border-slate-900 pt-1.5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-[8px] leading-snug text-slate-600">
                    <p className="mb-0.5 font-bold uppercase tracking-wide text-slate-500">Σημειώσεις</p>
                    <p className="rounded border border-slate-100 bg-slate-50 px-1 py-0.5 italic leading-[1.25]">
                        {notes || notesFallback}
                    </p>
                </div>

                <div className="w-40 shrink-0 text-[9px] leading-tight">
                    {totalPieces != null && (
                        <div className="mb-0.5 flex justify-between border-b border-slate-200 pb-0.5 text-slate-700">
                            <span>Σύνολο Τεμαχίων:</span>
                            <span className="tabular-nums font-bold">{totalPieces}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                        <span>{subtotalLabel}</span>
                        <span className="tabular-nums font-bold">{formatEuro(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                        <div className="flex justify-between text-rose-600">
                            <span>Έκπτωση ({discountPercent}%):</span>
                            <span className="tabular-nums font-bold">-{formatEuro(discountAmount)}</span>
                        </div>
                    )}
                    <div className="mb-0.5 flex justify-between border-b border-slate-200 pb-0.5 text-slate-600">
                        <span>Φ.Π.Α. ({(vatRate * 100).toFixed(0)}%):</span>
                        <span className="tabular-nums font-bold">{formatEuro(vatAmount)}</span>
                    </div>
                    <div className="flex justify-between font-black text-slate-900">
                        <span className="uppercase text-[9px]">Γενικό Σύνολο:</span>
                        <span className="tabular-nums text-[11px]">{formatEuro(grandTotal)}</span>
                    </div>
                </div>
            </div>
            {trailing}
        </div>
    );
}

export function CustomerPrintSkuNote({ sku, note }: { sku?: string | null; note?: string | null }) {
    const trimmed = isSpecialCreationSku(sku)
        ? getSpecialCreationDisplayNote(sku, note)
        : note?.trim();
    if (!trimmed) return null;
    const missing = isSpecialCreationSku(sku) && !note?.trim();

    return (
        <div className={`customer-print-sku-note mt-0.5 flex items-start gap-0.5 rounded-sm px-1 py-[1px] text-[8px] font-semibold leading-[1.15] whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${missing ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50/70 text-emerald-800'}`}>
            <StickyNote size={8} className="mt-[1px] shrink-0" />
            <span className="min-w-0 flex-1">{trimmed}</span>
        </div>
    );
}
