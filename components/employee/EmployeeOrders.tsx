import OrderCustomerName from '../orders/OrderCustomerName';
import { getOrderCustomerName } from '../../utils/orderCustomer';
import { formatNumber } from '../../utils/numberFormat';

import React, { useDeferredValue, useMemo, useState } from 'react';
import { CalendarRange, ChevronRight, Plus, ShoppingCart, Package, Calendar, Loader2 } from 'lucide-react';
import { useOrdersList } from '../../hooks/api/useOrders';
import { Order, OrderStatus } from '../../types';
import { formatCurrency } from '../../utils/pricingEngine';
import { getOrderStatusClasses, getOrderStatusIcon, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import IliosLoader from '../ui/IliosLoader';
import { HeaderPrimaryButton } from '../DesktopPageHeader';
import PageHeader, { SearchField } from '../shell/PageHeader';
import { useViewport } from '../shell/viewport';
import { useIncrementalList } from '../shell/useIncrementalList';

interface Props {
    onCreate: () => void;
    onEdit: (order: Order) => void;
    onOpenDeliveries?: (order: Order) => void;
    /** Id of the order currently being opened for editing (shows a spinner on its row). */
    openingId?: string | null;
}

type FilterKey = 'all' | OrderStatus;

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'Όλες' },
    { key: OrderStatus.Pending, label: 'Εκκρεμείς' },
    { key: OrderStatus.InProduction, label: 'Σε παραγωγή' },
    { key: OrderStatus.Ready, label: 'Έτοιμες' },
    { key: OrderStatus.PartiallyDelivered, label: 'Μερικώς' },
    { key: OrderStatus.Delivered, label: 'Παραδόθηκαν' },
];

const netValueOf = (order: Order) => order.total_price / (1 + (order.vat_rate !== undefined ? order.vat_rate : 0.24));
const dateFormatter = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const shortId = (id: string) => id.slice(-8).toUpperCase();
const itemCountOf = (order: Order) => order.item_count ?? order.items.length;

