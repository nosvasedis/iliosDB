import React, { useState } from 'react';
import { Customer, VatRegime } from '../../types';
import { X, Save, Loader2, Zap, Phone, Mail, MapPin, FileText, User } from 'lucide-react';
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

    const fieldClass = 'w-full p-4 border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-2xl outline-none transition-all text-base font-medium';
    const labelClass = 'text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block';

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end sm:justify-center">
            <div className="bg-white rounded-t-[2rem] sm:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-full duration-300 sm:max-w-lg sm:mx-auto sm:max-h-[90vh]">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between shrink-0 z-10">
                    <h2 className="text-xl font-black text-slate-900">
                        {customer.id ? 'Επεξεργασία Πελάτη' : 'Νέος Πελάτης'}
                    </h2>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="p-2.5 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
                    >
                        <X size={22} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 pb-8 space-y-5">
                    {/* Ονοματεπώνυμο */}
                    <div>
                        <label className={`${labelClass} flex items-center gap-2`}><User size={14} /> Ονοματεπώνυμο</label>
                        <input
                            type="text"
                            className={fieldClass}
                            placeholder="Ονοματεπώνυμο πελάτη..."
                            value={form.full_name}
                            onChange={e => setForm({ ...form, full_name: e.target.value })}
                            autoFocus
                        />
                    </div>

                    {/* Τηλέφωνο */}
                    <div>
                        <label className={`${labelClass} flex items-center gap-2`}><Phone size={14} /> Τηλέφωνο</label>
                        <input
                            type="tel"
                            className={fieldClass}
                            placeholder="Π.χ. 210 1234567"
                            value={form.phone || ''}
                            onChange={e => setForm({ ...form, phone: e.target.value })}
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className={`${labelClass} flex items-center gap-2`}><Mail size={14} /> Email</label>
                        <input
                            type="email"
                            className={fieldClass}
                            placeholder="email@example.com"
                            value={form.email || ''}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                        />
                    </div>

                    {/* Διεύθυνση */}
                    <div>
                        <label className={`${labelClass} flex items-center gap-2`}><MapPin size={14} /> Διεύθυνση</label>
                        <input
                            type="text"
                            className={fieldClass}
                            placeholder="Διεύθυνση..."
                            value={form.address || ''}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                        />
                    </div>

                    {/* ΑΦΜ + lookup */}
                    <div>
                        <label className={`${labelClass} flex items-center gap-2`}><FileText size={14} /> ΑΦΜ &amp; Αυτόματη συμπλήρωση</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className={`${fieldClass} font-mono flex-1`}
                                placeholder="9 ψηφία ΑΦΜ..."
                                value={form.vat_number || ''}
                                onChange={e => setForm({ ...form, vat_number: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                            />
                            <button
                                type="button"
                                onClick={handleAfmLookup}
                                disabled={isSearchingAfm || !form.vat_number || form.vat_number.length < 9}
                                className="p-4 bg-slate-800 text-white rounded-2xl font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none shrink-0"
                            >
                                {isSearchingAfm ? <Loader2 size={22} className="animate-spin" /> : <Zap size={22} />}
                            </button>
                        </div>
                    </div>

                    {/* Καθεστώς ΦΠΑ */}
                    <div>
                        <label className={labelClass}>Καθεστώς ΦΠΑ</label>
                        <select
                            className={fieldClass}
                            value={form.vat_rate ?? VatRegime.Standard}
                            onChange={e => setForm({ ...form, vat_rate: parseFloat(e.target.value) })}
                        >
                            <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                            <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                            <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                        </select>
                    </div>

                    {/* Σημειώσεις */}
                    <div>
                        <label className={labelClass}>Σημειώσεις</label>
                        <textarea
                            className={`${fieldClass} min-h-[100px] resize-none`}
                            placeholder="Εσωτερικές σημειώσεις..."
                            value={form.notes || ''}
                            onChange={e => setForm({ ...form, notes: e.target.value })}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 py-4 rounded-2xl font-bold border-2 border-slate-200 text-slate-600 bg-white active:scale-[0.99] transition-transform"
                        >
                            Άκυρο
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !form.full_name.trim()}
                            className="flex-1 py-4 rounded-2xl font-bold bg-[#060b00] text-white shadow-lg active:scale-[0.99] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
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
