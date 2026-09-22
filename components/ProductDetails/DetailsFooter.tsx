import React from 'react';
import { Loader2, Save } from 'lucide-react';

export default function DetailsFooter({
    isSaving,
    onSave,
}: {
    isSaving: boolean;
    onSave: () => void;
}) {
    return (
        <div className="flex shrink-0 items-center justify-end gap-4 border-t border-slate-100 bg-white/90 p-4 backdrop-blur-sm">
            <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {isSaving ? 'Αποθήκευση...' : 'Αποθήκευση αλλαγών'}
            </button>
        </div>
    );
}
