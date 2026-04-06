import React, { useMemo, useState } from 'react';
import { Customer, Order, VatRegime } from '../types';
import { Users, Plus, Search, Phone, Mail, MapPin, Clock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { useUI } from './UIProvider';
import CustomerDetailsModal from './CustomerDetailsModal';
import CreateCustomerModal from './CreateCustomerModal';
import { normalizedIncludes } from '../utils/greekSearch';
import { ordersRepository } from '../features/orders';
import { useCustomers, useOrders } from '../hooks/api/useOrders';
import DesktopPageHeader from './DesktopPageHeader';

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
                {isSystem ? (
                    <p className="text-[10px] text-slate-500 leading-snug mt-1">
                        Πολλοί τελικοί πελάτες· χωρίς κοινό ΑΦΜ ή διεύθυνση εδώ.
                    </p>
                ) : (
                    customer.vat_number && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">ΑΦΜ: {customer.vat_number}</div>
                    )
                )}
            </div>

            <div className="mt-auto pt-3 border-t border-slate-50 space-y-1.5">
                {isSystem ? (
                    <div className="text-[10px] text-slate-400 italic">Ανοίξτε για στατιστικά και ιστορικό παραγγελιών.</div>
                ) : (
                    <>
                        {customer.phone ? (
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                                <Phone size={12} className="text-slate-400" /> {customer.phone}
                            </div>
                        ) : (
                            <div className="h-4" />
                        )}
                        {customer.address ? (
                            <div className="flex items-center gap-2 text-xs text-slate-600 truncate">
                                <MapPin size={12} className="text-slate-400 shrink-0" /> {customer.address}
                            </div>
                        ) : (
                            <div className="h-4" />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default function CustomersPage({ onPrintOrder }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: customers } = useCustomers();
    const { data: orders } = useOrders();

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
            await ordersRepository.saveCustomer(c);
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
            await ordersRepository.updateCustomer(c.id, c);
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
                await ordersRepository.deleteCustomer(id);
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

            <DesktopPageHeader
                icon={Users}
                title="Πελάτες"
                subtitle="Διαχείριση πελατολογίου και ιστορικού."
                tail={(
                    <>
                        <div className="relative group min-w-[12rem] flex-1 md:max-w-xs md:flex-none">
                            <input
                                type="text"
                                placeholder="Αναζήτηση πελάτη..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-bold shadow-inner outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500" size={18} />
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedCustomer({
                                    id: crypto.randomUUID(),
                                    full_name: '',
                                    phone: '',
                                    email: '',
                                    vat_number: '',
                                    vat_rate: VatRegime.Standard,
                                    address: '',
                                    notes: '',
                                    created_at: new Date().toISOString()
                                });
                                setIsCreating(true);
                            }}
                            className="rounded-xl bg-[#060b00] p-3.5 text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-black active:scale-95"
                            title="Νέος Πελάτης"
                        >
                            <Plus size={22} strokeWidth={3} />
                        </button>
                    </>
                )}
            />

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

            {isCreating && selectedCustomer && (
                <CreateCustomerModal
                    draft={selectedCustomer}
                    onSave={handleCreateCustomer}
                    onCancel={() => { setIsCreating(false); setSelectedCustomer(null); }}
                />
            )}
        </div>
    );
}
