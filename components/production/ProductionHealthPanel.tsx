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

export default function ProductionHealthPanel({ summary, notes, onFilterClick }: Props) {
    const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

    return (
        <>
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
                {/* Health score circle + title */}
                <div className="flex items-center gap-3 shrink-0 min-w-0">
                    <div className={`w-16 h-16 shrink-0 rounded-full flex items-center justify-center text-xl font-black border-4 shadow-inner ${summary.healthScore > 80 ? 'border-emerald-100 text-emerald-600 bg-emerald-50' : (summary.healthScore > 50 ? 'border-amber-100 text-amber-600 bg-amber-50' : 'border-red-100 text-red-600 bg-red-50')}`}>
                        {summary.healthScore.toFixed(0)}%
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 md:whitespace-nowrap">Υγεία Παραγωγής</h3>
                        <p className="text-xs text-slate-500 md:whitespace-nowrap">Βάσει χρονικών ορίων</p>
                    </div>
                </div>

                {/* Οδηγίες Παραγωγής preview box */}
                {notes.length > 0 && (
                    <button
                        onClick={() => setIsNotesModalOpen(true)}
                        className="flex flex-col w-80 h-[100px] bg-white rounded-2xl border-2 border-indigo-100 overflow-hidden shrink-0 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/20 transition-colors text-left"
                        title="Άνοιγμα όλων των οδηγιών παραγωγής"
                    >
                        <div className="bg-indigo-50 px-3 py-1.5 border-b border-indigo-100 flex justify-between items-center shrink-0">
                            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1">
                                <ClipboardList size={10} /> Οδηγίες Παραγωγής
                            </span>
                            <span className="bg-white text-indigo-600 px-1.5 rounded text-[9px] font-bold shadow-sm">{notes.length}</span>
                        </div>
                        <div className="overflow-y-auto p-2 space-y-1.5 custom-scrollbar bg-white">
                            {notes.map((note, index) => (
                                <div key={note.id} className={`p-2 rounded-lg border text-[10px] leading-tight ${NOTE_COLORS[index % NOTE_COLORS.length]}`}>
                                    <div className="flex justify-between font-bold mb-0.5 opacity-90 border-b border-black/5 pb-0.5">
                                        <span>{index + 1}. {note.customer}</span>
                                        <span className="font-mono opacity-70">#{formatOrderId(note.id)}</span>
                                    </div>
                                    <div className="font-medium italic opacity-90">"{note.note}"</div>
                                </div>
                            ))}
                        </div>
                    </button>
                )}

                {/* Stat boxes */}
                <button onClick={() => onFilterClick('onHold')} className="bg-amber-50 px-4 py-3 rounded-2xl border border-amber-100 min-w-[128px] shrink-0 h-[100px] flex flex-col justify-center hover:bg-amber-100 transition-all text-left">
                    <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wide mb-1 flex items-center gap-1 whitespace-nowrap"><PauseCircle size={12} className="shrink-0" /> Σε Αναμονή</div>
                    <div className="text-2xl font-black text-amber-700">{summary.onHold}</div>
                </button>
                <button onClick={() => onFilterClick('active')} className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 min-w-[128px] shrink-0 h-[100px] flex flex-col justify-center hover:bg-slate-100 transition-all text-left">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1 whitespace-nowrap"><Activity size={12} className="shrink-0" /> Ενεργά</div>
                    <div className="text-2xl font-black text-slate-800">{summary.inProgress}</div>
                </button>
                <button onClick={() => onFilterClick('delayed')} className={`px-4 py-3 rounded-2xl border min-w-[128px] shrink-0 h-[100px] flex flex-col justify-center transition-all text-left ${summary.delayed > 0 ? 'bg-red-50 border-red-100 hover:bg-red-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                    <div className={`text-[11px] font-bold uppercase tracking-wide mb-1 flex items-center gap-1 whitespace-nowrap ${summary.delayed > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        <Siren size={12} className={`shrink-0 ${summary.delayed > 0 ? 'animate-pulse' : ''}`} /> Καθυστέρηση
                    </div>
                    <div className={`text-2xl font-black ${summary.delayed > 0 ? 'text-red-600' : 'text-slate-800'}`}>{summary.delayed}</div>
                </button>
                <button onClick={() => onFilterClick('ready')} className="bg-emerald-50 px-4 py-3 rounded-2xl border border-emerald-100 min-w-[128px] shrink-0 h-[100px] flex flex-col justify-center hover:bg-emerald-100 transition-all text-left">
                    <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide mb-1 flex items-center gap-1 whitespace-nowrap"><CheckCircle size={12} className="shrink-0" /> Έτοιμα</div>
                    <div className="text-2xl font-black text-emerald-700">{summary.ready}</div>
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
