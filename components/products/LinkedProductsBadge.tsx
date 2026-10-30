import React from 'react';
import { Link2 } from 'lucide-react';
import { formatNumber } from '../../utils/numberFormat';
import { formatLinkedSkusTitle } from '../../features/products/productLinks';

interface Props {
    linkedSkus: string[];
    onOpen: (anchor: HTMLElement) => void;
    className?: string;
    /** `dark` sits on photos; `light` sits on white surfaces. */
    tone?: 'dark' | 'light';
    size?: 'sm' | 'md';
}

/** Small «σετ» indicator: opens the fan (βεντάλια) of linked products. */
export default function LinkedProductsBadge({ linkedSkus, onOpen, className = '', tone = 'dark', size = 'md' }: Props) {
    if (linkedSkus.length === 0) return null;
    const toneClass = tone === 'dark'
        ? 'border-white/15 bg-[#060b00]/80 text-white hover:bg-[#060b00]'
        : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100';
    const sizeClass = size === 'sm' ? 'h-6 min-w-6 px-1.5 text-[10px]' : 'h-7 min-w-7 px-2 text-[10px]';
    return (
        <button
            type="button"
            title={formatLinkedSkusTitle(linkedSkus)}
            aria-label={`Συνδεδεμένα προϊόντα: ${linkedSkus.join(', ')}`}
            aria-haspopup="dialog"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpen(event.currentTarget);
            }}
            className={`z-20 inline-flex items-center justify-center gap-1 rounded-full border font-bold shadow-sm backdrop-blur-md transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${toneClass} ${sizeClass} ${className}`}
        >
            <Link2 size={size === 'sm' ? 11 : 12} className={tone === 'dark' ? 'text-violet-300' : 'text-violet-500'} strokeWidth={2.75} />
            <span className="tabular-nums">{formatNumber(linkedSkus.length)}</span>
        </button>
    );
}