const StatusPill = ({ status }: { status: OrderStatus }) => (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getOrderStatusClasses(status)}`}>
        {getOrderStatusIcon(status, 11)}
        {getOrderStatusLabel(status)}
    </span>
);

const OrderCard = React.memo<{ order: Order; busy: boolean; onEdit: (o: Order) => void; onOpenDeliveries?: (o: Order) => void }>(({ order, busy, onEdit, onOpenDeliveries }) => (
    <div
        className="flex items-stretch overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 96px' }}
    >
        <button type="button" onClick={() => onEdit(order)} className="min-w-0 flex-1 p-3 text-left active:bg-slate-50">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold leading-tight text-slate-900"><OrderCustomerName order={order} /></div>
                    <div className="mt-0.5 truncate font-mono text-[10px] font-bold text-slate-400">
                        #{shortId(order.id)}{order.seller_name ? <span className="font-sans font-semibold text-slate-500"> · {order.seller_name}</span> : null}
                    </div>
                </div>
                <StatusPill status={order.status} />
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1"><Calendar size={11} className="text-slate-400" />{dateFormatter.format(new Date(order.created_at))}</span>
                    <span className="inline-flex items-center gap-1"><Package size={11} className="text-slate-400" />{formatNumber(itemCountOf(order))} είδη</span>
                </div>
                <span className="flex items-center gap-1 text-base font-bold tabular-nums text-[#060b00]">
                    {formatCurrency(netValueOf(order))}
                    {busy ? <Loader2 size={15} className="animate-spin text-slate-400" /> : <ChevronRight size={15} className="text-slate-300" />}
                </span>
            </div>
        </button>
        {onOpenDeliveries && (
            <button
                type="button"
                onClick={() => onOpenDeliveries(order)}
                aria-label="Παράδοση"
                className="flex w-12 shrink-0 items-center justify-center border-l border-slate-100 text-slate-500 hover:bg-slate-50 active:bg-slate-100"
            >
                <CalendarRange size={17} />
            </button>
        )}
    </div>
));
OrderCard.displayName = 'OrderCard';

export default function EmployeeOrders({ onCreate, onEdit, onOpenDeliveries, openingId }: Props) {
    const { data: orders, isLoading } = useOrdersList();
    const { isDesktop } = useViewport();
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search.trim().toLowerCase());
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

    const counts = useMemo(() => {
        const map = new Map<FilterKey, number>([['all', orders?.length || 0]]);
        (orders || []).forEach((o) => map.set(o.status, (map.get(o.status) || 0) + 1));
        return map;
    }, [orders]);

    const filtered = useMemo(() => (orders || []).filter((o) => {
        if (activeFilter !== 'all' && o.status !== activeFilter) return false;
        if (!deferredSearch) return true;
        return `${getOrderCustomerName(o)} ${o.customer_name} ${o.id} ${o.seller_name || ''}`.toLowerCase().includes(deferredSearch);
    }), [orders, activeFilter, deferredSearch]);

    const { visible, hasMore, sentinelRef } = useIncrementalList(filtered, `${activeFilter}|${deferredSearch}`);

    if (isLoading && !orders) return <IliosLoader variant="section" detail="Παραγγελίες" className="h-full" />;

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
                        <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{formatNumber(counts.get(tab.key) || 0)}</span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <PageHeader
                icon={ShoppingCart}
                title="Παραγγελίες"
                subtitle={`${formatNumber(orders?.length || 0)} συνολικά`}
                actions={isDesktop ? (
                    <HeaderPrimaryButton icon={Plus} onClick={onCreate}>Νέα παραγγελία</HeaderPrimaryButton>
                ) : (
                    <button type="button" onClick={onCreate} className="flex h-10 items-center gap-1.5 rounded-xl bg-[#060b00] pl-2.5 pr-3.5 text-[13px] font-bold text-white active:scale-95">
                        <Plus size={17} className="text-amber-300" /> Νέα
                    </button>
                )}
                below={
                    <div className="space-y-2.5">
                        <div className="flex"><SearchField value={search} onChange={setSearch} placeholder="Πελάτης, πλασιέ ή κωδικός…" /></div>
                        {tabs}
                    </div>
                }
            />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                {isDesktop ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Κωδ.</th>
                                    <th className="px-4 py-3">Πελάτης</th>
                                    <th className="px-4 py-3">Ημερομηνία</th>
                                    <th className="px-4 py-3 text-right">Είδη</th>
                                    <th className="px-4 py-3 text-right">Καθαρό</th>
                                    <th className="px-4 py-3 text-center">Κατάσταση</th>
                                    <th className="px-4 py-3 text-right">Παράδοση</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visible.map((order) => (
                                    <tr key={order.id} onClick={() => onEdit(order)} className="cursor-pointer transition-colors hover:bg-slate-50">
                                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">
                                            <span className="inline-flex items-center gap-1.5">#{shortId(order.id)}{openingId === order.id && <Loader2 size={13} className="animate-spin" />}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-800"><OrderCustomerName order={order} /></div>
                                            {order.seller_name && <div className="mt-0.5 text-[11px] text-slate-500">Πλασιέ: {order.seller_name}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">{dateFormatter.format(new Date(order.created_at))}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatNumber(itemCountOf(order))}</td>
                                        <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{formatCurrency(netValueOf(order))}</td>
                                        <td className="px-4 py-3 text-center"><StatusPill status={order.status} /></td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onOpenDeliveries?.(order); }}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                                            >
                                                <CalendarRange size={13} /> Παράδοση
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="space-y-2 p-2 min-[400px]:p-3">
                        {visible.map((order) => (
                            <OrderCard key={order.id} order={order} busy={openingId === order.id} onEdit={onEdit} onOpenDeliveries={onOpenDeliveries} />
                        ))}
                    </div>
                )}
                {hasMore && <div ref={sentinelRef} className="h-10" />}
                {filtered.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                        <ShoppingCart size={34} className="opacity-25" />
                        <p className="text-sm font-bold">Δεν βρέθηκαν παραγγελίες.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
