import OrderCustomerName from '../orders/OrderCustomerName';
import { getOrderCustomerName } from '../../utils/orderCustomer';
import { formatNumber } from '../../utils/numberFormat';

import React, { useDeferredValue, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrderDetail, useOrdersList } from '../../hooks/api/useOrders';
import { Order, OrderStatus } from '../../types';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIProvider';
import { orderKeys, ordersRepository } from '../../features/orders';
import { Plus, Loader2, ChevronDown, Edit, ShoppingCart, Trash2, Calendar, Package } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { getOrderStatusClasses, getOrderStatusIcon, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import IliosLoader from '../ui/IliosLoader';
import SpecialCreationNote from '../SpecialCreationNote';
import SkuColorizedText from '../SkuColorizedText';
import { HeaderPrimaryButton } from '../DesktopPageHeader';
import PageHeader, { SearchField } from '../shell/PageHeader';
import { useViewport } from '../shell/viewport';
import { isSellerOrder } from './sellerOrderScope';

interface Props {
    onCreate: () => void;
    onEdit: (o: Order) => void;
}

type FilterKey = 'all' | OrderStatus;

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'Όλες' },
    { key: OrderStatus.Pending, label: 'Εκκρεμείς' },
    { key: OrderStatus.InProduction, label: 'Σε παραγωγή' },
    { key: OrderStatus.Ready, label: 'Έτοιμες' },
    { key: OrderStatus.Delivered, label: 'Παραδόθηκαν' },
];

const netValueOf = (order: Order) => order.total_price / (1 + (order.vat_rate !== undefined ? order.vat_rate : 0.24));
const dateFormatter = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' });

