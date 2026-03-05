import React, { useMemo, useState } from 'react';
import { Customer, Order, VatRegime } from '../types';
import { Users, Plus, Search, Phone, Mail, MapPin, Clock, Gift } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { useUI } from './UIProvider';
import CustomerDetailsModal from './CustomerDetailsModal';
import { normalizedIncludes } from '../utils/greekSearch';
import { getNextNamedayForName } from '../utils/namedays';
import { formatGreekDate } from '../utils/deliveryLabels';

interface Props {
    onPrintOrder?: (order: Order) => void;
}

// --- CUSTOMER CARD COMPONENT ---
interface CustomerCardProps {
    customer: Customer;
    onClick: () => void;
    latestOrderDate?: string;
    isSystem?: boolean;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onClick, latestOrderDate, isSystem }) => {
    const nextNameday = useMemo(() => getNextNamedayForName(customer.full_name), [customer.full_name]);
    return (
        <div
            onClick={onClick}
            className="group bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer relative overflow-hidden flex flex-col h-full"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-sm">
                    {customer.full_name.charAt(0).toUpperCase()}
                </div>
                {latestOrderDate && (
                    <div className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full flex items-center gap-1">
                        <Clock size={10} /> {new Date(latestOrderDate).toLocaleDateString('el-GR')}
                    </div>
                )}
            </div>

            <div className="mb-2">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 text-base leading-tight line-clamp-1" title={customer.full_name}>
                        {customer.full_name}
                    </h3>
                    {isSystem && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 uppercase">
                            Σύστημα
                        </span>
                    )}
                </div>
                {customer.vat_number && (
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">ΑΦΜ: {customer.vat_number}</div>
                )}
            </div>

            {nextNameday && (
                <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2 mb-3">
                    <div className="flex items-center gap-2 text-sky-700">
                        <Gift size={14} className="shrink-0" />
                        <span className="text-xs font-bold">
                            {nextNameday.is_today
                                ? `Γιορτάζει σήμερα · ${nextNameday.label}`
                                : nextNameday.days_until <= 7
                                    ? `Ονομαστική εορτή ${formatGreekDate(nextNameday.date)} (σε ${nextNameday.days_until} ημέρες)`
                                    : `Ονομαστική εορτή · ${nextNameday.label} ${formatGreekDate(nextNameday.date)}`}
                        </span>
                    </div>
                </div>
            )}

            <div className="mt-auto pt-3 border-t border-slate-50 space-y-1.5">
                {customer.phone ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Phone size={12} className="text-slate-400" /> {customer.phone}
                    </div>
                ) : <div className="h-4" />}
                {customer.address ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600 truncate">
                        <MapPin size={12} className="text-slate-400 shrink-0" /> {customer.address}
                    </div>
                ) : <div className="h-4" />}
            </div>
        </div>
    );
};

export default function CustomersPage({ onPrintOrder }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    // Filter Logic
    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        return customers.filter(c =>
            normalizedIncludes(c.full_name, searchTerm) ||
            (c.phone && c.phone.includes(searchTerm))
        ).sort((a, b) => a.full_name.localeCompare(b.full_name, 'el', { sensitivity: 'base' }));
    }, [customers, searchTerm]);

    // Map latest order dates for quick view
    const latestOrdersMap = useMemo(() => {
        if (!orders) return {};
        const map: Record<string, string> = {};
        orders.forEach(o => {
            const cid = o.customer_id;
            if (cid) {
                if (!map[cid] || new Date(o.created_at) > new Date(map[cid])) {
                    map[cid] = o.created_at;
                }
            }
        });
        return map;
    }, [orders]);

    const handleCreateCustomer = async (c: Customer) => {
        if (c.full_name.trim() === RETAIL_CUSTOMER_NAME) {
            showToast("Το όνομα 'Λιανική' είναι δεσμευμένο από το σύστημα.", "error");
            return;
        }
        try {
            await api.saveCustomer(c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setIsCreating(false);
            setSelectedCustomer(null);
            showToast("Ο πελάτης δημιουργήθηκε επιτυχώς.", "success");
        } catch (e) {
            showToast("Σφάλμα δημιουργίας.", "error");
            throw e;
        }
    };

    const handleUpdateCustomer = async (c: Customer) => {
        try {
            await api.updateCustomer(c.id, c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomer(c); // Update local view
            showToast("Τα στοιχεία ενημερώθηκαν.", "success");
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
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
                showToast("Διαγράφηκε.", "success");
            } catch (e) {
                showToast("Σφάλμα διαγραφής.", "error");
            }
        }
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col gap-6">

            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-blue-100 text-blue-600 shadow-sm transition-colors">
                        <Users size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Πελάτες</h1>
                        <p className="text-slate-500 text-sm font-medium">Διαχείριση πελατολογίου και ιστορικού.</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    <div className="relative group flex-1 md:flex-none">
                        <input
                            type="text"
                            placeholder="Αναζήτηση πελάτη..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all w-full md:w-64 shadow-inner font-bold text-sm"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    </div>

                    <button
                        onClick={() => {
                            setSelectedCustomer({
                                id: crypto.randomUUID(),
                                full_name: '',
                                phone: '',
                                vat_number: '',
                                vat_rate: VatRegime.Standard,
                                address: '',
                                notes: '',
                                created_at: new Date().toISOString()
                            });
                            setIsCreating(true);
                        }}
                        className="p-3.5 rounded-xl text-white shadow-lg bg-[#060b00] hover:bg-black transition-all hover:-translate-y-0.5 active:scale-95"
                        title="Νέος Πελάτης"
                    >
                        <Plus size={22} strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-20">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredCustomers.map(c => (
                        <CustomerCard
                            key={c.id}
                            customer={c}
                            onClick={() => { setSelectedCustomer(c); setIsCreating(false); }}
                            latestOrderDate={latestOrdersMap[c.id]}
                            isSystem={c.id === RETAIL_CUSTOMER_ID}
                        />
                    ))}
                    {filteredCustomers.length === 0 && <div className="col-span-full text-center py-20 text-slate-400 italic">Δεν βρέθηκαν πελάτες.</div>}
                </div>
            </div>

            {/* View/Edit Modal */}
            {selectedCustomer && !isCreating && orders && (
                <CustomerDetailsModal
                    customer={selectedCustomer}
                    orders={orders}
                    onClose={() => setSelectedCustomer(null)}
                    onUpdate={handleUpdateCustomer}
                    onDelete={handleDeleteCustomer}
                    onPrintOrder={onPrintOrder}
                />
            )}

            {/* Create Modal */}
            {isCreating && selectedCustomer && (
                <CustomerDetailsModal
                    customer={selectedCustomer}
                    orders={[]}
                    onClose={() => { setIsCreating(false); setSelectedCustomer(null); }}
                    onUpdate={handleCreateCustomer}
                    onDelete={async () => { setIsCreating(false); setSelectedCustomer(null); }}
                    onPrintOrder={undefined}
                />
            )}
        </div>
    );
}
