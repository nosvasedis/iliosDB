import React from 'react';
import { Factory, Globe } from 'lucide-react';
import { ProductionType } from '../../types';

export default function ProductionTypeBadge({ productionType }: { productionType: ProductionType }) {
    const isImported = productionType === ProductionType.Imported;
    const Icon = isImported ? Globe : Factory;

    return (
        <span className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
            isImported
                ? 'border-violet-200 bg-violet-50 text-violet-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
            <Icon size={15} aria-hidden="true" />
            {isImported ? 'Εισαγόμενο' : 'Ιδιοπαραγωγή'}
        </span>
    );
}
