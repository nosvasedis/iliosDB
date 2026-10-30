import RetailClientField from '../orders/RetailClientField';
import React from 'react';
import { User, Tag, Plus, X, Percent, Check, Store, Warehouse, Phone, Receipt, StickyNote, Search } from 'lucide-react';
import InternalOrderNotice from '../orders/InternalOrderNotice';
import { VatRegime } from '../../types';
import { useOrderState } from '../../hooks/useOrderState';
import { getTagColor } from '../../features/orders/tagColors';
import { useTagColorOverrides } from '../../hooks/api/useTagColorOverrides';
import { SellerPicker } from './SellerPicker';
import OrderTerritoryAlert from '../customers/OrderTerritoryAlert';
import OrderPriceModeToggle from './OrderPriceModeToggle';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
}

const fieldLabel = 'text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block';
const fieldInput = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm text-slate-800 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 transition-all';

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <h3 className="font-black text-slate-700 flex items-center gap-1.5 uppercase text-[11px] tracking-wider mb-3">
            <span className="text-slate-400">{icon}</span> {children}
        </h3>
    );
}

export const CustomerPanel: React.FC<Props> = ({ orderState }) => {
    const { state, setters, actions } = orderState;
    const { overrides: tagColorOverrides } = useTagColorOverrides();

    return (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm lg:min-h-0 lg:overflow-y-auto custom-scrollbar divide-y divide-slate-100">
            {/* Customer */}
            <section className="p-4 xl:p-5">
                <SectionTitle icon={<User size={14} />}>Στοιχεία Πελάτη</SectionTitle>
                <div className="space-y-3">
                    {state.isRetailCustomer ? <RetailClientField
                        value={state.retailClientLabel} onChange={setters.setRetailClientLabel}
                        onChangeCustomer={() => { setters.setSelectedCustomerId(null); setters.setCustomerName(''); setters.setCustomerSearch(''); setters.setRetailClientLabel(''); setters.setCustomerPhone(''); }}
                    /> : <>
                        {/* Customer Name with Autocomplete */}
                        <div className="relative">
                            <label className={fieldLabel}>Ονοματεπώνυμο</label>
                            <div className="relative">
                                <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${state.selectedCustomerId ? 'text-emerald-500' : 'text-slate-400'}`} />
                                <input
                                    className={`w-full pl-9 pr-9 py-2.5 border rounded-xl outline-none font-bold text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500/15 transition-all ${state.selectedCustomerId ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-400'}`}
                                    placeholder="Αναζήτηση πελάτη..."
                                    value={state.customerName}
                                    onChange={e => {
                                        setters.setCustomerName(e.target.value);
                                        setters.setCustomerSearch(e.target.value);
                                        setters.setShowCustomerResults(true);
                                        setters.setSelectedCustomerId(null);
                                    }}
                                    onFocus={() => setters.setShowCustomerResults(true)}
                                    onBlur={() => setters.setShowCustomerResults(false)}
                                    onKeyDown={e => {
                                        if (e.key === 'Escape') setters.setShowCustomerResults(false);
                                        if (e.key === 'Enter' && state.showCustomerResults && !state.selectedCustomerId && state.filteredCustomers.length > 0) {
                                            e.preventDefault();
                                            actions.handleSelectCustomer(state.filteredCustomers[0]);
                                            setters.setShowCustomerResults(false);
                                        }
                                    }}
                                    autoComplete="off"
                                />
                                {state.selectedCustomerId && <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
                            </div>

                            {state.showCustomerResults && state.customerSearch && !state.selectedCustomerId && state.filteredCustomers.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-200 mt-1.5 z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                                    {state.filteredCustomers.map(c => (
                                        <div
                                            key={c.id}
                                            // mousedown keeps the input from blurring (and closing the list) before the pick lands
                                            onMouseDown={e => { e.preventDefault(); actions.handleSelectCustomer(c); setters.setShowCustomerResults(false); }}
                                            className="px-3 py-2.5 hover:bg-emerald-50/60 cursor-pointer border-b border-slate-50 last:border-0 font-semibold text-sm text-slate-700 truncate"
                                        >
                                            {c.full_name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {state.isInternalCustomer ? (
                            <InternalOrderNotice />
                        ) : (
                            <div className={`grid gap-2 ${state.isSeller ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                <button
                                    type="button"
                                    onClick={actions.handleUseRetailCustomer}
                                    title="Χρήση πελάτη λιανικής"
                                    className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 text-[11px] font-black hover:bg-fuchsia-100 transition-colors"
                                >
                                    <Store size={13} className="shrink-0" /> Λιανική
                                </button>
                                {!state.isSeller && (
                                    <button
                                        type="button"
                                        onClick={actions.handleUseInternalCustomer}
                                        title="Παραγγελία για δικό μας απόθεμα — δεν μετράει στις πωλήσεις"
                                        className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 text-[11px] font-black hover:bg-teal-100 transition-colors"
                                    >
                                        <Warehouse size={13} className="shrink-0" /> Εσωτερική
                                    </button>
                                )}
                            </div>
                        )}
                    </>}

                    {!state.isRetailCustomer && (
                        <OrderTerritoryAlert customerId={state.selectedCustomerId} skus={state.selectedItems.map(item => item.sku)} />
                    )}

                    {/* Phone */}
                    <div>
                        <label className={fieldLabel}>Τηλέφωνο</label>
                        <div className="relative">
                            <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                type="tel"
                                className={`${fieldInput} pl-9 font-medium`}
                                placeholder="—"
                                value={state.customerPhone}
                                onChange={e => setters.setCustomerPhone(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className={`${fieldLabel} flex items-center gap-1`}><Tag size={11} /> Ετικέτες / Ομάδα</label>
                        <div className="flex gap-1.5">
                            <input
                                className={`${fieldInput} py-2 min-w-0 flex-1`}
                                placeholder="π.χ. Έκθεση A..."
                                value={state.tagInput}
                                onChange={e => setters.setTagInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && actions.handleAddTag()}
                            />
                            <button
                                type="button"
                                onClick={actions.handleAddTag}
                                disabled={!state.tagInput.trim()}
                                aria-label="Προσθήκη ετικέτας"
                                className="shrink-0 w-9 inline-flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        {state.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {state.tags.map(t => {
                                    const c = getTagColor(t, tagColorOverrides);
                                    return (
                                        <span key={t} className={`text-[10px] pl-2 pr-1 py-0.5 rounded-md border flex items-center gap-1 font-bold ${c.bg} ${c.text} ${c.border}`}>
                                            {t}
                                            <button type="button" onClick={() => actions.removeTag(t)} className="p-0.5 rounded hover:text-red-600 opacity-70 hover:opacity-100" aria-label={`Αφαίρεση ${t}`}>
                                                <X size={10} />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Seller / Πλασιέ Picker (admin only) */}
            {!state.isSeller && (
                <section className="p-4 xl:p-5">
                    <SellerPicker
                        selectedSellerId={state.selectedSellerId}
                        selectedSellerName={state.selectedSellerName}
                        commissionPercent={state.sellerCommissionPercent}
                        onSellerChange={(id, name) => {
                            setters.setSelectedSellerId(id);
                            setters.setSelectedSellerName(name);
                        }}
                        onCommissionChange={setters.setSellerCommissionPercent}
                    />
                </section>
            )}

            {/* Discount, VAT & price mode */}
            <section className="p-4 xl:p-5">
                <SectionTitle icon={<Receipt size={14} />}>Εμπορικοί Όροι</SectionTitle>
                <div className="space-y-3">
                    <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] gap-2">
                        <div>
                            <label className={fieldLabel}>Έκπτωση</label>
                            <div className="relative">
                                <input
                                    type="number" min="0" max="100"
                                    value={state.discountPercent}
                                    onChange={e => setters.setDiscountPercent(parseFloat(e.target.value) || 0)}
                                    onFocus={e => e.target.select()}
                                    className={`w-full pl-3 pr-7 py-2.5 border rounded-xl outline-none font-bold text-sm tabular-nums transition-all focus:ring-2 focus:ring-amber-500/25 focus:border-amber-400 ${
                                        state.discountPercent > 0 ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-800'
                                    }`}
                                />
                                <Percent size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-500 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className={fieldLabel}>Καθεστώς ΦΠΑ</label>
                            <select
                                value={state.vatRate}
                                onChange={e => setters.setVatRate(parseFloat(e.target.value))}
                                className={`${fieldInput} px-2.5 font-bold text-slate-700 cursor-pointer`}
                            >
                                <option value={VatRegime.Standard}>24% Κανονικό</option>
                                <option value={VatRegime.Reduced}>17% Μειωμένο</option>
                                <option value={VatRegime.Zero}>0% Μηδενικό</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end -mt-1">
                        <OrderPriceModeToggle value={state.priceMode} onChange={actions.handlePriceModeChange} />
                    </div>
                </div>
            </section>

            {/* Notes */}
            <section className="p-4 xl:p-5">
                <SectionTitle icon={<StickyNote size={14} />}>Σημειώσεις Παραγγελίας</SectionTitle>
                <textarea
                    value={state.orderNotes}
                    onChange={e => setters.setOrderNotes(e.target.value)}
                    rows={3}
                    className={`${fieldInput} resize-y min-h-[4.5rem] max-h-64`}
                    placeholder="Ειδικές οδηγίες..."
                />
            </section>
        </div>
    );
};
