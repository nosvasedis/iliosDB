import React from 'react';
import { ImageIcon, Link2, Plus } from 'lucide-react';
import { Gender } from '../../types';
import SkuColorizedText from '../SkuColorizedText';

export interface LinkedStripItem {
    sku: string;
    /** Variant suffix to show next to the master (e.g. the matched finish of the set). */
    suffix?: string | null;
    imageUrl: string | null;
    gender?: Gender;
    /** Small facts after the SKU: stock / in-order pills, price, … */
    aside?: React.ReactNode;
    onSelect?: () => void;
    onAdd?: () => void;
    addTitle?: string;
    /** Already on the document: shown muted with a check. */
    done?: boolean;
}

interface Props {
    title?: string;
    items: LinkedStripItem[];
    /** Optional trailing action, e.g. «Προσθήκη όλων». */
    action?: React.ReactNode;
    onOpenFan?: (anchor: HTMLElement) => void;
    className?: string;
    compact?: boolean;
}

/** Inline row of a product's set-mates, for detail screens, order builders and offers. */
export default function LinkedProductsStrip({ title = 'Σετ με', items, action, onOpenFan, className = '', compact = false }: Props) {
    if (items.length === 0) return null;
    return (
        <div className={`rounded-2xl border border-violet-100 bg-violet-50/50 p-2.5 ${className}`}>
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                <button
                    type="button"
                    onClick={(event) => onOpenFan?.(event.currentTarget)}
                    disabled={!onOpenFan}
                    title={onOpenFan ? 'Προβολή σε βεντάλια' : undefined}
                    className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-violet-700 enabled:hover:text-violet-900"
                >
                    <Link2 size={12} strokeWidth={2.75} />
                    {title}
                </button>
                {action}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
                {items.map((item) => {
                    const Container: React.ElementType = item.onSelect ? 'button' : 'div';
                    return (
                        <div
                            key={`${item.sku}${item.suffix || ''}`}
                            className={`flex shrink-0 items-center gap-2 rounded-xl border bg-white pr-1 shadow-sm transition ${item.done ? 'border-emerald-200 opacity-70' : 'border-violet-100 hover:border-violet-300'}`}
                        >
                            <Container
                                {...(item.onSelect ? { type: 'button', onClick: item.onSelect, title: `Επιλογή ${item.sku}` } : {})}
                                className="flex min-w-0 items-center gap-2 py-1 pl-1 text-left"
                            >
                                <span className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 overflow-hidden rounded-lg bg-slate-50`}>
                                    {item.imageUrl
                                        ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                        : <ImageIcon size={14} className="m-auto mt-3 text-slate-300" />}
                                </span>
                                <span className="flex min-w-0 flex-col">
                                    <span className="text-[13px] leading-tight">
                                        <SkuColorizedText sku={item.sku} suffix={item.suffix ?? ''} gender={item.gender} masterClassName="text-slate-800" mono />
                                    </span>
                                    {item.aside && <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-slate-500">{item.aside}</span>}
                                </span>
                            </Container>
                            {item.onAdd && !item.done && (
                                <button
                                    type="button"
                                    onClick={item.onAdd}
                                    title={item.addTitle || `Προσθήκη ${item.sku}${item.suffix || ''}`}
                                    aria-label={item.addTitle || `Προσθήκη ${item.sku}${item.suffix || ''}`}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm transition hover:bg-violet-700"
                                >
                                    <Plus size={15} strokeWidth={3} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
