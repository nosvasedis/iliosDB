import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Customer, VatRegime } from '../../types';
import { Search, Phone, MapPin, User, Mail, Plus, Clock } from 'lucide-react';
import { useUI } from '../UIProvider';
import CustomerDetailsModal from '../CustomerDetailsModal';
import MobileCustomerForm from '../mobile/MobileCustomerForm';
import { normalizedIncludes } from '../../utils/greekSearch';

// Normalize for duplicate check: lowercase, strip accents and spaces
const normalizeStr = (s: string) =>
    s.toLowerCase().replace(/\s+/g, ' ').trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function SellerCustomers() {
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();

    const [search, setSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const filteredList = useMemo(() => {
        if (!customers) return [];
        return customers.filter(c =>
            normalizedIncludes(c.full_name, search) ||
            (c.phone && c.phone.includes(search))
        ).sort((a, b) => a.full_name.localeCompare(b.full_name, 'el', { sensitivity: 'base' }));
    }, [customers, search]);

    const latestOrdersMap = useMemo(() => {
        if (!orders) return {} as Record<string, string>;
        const map: Record<string, string> = {};
        orders.forEach(o => {
            const cid = o.customer_id;
            if (cid && (!map[cid] || new Date(o.created_at) > new Date(map[cid]))) {
                map[cid] = o.created_at;
            }
        });
        return map;
    }, [orders]);

    const handleCreateCustomer = async (c: Customer) => {
        // Duplicate detection
        if (customers) {
            const normalized = normalizeStr(c.full_name);
            const dup = customers.find(existing => {
                if (existingNameMatch(existing.full_name, normalized)) return true;
                if (c.vat_number && existing.vat_number && c.vat_number === existing.vat_number) return true;
                if (c.phone && existing.phone && c.phone.replace(/\D/g, '') === existing.phone.replace(/\D/g, '')) return true;
                return false;
            });
            if (dup) {
                const ok = await confirm({
                    title: 'Πιθανό διπλότυπο',
                    message: `Μοιάζει με υπάρχοντα πελάτη: "${dup.full_name}"${dup.vat_number ? ` (ΑΦΜ: ${dup.vat_number})` : ''}. Θέλετε να συνεχίσετε;`,
                    isDestructive: false,
                    confirmText: 'Ναι, δημιουργία ανεξάρτητα',
                    cancelText: 'Ακύρωση'
                });
                if (!ok) return;
            }
        }
        try {
            await api.saveCustomer(c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomer(null);
            setIsCreating(false);
            showToast('Ο πελάτης δημιουργήθηκε επιτυχώς.', 'success');
        } catch (e) {
            showToast('Σφάλμα δημιουργίας.', 'error');
            throw e;
        }
    };

    const existingNameMatch = (existingName: string, normalized: string) => {
        if (!normalized) return false;
        return normalizeStr(existingName) === normalized;
    };

    const handleUpdateCustomer = async (c: Customer) => {
        try {
            await api.updateCustomer(c.id, c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomer(c);
            showToast('Τα στοιχεία ενημερώθηκαν.', 'success');
        } catch (e) {
            showToast('Σφάλμα ενημέρωσης.', 'error');
            throw e;
        }
    };

    const handleDeleteCustomer = async (id: string) => {
        const yes = await confirm({ title: 'Διαγραφή', message: 'Θέλετε να διαγράψετε οριστικά αυτόν τον πελάτη;', isDestructive: true });
        if (yes) {
            try {
                await api.deleteCustomer(id);
                queryClient.invalidateQueries({ queryKey: ['customers'] });
                setSelectedCustomer(null);
                showToast('Διαγράφηκε.', 'success');
            } catch (e) {
                showToast('Σφάλμα διαγραφής.', 'error');
            }
        }
    };

    const openNewCustomer = () => {
        setSelectedCustomer({
            id: crypto.randomUUID(),
            full_name: '',
            phone: '',
            email: '',
            address: '',
            vat_number: '',
            vat_rate: VatRegime.Standard,
            notes: '',
            created_at: new Date().toISOString()
        });
        setIsCreating(true);
    };

    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 shrink-0">
                <h1 className="text-2xl font-black text-slate-900">Πελατολόγιο</h1>
                <button
                    onClick={openNewCustomer}
                    className="flex items-center gap-2 bg-[#060b00] text-white px-4 py-2.5 rounded-xl font-bold shadow-md active:scale-95 transition-transform"
                >
                    <Plus size={18} /> Νέος Πελάτης
                </button>
            </div>

            <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                    type="text"
                    placeholder="Αναζήτηση..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredList.map(c => (
                    <div
                        key={c.id}
                        onClick={() => { setSelectedCustomer(c); setIsCreating(false); }}
                        className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold shrink-0">
                                <User size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-900 truncate">{c.full_name}</div>
                                {latestOrdersMap[c.id] && (
                                    <div className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                                        <Clock size={10} /> Τελευταία: {new Date(latestOrdersMap[c.id]).toLocaleDateString('el-GR')}
                                    </div>
                                )}
                                {c.address && <div className="text-[10px] text-slate-400 flex items-center gap-1 truncate"><MapPin size={10} /> {c.address}</div>}
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3 pt-2 border-t border-slate-50" onClick={e => e.stopPropagation()}>
                            {c.phone && (
                                <a href={`tel:${c.phone}`} className="flex-1 bg-slate-50 py-2 rounded-lg text-xs font-bold text-slate-600 flex items-center justify-center gap-2">
                                    <Phone size={12} /> Κλήση
                                </a>
                            )}
                            {c.email && (
                                <a href={`mailto:${c.email}`} className="flex-1 bg-slate-50 py-2 rounded-lg text-xs font-bold text-slate-600 flex items-center justify-center gap-2">
                                    <Mail size={12} /> Email
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {selectedCustomer && !isCreating && orders && (
                <CustomerDetailsModal
                    customer={selectedCustomer}
                    orders={orders}
                    onClose={() => { setSelectedCustomer(null); }}
                    onUpdate={handleUpdateCustomer}
                    onDelete={handleDeleteCustomer}
                    onPrintOrder={undefined}
                />
            )}

            {isCreating && selectedCustomer && (
                <MobileCustomerForm
                    customer={selectedCustomer}
                    onSave={handleCreateCustomer}
                    onCancel={() => { setIsCreating(false); setSelectedCustomer(null); }}
                />
            )}
        </div>
    );
}
