
import React, { useMemo, useState } from 'react';
import { Material, Product, Supplier, SupplierOrder } from '../../types';
import { ChevronLeft, Phone, Mail, MapPin, Plus, Trash2, Printer, Pencil, FileText, X, Search, ImageIcon, Box } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../../lib/supabase';
import MobilePurchaseOrderBuilder from './MobilePurchaseOrderBuilder';
import { getSupplierOrderStatusClasses, getSupplierOrderStatusIcon } from '../../features/suppliers/statusPresentation';
import { invalidateProductsAndCatalog } from '../../lib/queryInvalidation';
import { useUI } from '../UIProvider';

const MATERIAL_TYPE_LABELS: Record<string, string> = {
    Stone: 'Πέτρα',
    Cord: 'Κορδόνι',
    Component: 'Εξάρτημα',
    Enamel: 'Σμάλτο',
    Leather: 'Δέρμα',
};

interface Props {
    supplier: Supplier;
    onClose: () => void;
    onEditSupplier?: () => void;
    onPrintSupplierOrder?: (order: SupplierOrder) => void;
}

export default function MobileSupplierDetails({ supplier, onClose, onEditSupplier, onPrintSupplierOrder }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: orders } = useQuery({ queryKey: ['supplier_orders'], queryFn: api.getSupplierOrders });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });

    const [isCreatingOrder, setIsCreatingOrder] = useState(false);
    const [viewTab, setViewTab] = useState<'info' | 'orders' | 'products' | 'materials'>('orders');
    const [viewOrderId, setViewOrderId] = useState<string | null>(null);
    const [productSearchTerm, setProductSearchTerm] = useState('');

    const supplierOrders = orders?.filter(o => o.supplier_id === supplier.id) || [];

    const assignedProducts = useMemo(
        () =>
            (products?.filter(p => p.supplier_id === supplier.id) || []).sort((a, b) =>
                a.sku.localeCompare(b.sku, undefined, { numeric: true })
            ),
        [products, supplier.id]
    );

    const assignedMaterials = useMemo(
        () =>
            (materials?.filter(m => m.supplier_id === supplier.id) || []).sort((a, b) =>
                a.name.localeCompare(b.name)
            ),
        [materials, supplier.id]
    );

    const availableProductsForLink = useMemo(() => {
        if (!products) return [];
        const lower = productSearchTerm.toLowerCase();
        return products
            .filter(p => p.supplier_id !== supplier.id)
            .filter(p => p.sku.toLowerCase().includes(lower))
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))
            .slice(0, 20);
    }, [products, supplier.id, productSearchTerm]);

    const productBySku = useMemo(() => {
        const m = new Map<string, Product>();
        products?.forEach(p => m.set(p.sku, p));
        return m;
    }, [products]);

    const materialById = useMemo(() => {
        const m = new Map<string, Material>();
        materials?.forEach(mat => m.set(mat.id, mat));
        return m;
    }, [materials]);

    const handleLinkProduct = async (sku: string) => {
        try {
            await supabase.from('products').update({ supplier_id: supplier.id }).eq('sku', sku);
            await invalidateProductsAndCatalog(queryClient);
            showToast('Προϊόν συνδέθηκε.', 'success');
        } catch {
            showToast('Σφάλμα σύνδεσης.', 'error');
        }
    };

    const handleUnlinkProduct = async (sku: string) => {
        try {
            await supabase.from('products').update({ supplier_id: null }).eq('sku', sku);
            await invalidateProductsAndCatalog(queryClient);
            showToast('Σύνδεση αφαιρέθηκε.', 'success');
        } catch {
            showToast('Σφάλμα.', 'error');
        }
    };

    const handleDeleteOrder = async (orderId: string) => {
        const yes = await confirm({
            title: 'Διαγραφή Εντολής',
            message: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την εντολή αγοράς;',
            isDestructive: true,
            confirmText: 'Διαγραφή',
        });
        if (!yes) return;
        try {
            await api.deleteSupplierOrder(orderId);
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
            showToast('Η εντολή διαγράφηκε.', 'success');
        } catch {
            showToast('Σφάλμα διαγραφής.', 'error');
        }
    };

    const handleReceiveOrder = async (order: SupplierOrder) => {
        const yes = await confirm({
            title: 'Παραλαβή',
            message: 'Θέλετε να παραλάβετε τα προϊόντα; Θα ενημερωθεί το απόθεμα.',
            confirmText: 'Παραλαβή',
        });
        if (!yes) return;
        try {
            await api.receiveSupplierOrder(order);
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
            await invalidateProductsAndCatalog(queryClient);
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            showToast('Παραλαβή ολοκληρώθηκε.', 'success');
        } catch {
            showToast('Σφάλμα παραλαβής.', 'error');
        }
    };

    const viewOrder = viewOrderId ? supplierOrders.find(o => o.id === viewOrderId) : undefined;

    if (isCreatingOrder) {
        return (
            <MobilePurchaseOrderBuilder
                supplier={supplier}
                onClose={() => setIsCreatingOrder(false)}
            />
        );
    }

    const tabClass = (tab: typeof viewTab) =>
        `shrink-0 px-3 py-2 font-bold text-xs rounded-lg transition-colors whitespace-nowrap ${
            viewTab === tab ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
        }`;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="bg-white p-4 border-b border-slate-100 flex justify-between items-center shadow-sm z-10 gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button type="button" onClick={onClose} className="p-2 -ml-2 text-slate-500 hover:text-slate-800 shrink-0">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-800 leading-tight truncate">{supplier.name}</h2>
                        {supplier.contact_person && <p className="text-xs text-slate-500 truncate">{supplier.contact_person}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {onEditSupplier && (
                        <button
                            type="button"
                            onClick={onEditSupplier}
                            className="bg-slate-100 text-slate-800 p-2 rounded-xl shadow-sm active:scale-95"
                            title="Επεξεργασία προμηθευτή"
                        >
                            <Pencil size={20} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsCreatingOrder(true)}
                        className="bg-slate-900 text-white p-2 rounded-xl shadow-md active:scale-95"
                        title="Νέα εντολή"
                    >
                        <Plus size={20} />
                    </button>
                </div>
            </div>

            <div className="flex p-2 bg-white border-b border-slate-100 overflow-x-auto gap-1 custom-scrollbar">
                <button type="button" onClick={() => setViewTab('orders')} className={tabClass('orders')}>
                    Παραγγελίες
                </button>
                <button type="button" onClick={() => setViewTab('info')} className={tabClass('info')}>
                    Πληροφορίες
                </button>
                <button type="button" onClick={() => setViewTab('products')} className={tabClass('products')}>
                    Προϊόντα
                </button>
                <button type="button" onClick={() => setViewTab('materials')} className={tabClass('materials')}>
                    Υλικά
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 custom-scrollbar">
                {viewTab === 'info' && (
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
                        <div className="space-y-3">
                            <div className="text-[10px] text-slate-400 font-bold uppercase">Υπεύθυνος</div>
                            <div className="font-bold text-slate-700 text-sm">{supplier.contact_person || '—'}</div>
                            {supplier.phone && (
                                <a href={`tel:${supplier.phone}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-400">
                                        <Phone size={16} />
                                    </div>
                                    <span className="font-bold text-slate-700">{supplier.phone}</span>
                                </a>
                            )}
                            {supplier.email && (
                                <a href={`mailto:${supplier.email}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-400">
                                        <Mail size={16} />
                                    </div>
                                    <span className="font-bold text-slate-700 truncate">{supplier.email}</span>
                                </a>
                            )}
                            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-400 shrink-0">
                                    <MapPin size={16} />
                                </div>
                                <span className="font-bold text-slate-700 text-sm">{supplier.address || '—'}</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">Σημειώσεις</div>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 min-h-[80px]">
                                {supplier.notes || 'Καμία σημείωση.'}
                            </p>
                        </div>
                    </div>
                )}

                {viewTab === 'orders' && (
                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={() => setIsCreatingOrder(true)}
                            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 font-bold text-sm hover:border-slate-400 hover:bg-white transition-all flex items-center justify-center gap-2"
                        >
                            <Plus size={18} /> Νέα Εντολή Αγοράς
                        </button>
                        {supplierOrders.map(order => {
                            const lineCount = order.items?.length ?? 0;
                            return (
                                <div key={order.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex justify-between items-start mb-2 gap-2">
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-mono text-slate-400 mb-0.5">#{order.id.slice(0, 6).toUpperCase()}</div>
                                            <div className="text-sm font-bold text-slate-600">
                                                {lineCount} {lineCount === 1 ? 'γραμμή' : 'γραμμές'}
                                            </div>
                                        </div>
                                        <span
                                            className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1 ${getSupplierOrderStatusClasses(order.status)}`}
                                        >
                                            {getSupplierOrderStatusIcon(order.status, 16)} {order.status}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 font-medium mb-3">
                                        {new Date(order.created_at).toLocaleDateString('el-GR')} • {lineCount} είδη
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {onPrintSupplierOrder && (
                                            <button
                                                type="button"
                                                onClick={() => onPrintSupplierOrder(order)}
                                                className="p-2 text-slate-500 bg-slate-50 rounded-lg active:scale-95"
                                                title="Εκτύπωση"
                                            >
                                                <Printer size={16} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setViewOrderId(viewOrderId === order.id ? null : order.id)}
                                            className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-700 active:scale-95"
                                        >
                                            Λεπτομέρειες
                                        </button>
                                        {order.status === 'Pending' && (
                                            <button
                                                type="button"
                                                onClick={() => handleReceiveOrder(order)}
                                                className="flex-1 min-w-[100px] py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-sm active:scale-95 transition-transform"
                                            >
                                                Παραλαβή
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteOrder(order.id)}
                                            className="p-2 bg-red-50 text-red-600 rounded-lg active:scale-95 transition-transform"
                                            title="Διαγραφή"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {supplierOrders.length === 0 && <div className="text-center py-10 text-slate-400 italic">Δεν υπάρχουν παραγγελίες.</div>}
                    </div>
                )}

                {viewTab === 'products' && (
                    <div className="space-y-4">
                        <div className="bg-white p-2 pl-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                            <Search className="text-slate-400 shrink-0" size={18} />
                            <input
                                className="flex-1 outline-none text-sm font-bold bg-transparent min-w-0"
                                placeholder="Αναζήτηση SKU για σύνδεση..."
                                value={productSearchTerm}
                                onChange={e => setProductSearchTerm(e.target.value)}
                            />
                        </div>
                        {productSearchTerm.trim() && availableProductsForLink.length > 0 && (
                            <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-2 space-y-1">
                                <h4 className="text-[10px] font-bold text-slate-500 px-2 py-1 uppercase">Αποτελέσματα</h4>
                                {availableProductsForLink.map((p: Product) => (
                                    <div key={p.sku} className="flex justify-between items-center px-2 py-2 rounded-xl hover:bg-slate-50 gap-2">
                                        <span className="font-bold text-slate-800 text-sm truncate">{p.sku}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleLinkProduct(p.sku)}
                                            className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg font-bold shrink-0"
                                        >
                                            Σύνδεση
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="space-y-2">
                            {assignedProducts.map(p => (
                                <div
                                    key={p.sku}
                                    className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex gap-3 items-center"
                                >
                                    <div className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                        {p.image_url ? (
                                            <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={18} className="text-slate-300" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-black text-slate-800 text-sm">{p.sku}</div>
                                        {!!p.category?.trim() && (
                                            <div className="text-[11px] font-medium text-slate-400 mt-0.5 truncate">{p.category}</div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUnlinkProduct(p.sku)}
                                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg shrink-0"
                                        title="Αφαίρεση σύνδεσης"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            ))}
                            {assignedProducts.length === 0 && (
                                <div className="text-center py-10 text-slate-400 text-sm">Δεν υπάρχουν συνδεδεμένα προϊόντα.</div>
                            )}
                        </div>
                    </div>
                )}

                {viewTab === 'materials' && (
                    <div className="space-y-2">
                        {assignedMaterials.map(m => (
                            <div
                                key={m.id}
                                className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                                        <Box size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-800">{m.name}</div>
                                        <div className="text-xs font-bold text-slate-500">{MATERIAL_TYPE_LABELS[m.type] || m.type}</div>
                                    </div>
                                </div>
                                <div className="text-xs font-bold text-slate-500 pt-2 border-t border-slate-50 uppercase tracking-wide">
                                    Μον. μέτρησης: {m.unit}
                                </div>
                            </div>
                        ))}
                        {assignedMaterials.length === 0 && (
                            <div className="text-center py-10 text-slate-400 text-sm">
                                Κανένα συνδεδεμένο υλικό. (Ορίστε τον προμηθευτή από τη σελίδα Υλικών)
                            </div>
                        )}
                    </div>
                )}
            </div>

            {viewOrder && (
                <div
                    role="presentation"
                    className="fixed inset-0 z-[160] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
                    onClick={() => setViewOrderId(null)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <FileText size={22} className="text-purple-600" /> Γραμμές εντολής
                            </h3>
                            <button
                                type="button"
                                onClick={() => setViewOrderId(null)}
                                className="p-2 bg-slate-100 rounded-full text-slate-500"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 pt-2 custom-scrollbar space-y-3">
                            {(viewOrder.items || []).map((item, i) => {
                                const isProduct = item.item_type === 'Product';
                                const prod = isProduct ? productBySku.get(item.item_id) : undefined;
                                const mat = !isProduct ? materialById.get(item.item_id) : undefined;
                                const thumbUrl = prod?.image_url || null;
                                return (
                                    <div
                                        key={item.id || `${item.item_id}-${i}`}
                                        className="flex gap-3 rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/80 p-3 shadow-sm"
                                    >
                                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 shadow-inner">
                                            {thumbUrl ? (
                                                <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                                            ) : isProduct ? (
                                                <div className="flex h-full w-full items-center justify-center text-slate-300">
                                                    <ImageIcon size={28} strokeWidth={1.5} />
                                                </div>
                                            ) : (
                                                <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-amber-50 text-amber-700">
                                                    <Box size={22} strokeWidth={2} />
                                                    <span className="text-[8px] font-black uppercase tracking-wider">Υλικό</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span
                                                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                                                        isProduct
                                                            ? 'bg-violet-100 text-violet-800'
                                                            : 'bg-amber-100 text-amber-900'
                                                    }`}
                                                >
                                                    {isProduct ? 'Προϊόν' : 'Υλικό'}
                                                </span>
                                                {isProduct && prod?.sku && (
                                                    <span className="font-mono text-[10px] font-bold text-slate-400">{prod.sku}</span>
                                                )}
                                                {!isProduct && mat && (
                                                    <span className="text-[10px] font-bold text-slate-400">
                                                        {MATERIAL_TYPE_LABELS[mat.type] || mat.type}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm font-bold leading-snug text-slate-900">{item.item_name}</p>
                                            {item.size_info?.trim() && (
                                                <p className="text-xs font-semibold text-slate-500">Μέγεθος: {item.size_info}</p>
                                            )}
                                            {item.notes?.trim() && (
                                                <p className="text-[11px] leading-relaxed text-slate-500 italic">{item.notes}</p>
                                            )}
                                            {item.customer_reference?.trim() && (
                                                <p className="text-[11px] font-medium text-emerald-800/90">
                                                    <span className="text-slate-400 font-bold uppercase tracking-wide">Πελάτης </span>
                                                    {item.customer_reference}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end justify-center border-l border-slate-100 pl-3">
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ποσ.</span>
                                            <span className="text-xl font-black tabular-nums text-slate-900">{item.quantity}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {(viewOrder.items || []).length === 0 && (
                                <p className="py-8 text-center text-sm text-slate-400">Δεν υπάρχουν γραμμές σε αυτή την εντολή.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
