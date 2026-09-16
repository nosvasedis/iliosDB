import React, { useState } from 'react';
import { Activity, CheckCircle, ClipboardList, PauseCircle, Siren, X } from 'lucide-react';
import { formatOrderId } from '../../utils/orderUtils';

export type ProductionHealthFilter = 'active' | 'delayed' | 'onHold' | 'ready';

export interface ProductionInstructionNote {
    id: string;
    customer: string;
    note: string;
}

export interface ProductionHealthSummary {
    healthScore: number;
    delayed: number;
    onHold: number;
    inProgress: number;
    ready: number;
}

type Props = {
    summary: ProductionHealthSummary;
    notes: ProductionInstructionNote[];
    onFilterClick: (type: ProductionHealthFilter) => void;
};

const NOTE_COLORS = [
    'bg-blue-50 border-blue-100 text-blue-800',
    'bg-purple-50 border-purple-100 text-purple-800',
    'bg-rose-50 border-rose-100 text-rose-800',
    'bg-amber-50 border-amber-100 text-amber-800',
    'bg-teal-50 border-teal-100 text-teal-800',
];

function healthTone(score: number) {
    if (score > 80) return {
        box: 'bg-emerald-50 border-emerald-100',
        ring: 'border-emerald-200 text-emerald-600',
    };
    if (score > 50) return {
        box: 'bg-amber-50 border-amber-100',
        ring: 'border-amber-200 text-amber-600',
    };
    return {
        box: 'bg-red-50 border-red-100',
        ring: 'border-red-200 text-red-600',
    };
}

export default function ProductionHealthPanel({ summary, notes, onFilterClick }: Props) {
    const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
    const tone = healthTone(summary.healthScore);

    return (
        <>
            <div className="flex flex-wrap items-center justify-center gap-2">
                <div className={`flex h-10 items-center gap-2 rounded-xl border px-2.5 shrink-0 ${tone.box}`}>
                    <div className={`flex h-7 min-w-7 items-center justify-center rounded-full border-2 bg-white px-0.5 text-[10px] font-black tabular-nums shadow-inner ${tone.ring}`}>
                        {summary.healthScore.toFixed(0)}%
                    </div>
                    <div className="leading-tight">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Υγεία Παραγωγής</div>
                        <div className="text-[9px] font-medium text-slate-400">Βάσει χρον. ορίων</div>
                    </div>
                </div>

                {notes.length > 0 && (
                    <button
                        onClick={() => setIsNotesModalOpen(true)}
                        className="flex h-10 items-center gap-2 rounded-xl border-2 border-indigo-100 bg-white px-3 shrink-0 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                        title="Άνοιγμα όλων των οδηγιών παραγωγής"
                    >
                        <ClipboardList size={13} className="text-indigo-600 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Οδηγίες</span>
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-indigo-600">{notes.length}</span>
                    </button>
                )}

                <button
                    onClick={() => onFilterClick('onHold')}
                    className="flex h-10 items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 shrink-0 hover:bg-amber-100 transition-colors"
                >
                    <PauseCircle size={13} className="shrink-0 text-amber-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 whitespace-nowrap">Σε Αναμονή</span>
                    <span className="text-base font-black tabular-nums text-amber-700">{summary.onHold}</span>
                </button>
                <button
                    onClick={() => onFilterClick('active')}
                    className="flex h-10 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 shrink-0 hover:bg-slate-100 transition-colors"
                >
                    <Activity size={13} className="shrink-0 text-slate-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">Ενεργά</span>
                    <span className="text-base font-black tabular-nums text-slate-800">{summary.inProgress}</span>
                </button>
                <button
                    onClick={() => onFilterClick('delayed')}
                    className={`flex h-10 items-center gap-2 rounded-xl border px-3 shrink-0 transition-colors ${
                        summary.delayed > 0
                            ? 'border-red-100 bg-red-50 hover:bg-red-100'
                            : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                    }`}
                >
                    <Siren size={13} className={`shrink-0 ${summary.delayed > 0 ? 'animate-pulse text-red-500' : 'text-slate-400'}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${summary.delayed > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        Καθυστέρηση
                    </span>
                    <span className={`text-base font-black tabular-nums ${summary.delayed > 0 ? 'text-red-600' : 'text-slate-800'}`}>{summary.delayed}</span>
                </button>
                <button
                    onClick={() => onFilterClick('ready')}
                    className="flex h-10 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 shrink-0 hover:bg-emerald-100 transition-colors"
                >
                    <CheckCircle size={13} className="shrink-0 text-emerald-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 whitespace-nowrap">Έτοιμα</span>
                    <span className="text-base font-black tabular-nums text-emerald-700">{summary.ready}</span>
                </button>
            </div>

            {isNotesModalOpen && (
                <div className="fixed inset-0 z-[230] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsNotesModalOpen(false)}>
                    <div className="bg-white w-full max-w-4xl max-h-[86vh] rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <ClipboardList size={18} className="text-indigo-600" /> Όλες οι Οδηγίες Παραγωγής
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Σημειώσεις κύριας εντολής για όλες τις εντολές που είναι σε παραγωγή.</p>
                            </div>
                            <button onClick={() => setIsNotesModalOpen(false)} className="p-2 rounded-full text-slate-400 hover:bg-slate-200 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40 custom-scrollbar space-y-3">
                            {notes.map((note, index) => (
                                <div key={note.id} className={`p-3 rounded-xl border ${NOTE_COLORS[index % NOTE_COLORS.length]}`}>
                                    <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-1.5 mb-2">
                                        <span className="font-black text-sm">{note.customer}</span>
                                        <span className="text-xs font-mono font-bold opacity-80">#{formatOrderId(note.id)}</span>
                                    </div>
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-medium italic">"{note.note}"</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            </>
    );
}