// ─── Expanded detail (loads the line items only when opened) ─────────────────
const OrderDetailPanel: React.FC<{ order: Order; onEdit: (o: Order) => void; onDelete: (id: string) => Promise<void> }> = ({ order, onEdit, onDelete }) => {
    const { data: detail, isLoading } = useOrderDetail(order.id);
    const [isDeleting, setIsDeleting] = useState(false);
    const canEdit = order.status === OrderStatus.Pending;
    const items = detail?.items ?? [];

    return (
        <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/70 p-3">
            {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs font-bold text-slate-400">
                    <Loader2 size={14} className="animate-spin" /> Φόρτωση ειδών…
                </div>
            ) : items.length === 0 ? (
                <p className="py-3 text-center text-xs font-bold text-slate-400">Χωρίς είδη.</p>
            ) : (
                items.map((item, idx) => (
                    <div key={item.line_id || idx} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-2 text-xs">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <SkuColorizedText sku={item.sku} suffix={item.variant_suffix || ''} className="text-[13px]" />
                            <SpecialCreationNote sku={item.sku} note={item.notes} compact />
                            {item.size_info && (
                                <span className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-px text-[10px] font-bold text-blue-600">{item.size_info}</span>
                            )}
                            <span className="font-bold text-slate-400">×{formatNumber(item.quantity)}</span>
                        </div>
                        <span className="shrink-0 font-bold tabular-nums text-slate-700">{formatCurrency(item.price_at_order * item.quantity)}</span>
                    </div>
                ))
            )}
            {canEdit && (
                <div className="flex gap-2 pt-1.5">
                    <button
                        type="button"
                        onClick={() => detail && onEdit(detail)}
                        disabled={!detail}
                        className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 transition-colors hover:border-[#060b00] hover:text-[#060b00] disabled:opacity-50"
                    >
                        <Edit size={14} /> Επεξεργασία
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            setIsDeleting(true);
                            try { await onDelete(order.id); } finally { setIsDeleting(false); }
                        }}
                        disabled={isDeleting}
                        className="flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                    >
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Διαγραφή
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Order Card ───────────────────────────────────────────────────────────────
const SellerOrderCard = React.memo<{ order: Order; onEdit: (o: Order) => void; onDelete: (id: string) => Promise<void> }>(({ order, onEdit, onDelete }) => {
    const [expanded, setExpanded] = useState(false);
    const itemCount = order.item_count ?? order.items.length;

    return (
        <div
            className="self-start overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            style={expanded ? undefined : { contentVisibility: 'auto', containIntrinsicSize: 'auto 104px' }}
        >
            <button type="button" className="block w-full p-3 text-left min-[400px]:p-4" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="truncate text-[15px] font-bold leading-tight text-slate-900"><OrderCustomerName order={order} /></div>
                        <div className="mt-0.5 font-mono text-[10px] font-bold text-slate-400">#{order.id.slice(-8).toUpperCase()}</div>
                    </div>
                    <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getOrderStatusClasses(order.status, 'seller')}`}>
                        {getOrderStatusIcon(order.status, 11)}
                        {getOrderStatusLabel(order.status, 'seller')}
                    </span>
                </div>
                <div className="mt-2.5 flex items-end justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1"><Calendar size={11} className="text-slate-400" />{dateFormatter.format(new Date(order.created_at))}</span>
                        <span className="inline-flex items-center gap-1"><Package size={11} className="text-slate-400" />{formatNumber(itemCount)} {itemCount === 1 ? 'είδος' : 'είδη'}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-base font-bold tabular-nums text-[#060b00]">{formatCurrency(netValueOf(order))}</span>
                        <ChevronDown size={16} className={`text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </button>
            {expanded && <OrderDetailPanel order={order} onEdit={onEdit} onDelete={onDelete} />}
        </div>
    );
});
SellerOrderCard.displayName = 'SellerOrderCard';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SellerOrders({ onCreate, onEdit }: Props) {
    const { user, profile } = useAuth();
    const { confirm, showToast } = useUI();
    const { isDesktop } = useViewport();
    const queryClient = useQueryClient();
    const { data: orders, isLoading } = useOrdersList();
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search.trim().toLowerCase());
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

    const handleDeleteOrder = React.useCallback(async (id: string) => {
        const yes = await confirm({ title: 'Διαγραφή Παραγγελίας', message: 'Θέλετε να διαγράψετε οριστικά αυτή την παραγγελία;', isDestructive: true });
        if (!yes) return;
        try {
            await ordersRepository.deleteOrder(id);
            queryClient.invalidateQueries({ queryKey: orderKeys.all });
            showToast('Η παραγγελία διαγράφηκε.', 'success');
        } catch (e) {
            showToast('Σφάλμα διαγραφής.', 'error');
        }
    }, [confirm, queryClient, showToast]);

    const sellerId = profile?.id ?? user?.id;
    const sellerEmail = user?.email ?? '';
    const sellerFullName = profile?.full_name ?? '';
    const myOrders = useMemo(
        () => (orders || []).filter((o) => isSellerOrder(o, { id: sellerId, email: sellerEmail, fullName: sellerFullName })),
        [orders, sellerId, sellerEmail, sellerFullName],
    );

    const counts = useMemo(() => {
        const map = new Map<FilterKey, number>([['all', myOrders.length]]);
        myOrders.forEach((o) => map.set(o.status, (map.get(o.status) || 0) + 1));
        return map;
    }, [myOrders]);

    const filteredOrders = useMemo(() => myOrders.filter((o) => {
        if (activeFilter !== 'all' && o.status !== activeFilter) return false;
        if (!deferredSearch) return true;
        return `${getOrderCustomerName(o)} ${o.customer_name} ${o.id}`.toLowerCase().includes(deferredSearch);
    }), [myOrders, activeFilter, deferredSearch]);

    if (isLoading) return <IliosLoader variant="section" detail="Παραγγελίες" className="h-full" />;

    const tabs = (
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 ilios-no-scrollbar min-[400px]:-mx-4 min-[400px]:px-4 lg:mx-0 lg:px-0">
            {FILTER_TABS.map((tab) => {
                const active = activeFilter === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveFilter(tab.key)}
                        className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-bold transition-colors ${
                            active ? 'border-[#060b00] bg-[#060b00] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                    >
                        {tab.label}
                        <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                            {formatNumber(counts.get(tab.key) || 0)}
                        </span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <PageHeader
                icon={ShoppingCart}
                title="Οι παραγγελίες μου"
                subtitle={`${formatNumber(myOrders.length)} συνολικά`}
                actions={isDesktop ? (
                    <HeaderPrimaryButton icon={Plus} onClick={onCreate}>Νέα παραγγελία</HeaderPrimaryButton>
                ) : (
                    <button type="button" onClick={onCreate} className="flex h-10 items-center gap-1.5 rounded-xl bg-[#060b00] pl-2.5 pr-3.5 text-[13px] font-bold text-white active:scale-95">
                        <Plus size={17} className="text-amber-300" /> Νέα
                    </button>
                )}
                below={
                    <div className="space-y-2.5">
                        <div className="flex"><SearchField value={search} onChange={setSearch} placeholder="Πελάτης ή κωδικός παραγγελίας…" /></div>
                        {tabs}
                    </div>
                }
            />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                <div className="grid grid-cols-1 gap-2 p-2 min-[400px]:gap-2.5 min-[400px]:p-3 md:grid-cols-2 lg:gap-3 lg:px-0 lg:pt-4 2xl:grid-cols-3">
                    {filteredOrders.map((order) => (
                        <SellerOrderCard key={order.id} order={order} onEdit={onEdit} onDelete={handleDeleteOrder} />
                    ))}
                </div>
                {filteredOrders.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                        <ShoppingCart size={36} className="opacity-25" />
                        <p className="text-sm font-bold">Δεν βρέθηκαν παραγγελίες.</p>
                        {myOrders.length === 0 && (
                            <button type="button" onClick={onCreate} className="mt-1 rounded-xl bg-[#060b00] px-4 py-2.5 text-xs font-bold text-white">
                                Δημιουργία πρώτης παραγγελίας
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
