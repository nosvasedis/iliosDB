import React, { useState } from 'react';
import { Loader2, Tag, X } from 'lucide-react';

export function OrderBulkTagModal({
    count,
    isProcessing,
    onClose,
    onSave,
}: {
    count: number;
    isProcessing: boolean;
    onClose: () => void;
    onSave: (tag: string) => void;
}) {
    const [tag, setTag] = useState('');
    const trimmed = tag.trim();

    return (
        <div className="fixed inset-0 z-[350] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-violet-50/50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Tag size={18} className="text-violet-500" /> Μαζική Ετικέτα
                    </h3>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6">
                    <p className="mb-4 text-xs text-slate-500">
                        Η ετικέτα θα προστεθεί σε <strong>{count} επιλεγμένες παραγγελίες</strong>. Υπάρχουσες ετικέτες δεν αφαιρούνται.
                    </p>
                    <input
                        value={tag}
                        onChange={(event) => setTag(event.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/20 text-sm font-medium"
                        placeholder="π.χ. Έκθεση Αθηνών"
                        autoFocus
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && trimmed && !isProcessing) onSave(trimmed);
                        }}
                    />
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-200 transition-colors">
                        Άκυρο
                    </button>
                    <button
                        type="button"
                        onClick={() => onSave(trimmed)}
                        disabled={isProcessing || !trimmed}
                        className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black transition-colors flex items-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />} Προσθήκη
                    </button>
                </div>
            </div>
        </div>
    );
}
