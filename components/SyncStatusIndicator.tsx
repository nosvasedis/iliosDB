import React from 'react';
import { RefreshCw, CloudOff, HardDrive } from 'lucide-react';

interface SyncStatusIndicatorProps {
    pendingItems: any[];
    isOnline: boolean;
    isSyncing: boolean;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ pendingItems, isOnline, isSyncing }) => {
    const pendingCount = pendingItems.length;
    if (pendingCount === 0 && !isSyncing && isOnline) return null;

    const translateMethod = (method: string) => {
        switch (method) {
            case 'INSERT': return 'ΕΙΣΑΓΩΓΗ';
            case 'UPDATE': return 'ΕΝΗΜΕΡΩΣΗ';
            case 'DELETE': return 'ΔΙΑΓΡΑΦΗ';
            case 'UPSERT': return 'ΕΝΗΜΕΡΩΣΗ';
            default: return method;
        }
    };

    const tooltipText = pendingItems.length > 0
        ? pendingItems.slice(0, 10).map((i: any) => `${translateMethod(i.method)}: ${i.table}`).join('\n') + (pendingCount > 10 ? `\n...και ${pendingCount - 10} ακόμα` : '')
        : '';

    return (
        <div title={tooltipText} className="fixed bottom-4 right-4 z-[250] flex flex-col gap-2 pointer-events-none animate-in slide-in-from-bottom-6 fade-in duration-500">
            <div className={`
                pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md min-w-[200px] transition-all
                ${isSyncing ? 'bg-blue-900/90 border-blue-500 text-white' :
                    (!isOnline ? 'bg-amber-900/90 border-amber-500 text-amber-50' : 'bg-slate-900/90 border-slate-600 text-white')}
            `}>
                <div className="relative">
                    {isSyncing ? (
                        <RefreshCw size={24} className="animate-spin text-blue-400" />
                    ) : (
                        !isOnline ? <CloudOff size={24} className="text-amber-400" /> : <HardDrive size={24} className="text-slate-400" />
                    )}
                    {pendingCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-slate-900">
                            {pendingCount}
                        </span>
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-wider opacity-70">
                        {isSyncing ? 'ΣΥΓΧΡΟΝΙΣΜΟΣ...' : (!isOnline ? 'ΕΚΤΟΣ ΣΥΝΔΕΣΗΣ' : 'ΕΚΚΡΕΜΕΙ ΣΥΓΧΡΟΝΙΣΜΟΣ')}
                    </span>
                    <span className="font-bold text-sm">
                        {pendingCount === 1 ? '1 αλλαγή σε αναμονή' : `${pendingCount} αλλαγές σε αναμονή`}
                    </span>
                </div>
            </div>
        </div>
    );
};
