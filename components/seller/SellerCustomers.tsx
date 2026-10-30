import React, { useState, useMemo, useDeferredValue, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { INTERNAL_CUSTOMER_ID, RETAIL_CUSTOMER_ID } from '../../lib/supabase';
import { isReservedCustomerName } from '../../utils/retailConstants';
import { Customer, VatRegime } from '../../types';
import { Phone, MapPin, Mail, Plus, Clock, Users, UserPlus } from 'lucide-react';
import { useUI } from '../UIProvider';
import CustomerDetailsModal from '../CustomerDetailsModal';
import CreateCustomerModal from '../CreateCustomerModal';
import { normalizedIncludes } from '../../utils/greekSearch';
import { ordersRepository } from '../../features/orders';
import { useCustomers, useOrders } from '../../hooks/api/useOrders';
import { formatNumber } from '../../utils/numberFormat';
import { HeaderPrimaryButton } from '../DesktopPageHeader';
import PageHeader, { SearchField } from '../shell/PageHeader';
import { useViewport } from '../shell/viewport';

const PAGE_SIZE = 60;

// Normalize for duplicate check: lowercase, strip accents and spaces
const normalizeStr = (s: string) =>
    s.toLowerCase().replace(/\s+/g, ' ').trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');

const nameCollator = new Intl.Collator('el', { sensitivity: 'base' });
const dateFormatter = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const initialsOf = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';

const CustomerCard = React.memo<{ customer: Customer; lastOrder?: string; onOpen: (c: Customer) => void }>(({ customer: c, lastOrder, onOpen }) => {
    const isRetail = c.id === RETAIL_CUSTOMER_ID;
    return (
        <div
            className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 76px' }}
        >
            <button type="button" onClick={() => onOpen(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-black ${isRetail ? 'bg-fuchsia-50 text-fuchsia-700' : 'bg-gradient-to-br from-[#1c2812] to-[#060b00] text-amber-300'}`}>
                    {initialsOf(c.full_name)}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[14px] font-bold text-slate-900">{c.full_name}</span>
                        {c.customer_code && <span className="shrink-0 font-mono text-[10px] font-bold text-slate-400">#{c.customer_code}</span>}
                        {isRetail && (
                            <span className="shrink-0 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-1.5 text-[9px] font-bold uppercase text-fuchsia-700">Σύστημα</span>
                        )}
                    </span>
                    {isRetail ? (
                        <span className="block truncate text-[11px] text-slate-500">Συλλογικός λογαριασμός· όχι ένα ΑΦΜ/διεύθυνση.</span>
                    ) : c.address ? (
                        <span className="flex min-w-0 items-center gap-1 text-[11px] text-slate-500"><MapPin size={11} className="shrink-0 text-slate-400" /><span className="truncate">{c.address}</span></span>
                    ) : null}
                    {lastOrder && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400"><Clock size={10} /> Τελευταία: {dateFormatter.format(new Date(lastOrder))}</span>
                    )}
                </span>
            </button>
            {!isRetail && (c.phone || c.email) && (
                <div className="flex shrink-0 gap-1.5">
                    {c.phone && (
                        <a href={`tel:${c.phone}`} aria-label={`Κλήση ${c.full_name}`} className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 active:scale-95">
                            <Phone size={16} />
                        </a>
                    )}
                    {c.email && (
                        <a href={`mailto:${c.email}`} aria-label={`Email ${c.full_name}`} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 active:scale-95">
                            <Mail size={16} />
                        </a>
                    )}
                </div>
            )}
        </div>
    );
});
CustomerCard.displayName = 'CustomerCard';

export default function SellerCustomers() {
    const { data: customers } = useCustomers();
    const { data: orders } = useOrders();
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { isDesktop } = useViewport();

    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search.trim());
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Internal orders are an admin concept; sellers never pick that account.
    const sortedCustomers = useMemo(
        () => (customers || []).filter((c) => c.id !== INTERNAL_CUSTOMER_ID).sort((a, b) => nameCollator.compare(a.full_name, b.full_name)),
        [customers],
    );

    const filteredList = useMemo(() => {
        if (!deferredSearch) return sortedCustomers;
        const digits = deferredSearch.replace(/\D/g, '');
        return sortedCustomers.filter((c) =>
            normalizedIncludes(c.full_name, deferredSearch) ||
            (c.phone && (c.phone.includes(deferredSearch) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))) ||
            (c.customer_code && c.customer_code.includes(deferredSearch)) ||
            (c.vat_number && c.vat_number.includes(deferredSearch)) ||
            (c.address && normalizedIncludes(c.address, deferredSearch)),
        );
    }, [sortedCustomers, deferredSearch]);

    useEffect(() => setLimit(PAGE_SIZE), [deferredSearch]);

    // Grow the rendered window as the seller scrolls near the end.
    const hasMore = limit < filteredList.length;
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hasMore) return;
        const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) setLimit((prev) => prev + PAGE_SIZE);
        }, { rootMargin: '600px 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, [hasMore, filteredList]);

    const latestOrdersMap = useMemo(() => {
        const map: Record<string, string> = {};
        (orders || []).forEach((o) => {
            const cid = o.customer_id;
            if (cid && (!map[cid] || o.created_at > map[cid])) map[cid] = o.created_at;
        });
        return map;
    }, [orders]);

    const existingNameMatch = (existingName: string, normalized: string) => {
        if (!normalized) return false;
        return normalizeStr(existingName) === normalized;
    };

    const handleCreateCustomer = async (c: Customer) => {
        if (isReservedCustomerName(c.full_name)) {
            showToast(`Το όνομα '${c.full_name.trim()}' είναι δεσμευμένο από το σύστημα.`, 'error');
            return;
        }
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
            await ordersRepository.saveCustomer(c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomer(null);
            setIsCreating(false);
            showToast('Ο πελάτης δημιουργήθηκε επιτυχώς.', 'success');
        } catch (e) {
            showToast('Σφάλμα δημιουργίας.', 'error');
            throw e;
        }
    };

    const handleUpdateCustomer = async (c: Customer) => {
        try {
            await ordersRepository.updateCustomer(c.id, c);
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
                await ordersRepository.deleteCustomer(id);
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

    const openCustomer = React.useCallback((c: Customer) => {
        setSelectedCustomer(c);
        setIsCreating(false);
    }, []);

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <PageHeader
                icon={Users}
                title="Πελατολόγιο"
                subtitle={customers ? `${formatNumber(sortedCustomers.length)} πελάτες` : 'Φόρτωση…'}
                actions={isDesktop ? (
                    <HeaderPrimaryButton icon={UserPlus} onClick={openNewCustomer}>Νέος πελάτης</HeaderPrimaryButton>
                ) : (
                    <button type="button" onClick={openNewCustomer} className="flex h-10 items-center gap-1.5 rounded-xl bg-[#060b00] pl-2.5 pr-3.5 text-[13px] font-bold text-white active:scale-95">
                        <Plus size={17} className="text-amber-300" /> Νέος
                    </button>
                )}
                below={<div className="flex"><SearchField value={search} onChange={setSearch} placeholder="Όνομα, τηλέφωνο, ΑΦΜ, περιοχή…" /></div>}
            />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                <div className="grid grid-cols-1 gap-2 p-2 min-[400px]:p-3 md:grid-cols-2 lg:gap-3 lg:px-0 lg:pt-4 2xl:grid-cols-3">
                    {filteredList.slice(0, limit).map((c) => (
                        <CustomerCard key={c.id} customer={c} lastOrder={latestOrdersMap[c.id]} onOpen={openCustomer} />
                    ))}
                </div>
                {hasMore && <div ref={sentinelRef} className="h-10" />}
                {customers && filteredList.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                        <Users size={34} className="opacity-25" />
                        <p className="text-sm font-bold">Δεν βρέθηκαν πελάτες.</p>
                    </div>
                )}
            </div>

            {selectedCustomer && !isCreating && orders && (
                <CustomerDetailsModal
                    customer={selectedCustomer}
                    orders={orders}
                    onClose={() => { setSelectedCustomer(null); }}
                    onOpenCustomer={id => { const next = customers?.find(c => c.id === id); if (next) setSelectedCustomer(next); }}
                    onUpdate={handleUpdateCustomer}
                    onDelete={handleDeleteCustomer}
                    onPrintOrder={undefined}
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
