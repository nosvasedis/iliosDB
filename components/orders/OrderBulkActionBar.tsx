import React from 'react';
import ReactDOM from 'react-dom';
import { Archive, ArchiveRestore, Ban, Loader2, Printer, Tag, UserCheck, X } from 'lucide-react';

export function OrderBulkActionBar({
    count,
    isProcessing,
    progressPercent = 0,
    archiveMode,
    canCancel,
    onArchive,
    onPrint,
    onTag,
    onSeller,
    onCancel,
    onClear,
}: {
    count: number;
    isProcessing: boolean;
    progressPercent?: number;
    archiveMode: 'archive' | 'restore';
    canCancel: boolean;
    onArchive: () => void;
    onPrint: () => void;
    onTag: () => void;
    onSeller: () => void;
    onCancel: () => void;
    onClear: () => void;
}) {
    if (count <= 0 && !isProcessing) return null;

    const visibleProgress = isProcessing ? Math.max(12, progressPercent) : 0;
    const ArchiveIcon = archiveMode === 'restore' ? ArchiveRestore : Archive;
    const archiveLabel = archiveMode === 'restore' ? 'Ανάκτηση' : 'Αρχειοθέτηση';

    return ReactDOM.createPortal(
        <div className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] inset-x-0 flex justify-center z-[300] pointer-events-none px-4">
            <div className="relative overflow-hidden bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl px-4 py-3 flex flex-wrap items-center gap-3 pointer-events-auto animate-in slide-in-from-bottom-4 duration-200 border border-white/10 max-w-2xl w-full">
                {isProcessing && (
                    <div
                        className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 transition-[width] duration-300"
                        style={{ width: `${visibleProgress}%` }}
                    />
                )}
                <div className="flex items-center gap-2 shrink-0">
                    <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-xs font-black shadow-lg shadow-blue-500/40">
                        {count}
                    </div>
                    <span className="text-sm font-bold text-white/70 whitespace-nowrap">
                        {isProcessing ? 'Επεξεργασία…' : 'επιλεγμένες παραγγελίες'}
                    </span>
                </div>
                <div className="w-px h-6 bg-white/20 shrink-0 hidden sm:block" />
                <button
                    type="button"
                    onClick={onArchive}
                    disabled={isProcessing || count === 0}
                    className="shrink-0 px-4 py-1.5 bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 text-white rounded-xl text-sm font-black transition-all flex items-center gap-1.5 active:scale-95 shadow-lg shadow-blue-500/30"
                >
                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <ArchiveIcon size={14} />}
                    {archiveLabel}
                </button>
                <button
                    type="button"
                    onClick={onPrint}
                    disabled={isProcessing || count === 0}
                    className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Εκτύπωση παραγγελιών"
                >
                    <Printer size={16} />
                </button>
                <button
                    type="button"
                    onClick={onTag}
                    disabled={isProcessing || count === 0}
                    className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Προσθήκη ετικέτας"
                >
                    <Tag size={16} />
                </button>
                <button
                    type="button"
                    onClick={onSeller}
                    disabled={isProcessing || count === 0}
                    className="shrink-0 p-1.5 hover:bg-sky-500/20 rounded-lg text-sky-300 hover:text-sky-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Ανάθεση πλασιέ"
                >
                    <UserCheck size={16} />
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isProcessing || !canCancel}
                    className="shrink-0 p-1.5 hover:bg-orange-500/20 rounded-lg text-orange-400 hover:text-orange-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={canCancel ? 'Ακύρωση παραγγελιών' : 'Δεν γίνεται ακύρωση σε παραδοθείσες ή ήδη ακυρωμένες'}
                >
                    <Ban size={16} />
                </button>
                <button
                    type="button"
                    onClick={onClear}
                    disabled={isProcessing}
                    className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
                    title="Αποεπιλογή όλων"
                >
                    <X size={16} />
                </button>
            </div>
        </div>,
        document.body,
    );
}
