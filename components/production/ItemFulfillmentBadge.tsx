import React from 'react';
import { Truck, PackageCheck, Factory } from 'lucide-react';
import { ItemFulfillmentKind, ItemShipmentAllocation } from '../../utils/shipmentUtils';

interface Props {
    kind: ItemFulfillmentKind;
    shippedQty: number;
    quantity: number;
    shipmentAllocations: ItemShipmentAllocation[];
    inProductionQty: number;
}

function formatShipmentNumbers(allocations: ItemShipmentAllocation[]): string {
    if (allocations.length === 0) return '';
    return allocations.map((allocation) => `#${allocation.shipmentNumber}`).join(', ');
}

export function ItemFulfillmentBadge({
    kind,
    shippedQty,
    quantity,
    shipmentAllocations,
    inProductionQty,
}: Props) {
    if (kind === 'remaining') return null;

    const shipmentLabel = formatShipmentNumbers(shipmentAllocations);

    if (kind === 'fully_delivered') {
        return (
            <div className="flex flex-col items-start xl:items-end gap-1 shrink-0 self-start">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-slate-800 text-white border border-slate-900 shadow-sm whitespace-nowrap">
                    <Truck size={11} strokeWidth={2.5} />
                    {shipmentLabel ? `Παράδοση ${shipmentLabel}` : 'Παραδόθηκε'}
                </span>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                    {shippedQty}/{quantity} τεμ.
                </span>
            </div>
        );
    }

    if (kind === 'partially_delivered') {
        return (
            <div className="flex flex-col items-start xl:items-end gap-1 shrink-0 self-start">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-amber-50 text-amber-900 border-2 border-amber-300 shadow-sm whitespace-nowrap">
                    <PackageCheck size={11} strokeWidth={2.5} />
                    {shipmentLabel ? `Μερική Παράδοση ${shipmentLabel}` : 'Μερική Παράδοση'}
                </span>
                <span className="text-[9px] font-bold text-amber-700 bg-amber-50/80 border border-amber-200 px-1.5 py-0.5 rounded">
                    Παραδόθηκαν {shippedQty}/{quantity} τεμ.
                </span>
                {inProductionQty > 0 && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        <Factory size={9} />
                        Υπόλοιπο σε παραγωγή: {inProductionQty}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-start xl:items-end gap-1 shrink-0 self-start">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-200 shadow-sm whitespace-nowrap">
                <Factory size={11} strokeWidth={2.5} />
                Στην Παραγωγή
            </span>
            <span className="text-[9px] font-bold text-blue-600 bg-blue-50/80 border border-blue-100 px-1.5 py-0.5 rounded">
                {inProductionQty}/{quantity} τεμ.
            </span>
        </div>
    );
}
