import React from 'react';
import { HoverTooltip } from '../ui/HoverTooltip';

export default function RetailBadge() {
    return <span className="shrink-0 print:hidden"><HoverTooltip label="Λιανική">
        <span aria-label="Λιανική" tabIndex={0}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-fuchsia-200 bg-fuchsia-50 px-1 text-[10px] font-bold leading-none text-fuchsia-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-500"
        >Λ</span>
    </HoverTooltip></span>;
}

/** Marks orders we place for ourselves; they are not sales. */
export function InternalOrderBadge() {
    return <span className="shrink-0 print:hidden"><HoverTooltip label="Εσωτερική παραγγελία — δεν μετράει στις πωλήσεις">
        <span aria-label="Εσωτερική παραγγελία" tabIndex={0}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-teal-200 bg-teal-50 px-1 text-[10px] font-bold leading-none text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
        >Εσ</span>
    </HoverTooltip></span>;
}
