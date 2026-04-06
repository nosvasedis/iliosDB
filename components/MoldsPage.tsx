import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Mold } from '../types';
import { Trash2, Plus, MapPin, Loader2, Search, X, Check, MoreHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import DesktopPageHeader from './DesktopPageHeader';

// -- MOLD CARD COMPONENT --
interface MoldCardProps {
    mold: Mold;
    onSaveRow: (m: Mold) => Promise<void>;
    onDelete: (code: string) => Promise<void>;
}

const MoldCard: React.FC<MoldCardProps> = ({ mold, onSaveRow, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Mold>(mold);

    useEffect(() => {
        if (!isEditing) setEditForm(mold);
    }, [mold, isEditing]);

    const handleSave = () => {
        onSaveRow(editForm);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditForm(mold);
        setIsEditing(false);
    };

    return (
        <div className={`
            bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between
            ${isEditing ? 'border-amber-400 shadow-lg ring-4 ring-amber-500/10 z-10' : 'border-slate-100 hover:border-slate-300 hover:shadow-md'}
        `}>
            <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 w-full">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-600">
                            <MapPin size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-800 text-sm break-words leading-tight font-mono">{mold.code}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                {isEditing ? (
                                    <input
                                        className="text-xs text-slate-500 border-b border-slate-200 outline-none w-full"
                                        value={editForm.description || ''}
                                        onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                        placeholder="Περιγραφή..."
                                    />
                                ) : (
                                    <span className="text-xs text-slate-500 truncate block">
                                        {mold.description || 'Καμία περιγραφή'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {!isEditing && (
                        <button onClick={() => setIsEditing(true)} className="text-slate-300 hover:text-slate-600 p-1 shrink-0">
                            <MoreHorizontal size={18} />
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Τοποθεσια</div>
                        <div className="flex items-center gap-1">
                            {isEditing ? (
                                <input
                                    className="w-full bg-white border border-slate-300 rounded px-1 text-sm font-bold outline-none"
                                    value={editForm.location}
                                    onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                                />
                            ) : (
                                <span className="text-sm font-bold text-slate-700 truncate">{mold.location || '-'}</span>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Βαρος (g)</div>
                        <div className="flex items-center gap-1">
                            {isEditing ? (
                                <input
                                    type="number" step="0.01"
                                    className="w-full bg-white border border-slate-300 rounded px-1 text-sm font-mono font-bold outline-none"
                                    value={editForm.weight_g || 0}
                                    onChange={e => setEditForm({ ...editForm, weight_g: parseFloat(e.target.value) || 0 })}
                                />
                            ) : (
                                <span className="text-sm font-mono font-bold text-slate-700">{mold.weight_g || 0}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isEditing && (
                <div className="p-3 border-t border-slate-50 bg-slate-50/50 rounded-b-2xl flex justify-between items-center gap-2">
                    <button onClick={handleCancel} className="flex-1 py-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"><X size={14} className="mx-auto" /></button>
                    <button onClick={handleSave} className="flex-[2] py-1.5 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-black flex items-center justify-center gap-2"><Check size={14} /> Αποθήκευση</button>
                    <button onClick={() => onDelete(mold.code)} className="p-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 border border-red-100"><Trash2 size={14} /></button>
                </div>
            )}
        </div>
    );
};


export default function MoldsPage() {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: molds, isLoading } = useQuery<Mold[]>({ queryKey: ['molds'], queryFn: api.getMolds });

    const [searchTerm, setSearchTerm] = useState('');

    // Modals / FAB
    const [isCreating, setIsCreating] = useState(false);
    const [newMold, setNewMold] = useState<Mold>({ code: 'L', location: '', description: '', weight_g: 0 });
    const [showFab, setShowFab] = useState(false);
    const headerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scrollContainer = document.querySelector('main > div.overflow-y-auto');
        if (!scrollContainer) return;
        const handleScroll = () => {
            if (headerRef.current) {
                const headerBottomPosition = headerRef.current.getBoundingClientRect().bottom;
                setShowFab(headerBottomPosition < 20);
            }
        };
        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    const filteredMolds = useMemo(() => {
        if (!molds) return [];
        return molds
            .filter(m => m.code.toUpperCase().includes(searchTerm.toUpperCase()) || m.description.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
    }, [molds, searchTerm]);

    const handleCreate = async () => {
        if (!newMold.code || newMold.code === 'L') {
            showToast("Ο Κωδικός είναι υποχρεωτικός και πρέπει να είναι συμπληρωμένος.", 'error');
            return;
        }

        try {
            const { error } = await supabase.from('molds').insert(newMold);
            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['molds'] });
            setNewMold({ code: 'L', location: '', description: '', weight_g: 0 });
            setIsCreating(false);
            showToast("Το λάστιχο προστέθηκε.", 'success');
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα. Πιθανώς ο κωδικός υπάρχει ήδη.", 'error');
        }
    };

    const handleDelete = async (code: string) => {
        const yes = await confirm({
            title: 'Διαγραφή Λάστιχου',
            message: `Είστε σίγουροι ότι θέλετε να διαγράψετε το λάστιχο ${code};`,
            isDestructive: true,
            confirmText: 'Διαγραφή'
        });
        if (!yes) return;

        try {
            const { error } = await supabase.from('molds').delete().eq('code', code);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['molds'] });
            showToast("Διαγράφηκε.", 'info');
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα κατά τη διαγραφή.", 'error');
        }
    };

    const handleSaveRow = async (moldToSave: Mold) => {
        try {
            const { error } = await supabase.from('molds').update({
                location: moldToSave.location,
                description: moldToSave.description,
                weight_g: moldToSave.weight_g
            }).eq('code', moldToSave.code);

            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['molds'] });
            showToast(`Το λάστιχο ${moldToSave.code} αποθηκεύτηκε.`, 'success');
        } catch (e) {
            console.error("Error saving mold:", e);
            showToast("Σφάλμα αποθήκευσης.", 'error');
        }
    };

    if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-amber-500" size={32} /></div>;

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* HEADER */}
            <DesktopPageHeader
                ref={headerRef}
                icon={MapPin}
                title="Διαχείριση Λάστιχων"
                subtitle="Οργάνωση καλουπιών παραγωγής."
                tail={(
                    <div className="text-right">
                        <div className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Συνολο Λαστιχων</div>
                        <div className="text-2xl font-black text-amber-600">{molds?.length || 0}</div>
                    </div>
                )}
            />

            {/* CONTROLS */}
            <div className="flex items-center justify-between shrink-0 px-2">
                <div className="bg-white border border-slate-200 p-1 rounded-xl flex items-center shadow-sm w-full md:w-80">
                    <Search size={16} className="ml-3 text-slate-400" />
                    <input
                        placeholder="Αναζήτηση με κωδικό ή περιγραφή..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-transparent p-2 pl-2 text-sm font-bold outline-none text-slate-700"
                    />
                    {searchTerm && <button onClick={() => setSearchTerm('')} className="mr-2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
                </div>

                <button
                    onClick={() => setIsCreating(true)}
                    className="bg-[#060b00] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-slate-800 transition-all hover:-translate-y-0.5"
                >
                    <Plus size={18} /> Νέο Λάστιχο
                </button>
            </div>

            {/* GRID */}
            <div className="flex-1 pr-2 pb-20">
                {filteredMolds.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredMolds.map(mold => (
                            <MoldCard
                                key={mold.code}
                                mold={mold}
                                onSaveRow={handleSaveRow}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <MapPin size={48} className="mb-4 opacity-20" />
                        <p className="font-bold">Δεν βρέθηκαν λάστιχα.</p>
                    </div>
                )}
            </div>

            {/* CREATE MODAL */}
            {isCreating && (
                <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 border border-slate-100">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-black text-slate-800">Νέο Λάστιχο</h3>
                            </div>
                            <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Κωδικός</label>
                                <input type="text" value={newMold.code} onChange={e => setNewMold({ ...newMold, code: e.target.value.toUpperCase() })} placeholder="π.χ. L12" className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 uppercase font-mono font-bold focus:ring-4 focus:ring-amber-500/20 outline-none transition-all" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Τοποθεσία</label>
                                    <input type="text" value={newMold.location} onChange={e => setNewMold({ ...newMold, location: e.target.value })} placeholder="Συρτάρι 1" className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-bold focus:ring-4 focus:ring-amber-500/20 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Βάρος (g)</label>
                                    <input type="number" step="0.01" value={newMold.weight_g || ''} onChange={e => setNewMold({ ...newMold, weight_g: parseFloat(e.target.value) || 0 })} placeholder="0.00" className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-mono font-bold focus:ring-4 focus:ring-amber-500/20 outline-none transition-all" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Περιγραφή</label>
                                <input type="text" value={newMold.description} onChange={e => setNewMold({ ...newMold, description: e.target.value })} placeholder="Περιγραφή καλουπιού..." className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 outline-none transition-all" />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setIsCreating(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                Άκυρο
                            </button>
                            <button onClick={handleCreate} className="flex-[2] bg-slate-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-black transition-colors shadow-lg flex items-center justify-center gap-2">
                                <Check size={16} /> Προσθήκη
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* FLOATING ACTION BUTTON */}
            <div className={`fixed bottom-8 right-8 z-[100] transition-all duration-300 ${showFab ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center justify-center gap-3 bg-[#060b00] text-white rounded-full font-bold shadow-2xl hover:bg-black transition-all duration-200 ease-in-out transform hover:-translate-y-1 hover:scale-105 h-16 w-16 sm:w-auto sm:h-auto sm:px-6 sm:py-4"
                >
                    <Plus size={24} /> <span className="hidden sm:inline whitespace-nowrap">Νέο Λάστιχο</span>
                </button>
            </div>
        </div>
    );
}
