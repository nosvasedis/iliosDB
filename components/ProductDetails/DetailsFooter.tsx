import React from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';

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
            <div className="flex items-center gap-3 text-xs font-semibold" aria-live="polite">
                {isDirty ? (
                    <span className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-700 ring-1 ring-amber-200">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Μη αποθηκευμένες αλλαγές
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5 text-slate-400">
                        <CheckCircle2 size={14} className="text-emerald-500" /> Χωρίς εκκρεμείς αλλαγές
                    </span>
                )}
                <span className="hidden items-center gap-1 text-slate-400 md:flex">
                    <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">Ctrl</kbd>
                    <span>+</span>
                    <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">S</kbd>
                    <span className="ml-1">αποθήκευση</span>
                </span>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                    Κλείσιμο
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-7 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-100 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isSaving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                    {isSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
                </button>
            </div>
        </footer>
    );
}
