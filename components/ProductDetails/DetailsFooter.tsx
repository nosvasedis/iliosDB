import React from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { DetailsButton } from './detailsUi';

export default function DetailsFooter({
    isSaving,
    isDirty,
    onSave,
    onClose,
}: {
    isSaving: boolean;
    isDirty: boolean;
    onSave: () => void;
    onClose: () => void;
}) {
    return (
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 md:px-6">
            <div className="flex min-h-[2rem] items-center gap-4 text-xs font-medium" aria-live="polite">
                {isDirty ? (
                    <span className="flex items-center gap-2 text-amber-700">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                        </span>
                        Μη αποθηκευμένες αλλαγές
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5 text-slate-400">
                        <CheckCircle2 size={14} className="text-emerald-500" /> Όλα αποθηκευμένα
                    </span>
                )}
                <span className="hidden items-center gap-1 text-slate-400 md:flex">
                    <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500 shadow-[inset_0_-1px_0_rgb(226_232_240)]">Ctrl</kbd>
                    <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500 shadow-[inset_0_-1px_0_rgb(226_232_240)]">S</kbd>
                    <span className="ml-0.5">για αποθήκευση</span>
                </span>
            </div>
            <div className="flex items-center gap-2">
                <DetailsButton variant="ghost" size="lg" onClick={onClose}>
                    Κλείσιμο
                </DetailsButton>
                <DetailsButton
                    variant="success"
                    size="lg"
                    icon={isSaving ? Loader2 : Save}
                    onClick={onSave}
                    disabled={isSaving}
                    className={`min-w-[9.5rem] ${isSaving ? '[&>svg]:animate-spin' : ''}`}
                >
                    {isSaving ? 'Αποθήκευση…' : 'Αποθήκευση'}
                </DetailsButton>
            </div>
        </footer>
    );
}
