import { formatDecimal } from '../../utils/numberFormat';
import React from 'react';
import { Camera, ImageIcon, Loader2, PieChart, ScrollText, Trash2 } from 'lucide-react';
import { ACCEPTED_IMAGE_INPUT_TYPES } from '../../utils/imageHelpers';
import { formatCurrency } from '../../utils/pricingEngine';
import { DetailsFact, DetailsIconButton } from './detailsUi';

export interface CostComposition {
    silver: number;
    materials: number;
    labor: number;
}

const COMPOSITION_PARTS: { key: keyof CostComposition; label: string; color: string }[] = [
    { key: 'silver', label: 'Ασήμι', color: 'bg-slate-400' },
    { key: 'materials', label: 'Υλικά / Πέτρες', color: 'bg-sky-500' },
    { key: 'labor', label: 'Εργατικά', color: 'bg-amber-500' },
];

export default function DetailsSidebar({
    sku,
    imageUrl,
    isUploadingImage,
    isDeletingImage,
    onImageUpdate,
    onDeleteImage,
    composition,
    cost,
    scopeLabel,
    facts,
}: {
    sku: string;
    imageUrl?: string | null;
    isUploadingImage: boolean;
    isDeletingImage: boolean;
    onImageUpdate: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onDeleteImage: () => void;
    composition: CostComposition;
    cost: number;
    scopeLabel: string;
    facts: { label: string; value: React.ReactNode }[];
}) {
    const compositionTotal = COMPOSITION_PARTS.reduce((sum, part) => sum + Math.max(0, composition[part.key] || 0), 0);

    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                <label className="group relative block aspect-square cursor-pointer overflow-hidden rounded-xl bg-gradient-to-b from-slate-50 to-white">
                    {imageUrl ? (
                        <img src={imageUrl} className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" alt={sku} />
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-300 transition-colors group-hover:text-slate-400">
                            <ImageIcon size={40} strokeWidth={1.5} />
                            <span className="text-[11px] font-semibold text-slate-400">Πατήστε για προσθήκη φωτογραφίας</span>
                        </div>
                    )}
                    {isUploadingImage && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                            <Loader2 size={24} className="animate-spin text-slate-500" />
                        </div>
                    )}
                    <input type="file" aria-label="Αλλαγή φωτογραφίας SKU" className="sr-only" accept={ACCEPTED_IMAGE_INPUT_TYPES} onChange={onImageUpdate} disabled={isUploadingImage} />
                </label>
                <div className="flex items-center gap-1 px-1 pb-0.5 pt-1.5">
                    <label className={`inline-flex h-8 flex-1 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 ${isUploadingImage ? 'pointer-events-none opacity-50' : ''}`}>
                        <Camera size={14} />
                        {isUploadingImage ? 'Μεταφόρτωση…' : imageUrl ? 'Αλλαγή φωτογραφίας' : 'Προσθήκη φωτογραφίας'}
                        <input type="file" aria-label="Μεταφόρτωση φωτογραφίας SKU" className="sr-only" accept={ACCEPTED_IMAGE_INPUT_TYPES} onChange={onImageUpdate} disabled={isUploadingImage} />
                    </label>
                    {imageUrl && (
                        <DetailsIconButton
                            icon={isDeletingImage ? Loader2 : Trash2}
                            label="Διαγραφή φωτογραφίας"
                            variant="danger"
                            size="sm"
                            onClick={onDeleteImage}
                            disabled={isDeletingImage}
                            className={`h-8 w-8 ${isDeletingImage ? '[&>svg]:animate-spin' : ''}`}
                        />
                    )}
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <PieChart size={13} className="text-slate-400" /> Σύνθεση κόστους
                    </h3>
                    <span className="font-mono text-sm font-bold text-slate-900">{formatCurrency(cost)}</span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    {compositionTotal > 0 && COMPOSITION_PARTS.map(part => (
                        <div
                            key={part.key}
                            className={`h-full ${part.color}`}
                            style={{ width: `${(Math.max(0, composition[part.key] || 0) / compositionTotal) * 100}%` }}
                            title={part.label}
                        />
                    ))}
                </div>
                <ul className="mt-3 space-y-1.5">
                    {COMPOSITION_PARTS.map(part => {
                        const value = composition[part.key] || 0;
                        const share = compositionTotal > 0 ? (Math.max(0, value) / compositionTotal) * 100 : 0;
                        return (
                            <li key={part.key} className="flex items-center justify-between gap-2 text-xs">
                                <span className="flex items-center gap-2 text-slate-600">
                                    <span className={`h-2 w-2 rounded-sm ${part.color}`} /> {part.label}
                                </span>
                                <span className="flex items-baseline gap-2">
                                    <span className="w-9 text-right text-[10px] font-semibold text-slate-400">{formatDecimal(share, 0)}%</span>
                                    <span className="w-16 text-right font-mono font-bold text-slate-800">{formatCurrency(value)}</span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-3 truncate border-t border-slate-100 pt-2 text-[10px] font-medium text-slate-400">Αφορά: {scopeLabel}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <h3 className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <ScrollText size={13} className="text-slate-400" /> Στοιχεία εγγραφής
                </h3>
                <dl className="divide-y divide-slate-100">
                    {facts.map(fact => (
                        <DetailsFact key={fact.label} label={fact.label}>{fact.value}</DetailsFact>
                    ))}
                </dl>
            </div>
        </div>
    );
}
