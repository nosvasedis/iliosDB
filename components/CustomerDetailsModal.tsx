import CustomerPhoneFields from './customers/CustomerPhoneFields';
import CustomerVatStatusAlert from './customers/CustomerVatStatusAlert';
import { useCustomerVatLookup } from './customers/useCustomerVatLookup';
import CustomerVatProfileSuggestion from './customers/CustomerVatProfileSuggestion';
import OrderCustomerName from './orders/OrderCustomerName';
import { formatDecimal, formatNumber } from '../utils/numberFormat';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Customer, Order, OrderShipmentItem, OrderStatus, VatRegime } from '../types';
import {
    Phone,
    Mail,
    MapPin,
    Save,
    Loader2,
    X,
    ShoppingBag,
    Calendar,
    PieChart,
    Trash2,
    Printer,
    Trophy,
    Zap,
    Wallet,
    Package,
    Users as UsersIcon,
    ArrowRight,
    Gift,
    Copy,
    Check,
    Search,
    LayoutDashboard,
    Receipt,
    StickyNote,
    ArrowRightLeft,
    HandHeart,
    Wrench,
    Plus,
    Pencil,
    Navigation,
    Building2,
    Hash,
    Contact as IdCard,
    Briefcase,
    TrendingUp,
    Clock,
    Store,
    ChevronRight,
    Globe2,
    Landmark,
    Star,
    Gem,
    Radar,
    Sparkles,
    Warehouse,
} from 'lucide-react';
import { INTERNAL_CUSTOMER_ID, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import { extractRetailClientFromNotes } from '../utils/retailNotes';
import { getNextNamedayForName } from '../utils/namedays';
import { formatGreekDate } from '../utils/deliveryLabels';
import { getOrderStatusClasses, getOrderStatusLabel } from '../features/orders/statusPresentation';
import { canOfferRemainingTransfer, getCandidateTransferTargetOrders } from '../features/orders/transferHelpers';
import { useAllShipmentItems, useAllShipments } from '../hooks/api/useOrders';
import { useProductionBatches } from '../hooks/api/useProductionBatches';
import { isOrderReadyForShipment } from '../utils/orderReadiness';
import TransferRemainingItemsModal from './TransferRemainingItemsModal';
import CustomerAssortmentPanel from './customers/CustomerAssortmentPanel';
import { CustomerProfileEditor, CustomerProfileSummary, CustomerSocialsPane, SocialIconRow } from './customers/customerProfileUi';
import { useAssortmentIndex, useTerritoryPrefs } from './customers/useCustomerTerritory';
import { getCustomerAssortment, overlapsForCustomer, SEVERITY_META } from '../features/customers/customerAssortment';
import { cleanCustomerProfile, collectCustomerTags, readCustomerProfile, savedSocials } from '../features/customers/customerProfile';
import { useCustomers } from '../hooks/api/useOrders';
import { useCustomerServiceWorkspace } from '../hooks/api/useCustomerService';
import { CONSIGNMENT_STATUS_LABELS, REPAIR_ORIGIN_LABELS, consignmentSaleTotal, findLiveRepairBatch, formatGreekDateOnly, formatGreekMoney } from '../features/customerService';
import ConsignmentBadge from './customerService/ConsignmentBadge';
import RepairBadge from './customerService/RepairBadge';
import RepairStageBadge from './customerService/RepairStageBadge';
import CustomerServiceQuickForm from './customerService/CustomerServiceQuickForm';
import SkuColorizedText from './SkuColorizedText';
import CustomerVatExemptionFields from './CustomerVatExemptionFields';
import { ActivityBadge, CustomerAvatar, CustomerCategorySummary, RegionPill } from './customers/customerUi';
import {
    addressCountryMismatch,
    CountryMismatchHint,
    CountrySelect,
    CustomerBranchesEditor,
    OverseasVatSuggestion,
    withCustomerCountry,
} from './customers/customerProfileFields';
import {
    summarizeCustomerOrders,
    composeBranchAddress,
    customerBranches,
    formatDaysAgo,
    isDomesticCountry,
    normalizeCountry,
    PRECISION_LABEL,
    resolveBranchLocation,
    resolveCustomerLocation,
} from '../features/customers/customerLocation';
import { countryDisplayName } from '../features/customers/greekRegions';
import { isInspectionModeActive } from '../lib/inspectionMode';

export interface CustomerDetailsModalProps {
    customer: Customer;
    orders: Order[];
    onClose: () => void;
    onUpdate: (c: Customer) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onPrintOrder?: (o: Order) => void;
    /** Shown as a "Χάρτης" quick action and on the location card. */
    onShowOnMap?: () => void;
    /** Opens another customer's card (neighbours in «Γκάμα & Περιοχή»). */
    onOpenCustomer?: (customerId: string) => void;
}

const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10';
const sectionCard = 'rounded-2xl border border-slate-100 bg-white shadow-sm';
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_CONSIGNMENT_STATUSES = new Set(['completed', 'cancelled']);

const netOf = (o: Order) => o.total_price / (1 + (o.vat_rate ?? 0.24));
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('el-GR');

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function OrderIdRow({ orderId, copied, onCopy, compact }: { orderId: string; copied: boolean; onCopy: () => void; compact?: boolean }) {
    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <span
                className={`truncate font-mono font-bold tracking-tight text-slate-800 ${compact ? 'text-[11px]' : 'text-xs sm:text-sm'}`}
                title={orderId}
            >
                {orderId}
            </span>
            <button
                type="button"
                onClick={e => { e.stopPropagation(); onCopy(); }}
                className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
                title="Αντιγραφή κωδικού"
                aria-label="Αντιγραφή κωδικού παραγγελίας"
            >
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            </button>
        </div>
    );
}

function SectionTitle({ icon: Icon, title, action }: { icon: typeof Phone; title: string; action?: React.ReactNode }) {
    return (
        <div className="mb-2.5 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                <Icon size={12} /> {title}
            </h3>
            {action}
        </div>
    );
}

function InfoRow({ icon: Icon, label, value, href, copyValue, mono, onCopy }: {
    icon: typeof Phone; label: string; value?: React.ReactNode; href?: string; copyValue?: string; mono?: boolean;
    onCopy?: (value: string, label: string) => void;
}) {
    const empty = value === undefined || value === null || value === '';
    const content = empty ? <span className="font-medium italic text-slate-300">—</span> : value;
    return (
        <div className="group flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-white">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm ring-1 ring-slate-100">
                <Icon size={14} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
                {href && !empty ? (
                    <a href={href} className={`block break-words text-[13px] font-bold text-slate-800 hover:text-sky-700 ${mono ? 'font-mono' : ''}`}>{content}</a>
                ) : (
                    <div className={`break-words text-[13px] font-bold text-slate-800 ${mono ? 'font-mono' : ''}`}>{content}</div>
                )}
            </div>
            {copyValue && onCopy && (
                <button
                    type="button"
                    onClick={() => onCopy(copyValue, label)}
                    className="mt-1 shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                    title={`Αντιγραφή: ${label}`}
                >
                    <Copy size={13} />
                </button>
            )}
        </div>
    );
}

function QuickAction({ icon: Icon, label, href, onClick, disabled, title }: {
    icon: typeof Phone; label: string; href?: string; onClick?: () => void; disabled?: boolean; title?: string;
}) {
    const cls = `flex flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2.5 text-[11px] font-bold transition ${disabled
        ? 'pointer-events-none border-slate-100 bg-slate-50 text-slate-300'
        : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'}`;
    if (href && !disabled) {
        return <a href={href} className={cls} title={title ?? label}><Icon size={17} /> {label}</a>;
    }
    return <button type="button" onClick={onClick} disabled={disabled} className={cls} title={title ?? label}><Icon size={17} /> {label}</button>;
}

