import React, { useState, useMemo } from 'react';
import { Supplier, Product, Material, SupplierOrder } from '../types';
import { Trash2, Plus, Globe, Phone, Mail, MapPin, Search, X, Check, ImageIcon, Box, Clock, FileText, Printer } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { invalidateProductsAndCatalog } from '../lib/queryInvalidation';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import SupplierOrderPrintView from './SupplierOrderPrintView';
import DesktopPurchaseOrderBuilder from './DesktopPurchaseOrderBuilder';
import { usePrint } from './PrintContext';
import { getSupplierOrderStatusClasses, getSupplierOrderStatusIcon, getSupplierOrderStatusLabel } from '../features/suppliers/statusPresentation';

const MATERIAL_TYPE_LABELS: Record<string, string> = {
    'Stone': 'Πέτρα',
    'Cord': 'Κορδόνι',
    'Component': 'Εξάρτημα',
    'Enamel': 'Σμάλτο',
    'Leather': 'Δέρμα'
};

// --- SUPPLIER CARD COMPONENT ---
interface SupplierCardProps {
    supplier: Supplier;
    onClick: () => void;
    latestOrderDate?: string;
}

const SupplierCard: React.FC<SupplierCardProps> = ({ supplier, onClick, latestOrderDate }) => {
    return (
        <div
            onClick={onClick}
            className="group bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all cursor-pointer relative overflow-hidden flex flex-col h-full"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center font-bold text-lg group-hover:bg-purple-600 group-hover:text-white transition-colors shadow-sm">
                    {supplier.name.charAt(0).toUpperCase()}
                </div>
                {latestOrderDate && (
                    <div className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full flex items-center gap-1">
                        <Clock size={10} /> {new Date(latestOrderDate).toLocaleDateString('el-GR')}
                    </div>
                )}
            </div>

            <div className="mb-2">
                <h3 className="font-bold text-slate-800 text-base leading-tight line-clamp-1" title={supplier.name}>
                    {supplier.name}
                </h3>
                {supplier.contact_person && (
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">{supplier.contact_person}</div>
                )}
            </div>

            <div className="mt-auto pt-3 border-t border-slate-50 space-y-1.5">
                {supplier.phone ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Phone size={12} className="text-slate-400" /> {supplier.phone}
                    </div>
                ) : <div className="h-4" />}
                {supplier.address ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600 truncate">
                        <MapPin size={12} className="text-slate-400 shrink-0" /> {supplier.address}
                    </div>
                ) : <div className="h-4" />}
            </div>
        </div>
    );
};

