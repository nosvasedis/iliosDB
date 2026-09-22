import React from 'react';
import { Camera, ImageIcon, Loader2, Trash2, TrendingUp } from 'lucide-react';
import { ACCEPTED_IMAGE_INPUT_TYPES } from '../../utils/imageHelpers';
import { formatCurrency } from '../../utils/pricingEngine';

export default function DetailsSidebar({
    sku,
    imageUrl,
    isUploadingImage,
    isDeletingImage,
    isComponent,
    displayedCost,
    displayedPrice,
    displayedMargin,
    onImageUpdate,
    onDeleteImage,
}: {
    sku: string;
    imageUrl?: string | null;
    isUploadingImage: boolean;
    isDeletingImage: boolean;
    isComponent: boolean;
    displayedCost: number;
    displayedPrice: number;
    displayedMargin: number;
    onImageUpdate: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onDeleteImage: () => void;
}) {
    return (
        <div className="space-y-6">
            <div className="group relative rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
                    {imageUrl ? (
                        <img src={imageUrl} className="h-full w-full object-cover" alt={sku} />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                            <ImageIcon size={48} />
                        </div>
                    )}

                    <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/20 px-4 py-2 font-bold text-white backdrop-blur-md">
                            <Camera size={18} /> {isUploadingImage ? 'Μεταφόρτωση...' : 'Αλλαγή'}
                        </div>
                        <input type="file" className="hidden" accept={ACCEPTED_IMAGE_INPUT_TYPES} onChange={onImageUpdate} disabled={isUploadingImage} />
                    </label>

                    {imageUrl && (
                        <button
                            type="button"
                            onClick={onDeleteImage}
                            disabled={isDeletingImage}
                            className="absolute left-2 top-2 z-[1] rounded-full bg-red-500 p-1.5 text-white shadow-md transition-colors hover:bg-red-600"
                            title="Διαγραφή Φωτογραφίας"
                        >
                            {isDeletingImage ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 font-bold text-slate-700">
                    <TrendingUp size={18} className="text-emerald-500" /> Σύνοψη
                </h3>

                <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Κόστος</span>
                    <span className="font-mono font-bold text-slate-800">{formatCurrency(displayedCost)}</span>
                </div>

                {!isComponent && (
                    <>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">Χονδρική</span>
                            <span className="font-mono font-bold text-emerald-600">{formatCurrency(displayedPrice)}</span>
                        </div>
                        <div className="h-px w-full bg-slate-100" />
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-bold uppercase text-slate-400">Περιθώριο</span>
                            <span className={`font-black ${displayedMargin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>
                                {displayedMargin.toFixed(0)}%
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
