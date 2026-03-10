
import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Database, Image as ImageIcon, Settings, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { BackupProgress, BackupProgressPhase } from '../lib/backupConfig';

interface BackupProgressModalProps {
    isOpen: boolean;
    title: string;
    progress: BackupProgress | null;
    isComplete: boolean;
    summary?: string;
    errors?: Array<{ table: string; message: string }>;
    onClose: () => void;
}

const PHASE_LABELS: Record<BackupProgressPhase, { label: string; icon: React.ReactNode }> = {
    tables:     { label: 'Πίνακες Δεδομένων',     icon: <Database size={16} /> },
    images:     { label: 'Εικόνες Προϊόντων',      icon: <ImageIcon size={16} /> },
    config:     { label: 'Ρυθμίσεις Σύνδεσης',     icon: <Settings size={16} /> },
    sync_queue: { label: 'Ουρά Συγχρονισμού',      icon: <RefreshCw size={16} /> },
    validation: { label: 'Επαλήθευση',             icon: <Shield size={16} /> },
    cleanup:    { label: 'Εκκαθάριση',             icon: <Trash2 size={16} /> },
};

export default function BackupProgressModal({ isOpen, title, progress, isComplete, summary, errors, onClose }: BackupProgressModalProps) {
    const [elapsed, setElapsed] = useState(0);
    const [startTime] = useState(Date.now());

    useEffect(() => {
        if (!isOpen || isComplete) return;
        const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
        return () => clearInterval(interval);
    }, [isOpen, isComplete, startTime]);

    if (!isOpen) return null;

    const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    const phaseInfo = progress ? PHASE_LABELS[progress.phase] : null;
    const hasErrors = errors && errors.length > 0;

    const formatElapsed = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return mins > 0 ? `${mins}λ ${secs}δ` : `${secs}δ`;
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="p-6 pb-4">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        {isComplete
                            ? (hasErrors ? <AlertTriangle size={20} className="text-amber-500" /> : <CheckCircle2 size={20} className="text-emerald-500" />)
                            : <Loader2 size={20} className="animate-spin text-blue-500" />
                        }
                        {title}
                    </h2>
                </div>

                {/* Progress body */}
                <div className="px-6 pb-6 space-y-4">
                    {!isComplete && progress && (
                        <>
                            {/* Phase indicator */}
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                {phaseInfo?.icon}
                                <span className="font-bold">{phaseInfo?.label}</span>
                            </div>

                            {/* Message */}
                            <p className="text-sm text-slate-600 font-medium">{progress.message}</p>

                            {/* Progress bar */}
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>

                            {/* Stats row */}
                            <div className="flex justify-between text-xs text-slate-400 font-bold">
                                <span>{progress.current} / {progress.total}</span>
                                <span>{formatElapsed(elapsed)}</span>
                            </div>
                        </>
                    )}

                    {isComplete && (
                        <>
                            {summary && (
                                <div className={`p-4 rounded-2xl text-sm font-medium ${hasErrors ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                                    {summary}
                                </div>
                            )}
                            {hasErrors && (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {errors!.map((e, i) => (
                                        <div key={i} className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">
                                            <span className="font-bold">{e.table}:</span> {e.message}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                className="w-full mt-2 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-black transition-colors text-sm"
                            >
                                Κλείσιμο
                            </button>
                        </>
                    )}

                    {!isComplete && (
                        <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-wider">
                            Παρακαλώ μην κλείσετε τον browser
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
