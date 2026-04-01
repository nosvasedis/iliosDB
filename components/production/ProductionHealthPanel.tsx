import React, { useMemo, useState } from 'react';
import { Activity, Bell, CheckCircle, ClipboardList, PauseCircle, Siren, X } from 'lucide-react';
import { ProductionAlertGroup } from './productionAlerts';
import ProductionAlertsModal from './ProductionAlertsModal';
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
    alertGroups: ProductionAlertGroup[];
    onFilterClick: (type: ProductionHealthFilter) => void;
};

const NOTE_COLORS = [
    'bg-blue-50 border-blue-100 text-blue-800',
    'bg-purple-50 border-purple-100 text-purple-800',
    'bg-rose-50 border-rose-100 text-rose-800',
    'bg-amber-50 border-amber-100 text-amber-800',
    'bg-teal-50 border-teal-100 text-teal-800',
];

export default function ProductionHealthPanel({ summary, notes, alertGroups, onFilterClick }: Props) {
    const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
    const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);

    const alertCount = useMemo(
        () => alertGroups.reduce((sum, group) => sum + group.itemCount, 0),
        [alertGroups]
    );

    return (
        <>
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 mb-2">
                <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-black border-4 shadow-inner ${summary.healthScore > 80 ? 'border-emerald-100 text-emerald-600 bg-emerald-50' : (summary.healthScore > 50 ? 'border-amber-100 text-amber-600 bg-amber-50' : 'border-red-100 text-red-600 bg-red-50')}`}>
                            {summary.healthScore.toFixed(0)}%
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Υγεία Παραγωγής</h3>
                            <p className="text-xs text-slate-500">Βάσει χρονικών ορίων</p>
                        </div>
                    </div>

                    <div className="flex gap-4 w-full md:w-auto overflow-x-auto pb-4 md:pb-0 items-start">
                        <div className="flex items-start gap-3 shrink-0">
                            <button
                                onClick={() => setIsAlertsModalOpen(true)}
                                title="Άνοιγμα ειδοποιήσεων παραγωγής"
                                aria-label="Άνοιγμα ειδοποιήσεων παραγωγής"
                                className={`relative mt-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition-all ${alertCount > 0 ? 'border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50/40' : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-white hover:border-slate-300'}`}
                            >
                                <Bell size={16} />
                                {alertCount > 0 && (
                                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 px-1.5 flex items-center justify-center text-[10px] font-black text-white shadow-sm">
                                        {alertCount > 9 ? '9+' : alertCount}
                                    </span>
                                )}
                            </button>

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
                        </div>

                        <button onClick={() => onFilterClick('onHold')} className="bg-amber-50 px-5 py-3 rounded-2xl border border-amber-100 min-w-[120px] h-[100px] flex flex-col justify-center hover:bg-amber-100 transition-all text-left">
                            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-1"><PauseCircle size={12} /> Σε Αναμονή</div>
                            <div className="text-2xl font-black text-amber-700">{summary.onHold}</div>
                        </button>
                        <button onClick={() => onFilterClick('active')} className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100 min-w-[120px] h-[100px] flex flex-col justify-center hover:bg-slate-100 transition-all text-left">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Activity size={12} /> Ενεργά</div>
                            <div className="text-2xl font-black text-slate-800">{summary.inProgress}</div>
                        </button>
                        <button onClick={() => onFilterClick('delayed')} className={`px-5 py-3 rounded-2xl border min-w-[120px] h-[100px] flex flex-col justify-center transition-all text-left ${summary.delayed > 0 ? 'bg-red-50 border-red-100 hover:bg-red-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                            <div className={`text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${summary.delayed > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                <Siren size={12} className={summary.delayed > 0 ? 'animate-pulse' : ''} /> Καθυστέρηση
                            </div>
                            <div className={`text-2xl font-black ${summary.delayed > 0 ? 'text-red-600' : 'text-slate-800'}`}>{summary.delayed}</div>
                        </button>
                        <button onClick={() => onFilterClick('ready')} className="bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100 min-w-[120px] h-[100px] flex flex-col justify-center hover:bg-emerald-100 transition-all text-left">
                            <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle size={12} /> Έτοιμα</div>
                            <div className="text-2xl font-black text-emerald-700">{summary.ready}</div>
                        </button>
                    </div>
                </div>
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

            <ProductionAlertsModal
                isOpen={isAlertsModalOpen}
                onClose={() => setIsAlertsModalOpen(false)}
                groups={alertGroups}
            />
        </>
    );
}
