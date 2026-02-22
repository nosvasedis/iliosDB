import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../lib/supabase';
import { X, Clock, User, Activity, Search, RefreshCw, Layers } from 'lucide-react';
import { AuditLog } from '../types';

interface Props {
    onClose: () => void;
}

export default function AuditLogsModal({ onClose }: Props) {
    const { data: logs, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['auditLogs'],
        queryFn: api.getAuditLogs
    });

    const [searchTerm, setSearchTerm] = useState('');
    const listParentRef = useRef<HTMLDivElement>(null);

    const filteredLogs = React.useMemo(() => {
        if (!logs) return [];
        if (!searchTerm) return logs;

        const lowerSearch = searchTerm.toLowerCase();
        return logs.filter(log =>
            log.action.toLowerCase().includes(lowerSearch) ||
            log.user_name.toLowerCase().includes(lowerSearch) ||
            (log.details && JSON.stringify(log.details).toLowerCase().includes(lowerSearch))
        );
    }, [logs, searchTerm]);

    const rowVirtualizer = useVirtualizer({
        count: filteredLogs.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 88,
        overscan: 5
    });

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                            <Clock size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Ιστορικό Ενεργειών</h3>
                            <p className="text-sm text-slate-500">Προβολή των πιο πρόσφατων ενεργειών (έως 200)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => refetch()} disabled={isRefetching} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors" title="Ανανέωση">
                            <RefreshCw size={20} className={isRefetching ? 'animate-spin text-indigo-500' : ''} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Αναζήτηση ανά χρήστη, ενέργεια ή λεπτομέρειες..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/20 text-slate-700 font-medium transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50 p-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                            <RefreshCw size={32} className="animate-spin text-indigo-400" />
                            <p className="font-bold">Φόρτωση ιστορικού...</p>
                        </div>
                    ) : isError ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-600 gap-3 p-6">
                            <p className="font-bold">Σφάλμα φόρτωσης ιστορικού.</p>
                            <p className="text-sm font-mono bg-red-50 p-2 rounded">{(error as Error)?.message}</p>
                            <button onClick={() => refetch()} className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors">
                                Ανανέωση
                            </button>
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                            <Layers size={48} className="text-slate-300" />
                            <p className="font-bold text-lg">Δεν βρέθηκαν εγγραφές</p>
                            {searchTerm && <p className="text-sm text-slate-500">Δοκιμάστε άλλον όρο αναζήτησης</p>}
                        </div>
                    ) : (
                        <div ref={listParentRef} className="flex-1 overflow-y-auto min-h-0">
                            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const log = filteredLogs[virtualRow.index];
                                    return (
                                        <div
                                            key={log.id}
                                            className="absolute top-0 left-0 w-full pr-2 pb-3"
                                            style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                                        >
                                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-md transition-shadow h-full">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-bold text-slate-800 text-base">{log.action}</span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
                                                        <span className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md text-slate-700">
                                                            <User size={14} /> {log.user_name}
                                                        </span>
                                                        <span className="flex items-center gap-1.5 text-slate-500">
                                                            <Clock size={14} /> {new Date(log.created_at).toLocaleString('el-GR')}
                                                        </span>
                                                    </div>
                                                </div>
                                                {log.details && Object.keys(log.details).length > 0 && (
                                                    <div className="sm:w-1/3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs overflow-x-auto">
                                                        <div className="font-mono text-slate-600 max-h-24 overflow-y-auto">
                                                            {Object.entries(log.details).map(([key, value]) => (
                                                                <div key={key} className="flex gap-2 mb-1 last:mb-0">
                                                                    <span className="font-bold text-slate-500">{key}:</span>
                                                                    <span className="text-slate-800 break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
