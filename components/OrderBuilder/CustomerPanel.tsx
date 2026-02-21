import React from 'react';
import { User, Tag, Plus, X, Percent, Check } from 'lucide-react';
import { VatRegime } from '../../types';
import { useOrderState } from '../../hooks/useOrderState';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
}

export const CustomerPanel: React.FC<Props> = ({ orderState }) => {
    const { state, setters, actions } = orderState;

    return (
        <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm overflow-y-auto custom-scrollbar h-full">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-50 pb-2">
                <User size={16} /> Στοιχεία Πελάτη
            </h3>

            <div className="space-y-4">
                {/* Customer Name with Autocomplete */}
                <div className="relative">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ονοματεπώνυμο</label>
                    <input
                        className={`w-full p-3 bg-slate-50 border rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 transition-all ${state.selectedCustomerId ? 'border-emerald-300 ring-2 ring-emerald-50' : 'border-slate-200'}`}
                        placeholder="Αναζήτηση..."
                        value={state.customerName}
                        onChange={e => {
                            setters.setCustomerName(e.target.value);
                            setters.setCustomerSearch(e.target.value);
                            setters.setShowCustomerResults(true);
                            if (!e.target.value) setters.setSelectedCustomerId(null);
                        }}
                        onFocus={() => setters.setShowCustomerResults(true)}
                    />
                    {state.selectedCustomerId && <Check size={16} className="absolute right-3 top-9 text-emerald-500" />}

                    {state.showCustomerResults && state.customerSearch && !state.selectedCustomerId && state.filteredCustomers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                            {state.filteredCustomers.map(c => (
                                <div key={c.id} onClick={() => actions.handleSelectCustomer(c)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 font-medium text-sm text-slate-700">
                                    {c.full_name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Phone */}
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Τηλέφωνο</label>
                    <input
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="-"
                        value={state.customerPhone}
                        onChange={e => setters.setCustomerPhone(e.target.value)}
                    />
                </div>

                {/* Tags */}
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Tag size={12} /> Ετικέτες / Ομάδα</label>
                    <div className="flex gap-2 mb-2">
                        <input
                            className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                            placeholder="π.χ. Έκθεση A..."
                            value={state.tagInput}
                            onChange={e => setters.setTagInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && actions.handleAddTag()}
                        />
                        <button onClick={actions.handleAddTag} className="bg-slate-200 text-slate-600 p-2 rounded-lg hover:bg-slate-300"><Plus size={16} /></button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {state.tags.map(t => (
                            <span key={t} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1 font-bold">
                                {t} <button onClick={() => actions.removeTag(t)} className="hover:text-red-500"><X size={10} /></button>
                            </span>
                        ))}
                    </div>
                </div>

                {/* Discount & VAT */}
                <div className="pt-4 border-t border-slate-50 space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Έκπτωση (%)</label>
                        <div className="relative">
                            <input
                                type="number" min="0" max="100"
                                value={state.discountPercent}
                                onChange={e => setters.setDiscountPercent(parseFloat(e.target.value) || 0)}
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-amber-900 pr-8"
                            />
                            <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Καθεστώς ΦΠΑ</label>
                        <select
                            value={state.vatRate}
                            onChange={e => setters.setVatRate(parseFloat(e.target.value))}
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 cursor-pointer"
                        >
                            <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                            <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                            <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                        </select>
                    </div>
                </div>

                {/* Notes */}
                <div className="pt-4 border-t border-slate-50">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Σημειώσεις Παραγγελίας</label>
                    <textarea
                        value={state.orderNotes}
                        onChange={e => setters.setOrderNotes(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm h-32 resize-none outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="Ειδικές οδηγίες..."
                    />
                </div>
            </div>
        </div>
    );
};