function KpiCard({ icon: Icon, label, value, sub, tone }: { icon: typeof Phone; label: string; value: React.ReactNode; sub?: React.ReactNode; tone: string }) {
    return (
        <div className={`${sectionCard} flex items-start gap-3 p-4`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></span>
            <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
                <div className="mt-0.5 truncate text-xl font-black tabular-nums text-slate-900">{value}</div>
                {sub && <div className="truncate text-[11px] font-semibold text-slate-400">{sub}</div>}
            </div>
        </div>
    );
}

function FormField({ label, hint, children, className = '' }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1.5 block text-[11px] font-bold text-slate-500">{label}</span>
            {children}
            {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
        </label>
    );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Phone; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 py-12 text-center">
            <Icon size={34} className="mb-2 text-slate-200" />
            <p className="text-sm font-medium text-slate-400">{text}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------

export default function CustomerDetailsModal({
    customer,
    orders,
    onClose,
    onUpdate,
    onDelete,
    onPrintOrder,
    onShowOnMap,
    onOpenCustomer,
}: CustomerDetailsModalProps) {
    /** Λιανική specifically (end clients from order notes). */
    const isRetailAccount = customer.id === RETAIL_CUSTOMER_ID;
    /** «Εσωτερική παραγγελία»: our own orders, not sales. */
    const isInternalAccount = customer.id === INTERNAL_CUSTOMER_ID;
    /** Any system account: read-only, no identity, no territory. */
    const isRetailSystemCustomer = isRetailAccount || isInternalAccount;
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Customer>(customer);
    const [isSaving, setIsSaving] = useState(false);
    const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
    const [transferOrder, setTransferOrder] = useState<Order | null>(null);
    const { showToast } = useUI();
    const vatLookup = useCustomerVatLookup(setEditForm);
    const { isSearching: isSearchingAfm, evidence: vatLookupEvidence } = vatLookup;
    const { data: allShipments } = useAllShipments();
    const { data: allShipmentItems } = useAllShipmentItems();
    const { data: batches } = useProductionBatches();
    const { data: customerServiceData } = useCustomerServiceWorkspace();
    const { data: allCustomers } = useCustomers();
    const assortmentIndex = useAssortmentIndex();
    const territoryPrefs = useTerritoryPrefs();
    const tagSuggestions = useMemo(() => collectCustomerTags(allCustomers), [allCustomers]);
    /** All-time assortment: «τι αγοράζει» on the overview. */
    const assortment = useMemo(
        () => (assortmentIndex ? getCustomerAssortment(assortmentIndex, customer.id, 'all') : null),
        [assortmentIndex, customer.id],
    );
    const territoryOverlaps = useMemo(
        () => (assortmentIndex && !isRetailSystemCustomer
            ? overlapsForCustomer(assortmentIndex, customer.id, { radiusKm: territoryPrefs.radiusKm, window: territoryPrefs.window, ignored: territoryPrefs.ignoredSet })
            : []),
        [assortmentIndex, isRetailSystemCustomer, customer.id, territoryPrefs.radiusKm, territoryPrefs.window, territoryPrefs.ignoredSet],
    );
    const customerLocation = useMemo(() => resolveCustomerLocation(customer), [customer]);
    const draftLocation = useMemo(() => resolveCustomerLocation(editForm), [editForm]);
    const branches = useMemo(() => customerBranches(customer), [customer]);
    const isDomestic = isDomesticCountry(customer.country);
    const draftIsDomestic = isDomesticCountry(editForm.country);
    const countryName = countryDisplayName(normalizeCountry(customer.country));
    const inspectionLocked = isInspectionModeActive();
    /** Main place for the location card: main shop, else fiscal seat. */
    const mainBranch = branches[0] ?? null;
    const mainLocation = useMemo(
        () => (mainBranch ? resolveBranchLocation(customer, mainBranch) : customerLocation),
        [customer, mainBranch, customerLocation],
    );

    const customerConsignments = useMemo(
        () => (customerServiceData?.consignments || []).filter(entry => entry.customer_id === customer.id),
        [customerServiceData?.consignments, customer.id]
    );
    const customerRepairs = useMemo(
        () => (customerServiceData?.repairItems || []).filter(entry => entry.customer_id === customer.id),
        [customerServiceData?.repairItems, customer.id]
    );
    const openConsignments = customerConsignments.filter(c => !CLOSED_CONSIGNMENT_STATUSES.has(c.status)).length;
    const openRepairs = customerRepairs.filter(r => !r.is_archived).length;

    const shipmentItemsByOrderId = useMemo(() => {
        const map = new Map<string, OrderShipmentItem[]>();
        if (!allShipments || !allShipmentItems) return map;
        const shipmentToOrder = new Map(allShipments.map(shipment => [shipment.id, shipment.order_id]));
        for (const item of allShipmentItems) {
            const orderId = shipmentToOrder.get(item.shipment_id);
            if (!orderId) continue;
            const existing = map.get(orderId);
            if (existing) existing.push(item);
            else map.set(orderId, [item]);
        }
        return map;
    }, [allShipments, allShipmentItems]);

    const shippedQtyByOrderId = useMemo(() => {
        const map = new Map<string, number>();
        shipmentItemsByOrderId.forEach((items, orderId) => {
            map.set(orderId, items.reduce((sum, item) => sum + item.quantity, 0));
        });
        return map;
    }, [shipmentItemsByOrderId]);

    const batchesByOrderId = useMemo(() => {
        const map = new Map<string, NonNullable<typeof batches>>();
        (batches ?? []).forEach(batch => {
            if (!batch.order_id) return;
            const existing = map.get(batch.order_id);
            if (existing) existing.push(batch);
            else map.set(batch.order_id, [batch]);
        });
        return map;
    }, [batches]);

    type NormalTab = 'overview' | 'details' | 'orders' | 'assortment' | 'consignments' | 'repairs';
    type RetailTab = 'overview' | 'end_clients' | 'categories' | 'orders';
    const [activeTab, setActiveTab] = useState<NormalTab | RetailTab>('overview');
    const [assortmentSection, setAssortmentSection] = useState<'range' | 'territory' | 'ideas'>('range');
    const openAssortment = (section: 'range' | 'territory' | 'ideas') => { setAssortmentSection(section); setActiveTab('assortment'); };
    /** Open the social pane of the editor directly. */
    const [editFocus, setEditFocus] = useState<'socials' | null>(null);
    const [serviceForm, setServiceForm] = useState<'consignment' | 'repair' | null>(null);
    const [orderQuery, setOrderQuery] = useState('');

    useEffect(() => {
        setEditForm(customer);
        setIsEditing(false);
        setActiveTab('overview');
        setAssortmentSection('range');
        setOrderQuery('');
    }, [customer.id]);

    useEffect(() => {
        if (!isEditing) setEditForm(customer);
    }, [customer, isEditing]);

    useEffect(() => {
        if (!isEditing || editFocus !== 'socials') return;
        const id = window.setTimeout(() => document.getElementById('customer-edit-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        return () => window.clearTimeout(id);
    }, [isEditing, editFocus]);

    // Esc closes the card (but never discards an edit in progress).
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || transferOrder || serviceForm) return;
            if (isEditing) return;
            onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isEditing, onClose, transferOrder, serviceForm]);

    const stats = useMemo(() => {
        const customerOrders = orders
            .filter(
                o =>
                    o.status !== OrderStatus.Cancelled &&
                    (o.customer_id === customer.id || o.customer_name === customer.full_name)
            )
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const totalSpent = customerOrders.reduce((acc, o) => acc + netOf(o), 0);
        // Use the directory's customer-id association for the category as well.
        const summary = summarizeCustomerOrders(orders.filter(o => o.customer_id === customer.id));
        const orderCount = customerOrders.length;
        const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;

        const totalItems = customerOrders.reduce((acc, o) => acc + o.items.reduce((sum, item) => sum + (item.quantity || 0), 0), 0);

        const latestOrder = customerOrders[0];
        const oldestOrder = customerOrders[customerOrders.length - 1];
        const daysSinceLast = latestOrder ? Math.max(0, Math.floor((Date.now() - new Date(latestOrder.created_at).getTime()) / DAY_MS)) : null;

        let activeMonths = 0;
        if (latestOrder && oldestOrder) {
            activeMonths = Math.max(
                1,
                Math.round((new Date(latestOrder.created_at).getTime() - new Date(oldestOrder.created_at).getTime()) / (DAY_MS * 30))
            );
        }

        const yearAgo = Date.now() - 365 * DAY_MS;
        const last12mSpent = customerOrders
            .filter(o => new Date(o.created_at).getTime() >= yearAgo)
            .reduce((acc, o) => acc + netOf(o), 0);

        return {
            totalSpent,
            last12mSpent,
            orderCount,
            avgOrderValue,
            history: customerOrders,
            totalItems,
            latestOrder,
            firstOrder: oldestOrder,
            daysSinceLast,
            summary,
            activeMonths,
        };
    }, [customer, orders]);

    const canTransferOrderFromCustomerList = useCallback((order: Order) => {
        const candidateTargets = getCandidateTransferTargetOrders(order, stats.history);
        if (candidateTargets.length === 0) return false;
        return canOfferRemainingTransfer(
            order,
            shipmentItemsByOrderId.get(order.id) || [],
            isOrderReadyForShipment(order, batchesByOrderId.get(order.id), shippedQtyByOrderId.get(order.id)),
        );
    }, [batchesByOrderId, shipmentItemsByOrderId, shippedQtyByOrderId, stats.history]);

    const filteredOrders = useMemo(() => {
        const q = orderQuery.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!q) return stats.history;
        return stats.history.filter(o => {
            if (o.id.toLowerCase().includes(q)) return true;
            const dateStr = new Date(o.created_at).toLocaleDateString('el-GR');
            if (dateStr.toLowerCase().includes(q)) return true;
            if (o.items.some(item => {
                const haystack = [
                    item.sku,
                    item.variant_suffix,
                    item.product_details?.category,
                    item.product_details?.description,
                    item.notes,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '');
                return haystack.includes(q);
            })) return true;
            if (isRetailAccount) {
                const raw = extractRetailClientFromNotes(o.notes).retailClientLabel || '';
                const label = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (label.includes(q)) return true;
            }
            return false;
        });
    }, [stats.history, orderQuery, isRetailAccount]);

    const retailOrdersWithLabels = useMemo(() => (isRetailAccount
        ? stats.history.map(o => ({ order: o, retailClientLabel: extractRetailClientFromNotes(o.notes).retailClientLabel }))
        : []), [isRetailAccount, stats.history]);

    const retailClientStats = useMemo(() => {
        if (!isRetailAccount) return [];
        const clientMap: Record<string, { name: string; orderCount: number; totalRevenue: number }> = {};
        retailOrdersWithLabels.forEach(({ order, retailClientLabel }) => {
            const label = retailClientLabel || 'Χωρίς τελικό πελάτη';
            if (!clientMap[label]) clientMap[label] = { name: label, orderCount: 0, totalRevenue: 0 };
            clientMap[label].orderCount += 1;
            clientMap[label].totalRevenue += netOf(order);
        });
        return Object.values(clientMap).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);
    }, [retailOrdersWithLabels, isRetailAccount]);

    const handleSave = async () => {
        if (isRetailSystemCustomer) {
            showToast('Ο πελάτης Λιανική είναι μόνο για ανάγνωση.', 'error');
            return;
        }
        if (!editForm.full_name.trim()) {
            showToast('Το ονοματεπώνυμο είναι υποχρεωτικό.', 'error');
            return;
        }
        if (editForm.vat_rate === 0 && !editForm.vat_exemption_category) {
            showToast('Επιλέξτε την πραγματική αιτία απαλλαγής ΦΠΑ.', 'error');
            return;
        }
        const cleanBranches = (Array.isArray(editForm.branches) ? editForm.branches : [])
            .filter(b => b.label?.trim() || b.street?.trim() || b.city?.trim())
            .map((b, index) => ({ ...b, label: b.label?.trim() || `Κατάστημα ${index + 1}` }));
        if (cleanBranches.length > 0 && !cleanBranches.some(b => b.is_primary)) cleanBranches[0] = { ...cleanBranches[0], is_primary: true };
        const payload: Customer = {
            ...editForm,
            country: normalizeCountry(editForm.country),
            vat_number: draftIsDomestic
                ? editForm.vat_number
                : (editForm.vat_number || '').toUpperCase().replace(/\s+/g, ''),
            branches: cleanBranches,
            profile: cleanCustomerProfile(editForm.profile ?? {}),
        };
        // Customers that never had a profile don't send an empty one.
        if (customer.profile === undefined && Object.keys(payload.profile ?? {}).length === 0) delete payload.profile;
        if (!(await vatLookup.confirmSave(editForm.vat_number))) return;
        setIsSaving(true);
        try {
            await onUpdate(payload);
            setIsEditing(false);
        } catch (e) {
            console.error('Save error:', e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAfmLookup = async () => {
        await vatLookup.lookup(editForm.vat_number);
    };

    const copyOrderId = useCallback(
        async (orderId: string) => {
            try {
                await navigator.clipboard.writeText(orderId);
                setCopiedOrderId(orderId);
                showToast('Ο κωδικός παραγγελίας αντιγράφηκε', 'success');
                window.setTimeout(() => setCopiedOrderId(id => (id === orderId ? null : id)), 2000);
            } catch {
                showToast('Δεν ήταν δυνατή η αντιγραφή', 'error');
            }
        },
        [showToast]
    );

    const copyValue = useCallback(async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            showToast(`${label}: αντιγράφηκε`, 'success');
        } catch {
            showToast('Δεν ήταν δυνατή η αντιγραφή', 'error');
        }
    }, [showToast]);

    const startEditing = (focus: 'socials' | null = null) => {
        setEditForm({ ...customer, profile: readCustomerProfile(customer) });
        setEditFocus(focus);
        setIsEditing(true);
    };
    const cancelEditing = () => {
        setEditForm(customer);
        setIsEditing(false);
    };

    const retailTabList: { id: RetailTab; label: string; Icon: typeof LayoutDashboard; count?: number }[] = [
        { id: 'overview', label: 'Επισκόπηση', Icon: LayoutDashboard },
        { id: 'end_clients', label: 'Τελικοί πελάτες', Icon: UsersIcon },
        { id: 'categories', label: 'Είδη', Icon: PieChart },
        { id: 'orders', label: 'Παραγγελίες', Icon: ShoppingBag, count: stats.orderCount },
    ];
    const normalTabList: { id: NormalTab; label: string; Icon: typeof LayoutDashboard; count?: number; narrowOnly?: boolean }[] = [
        { id: 'overview', label: 'Επισκόπηση', Icon: LayoutDashboard },
        { id: 'details', label: 'Στοιχεία', Icon: IdCard, narrowOnly: true },
        { id: 'orders', label: 'Παραγγελίες', Icon: ShoppingBag, count: stats.orderCount },
        { id: 'assortment', label: 'Γκάμα & Περιοχή', Icon: Gem, count: territoryOverlaps.length || undefined },
        { id: 'consignments', label: 'Παρακαταθήκες', Icon: HandHeart, count: customerConsignments.length },
        { id: 'repairs', label: 'Επισκευές', Icon: Wrench, count: customerRepairs.length },
    ];
    const tabList = isRetailAccount ? retailTabList : isInternalAccount ? retailTabList.filter(t => t.id !== 'end_clients') : normalTabList;

    /** Λιανική is a bucket for many real clients — no single identity, nameday, or "VIP" person. */
    const nextNameday =
        !isRetailSystemCustomer && customer.full_name && customer.full_name !== RETAIL_CUSTOMER_NAME
            ? getNextNamedayForName(customer.full_name)
            : null;
    const isVip = stats.summary.tier === 'top' && !isRetailSystemCustomer;
    const vatPercent = formatDecimal(((customer.vat_rate ?? 0.24) * 100), 0);

    // -----------------------------------------------------------------------
    // Sections
    // -----------------------------------------------------------------------

    /** One-click fix when the address names another country than the «Χώρα» field. */
    const [isFixingCountry, setIsFixingCountry] = useState(false);
    const fixCountry = async (code: string) => {
        setIsFixingCountry(true);
        try {
            await onUpdate(withCustomerCountry(customer, code));
        } catch (e) {
            console.error('Country fix error:', e);
        } finally {
            setIsFixingCountry(false);
        }
    };

    const savedProfile = readCustomerProfile(customer);
    const hasProfileSummary = Boolean(
        savedProfile.contacts?.length || savedProfile.shop_type || savedProfile.positioning || savedProfile.clientele
        || savedProfile.season || savedProfile.opening_hours || savedProfile.payment_method || savedProfile.credit_days
        || savedProfile.credit_limit || savedProfile.tags?.length || savedProfile.exclusivity,
    );

    const detailsSections = (
        <div className="space-y-5">
            {!isRetailSystemCustomer && addressCountryMismatch(customer) && !inspectionLocked && (
                <CountryMismatchHint customer={customer} onFix={fixCountry} busy={isFixingCountry} />
            )}
            <section>
                <SectionTitle icon={Phone} title="Επικοινωνία" />
                <div className="space-y-0.5">
                    <InfoRow icon={Phone} label="Κινητό" value={customer.mobile_phone} copyValue={customer.mobile_phone} onCopy={copyValue} />
<InfoRow icon={Phone} label="Σταθερό" value={customer.landline_phone} copyValue={customer.landline_phone} onCopy={copyValue} />
{customer.phone_unclassified && <InfoRow icon={Phone} label="Τηλέφωνο προς έλεγχο" value={customer.phone_unclassified} />}
                    <InfoRow icon={Mail} label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} copyValue={customer.email} onCopy={copyValue} />
                    <InfoRow
                        icon={Landmark}
                        label="Φορολογική έδρα · παραστατικά"
                        value={customer.address ? (
                            <span className="block">
                                {customer.address}
                                {!isDomestic && <span className="block text-xs font-semibold text-violet-700">{countryName}</span>}
                                {branches.length === 0 && <span className="mt-1 flex"><RegionPill location={customerLocation} /></span>}
                            </span>
                        ) : (!isDomestic ? countryName : undefined)}
                        copyValue={customer.address}
                        onCopy={copyValue}
                    />
                </div>
            </section>
            {!isRetailSystemCustomer && (
                <CustomerSocialsPane customer={customer} onEdit={inspectionLocked ? undefined : () => startEditing('socials')} />
            )}
            {!isRetailSystemCustomer && hasProfileSummary && (
                <section>
                    <SectionTitle
                        icon={UsersIcon}
                        title="Προφίλ & εμπορικοί όροι"
                        action={<button type="button" onClick={() => startEditing()} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50">Επεξεργασία</button>}
                    />
                    <CustomerProfileSummary customer={customer} collectionNames={assortmentIndex?.collections} />
                </section>
            )}
            <section>
                <SectionTitle
                    icon={Store}
                    title={`Καταστήματα${branches.length ? ` (${branches.length})` : ''}`}
                    action={<button type="button" onClick={() => startEditing()} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50">{branches.length ? 'Διαχείριση' : 'Προσθήκη'}</button>}
                />
                {branches.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-[12px] text-slate-400">
                        Χωρίς καταχωρημένα καταστήματα — στον χάρτη χρησιμοποιείται η φορολογική έδρα.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {branches.map(branch => {
                            const location = resolveBranchLocation(customer, branch);
                            const address = composeBranchAddress(branch);
                            return (
                                <div key={branch.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                                    <div className="flex items-center gap-1.5">
                                        {branch.is_primary ? <Star size={12} className="shrink-0 fill-sky-500 text-sky-500" /> : <Store size={12} className="shrink-0 text-slate-400" />}
                                        <span className="truncate text-[13px] font-black text-slate-800">{branch.label}</span>
                                        {branch.is_primary && <span className="ml-auto shrink-0 rounded-full bg-sky-50 px-1.5 py-px text-[9px] font-black uppercase text-sky-700">Κύριο</span>}
                                    </div>
                                    {address && (
                                        <div className="mt-0.5 flex items-start gap-1 text-[12px] font-semibold text-slate-600">
                                            <span className="min-w-0 flex-1 break-words">{address}</span>
                                            <button type="button" onClick={() => copyValue(address, branch.label)} className="shrink-0 rounded p-0.5 text-slate-300 hover:text-slate-700" title="Αντιγραφή διεύθυνσης"><Copy size={12} /></button>
                                        </div>
                                    )}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        <RegionPill location={location} />
                                        {branch.phone && (
                                            <a href={`tel:${branch.phone}`} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-100 hover:text-sky-700">
                                                <Phone size={10} /> {branch.phone}
                                            </a>
                                        )}
                                    </div>
                                    {(branch.contact_person || branch.notes) && (
                                        <div className="mt-1 text-[11px] text-slate-400">{[branch.contact_person, branch.notes].filter(Boolean).join(' · ')}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
            <section>
                <SectionTitle icon={Receipt} title="Φορολογικά στοιχεία" />
                {isRetailSystemCustomer ? <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">{isInternalAccount
                    ? 'Καρτέλα του συστήματος για παραγγελίες προς δικό μας απόθεμα. Δεν έχει ΑΦΜ και δεν εκδίδονται παραστατικά.'
                    : 'Γενική καρτέλα λιανικών πωλήσεων, χωρίς δικό της ΑΦΜ. Για τιμολόγιο χρησιμοποιήστε ξεχωριστή καρτέλα με τα πραγματικά στοιχεία του πελάτη.'}</p> : <div className="space-y-0.5">
                    <InfoRow icon={Hash} label={isDomestic ? 'ΑΦΜ' : 'VAT / Tax ID'} value={customer.vat_number} mono copyValue={customer.vat_number} onCopy={copyValue} />
                    {isDomestic
                        ? <InfoRow icon={Building2} label="ΔΟΥ" value={customer.tax_office} />
                        : <InfoRow icon={Globe2} label="Χώρα" value={countryName} />}
                    <InfoRow icon={Briefcase} label="Επάγγελμα" value={customer.profession} />
                    <InfoRow
                        icon={Receipt}
                        label="Καθεστώς ΦΠΑ"
                        value={(
                            <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-black ${customer.vat_rate === 0 ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>
                                {vatPercent}% ΦΠΑ
                            </span>
                        )}
                    />
                    {customer.vat_rate === 0 && (
                        <div className="ml-12 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                            <div className="font-black">Αιτία απαλλαγής myDATA: {customer.vat_exemption_category || 'δεν έχει οριστεί'}</div>
                            {customer.vat_exemption_legal_note && <div className="mt-0.5 font-semibold">{customer.vat_exemption_legal_note}</div>}
                        </div>
                    )}
                </div>}
            </section>
            <section>
                <SectionTitle
                    icon={StickyNote}
                    title="Σημειώσεις"
                    action={<button type="button" onClick={() => startEditing()} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50">Επεξεργασία</button>}
                />
                <p className={`whitespace-pre-wrap rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-[13px] leading-relaxed ${customer.notes ? 'text-slate-700' : 'italic text-slate-300'}`}>
                    {customer.notes || 'Καμία σημείωση.'}
                </p>
            </section>
        </div>
    );

    const recentOrdersCard = (
        <div className={`${sectionCard} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><ShoppingBag size={16} className="text-sky-600" /> Πρόσφατες παραγγελίες</h3>
                {stats.orderCount > 0 && (
                    <button type="button" onClick={() => setActiveTab('orders')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-sky-700 hover:bg-sky-50">
                        Όλες ({formatNumber(stats.orderCount)}) <ArrowRight size={12} />
                    </button>
                )}
            </div>
            {stats.history.length > 0 ? (
                <div className="divide-y divide-slate-50">
                    {stats.history.slice(0, 5).map(o => {
                        return (
                            <div key={o.id} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/70">
                                <div className="min-w-0 flex-1">
                                    <OrderIdRow orderId={o.id} copied={copiedOrderId === o.id} onCopy={() => copyOrderId(o.id)} compact />
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-400">
                                        <span>{formatDate(o.created_at)}</span>
                                        <span>·</span>
                                        <span>{formatNumber(o.items.length)} είδη</span>
                                        {isRetailAccount && <span className="text-sm font-bold text-slate-800"><OrderCustomerName order={o} /></span>}
                                    </div>
                                </div>
                                <span className={`hidden shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide sm:inline ${getOrderStatusClasses(o.status)}`}>
                                    {getOrderStatusLabel(o.status)}
                                </span>
                                <span className="w-24 shrink-0 text-right font-mono text-sm font-black text-slate-800">{formatCurrency(netOf(o))}</span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="py-10 text-center text-sm text-slate-400">Δεν υπάρχουν παραγγελίες ακόμα.</p>
            )}
        </div>
    );

    /** Jewellery kinds bought (all time), from the shared assortment index. */
    const categoriesBars = (limit: number) => (
        !assortment ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-7 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : assortment.kinds.length > 0 ? (
            <div className="space-y-3">
                {assortment.kinds.slice(0, limit).map((item, index) => (
                    <div key={item.key}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-bold text-slate-700">
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
                                <span className="truncate">{item.label}</span>
                            </span>
                            <span className="shrink-0 text-[11px] font-bold text-slate-500">{formatNumber(item.qty)} τεμ. · {formatNumber(item.skuCount)} κωδ.</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-700" style={{ width: `${Math.max(4, item.share)}%` }} />
                        </div>
                    </div>
                ))}
                {assortment.collections.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {assortment.collections.slice(0, 4).map(c => (
                            <span key={c.key} className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-100">{c.label} · {formatNumber(c.qty)}</span>
                        ))}
                    </div>
                )}
            </div>
        ) : (
            <p className="py-6 text-center text-xs text-slate-400">Δεν υπάρχουν δεδομένα αγορών.</p>
        )
    );

    const worstOverlap = territoryOverlaps[0] ?? null;
    const sharedSkuCount = new Set(territoryOverlaps.flatMap(o => o.sharedSkus.map(x => x.sku))).size;
    const territoryCard = (
        <div className={`${sectionCard} p-5`}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><Radar size={16} className="text-orange-500" /> Περιοχή</h3>
            {!assortmentIndex ? (
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
            ) : !worstOverlap ? (
                <p className="text-xs leading-relaxed text-slate-500">Κανένας γειτονικός πελάτης σε {territoryPrefs.radiusKm.toLocaleString('el-GR')} km δεν έχει ίδιους κωδικούς ή συλλογές.</p>
            ) : (
                <div className="space-y-1.5">
                    <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${SEVERITY_META[worstOverlap.severity].tone}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_META[worstOverlap.severity].dot}`} /> {SEVERITY_META[worstOverlap.severity].label}
                    </div>
                    <p className="text-xs text-slate-600">
                        <b>{formatNumber(territoryOverlaps.length)}</b> {territoryOverlaps.length === 1 ? 'γειτονικός πελάτης' : 'γειτονικοί πελάτες'} με κοινή γκάμα
                        {sharedSkuCount ? ` · ${formatNumber(sharedSkuCount)} κοινοί κωδικοί` : ''}.
                    </p>
                </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => openAssortment('territory')} className="flex items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100"><Radar size={12} /> Επικαλύψεις</button>
                <button type="button" onClick={() => openAssortment('ideas')} className="flex items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100"><Sparkles size={12} /> Προτάσεις</button>
            </div>
        </div>
    );

    const normalOverview = (
        <div className="space-y-5">
            <CustomerCategorySummary summary={stats.summary} />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <KpiCard icon={Wallet} label="Καθαρός τζίρος" value={formatCurrency(stats.totalSpent)} sub={`${formatCurrency(stats.last12mSpent)} τους τελευταίους 12 μήνες`} tone="bg-emerald-50 text-emerald-600" />
                <KpiCard icon={ShoppingBag} label="Παραγγελίες" value={formatNumber(stats.orderCount)} sub={`${formatNumber(stats.totalItems)} τεμάχια συνολικά`} tone="bg-sky-50 text-sky-600" />
                <KpiCard icon={TrendingUp} label="Μέση αξία" value={formatCurrency(stats.avgOrderValue)} sub="ανά παραγγελία" tone="bg-violet-50 text-violet-600" />
                <KpiCard
                    icon={Clock}
                    label="Τελευταία παραγγελία"
                    value={stats.latestOrder ? formatDaysAgo(stats.daysSinceLast) : '—'}
                    sub={stats.latestOrder ? formatDate(stats.latestOrder.created_at) : 'Καμία ακόμα'}
                    tone="bg-amber-50 text-amber-600"
                />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                {recentOrdersCard}

                <div className="space-y-5">
                    <div className={`${sectionCard} p-5`}>
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-800"><Gem size={16} className="text-indigo-500" /> Τι αγοράζει</h3>
                        {categoriesBars(4)}
                        {Boolean(assortment?.kinds.length) && (
                            <button type="button" onClick={() => openAssortment('range')} className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">
                                Γκάμα: κωδικοί & συλλογές <ArrowRight size={12} />
                            </button>
                        )}
                    </div>

                    {territoryCard}

                    <div className={`${sectionCard} p-5`}>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800"><HandHeart size={16} className="text-indigo-500" /> Εξυπηρέτηση</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setActiveTab('consignments')} className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-left transition hover:border-indigo-200">
                                <div className="text-lg font-black text-indigo-900">{formatNumber(openConsignments)}</div>
                                <div className="text-[10px] font-bold uppercase text-indigo-700/70">Ενεργές παρακαταθ.</div>
                            </button>
                            <button type="button" onClick={() => setActiveTab('repairs')} className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-left transition hover:border-sky-200">
                                <div className="text-lg font-black text-sky-900">{formatNumber(openRepairs)}</div>
                                <div className="text-[10px] font-bold uppercase text-sky-700/70">Ανοιχτές επισκευές</div>
                            </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setServiceForm('consignment')} className="flex items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100"><Plus size={13} /> Παρακαταθήκη</button>
                            <button type="button" onClick={() => setServiceForm('repair')} className="flex items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100"><Plus size={13} /> Επισκευή</button>
                        </div>
                    </div>

                    <div className={`${sectionCard} p-5`}>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
                            <MapPin size={16} className="text-sky-500" /> {branches.length > 1 ? `Καταστήματα (${branches.length})` : mainBranch ? 'Κατάστημα' : 'Τοποθεσία'}
                        </h3>
                        {mainBranch && <div className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase text-sky-700"><Star size={11} className="fill-sky-500 text-sky-500" /> {mainBranch.label}</div>}
                        <div className="text-sm font-bold text-slate-800">{mainLocation.town || mainLocation.unitLabel || 'Άγνωστη περιοχή'}</div>
                        <div className="text-xs text-slate-500">
                            {[mainLocation.unitLabel !== mainLocation.town ? mainLocation.unitLabel : null, mainLocation.periferiaLabel].filter(Boolean).join(' · ') || 'Συμπληρώστε ΤΚ και πόλη στη διεύθυνση.'}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">{PRECISION_LABEL[mainLocation.precision]}{mainLocation.postalCode ? ` · ΤΚ ${mainLocation.postalCode}` : ''}</div>
                        {branches.length > 1 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {branches.slice(1).map(branch => <RegionPill key={branch.id} location={resolveBranchLocation(customer, branch)} />)}
                            </div>
                        )}
                        {onShowOnMap && mainLocation.coords && (
                            <button type="button" onClick={onShowOnMap} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#060b00] py-2 text-xs font-bold text-white hover:bg-black">
                                <Navigation size={13} /> Προβολή στον χάρτη
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    const retailOverview = (
        <div className="space-y-5">
            {isInternalAccount ? (
                <div className="rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-xs leading-relaxed text-teal-950">
                    <span className="font-bold">Εσωτερικές παραγγελίες.</span> Παραγγελίες που κάνουμε για δικό μας απόθεμα (π.χ. έκθεση, δειγματολόγιο).
                    Περνούν κανονικά από την παραγωγή, αλλά <b>δεν μετράνε</b> σε πωλήσεις, στατιστικά, προμήθειες πλασιέ, χάρτη πελατών και παραστατικά.
                    Οι αξίες παρακάτω είναι ενδεικτικές τιμές καταλόγου.
                </div>
            ) : (
                <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/60 px-4 py-3 text-xs leading-relaxed text-fuchsia-950">
                    <span className="font-bold">Συλλογικός λογαριασμός λιανικής.</span> Δεν αντιστοιχεί σε ένα νομικό πρόσωπο — οι τελικοί πελάτες
                    αναδεικνύονται από τις σημειώσεις των παραγγελιών.
                </div>
            )}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <KpiCard icon={Wallet} label={isInternalAccount ? 'Αξία καταλόγου' : 'Καθαρός τζίρος'} value={formatCurrency(stats.totalSpent)} sub={`${formatCurrency(stats.last12mSpent)} σε 12 μήνες`} tone="bg-emerald-50 text-emerald-600" />
                <KpiCard icon={ShoppingBag} label="Παραγγελίες" value={formatNumber(stats.orderCount)} sub={`Μ.Ο. ${formatCurrency(stats.avgOrderValue)}`} tone="bg-sky-50 text-sky-600" />
                <KpiCard icon={Package} label="Τεμάχια" value={formatNumber(stats.totalItems)} sub={`${formatNumber(stats.activeMonths)} ενεργοί μήνες`} tone="bg-violet-50 text-violet-600" />
                <KpiCard icon={Calendar} label="Τελευταία" value={stats.latestOrder ? formatDaysAgo(stats.daysSinceLast) : '—'} sub={stats.latestOrder ? formatDate(stats.latestOrder.created_at) : undefined} tone="bg-amber-50 text-amber-600" />
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                {recentOrdersCard}
                <div className={`${sectionCard} p-5`}>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-800"><PieChart size={16} className="text-indigo-500" /> Κορυφαία είδη</h3>
                    {categoriesBars(5)}
                </div>
            </div>
        </div>
    );

    const ordersTab = (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        value={orderQuery}
                        onChange={e => setOrderQuery(e.target.value)}
                        placeholder={isRetailAccount ? 'Κωδικός, ημερομηνία, τελικός πελάτης…' : 'Κωδικός, ημερομηνία, SKU ή κατηγορία…'}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                    />
                </div>
                <span className="shrink-0 text-xs font-bold text-slate-400">
                    {filteredOrders.length === stats.history.length
                        ? `${formatNumber(stats.history.length)} παραγγελίες`
                        : `${formatNumber(filteredOrders.length)} από ${formatNumber(stats.history.length)}`}
                </span>
            </div>

            {filteredOrders.length > 0 && (
                <div className={`${sectionCard} divide-y divide-slate-50 overflow-hidden`}>
                    {filteredOrders.map(o => {
                        return (
                            <div key={o.id} className="flex flex-col gap-3 px-4 py-3.5 transition hover:bg-slate-50/60 sm:flex-row sm:items-center sm:px-5">
                                <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border sm:flex ${getOrderStatusClasses(o.status)}`}>
                                    {o.status === OrderStatus.Delivered ? <Wallet size={18} /> : <Calendar size={18} />}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <OrderIdRow orderId={o.id} copied={copiedOrderId === o.id} onCopy={() => copyOrderId(o.id)} />
                                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${getOrderStatusClasses(o.status)}`}>
                                            {getOrderStatusLabel(o.status)}
                                        </span>
                                        {isRetailAccount && <span className="text-sm font-bold text-slate-800"><OrderCustomerName order={o} /></span>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                                        <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(o.created_at)}</span>
                                        <span className="flex items-center gap-1"><ShoppingBag size={11} /> {formatNumber(o.items.length)} είδη</span>
                                        <span className="font-mono text-slate-400">Με ΦΠΑ {formatCurrency(o.total_price)}</span>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                                    <div className="text-left sm:mr-2 sm:text-right">
                                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Καθαρή αξία</div>
                                        <div className="text-base font-black tabular-nums text-slate-900">{formatCurrency(netOf(o))}</div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        {canTransferOrderFromCustomerList(o) && (
                                            <button
                                                type="button"
                                                onClick={() => setTransferOrder(o)}
                                                className="rounded-xl border border-violet-100 bg-violet-50 p-2.5 text-violet-700 transition-colors hover:bg-violet-100 hover:text-violet-900"
                                                title="Μεταφορά υπολοίπου σε άλλη παραγγελία"
                                            >
                                                <ArrowRightLeft size={16} />
                                            </button>
                                        )}
                                        {onPrintOrder && (
                                            <button
                                                type="button"
                                                onClick={() => onPrintOrder(o)}
                                                className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
                                                title="Εκτύπωση"
                                            >
                                                <Printer size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {stats.history.length > 0 && filteredOrders.length === 0 && (
                <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 py-10 text-center text-sm font-medium text-amber-900">
                    Κανένα αποτέλεσμα για «{orderQuery}». Δοκιμάστε άλλο κείμενο.
                </div>
            )}
            {stats.history.length === 0 && <EmptyState icon={ShoppingBag} text="Δεν υπάρχουν παραγγελίες." />}
        </div>
    );

    const consignmentsTab = (
        <section className={`${sectionCard} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-indigo-50/60 px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-indigo-100 p-2 text-indigo-800"><HandHeart size={18} /></div>
                    <div>
                        <h3 className="font-black text-slate-800">Παρακαταθήκες</h3>
                        <p className="text-xs text-slate-500">{formatNumber(openConsignments)} ενεργές · {formatNumber(customerConsignments.length)} συνολικά</p>
                    </div>
                </div>
                <button type="button" onClick={() => setServiceForm('consignment')} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-indigo-800">
                    <Plus size={14} /> Νέα παρακαταθήκη
                </button>
            </div>
            <div className="divide-y divide-slate-100">
                {customerConsignments.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-400">Δεν υπάρχουν παρακαταθήκες για αυτόν τον πελάτη.</div>
                ) : customerConsignments.map(entry => {
                    const lines = (customerServiceData?.consignmentLines || []).filter(line => line.consignment_id === entry.id);
                    const pending = lines.reduce((sum, line) => sum + line.pending_quantity, 0);
                    const value = lines.reduce((sum, line) => sum + consignmentSaleTotal(line, line.pending_quantity, customerServiceData?.consignmentSettlements), 0);
                    return (
                        <div key={entry.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm font-black text-slate-800">{entry.code}</span>
                                    <ConsignmentBadge compact />
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{CONSIGNMENT_STATUS_LABELS[entry.status]}</span>
                                </div>
                                <div className="mt-1 text-xs text-slate-500">Επανέλεγχος {formatGreekDateOnly(entry.review_due_at)} · {formatNumber(lines.length)} γραμμές</div>
                            </div>
                            <div className="flex gap-6 text-right">
                                <div><div className="font-black text-slate-800">{formatNumber(pending)}</div><div className="text-[9px] font-bold uppercase text-slate-400">Εκκρεμή τεμ.</div></div>
                                <div><div className="font-black text-indigo-800">{formatGreekMoney(value)}</div><div className="text-[9px] font-bold uppercase text-slate-400">Αξία</div></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );

    const repairsTab = (
        <section className={`${sectionCard} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-sky-50/60 px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-sky-100 p-2 text-sky-700"><Wrench size={18} /></div>
                    <div>
                        <h3 className="font-black text-slate-800">Επισκευές</h3>
                        <p className="text-xs text-slate-500">{formatNumber(openRepairs)} ανοιχτές · {formatNumber(customerRepairs.length)} συνολικά</p>
                    </div>
                </div>
                <button type="button" onClick={() => setServiceForm('repair')} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-sky-800">
                    <Plus size={14} /> Νέα παραλαβή
                </button>
            </div>
            <div className="divide-y divide-slate-100">
                {customerRepairs.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-400">Δεν υπάρχουν επισκευές για αυτόν τον πελάτη.</div>
                ) : customerRepairs.map(item => {
                    const liveBatch = findLiveRepairBatch(item.id, customerServiceData?.repairCycles || [], batches || []);
                    return (
                        <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm font-black text-slate-800">{item.code}</span>
                                    <RepairBadge compact />
                                    <RepairStageBadge item={item} batch={liveBatch} />
                                    {item.is_archived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">Αρχείο</span>}
                                    {item.current_cycle_number > 1 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700">Κύκλος {formatNumber(item.current_cycle_number)}</span>}
                                </div>
                                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                                <p className="mt-0.5 text-[10px] font-bold text-slate-400">{REPAIR_ORIGIN_LABELS[item.origin_type]}</p>
                            </div>
                            <div className="shrink-0 text-right text-xs text-slate-500">
                                <div className="font-black text-slate-700">{item.product_sku ? <SkuColorizedText sku={item.product_sku} suffix={item.variant_suffix || ''} /> : 'Χωρίς SKU'}</div>
                                <div>{formatGreekDateOnly(item.created_at)}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );

    const endClientsTab = (
        <div className={`${sectionCard} p-6`}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-black text-slate-800"><UsersIcon size={16} className="text-indigo-500" /> Κορυφαίοι τελικοί πελάτες</h3>
            <p className="mb-5 text-xs text-slate-500">Κατάταξη από τις σημειώσεις λιανικής στις παραγγελίες.</p>
            {retailClientStats.length > 0 ? (
                <div className="space-y-3">
                    {retailClientStats.map((client, index) => {
                        const maxRevenue = retailClientStats[0]?.totalRevenue || 1;
                        const isUnlabeled = client.name === 'Χωρίς τελικό πελάτη';
                        return (
                            <div key={client.name} className="flex items-center gap-4">
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${index === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{formatNumber(index + 1)}</div>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center justify-between">
                                        <span className={`truncate text-sm font-bold ${isUnlabeled ? 'italic text-slate-400' : 'text-slate-700'}`}>{client.name}</span>
                                        <div className="ml-3 flex shrink-0 items-center gap-3 text-right">
                                            <span className="text-[10px] font-bold text-slate-400">{formatNumber(client.orderCount)} παρ.</span>
                                            <span className="font-mono text-sm font-black text-slate-800">{formatCurrency(client.totalRevenue)}</span>
                                        </div>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500 transition-all duration-700" style={{ width: `${(client.totalRevenue / maxRevenue) * 100}%` }} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <EmptyState icon={UsersIcon} text="Δεν υπάρχουν δεδομένα τελικών πελατών." />
            )}
        </div>
    );

    const categoriesTab = (
        <div className={`${sectionCard} p-6`}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-black text-slate-800"><Trophy size={16} className="text-amber-500" /> Κορυφαία είδη</h3>
            <p className="mb-5 text-xs text-slate-500">Κατανομή τεμαχίων ανά είδος κοσμήματος, από όλο το ιστορικό.</p>
            {categoriesBars(5)}
        </div>
    );

    const editFormView = (
        <div className="mx-auto max-w-3xl space-y-5 pb-4">
            <section className={`${sectionCard} p-5`}>
                <SectionTitle icon={IdCard} title="Ταυτότητα" />
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Επωνυμία / Ονοματεπώνυμο *" className="sm:col-span-2">
                        <input
                            className={`${inputClass} text-base`}
                            value={editForm.full_name}
                            onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                            placeholder="π.χ. Κοσμήματα Ήλιος ΟΕ"
                            autoFocus
                        />
                    </FormField>
                    <FormField label="Χώρα φορολογικής έδρας" hint={draftIsDomestic ? 'Ελληνικός πελάτης — ΑΦΜ και ΔΟΥ από την ΑΑΔΕ.' : 'Πελάτης εξωτερικού — στα παραστατικά δηλώνεται η χώρα και το VAT/Tax ID.'}>
                        <CountrySelect
                            value={editForm.country}
                            onChange={code => setEditForm(withCustomerCountry(editForm, code))}
                        />
                    </FormField>
                    {draftIsDomestic ? (
                        <FormField label="ΑΦΜ" hint="Πατήστε ⚡ για αυτόματη συμπλήρωση από το μητρώο ΑΑΔΕ.">
                            <div className="flex gap-2">
                                <input
                                    className={`${inputClass} flex-1 font-mono`}
                                    placeholder="9 ψηφία"
                                    inputMode="numeric"
                                    value={editForm.vat_number || ''}
                                    onChange={e => setEditForm({ ...editForm, vat_number: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                                />
                                <button
                                    type="button"
                                    onClick={handleAfmLookup}
                                    disabled={isSearchingAfm}
                                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#060b00] px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-black disabled:opacity-50"
                                    title="Αναζήτηση στο μητρώο ΑΑΔΕ"
                                >
                                    {isSearchingAfm ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} ΑΑΔΕ
                                </button>
                            </div>
                            <CustomerVatStatusAlert lookup={vatLookupEvidence} vatNumber={editForm.vat_number} applied={vatLookup.applied} onApply={vatLookup.applyEvidence} />
                        </FormField>
                    ) : (
                        <FormField label="VAT / Tax ID" hint="Π.χ. DE123456789 ή τοπικός φορολογικός αριθμός.">
                            <input
                                className={`${inputClass} font-mono uppercase`}
                                value={editForm.vat_number || ''}
                                onChange={e => setEditForm({ ...editForm, vat_number: e.target.value.slice(0, 20) })}
                                placeholder="VAT number"
                            />
                        </FormField>
                    )}
                    {draftIsDomestic && (
                        <FormField label="ΔΟΥ">
                            <input className={inputClass} value={editForm.tax_office || ''} onChange={e => setEditForm({ ...editForm, tax_office: e.target.value })} placeholder="π.χ. Α' Αθηνών" />
                        </FormField>
                    )}
                    <FormField label="Επάγγελμα / κύρια δραστηριότητα" className="sm:col-span-2">
                        <input className={inputClass} value={editForm.profession || ''} onChange={e => setEditForm({ ...editForm, profession: e.target.value })} />
                    </FormField>
                </div>
            </section>

            <section className={`${sectionCard} p-5`}>
                <SectionTitle icon={Phone} title="Επικοινωνία & διεύθυνση" />
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2"><CustomerPhoneFields customer={editForm} onChange={setEditForm} /></div>
                    <FormField label="Email">
                        <input type="email" className={inputClass} value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="name@example.gr" />
                    </FormField>
                    <FormField
                        label={draftIsDomestic ? 'Φορολογική έδρα (όπως στην ΑΑΔΕ)' : 'Διεύθυνση έδρας'}
                        className="sm:col-span-2"
                        hint={(
                            <span className="flex flex-wrap items-center gap-1.5">
                                Εμφανίζεται στα παραστατικά και τις παραγγελίες.{draftIsDomestic ? ' Μορφή: «Οδός αριθμός, ΤΚ - Πόλη».' : ' Μορφή: «Street 1, City».'} Αναγνωρίστηκε:
                                <RegionPill location={draftLocation} />
                            </span>
                        )}
                    >
                        <div className="relative">
                            <Landmark size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input className={`${inputClass} pl-9`} value={editForm.address || ''} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder={draftIsDomestic ? 'π.χ. Ερμού 12, 10563 - Αθήνα' : 'e.g. 31-05 Ditmars Blvd, New York'} />
                        </div>
                    </FormField>
                    <div className="sm:col-span-2 empty:hidden">
                        <CountryMismatchHint customer={editForm} onFix={code => setEditForm(withCustomerCountry(editForm, code))} />
                    </div>
                </div>
            </section>

            <section className={`${sectionCard} p-5`}>
                <SectionTitle icon={Store} title="Καταστήματα / υποκαταστήματα" />
                <CustomerBranchesEditor
                    customer={editForm}
                    onChange={next => setEditForm({ ...editForm, branches: next })}
                    disabled={inspectionLocked}
                    disabledReason="Σε λειτουργία ελέγχου τα καταστήματα δεν τροποποιούνται."
                />
            </section>

            <section className={`${sectionCard} p-5`}>
                <SectionTitle icon={Receipt} title="Τιμολόγηση" />
                <div className="mb-3"><OverseasVatSuggestion customer={editForm} onChange={setEditForm} /></div>
                <FormField label="Καθεστώς ΦΠΑ">
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { value: VatRegime.Standard, label: '24%', sub: 'Κανονικό' },
                            { value: VatRegime.Reduced, label: '17%', sub: 'Μειωμένο' },
                            { value: VatRegime.Zero, label: '0%', sub: 'Απαλλαγή' },
                        ].map(opt => {
                            const active = (editForm.vat_rate ?? VatRegime.Standard) === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, vat_rate: opt.value, ...(opt.value === 0 ? {} : { vat_exemption_category: null, vat_exemption_legal_note: null }) })}
                                    className={`rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-[#060b00] bg-[#060b00] text-white shadow' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                                >
                                    <div className="text-base font-black">{opt.label}</div>
                                    <div className={`text-[11px] font-semibold ${active ? 'text-white/70' : 'text-slate-400'}`}>{opt.sub}</div>
                                </button>
                            );
                        })}
                    </div>
                </FormField>
                <div className="mt-3">
                    <CustomerVatProfileSuggestion customer={editForm} onChange={setEditForm} lookup={vatLookupEvidence} /><CustomerVatExemptionFields customer={editForm} onChange={setEditForm} />
                </div>
            </section>

            <section className={`${sectionCard} p-5`}>
                <div id="customer-edit-profile" className="scroll-mt-4" />
                <SectionTitle icon={UsersIcon} title="Προφίλ, social media & όροι" />
                <CustomerProfileEditor
                    value={editForm.profile ?? {}}
                    onChange={profile => setEditForm(prev => ({ ...prev, profile }))}
                    mobilePhone={editForm.mobile_phone || null}
                    tagSuggestions={tagSuggestions}
                    socialsOpen={editFocus === 'socials' ? true : undefined}
                />
            </section>

            <section className={`${sectionCard} p-5`}>
                <SectionTitle icon={StickyNote} title="Σημειώσεις" />
                <textarea
                    className={`${inputClass} min-h-[120px] resize-y font-medium`}
                    placeholder="Εσωτερικές σημειώσεις — ορατές μόνο στην εφαρμογή…"
                    value={editForm.notes || ''}
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                />
            </section>
        </div>
    );

    const activeContent = (() => {
        if (isEditing) return editFormView;
        switch (activeTab) {
            case 'overview': return isRetailSystemCustomer ? retailOverview : normalOverview;
            case 'details': return <div className="mx-auto max-w-xl rounded-2xl bg-slate-50 p-3">{detailsSections}</div>;
            case 'orders': return ordersTab;
            case 'assortment': return (
                <CustomerAssortmentPanel
                    key={assortmentSection}
                    customer={customer}
                    initialSection={assortmentSection}
                    onOpenCustomer={onOpenCustomer}
                    onOpenOrders={query => { setOrderQuery(query || ''); setActiveTab('orders'); }}
                />
            );
            case 'consignments': return consignmentsTab;
            case 'repairs': return repairsTab;
            case 'end_clients': return endClientsTab;
            case 'categories': return categoriesTab;
            default: return null;
        }
    })();

    // -----------------------------------------------------------------------
    // Layout
    // -----------------------------------------------------------------------

    return (
        <>
        {!transferOrder && (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-sm animate-in fade-in duration-200 sm:p-4 lg:p-6"
            onMouseDown={e => { if (e.target === e.currentTarget && !isEditing) onClose(); }}
        >
            <div
                className="flex h-[min(94vh,980px)] w-full max-w-[1320px] flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-900/5 animate-in zoom-in-95 duration-200 lg:flex-row"
                role="dialog"
                aria-modal="true"
                aria-labelledby="customer-modal-title"
            >
                {/* ---------------- Profile sidebar ---------------- */}
                <aside className="flex shrink-0 flex-col border-b border-slate-100 bg-slate-50/80 lg:w-[320px] lg:border-b-0 lg:border-r xl:w-[340px]">
                    <div className="custom-scrollbar flex-1 overflow-y-auto">
                        {/* Hero */}
                        <div className="relative px-5 pb-4 pt-5 lg:px-6 lg:pt-7">
                            <div
                                className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-[0.12]"
                                style={{ background: isInternalAccount ? 'linear-gradient(135deg,#14b8a6,#059669)' : isRetailSystemCustomer ? 'linear-gradient(135deg,#d946ef,#7c3aed)' : 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}
                                aria-hidden
                            />
                            <button
                                type="button"
                                onClick={onClose}
                                className="absolute right-3 top-3 rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-800 lg:hidden"
                                aria-label="Κλείσιμο"
                            >
                                <X size={20} />
                            </button>

                            <div className="relative flex items-center gap-4 lg:flex-col lg:items-start">
                                {isRetailSystemCustomer ? (
                                    <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-4 ring-white lg:h-20 lg:w-20 ${isInternalAccount ? 'from-teal-500 to-emerald-600' : 'from-fuchsia-500 to-violet-600'}`}>
                                        {isInternalAccount ? <Warehouse size={30} /> : <Store size={30} />}
                                    </div>
                                ) : (
                                    <CustomerAvatar name={customer.full_name || '?'} seed={customer.id} size={72} className="rounded-3xl shadow-lg ring-4" />
                                )}
                                <div className="min-w-0 pr-8 lg:pr-0">
                                    <h2 id="customer-modal-title" className="text-xl font-black leading-tight tracking-tight text-[#060b00] lg:text-[22px]">
                                        {customer.full_name}
                                    </h2>
                                    {customer.profession && !isRetailSystemCustomer && (
                                        <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-500">{customer.profession}</p>
                                    )}
                                </div>
                            </div>

                            <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
                                {customer.customer_code && (
                                    <span className="rounded-lg bg-white px-2 py-0.5 font-mono text-[10px] font-black text-slate-600 ring-1 ring-slate-200">#{customer.customer_code}</span>
                                )}
                                {isRetailSystemCustomer ? (
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${isInternalAccount ? 'bg-teal-100 text-teal-800' : 'bg-fuchsia-100 text-fuchsia-800'}`}>Συστημικός · μόνο ανάγνωση</span>
                                ) : (
                                    <ActivityBadge activity={stats.summary.activity} tier={stats.summary.tier} />
                                )}
                                {!isRetailSystemCustomer && !isDomestic && (
                                    <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-800"><Globe2 size={11} /> {countryName}</span>
                                )}
                                {isVip && (
                                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900"><Trophy size={10} /> VIP</span>
                                )}
                                {nextNameday && (
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${nextNameday.is_today ? 'bg-rose-100 text-rose-800' : 'bg-sky-50 text-sky-800 ring-1 ring-sky-100'}`}>
                                        <Gift size={11} />
                                        {nextNameday.is_today
                                            ? `Γιορτάζει σήμερα`
                                            : nextNameday.days_until <= 7
                                              ? `Γιορτή σε ${formatNumber(nextNameday.days_until)} ημ.`
                                              : `${nextNameday.label} ${formatGreekDate(nextNameday.date)}`}
                                    </span>
                                )}
                            </div>

                            {!isRetailSystemCustomer && savedSocials(savedProfile).length > 0 && (
                                <div className="relative mt-3"><SocialIconRow customer={customer} size="md" /></div>
                            )}

                            {!isRetailSystemCustomer && (
                                <div className="relative mt-4 grid grid-cols-4 gap-2">
                                    <QuickAction icon={Phone} label="Κλήση" href={customer.phone ? `tel:${customer.phone}` : undefined} disabled={!customer.phone} />
                                    <QuickAction icon={Mail} label="Email" href={customer.email ? `mailto:${customer.email}` : undefined} disabled={!customer.email} />
                                    <QuickAction icon={Navigation} label="Χάρτης" onClick={onShowOnMap} disabled={!onShowOnMap || !mainLocation.coords} title={mainLocation.coords ? 'Προβολή στον χάρτη' : 'Χωρίς τοποθεσία'} />
                                    <QuickAction icon={Pencil} label="Αλλαγή" onClick={() => startEditing()} disabled={isEditing} title="Επεξεργασία στοιχείων" />
                                </div>
                            )}
                        </div>

                        {/* Details (wide screens; narrow screens use the «Στοιχεία» tab) */}
                        {!isRetailSystemCustomer && (
                            <div className="hidden border-t border-slate-200/70 px-4 py-5 lg:block">
                                {detailsSections}
                            </div>
                        )}
                        {isRetailSystemCustomer && (
                            <div className="hidden border-t border-slate-200/70 px-6 py-5 text-xs leading-relaxed text-slate-500 lg:block">
                                {isInternalAccount
                                    ? 'Νέα εσωτερική παραγγελία: στη Νέα παραγγελία πατήστε «Εσωτερική παραγγελία». Δεν μετράει στις πωλήσεις.'
                                    : 'Οι παραγγελίες λιανικής καταχωρούνται εδώ· οι τελικοί πελάτες προκύπτουν από τις σημειώσεις κάθε παραγγελίας.'}
                            </div>
                        )}
                    </div>

                    {!isRetailSystemCustomer && (
                        <div className="hidden items-center justify-between gap-2 border-t border-slate-200/70 px-6 py-3 text-[11px] text-slate-400 lg:flex">
                            <span>
                                {stats.firstOrder ? `Πελάτης από ${formatDate(stats.firstOrder.created_at)}` : `Καταχωρήθηκε ${formatDate(customer.created_at)}`}
                            </span>
                            <button
                                type="button"
                                onClick={() => onDelete(customer.id)}
                                className="flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                                <Trash2 size={13} /> Διαγραφή
                            </button>
                        </div>
                    )}
                </aside>

                {/* ---------------- Main panel ---------------- */}
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-3 py-2.5 sm:px-5">
                        {isEditing ? (
                            <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Pencil size={17} /></span>
                                <div className="min-w-0">
                                    <div className="text-sm font-black text-slate-900">Επεξεργασία στοιχείων</div>
                                    <div className="truncate text-[11px] text-slate-400">Οι αλλαγές αποθηκεύονται όταν πατήσετε «Αποθήκευση».</div>
                                </div>
                            </div>
                        ) : (
                            <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Ενότητες καρτέλας πελάτη">
                                {tabList.map(tab => {
                                    const active = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={active}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition ${'narrowOnly' in tab && tab.narrowOnly ? 'lg:hidden' : ''} ${active ? 'bg-[#060b00] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                                        >
                                            <tab.Icon size={15} />
                                            {tab.label}
                                            {tab.count !== undefined && tab.count > 0 && (
                                                <span className={`rounded-full px-1.5 py-px text-[10px] font-black ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{formatNumber(tab.count)}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </nav>
                        )}

                        <div className="flex shrink-0 items-center gap-2">
                            {isEditing ? (
                                <>
                                    <button type="button" onClick={cancelEditing} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50">
                                        Άκυρο
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-black disabled:opacity-60"
                                    >
                                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
                                    </button>
                                </>
                            ) : (
                                <>
                                    {!isRetailSystemCustomer && (
                                        <button
                                            type="button"
                                            onClick={() => startEditing()}
                                            className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:flex"
                                        >
                                            <Pencil size={14} /> Επεξεργασία
                                        </button>
                                    )}
                                    {!isRetailSystemCustomer && (
                                        <button
                                            type="button"
                                            onClick={() => onDelete(customer.id)}
                                            className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 lg:hidden"
                                            aria-label="Διαγραφή πελάτη"
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="hidden rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 lg:block"
                                        aria-label="Κλείσιμο"
                                        title="Κλείσιμο (Esc)"
                                    >
                                        <X size={20} />
                                    </button>
                                </>
                            )}
                        </div>
                    </header>

                    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-4 sm:p-5 xl:p-6">
                        {activeContent}
                    </div>

                    {!isEditing && stats.orderCount > 0 && activeTab === 'overview' && (
                        <div className="hidden shrink-0 items-center justify-between border-t border-slate-100 bg-white px-5 py-2.5 text-[11px] text-slate-400 xl:flex">
                            <span>Τιμές χωρίς ΦΠΑ · Ακυρωμένες παραγγελίες εξαιρούνται</span>
                            <button type="button" onClick={() => setActiveTab('orders')} className="flex items-center gap-0.5 font-bold text-slate-500 hover:text-slate-800">
                                Ιστορικό παραγγελιών <ChevronRight size={13} />
                            </button>
                        </div>
                    )}
                </section>
            </div>
        </div>
        )}
        {transferOrder && (
            <TransferRemainingItemsModal
                orderA={transferOrder}
                onClose={() => setTransferOrder(null)}
                onSuccess={(updatedOrderB) => {
                    setTransferOrder(null);
                    onPrintOrder?.(updatedOrderB);
                }}
            />
        )}
        {serviceForm && customer.id && (
            <CustomerServiceQuickForm kind={serviceForm} customerId={customer.id} onClose={() => setServiceForm(null)} />
        )}
        </>
    );
}