export default function SuppliersPage() {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { setSupplierOrderToPrint } = usePrint();

    // Data Fetching
    const { data: suppliers, isError: suppliersError, error: suppliersErr, refetch: refetchSuppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: supplierOrders } = useQuery({ queryKey: ['supplier_orders'], queryFn: api.getSupplierOrders });

    // UI State
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [activeTab, setActiveTab] = useState<'info' | 'products' | 'materials' | 'orders'>('info');
    const [isEditing, setIsEditing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Create/Edit Supplier Form
    const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});

    // Product Assignment State
    const [productSearchTerm, setProductSearchTerm] = useState('');

    // Purchase Order State
    const [isCreatingOrder, setIsCreatingOrder] = useState(false);
    const [viewOrderId, setViewOrderId] = useState<string | null>(null);
    const [orderToPrint, setOrderToPrint] = useState<SupplierOrder | null>(null);

    const filteredSuppliers = useMemo(() => {
        if (!suppliers) return [];
        return suppliers.filter(s =>
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [suppliers, searchTerm]);

    // Supplier Actions
    const handleSaveSupplier = async () => {
        if (!supplierForm.name) { showToast("Η επωνυμία είναι υποχρεωτική", 'error'); return; }
        try {
            await api.saveSupplier(supplierForm);
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            setIsEditing(false);
            showToast("Αποθηκεύτηκε επιτυχώς.", 'success');
            // Important: close modal on new supplier creation
            if (!supplierForm.id) {
                setSelectedSupplier(null);
            } else if (selectedSupplier) {
                setSelectedSupplier({ ...selectedSupplier, ...supplierForm } as Supplier);
            }
        } catch (e) { showToast("Σφάλμα αποθήκευσης.", 'error'); }
    };

    const handleDeleteSupplier = async (id: string) => {
        if (!await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) return;
        try {
            await api.deleteSupplier(id);
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            if (selectedSupplier?.id === id) {
                setSelectedSupplier(null);
                setIsEditing(false);
            }
            showToast("Διαγράφηκε.", 'info');
        } catch (e) { showToast("Σφάλμα διαγραφής.", 'error'); }
    };

    const assignedProducts = useMemo(() => {
        return (products?.filter(p => p.supplier_id === selectedSupplier?.id) || [])
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [products, selectedSupplier]);

    const assignedMaterials = useMemo(() => {
        return (materials?.filter(m => m.supplier_id === selectedSupplier?.id) || [])
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [materials, selectedSupplier]);

    const relatedOrders = useMemo(() => supplierOrders?.filter(o => o.supplier_id === selectedSupplier?.id) || [], [supplierOrders, selectedSupplier]);

    const availableProductsForLink = useMemo(() => {
        if (!products || !selectedSupplier) return [];
        const lower = productSearchTerm.toLowerCase();
        return products
            .filter(p => p.supplier_id !== selectedSupplier.id)
            .filter(p => p.sku.toLowerCase().includes(lower))
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))
            .slice(0, 20);
    }, [products, selectedSupplier, productSearchTerm]);

    const handleLinkProduct = async (sku: string) => {
        if (!selectedSupplier) return;
        try {
            await supabase.from('products').update({ supplier_id: selectedSupplier.id }).eq('sku', sku);
            invalidateProductsAndCatalog(queryClient);
            showToast("Προϊόν συνδέθηκε.", "success");
        } catch (e) { showToast("Σφάλμα.", "error"); }
    };

    const handleUnlinkProduct = async (sku: string) => {
        try {
            await supabase.from('products').update({ supplier_id: null }).eq('sku', sku);
            invalidateProductsAndCatalog(queryClient);
            showToast("Σύνδεση αφαιρέθηκε.", "success");
        } catch (e) { showToast("Σφάλμα.", "error"); }
    };

    const handleReceiveOrder = async (order: SupplierOrder) => {
        const yes = await confirm({ title: 'Παραλαβή', message: 'Θέλετε να παραλάβετε τα προϊόντα; Θα ενημερωθεί το απόθεμα.', confirmText: 'Παραλαβή' });
        if (!yes) return;
        try {
            await api.receiveSupplierOrder(order);
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
            await invalidateProductsAndCatalog(queryClient);
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            showToast("Παραλαβή ολοκληρώθηκε.", "success");
        } catch (e) { showToast("Σφάλμα παραλαβής.", "error"); }
    };

    const handleDeleteOrder = async (orderId: string) => {
        const yes = await confirm({ title: 'Διαγραφή Εντολής', message: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την εντολή αγοράς;', isDestructive: true, confirmText: 'Διαγραφή' });
        if (!yes) return;
        try {
            await api.deleteSupplierOrder(orderId);
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
            showToast("Η εντολή διαγράφηκε.", "success");
        } catch (e) { showToast("Σφάλμα διαγραφής.", "error"); }
    };

    if (suppliersError) {
        return (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6 rounded-r-xl max-w-2xl" role="alert">
                <p className="font-bold mb-2">Σφάλμα φόρτωσης</p>
                <p>Δεν ήταν δυνατή η φόρτωση των προμηθευτών.</p>
                <p className="text-sm mt-4 font-mono bg-red-100/50 p-2 rounded">{(suppliersErr as Error)?.message}</p>
                <button onClick={() => refetchSuppliers()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors">
                    Ανανέωση
                </button>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col gap-6">

            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-purple-100 text-purple-600 shadow-sm transition-colors">
                        <Globe size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Προμηθευτές</h1>
                        <p className="text-slate-500 text-sm font-medium">Διαχείριση προμηθευτών και υλικών.</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    <div className="relative group flex-1 md:flex-none">
                        <input
                            type="text"
                            placeholder="Αναζήτηση προμηθευτή..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 transition-all w-full md:w-64 shadow-inner font-bold text-sm"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-purple-500 transition-colors" size={18} />
                    </div>

                    <button
                        onClick={() => { setSelectedSupplier(null); setSupplierForm({}); setIsEditing(true); }}
                        className="p-3.5 rounded-xl text-white shadow-lg bg-purple-600 hover:bg-purple-700 transition-all hover:-translate-y-0.5 active:scale-95"
                        title="Νέος Προμηθευτής"
                    >
                        <Plus size={22} strokeWidth={3} />
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-20">
                {filteredSuppliers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredSuppliers.map(s => {
                            const latestOrder = supplierOrders?.filter(o => o.supplier_id === s.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                            return (
                                <SupplierCard
                                    key={s.id}
                                    supplier={s}
                                    latestOrderDate={latestOrder?.created_at}
                                    onClick={() => { setSelectedSupplier(s); setActiveTab('info'); setIsEditing(false); }}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Globe size={48} className="opacity-20 mb-4" />
                        <p className="font-bold">Δεν βρέθηκαν προμηθευτές.</p>
                    </div>
                )}

                {/* CREATE / EDIT SUPPLIER MODAL */}
                {isEditing && (
                    <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                    <Globe className="text-purple-600" /> {supplierForm.id ? 'Επεξεργασία Προμηθευτή' : 'Νέος Προμηθευτής'}
                                </h2>
                                <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600 p-2"><X size={20} /></button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Επωνυμία *</label>
                                    <input value={supplierForm.name || ''} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} placeholder="π.χ. Υλικά ΕΠΕ" className="w-full p-3 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-purple-500/20 bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Υπεύθυνος</label>
                                    <input value={supplierForm.contact_person || ''} onChange={e => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} placeholder="Ονοματεπώνυμο" className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Τηλέφωνο</label>
                                        <input value={supplierForm.phone || ''} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} placeholder="+30..." className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:bg-white transition-colors" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Email</label>
                                        <input value={supplierForm.email || ''} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} placeholder="email@..." className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:bg-white transition-colors" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Διεύθυνση</label>
                                    <input value={supplierForm.address || ''} onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })} placeholder="Οδός, Πόλη, ΤΚ" className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Σημειώσεις</label>
                                    <textarea value={supplierForm.notes || ''} onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })} placeholder="Πρόσθετες πληροφορίες..." className="w-full p-3 border border-slate-200 rounded-xl h-24 resize-none outline-none bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                            </div>
                            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                                <button onClick={() => setIsEditing(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Άκυρο</button>
                                <button onClick={handleSaveSupplier} className="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-lg hover:bg-black transition-colors flex items-center gap-2"><Check size={16} /> Αποθήκευση</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* DETAILS MODAL */}
                {selectedSupplier && !isEditing && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 lg:p-10 animate-in fade-in">
                        <div className="bg-white w-full max-w-6xl h-full max-h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col animate-in zoom-in-95">
                            {/* Modal Header */}
                            <div className="p-6 md:p-8 md:pr-24 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 bg-slate-50 relative shrink-0">
                                <button onClick={() => setSelectedSupplier(null)} className="absolute top-6 right-6 p-2 bg-white text-slate-400 hover:text-slate-700 rounded-full shadow-sm border border-slate-100 hover:bg-slate-50 transition-all z-10"><X size={20} /></button>
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-100 text-2xl font-black">
                                        {selectedSupplier.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-none mb-2">{selectedSupplier.name}</h2>
                                        <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500">
                                            {selectedSupplier.phone && <span className="flex items-center gap-1.5"><Phone size={14} /> {selectedSupplier.phone}</span>}
                                            {selectedSupplier.email && <span className="flex items-center gap-1.5"><Mail size={14} /> {selectedSupplier.email}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => { setSupplierForm(selectedSupplier); setIsEditing(true); }} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm text-sm">Επεξεργασία</button>
                                    <button onClick={() => handleDeleteSupplier(selectedSupplier.id)} className="p-2.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-100 transition-colors shadow-sm"><Trash2 size={18} /></button>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-slate-100 px-4 md:px-8 gap-4 md:gap-8 shrink-0 bg-white overflow-x-auto custom-scrollbar">
                                {[
                                    { id: 'info', label: 'Πληροφορίες' },
                                    { id: 'products', label: `Προϊόντα (${assignedProducts.length})` },
                                    { id: 'materials', label: `Υλικά (${assignedMaterials.length})` },
                                    { id: 'orders', label: `Παραγγελίες (${relatedOrders.length})` }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Modal Content */}
                            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/50 custom-scrollbar relative">
                                {activeTab === 'info' && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-4"><Phone size={16} className="text-purple-500" /> Στοιχεία Επικοινωνίας</h3>
                                            <div className="space-y-4">
                                                <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Υπεύθυνος</label><div className="font-bold text-slate-700 text-sm">{selectedSupplier.contact_person || '-'}</div></div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Τηλέφωνο</label><div className="font-bold text-slate-700 text-sm">{selectedSupplier.phone || '-'}</div></div>
                                                    <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Email</label><div className="font-bold text-slate-700 text-sm">{selectedSupplier.email || '-'}</div></div>
                                                </div>
                                                <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Διεύθυνση</label><div className="font-bold text-slate-700 text-sm">{selectedSupplier.address || '-'}</div></div>
                                            </div>
                                        </div>
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-fit">
                                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-4"><FileText size={16} className="text-purple-500" /> Σημειώσεις</h3>
                                            <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-medium min-h-[100px]">{selectedSupplier.notes || 'Καμία σημείωση.'}</p>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'products' && (
                                    <div className="space-y-6 max-w-6xl">
                                        <div className="bg-white p-2 pl-4 rounded-full border border-slate-200 shadow-sm flex items-center gap-3 w-full md:w-96 mb-6">
                                            <Search className="text-slate-400" size={18} />
                                            <input className="flex-1 outline-none text-sm font-bold bg-transparent" placeholder="Αναζήτηση προϊόντος για σύνδεση..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                                        </div>
                                        {productSearchTerm && availableProductsForLink.length > 0 && (
                                            <div className="bg-white rounded-2xl border border-purple-100 shadow-xl p-3 space-y-1 mb-8">
                                                <h4 className="text-xs font-bold text-slate-500 px-3 py-2 uppercase tracking-wider">Αποτελέσματα</h4>
                                                {availableProductsForLink.map(p => (
                                                    <div key={p.sku} className="flex justify-between items-center px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-slate-200">{p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-slate-300" />}</div>
                                                            <span className="font-bold text-slate-800">{p.sku}</span>
                                                        </div>
                                                        <button onClick={() => handleLinkProduct(p.sku)} className="text-xs bg-purple-50 text-purple-700 px-4 py-2 rounded-lg font-bold hover:bg-purple-100 transition-colors">Σύνδεση</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {assignedProducts.map(p => (
                                                <div key={p.sku} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between group h-full hover:border-slate-300 transition-colors">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                                            {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={18} className="text-slate-300" />}
                                                        </div>
                                                        <button onClick={() => handleUnlinkProduct(p.sku)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all shrink-0 bg-white rounded-md"><X size={16} /></button>
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-slate-800">{p.sku}</div>
                                                        {p.supplier_sku && (
                                                            <div className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 uppercase inline-block mt-1 truncate max-w-full">
                                                                Ref: {p.supplier_sku}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="mt-3 pt-3 border-t border-slate-50 text-xs font-bold text-slate-500">
                                                        Κόστος: {formatCurrency(p.active_price || p.supplier_cost || 0)}
                                                    </div>
                                                </div>
                                            ))}
                                            {assignedProducts.length === 0 && <div className="col-span-full text-center py-20 text-slate-400 font-medium">Δεν υπάρχουν συνδεδεμένα προϊόντα.</div>}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'materials' && (
                                    <div className="space-y-6 max-w-6xl">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            {assignedMaterials.map(m => (
                                                <div key={m.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center gap-3 hover:border-slate-300 transition-colors">
                                                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-1">
                                                        <Box size={24} />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800">{m.name}</div>
                                                        <div className="text-xs font-bold text-slate-500 mt-1">{MATERIAL_TYPE_LABELS[m.type] || m.type}</div>
                                                    </div>
                                                    <div className="mt-2 pt-2 border-t border-slate-50 text-sm font-black text-slate-700 w-full">
                                                        {formatCurrency(m.cost_per_unit)} / <span className="text-xs text-slate-400 font-bold uppercase">{m.unit}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {assignedMaterials.length === 0 && <div className="col-span-full text-center py-20 text-slate-400 font-medium">Κανένα συνδεδεμένο υλικό. (Ορίστε τον προμηθευτή από τη σελίδα Υλικών)</div>}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'orders' && (
                                    <div className="space-y-6 max-w-5xl">
                                        <button onClick={() => setIsCreatingOrder(true)} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 font-bold hover:border-slate-400 hover:text-slate-700 hover:bg-white transition-all flex items-center justify-center gap-2">
                                            <Plus size={20} /> Νέα Εντολή Αγοράς
                                        </button>
                                        <div className="grid grid-cols-1 gap-4">
                                            {relatedOrders.map(o => (
                                                <div key={o.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4 group hover:border-slate-300 transition-all">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${o.status === 'Pending' ? 'bg-amber-100 text-amber-600' : o.status === 'Received' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                                            {getSupplierOrderStatusIcon(o.status, 20)}
                                                        </div>
                                                        <div>
                                                            <div className="font-black text-slate-800 text-lg flex items-center gap-2 flex-wrap">
                                                                #{o.id.slice(0, 6).toUpperCase()}
                                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded border tracking-wide ${getSupplierOrderStatusClasses(o.status)}`}>
                                                                    {getSupplierOrderStatusLabel(o.status)}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-slate-500 font-bold mt-1">
                                                                {new Date(o.created_at).toLocaleDateString('el-GR')} • {o.items.length} είδη
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                                                        <button onClick={() => setOrderToPrint(o)} className="p-2 text-slate-400 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"><Printer size={18} /></button>
                                                        <button onClick={() => setViewOrderId(viewOrderId === o.id ? null : o.id)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors">Λεπτομέρειες</button>
                                                        {o.status === 'Pending' && (
                                                            <button onClick={() => handleReceiveOrder(o)} className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-colors shadow-md">Παραλαβή</button>
                                                        )}
                                                        <button onClick={() => handleDeleteOrder(o.id)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-lg transition-colors" title="Διαγραφή"><Trash2 size={18} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                            {relatedOrders.length === 0 && <div className="text-center text-slate-400 font-medium py-10">Δεν υπάρχουν παραγγελίες.</div>}
                                        </div>
                                    </div>
                                )}

                                {/* View Order Details Overlay */}
                                {viewOrderId && (
                                    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
                                        <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl relative animate-in zoom-in-95">
                                            <button onClick={() => setViewOrderId(null)} className="absolute top-6 right-6 p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"><X size={20} /></button>
                                            <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3"><FileText size={28} className="text-purple-600" /> Λεπτομέρειες Εντολής</h3>
                                            <div className="max-h-[50vh] overflow-y-auto custom-scrollbar border rounded-2xl border-slate-100 bg-slate-50/50">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold sticky top-0">
                                                        <tr><th className="p-4">Είδος</th><th className="p-4">Τίτλος</th><th className="p-4">Πελάτης</th><th className="p-4 text-center">Ποσ.</th></tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 pb-2">
                                                        {relatedOrders.find(o => o.id === viewOrderId)?.items.map((item, i) => (
                                                            <tr key={i} className="hover:bg-white transition-colors">
                                                                <td className="p-4 font-black text-slate-800 text-xs tracking-wider">{item.item_type === 'Product' ? 'ΠΡΟΪΟΝ' : 'ΥΛΙΚΟ'}</td>
                                                                <td className="p-4 font-medium text-slate-700">{item.item_name}</td>
                                                                <td className="p-4 text-sm text-slate-600">{item.customer_reference || '—'}</td>
                                                                <td className="p-4 text-center font-mono font-bold text-slate-900">{item.quantity}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Print Overlay */}
                {orderToPrint && products && (
                    <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
                        <div className="bg-white rounded-3xl w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Printer size={18} /> Προεπισκόπηση Εκτύπωσης</h3>
                                <button onClick={() => setOrderToPrint(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
                            </div>
                            <div className="flex-1 overflow-auto bg-slate-200 p-8 flex justify-center custom-scrollbar">
                                <div className="scale-[0.8] origin-top bg-white shadow-lg">
                                    <SupplierOrderPrintView order={orderToPrint} products={products} />
                                </div>
                            </div>
                            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
                                <button
                                    onClick={() => {
                                        setSupplierOrderToPrint(orderToPrint);
                                        setOrderToPrint(null);
                                    }}
                                    className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-black shadow-lg"
                                >
                                    Εκτύπωση
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Create Order Modal */}
                {isCreatingOrder && selectedSupplier && (
                    <DesktopPurchaseOrderBuilder
                        supplier={selectedSupplier}
                        onClose={() => setIsCreatingOrder(false)}
                    />
                )}
            </div>
        </div>
    );
}
