import { formatDecimal } from '../../utils/numberFormat';
import React, { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MapPin, Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { Mold, Product } from '../../types';
import { getAvailableMolds } from '../../features/products';
import { createMoldEntry } from '../../features/products/repository';
import { DetailsButton, DetailsIconButton, DetailsSection } from './detailsUi';

export interface MoldDraft {
    open: boolean;
    search: string;
    code: string;
    location: string;
    description: string;
}

export const EMPTY_MOLD_DRAFT: MoldDraft = { open: false, search: '', code: 'L', location: '', description: '' };

const draftInputClass = 'w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none transition-all placeholder-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/15';

export default function MoldsSection({
    product,
    setProduct,
    allMolds,
    draft,
    setDraft,
    isCreating,
    setIsCreating,
    showToast,
}: {
    product: Product;
    setProduct: React.Dispatch<React.SetStateAction<Product>>;
    allMolds: Mold[];
    draft: MoldDraft;
    setDraft: React.Dispatch<React.SetStateAction<MoldDraft>>;
    isCreating: boolean;
    setIsCreating: (value: boolean) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
    const queryClient = useQueryClient();
    const moldsByCode = useMemo(() => new Map(allMolds.map(m => [m.code, m])), [allMolds]);
    const availableMolds = useMemo(
        () => getAvailableMolds(allMolds, product.molds, draft.search),
        [allMolds, product.molds, draft.search],
    );
    const totalMoldWeight = product.molds.reduce((sum, pm) => sum + (moldsByCode.get(pm.code)?.weight_g || 0) * pm.quantity, 0);

    const addMold = (code: string) => {
        setProduct(prev => prev.molds.some(m => m.code === code) ? prev : { ...prev, molds: [...prev.molds, { code, quantity: 1 }] });
    };
    const setQuantity = (code: string, quantity: number) => {
        setProduct(prev => ({ ...prev, molds: prev.molds.map(m => m.code === code ? { ...m, quantity: Math.max(1, quantity) } : m) }));
    };
    const removeMold = (code: string) => {
        setProduct(prev => ({ ...prev, molds: prev.molds.filter(m => m.code !== code) }));
    };

    const handleQuickCreate = async () => {
        const code = draft.code.trim().toUpperCase();
        if (!code || code === 'L') {
            showToast('Ο Κωδικός είναι υποχρεωτικός.', 'error');
            return;
        }
        setIsCreating(true);
        try {
            await createMoldEntry({ code, location: draft.location.trim(), description: draft.description.trim(), weight_g: 0 });
            await queryClient.invalidateQueries({ queryKey: ['molds'] });
            addMold(code);
            setDraft(EMPTY_MOLD_DRAFT);
            showToast(`Το λάστιχο ${code} επιλέχθηκε!`, 'success');
        } catch {
            showToast('Σφάλμα δημιουργίας. Πιθανώς ο κωδικός υπάρχει ήδη.', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <DetailsSection
            tone="molds"
            icon={MapPin}
            title="Λάστιχα"
            subtitle={product.molds.length > 0 ? `Σύνολο βάρους λάστιχων: ${formatDecimal(totalMoldWeight, 2)} g` : undefined}
            actions={(
                <DetailsButton icon={draft.open ? X : Plus} pressed={draft.open} onClick={() => setDraft(prev => ({ ...prev, open: !prev.open }))}>
                    {draft.open ? 'Κλείσιμο' : 'Προσθήκη λάστιχου'}
                </DetailsButton>
            )}
        >
            {product.molds.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Κωδικός</th>
                                <th className="px-3 py-2 text-left">Περιγραφή</th>
                                <th className="hidden px-3 py-2 text-left md:table-cell">Θέση</th>
                                <th className="px-3 py-2 text-right">Βάρος</th>
                                <th className="px-3 py-2 text-center">Ποσότητα</th>
                                <th className="w-10 px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {product.molds.map(m => {
                                const details = moldsByCode.get(m.code);
                                return (
                                    <tr key={m.code} className="group hover:bg-amber-50/40">
                                        <td className="px-3 py-2 font-mono font-bold text-amber-800">{m.code}</td>
                                        <td className="max-w-[16rem] px-3 py-2 text-xs text-slate-600">
                                            <span className="line-clamp-2 whitespace-pre-wrap break-words">{details?.description?.trim() || <span className="italic text-slate-300">—</span>}</span>
                                        </td>
                                        <td className="hidden px-3 py-2 text-xs text-slate-500 md:table-cell">{details?.location || '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">{details?.weight_g ? `${formatDecimal(details.weight_g, 2)} g` : '—'}</td>
                                        <td className="px-3 py-2">
                                            <div className="mx-auto flex w-fit items-center rounded-lg border border-slate-200 bg-white">
                                                <button type="button" onClick={() => setQuantity(m.code, m.quantity - 1)} disabled={m.quantity <= 1} className="flex h-7 w-7 items-center justify-center rounded-l-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30" aria-label="Μείωση">
                                                    <Minus size={12} />
                                                </button>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={m.quantity}
                                                    onChange={(e) => setQuantity(m.code, parseInt(e.target.value) || 1)}
                                                    className="w-9 bg-transparent text-center text-xs font-bold text-slate-800 outline-none"
                                                />
                                                <button type="button" onClick={() => setQuantity(m.code, m.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label="Αύξηση">
                                                    <Plus size={12} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            <DetailsIconButton icon={Trash2} label={`Αφαίρεση ${m.code}`} variant="danger" onClick={() => removeMold(m.code)} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-slate-200 py-5 text-center text-sm italic text-slate-400">Δεν έχουν οριστεί λάστιχα.</div>
            )}

            {draft.open && (
                <div className="mt-3 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 animate-in fade-in lg:grid-cols-2">
                    <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Υπάρχον λάστιχο</div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="Αναζήτηση λάστιχου..."
                                value={draft.search}
                                onChange={e => setDraft(prev => ({ ...prev, search: e.target.value }))}
                                className={`${draftInputClass} pl-9`}
                                autoFocus
                            />
                        </div>
                        <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
                            {availableMolds.map(m => (
                                <button key={m.code} type="button" onClick={() => addMold(m.code)} className="group flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left text-sm transition-colors hover:bg-amber-50">
                                    <span className="font-mono font-bold text-slate-700 group-hover:text-amber-800">{m.code}</span>
                                    <span className="truncate text-xs text-slate-400 group-hover:text-amber-600">{m.description}</span>
                                </button>
                            ))}
                            {availableMolds.length === 0 && <div className="p-3 text-center text-xs text-slate-400">Δεν βρέθηκαν διαθέσιμα λάστιχα.</div>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
                            <Plus size={12} /> Νέο λάστιχο
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="text"
                                placeholder="Κωδικός *"
                                value={draft.code}
                                onChange={(e) => setDraft(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                className={`${draftInputClass} font-mono font-bold uppercase`}
                            />
                            <input
                                type="text"
                                placeholder="Τοποθεσία"
                                value={draft.location}
                                onChange={(e) => setDraft(prev => ({ ...prev, location: e.target.value }))}
                                className={draftInputClass}
                            />
                        </div>
                        <input
                            type="text"
                            placeholder="Περιγραφή"
                            value={draft.description}
                            onChange={(e) => setDraft(prev => ({ ...prev, description: e.target.value }))}
                            className={draftInputClass}
                        />
                        <DetailsButton
                            variant="primary"
                            size="md"
                            icon={isCreating ? Loader2 : Check}
                            onClick={handleQuickCreate}
                            disabled={isCreating}
                            className={`w-full ${isCreating ? '[&>svg]:animate-spin' : ''}`}
                        >
                            Δημιουργία & επιλογή
                        </DetailsButton>
                    </div>
                </div>
            )}
        </DetailsSection>
    );
}
