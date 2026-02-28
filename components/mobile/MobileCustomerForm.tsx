import React, { useState } from 'react';
import { Customer, VatRegime } from '../../types';
import { X, Save, Loader2, Zap, Phone, Mail, MapPin, FileText, User, CreditCard, MessageSquare } from 'lucide-react';
import { api } from '../../lib/supabase';
import { useUI } from '../UIProvider';

export interface MobileCustomerFormProps {
    /** Initial values (empty for new customer) */
    customer: Customer;
    onSave: (c: Customer) => Promise<void>;
    onCancel: () => void;
}

export default function MobileCustomerForm({ customer, onSave, onCancel }: MobileCustomerFormProps) {
    const [form, setForm] = useState<Customer>(customer);
    const [isSaving, setIsSaving] = useState(false);
    const [isSearchingAfm, setIsSearchingAfm] = useState(false);
    const { showToast } = useUI();

    const handleAfmLookup = async () => {
        if (!form.vat_number || form.vat_number.length < 9) {
            showToast('Μη έγκυρο ΑΦΜ.', 'error');
            return;
        }
        setIsSearchingAfm(true);
        try {
            const result = await api.lookupAfm(form.vat_number);
            if (result) {
                setForm(prev => ({
                    ...prev,
                    full_name: result.name || prev.full_name,
                    address: result.address || prev.address,
                    phone: (!prev.phone && result.phone) ? result.phone : prev.phone,
                    email: (!prev.email && result.email) ? result.email : prev.email,
                }));
                const filled = ['Επωνυμία', result.address ? 'Διεύθυνση' : null, result.phone ? 'Τηλέφωνο' : null, result.email ? 'Email' : null].filter(Boolean).join(', ');
                showToast(`Βρέθηκαν: ${filled}`, 'success');
            } else {
                showToast('Δεν βρέθηκαν στοιχεία.', 'info');
            }
        } catch (e: unknown) {
            showToast((e as Error)?.message || 'Σφάλμα αναζήτησης.', 'error');
        } finally {
            setIsSearchingAfm(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.full_name.trim()) {
            showToast('Το ονοματεπώνυμο είναι υποχρεωτικό.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            await onSave(form);
        } catch (err) {
            // onSave may throw; caller can show toast
        } finally {
            setIsSaving(false);
        }
    };

    const initials = form.full_name.trim()
        ? form.full_name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
        : '?';

    const inputClass = 'w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-base font-medium text-slate-800 placeholder:text-slate-300';

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex flex-col justify-end sm:justify-center">
            <div className="bg-slate-50 rounded-t-[2.5rem] sm:rounded-3xl max-h-[96vh] overflow-y-auto shadow-2xl sm:max-w-lg sm:mx-auto sm:max-h-[90vh] flex flex-col">

                {/* ── Gradient header */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-t-[2.5rem] sm:rounded-t-3xl px-6 pt-7 pb-8 relative overflow-hidden shrink-0">
                    {/* decorative circles */}
                    <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/5" />
                    <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-white/5" />

                    <div className="flex items-center justify-between mb-5 relative z-10">
                        <span className="text-xs font-black text-white/40 uppercase tracking-widest">
                            {customer.full_name ? 'Επεξεργασία Πελάτη' : 'Νέος Πελάτης'}
                        </span>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white/70 hover:text-white transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Avatar */}
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
                            <span className="text-white text-xl font-black">{initials}</span>
                        </div>
                        <div>
                            <div className="text-white font-black text-lg leading-tight">
                                {form.full_name || <span className="text-white/30 font-medium">Όνομα πελάτη...</span>}
                            </div>
                            {form.phone && (
                                <div className="text-white/50 text-xs font-medium mt-0.5">{form.phone}</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Form body */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4 pb-8">

                    {/* Identity section */}
                    <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <User size={14} className="text-blue-500" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Στοιχεία Ταυτότητας</span>
                        </div>
                        <input
                            type="text"
                            className={inputClass}
                            placeholder="Ονοματεπώνυμο *"
                            value={form.full_name}
                            onChange={e => setForm({ ...form, full_name: e.target.value })}
                            autoFocus
                        />
                    </div>

                    {/* Contact section */}
                    <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Phone size={14} className="text-emerald-500" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Επικοινωνία</span>
                        </div>
                        <input
                            type="tel"
                            className={inputClass}
                            placeholder="Τηλέφωνο"
                            value={form.phone || ''}
                            onChange={e => setForm({ ...form, phone: e.target.value })}
                        />
                        <input
                            type="email"
                            className={inputClass}
                            placeholder="Email"
                            value={form.email || ''}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                        />
                        <div className="relative">
                            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                            <input
                                type="text"
                                className={`${inputClass} pl-10`}
                                placeholder="Διεύθυνση"
                                value={form.address || ''}
                                onChange={e => setForm({ ...form, address: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Fiscal section */}
                    <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <CreditCard size={14} className="text-amber-500" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Φορολογικά</span>
                        </div>

                        {/* AFM + autofill */}
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <FileText size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                <input
                                    type="text"
                                    className={`${inputClass} pl-10 font-mono`}
                                    placeholder="ΑΦΜ (9 ψηφία)"
                                    value={form.vat_number || ''}
                                    onChange={e => setForm({ ...form, vat_number: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAfmLookup}
                                disabled={isSearchingAfm || !form.vat_number || form.vat_number.length < 9}
                                className="px-4 bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl font-bold shadow-md active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 shrink-0 text-sm"
                            >
                                {isSearchingAfm ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                                <span className="hidden sm:block">Αυτόματο</span>
                            </button>
                        </div>

                        {/* VAT regime */}
                        <select
                            className={`${inputClass} cursor-pointer`}
                            value={form.vat_rate ?? VatRegime.Standard}
                            onChange={e => setForm({ ...form, vat_rate: parseFloat(e.target.value) })}
                        >
                            <option value={VatRegime.Standard}>24% — Κανονικό ΦΠΑ</option>
                            <option value={VatRegime.Reduced}>17% — Μειωμένο</option>
                            <option value={VatRegime.Zero}>0% — Απαλλαγή</option>
                        </select>
                    </div>

                    {/* Notes */}
                    <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-3">
                            <MessageSquare size={14} className="text-purple-500" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Σημειώσεις</span>
                        </div>
                        <textarea
                            className={`${inputClass} min-h-[80px] resize-none`}
                            placeholder="Εσωτερικές σημειώσεις..."
                            value={form.notes || ''}
                            onChange={e => setForm({ ...form, notes: e.target.value })}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 py-4 rounded-2xl font-bold border-2 border-slate-200 text-slate-500 bg-white hover:bg-slate-50 active:scale-[0.99] transition-all"
                        >
                            Άκυρο
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !form.full_name.trim()}
                            className="flex-2 py-4 px-8 rounded-2xl font-black bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-xl shadow-slate-900/20 active:scale-[0.99] transition-all disabled:opacity-40 flex items-center justify-center gap-2 text-base"
                        >
                            {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            Αποθήκευση
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
