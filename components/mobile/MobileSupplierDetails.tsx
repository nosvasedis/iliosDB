
import React, { useState } from 'react';
import { Supplier, SupplierOrder } from '../../types';
import { ChevronLeft, Phone, Mail, MapPin, Plus, Package, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { formatCurrency } from '../../utils/pricingEngine';
import MobilePurchaseOrderBuilder from './MobilePurchaseOrderBuilder';
import { getSupplierOrderStatusClasses, getSupplierOrderStatusIcon } from '../../features/suppliers/statusPresentation';

interface Props {
    supplier: Supplier;
    onClose: () => void;
}

export default function MobileSupplierDetails({ supplier, onClose }: Props) {
    const queryClient = useQueryClient();
    const { data: orders } = useQuery({ queryKey: ['supplier_orders'], queryFn: api.getSupplierOrders });
    const [isCreatingOrder, setIsCreatingOrder] = useState(false);
    const [viewTab, setViewTab] = useState<'info' | 'orders'>('orders');

    const supplierOrders = orders?.filter(o => o.supplier_id === supplier.id) || [];

    const handleDeleteOrder = async (orderId: string) => {
        if (!confirm('Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την εντολή αγοράς;')) return;
        try {
            await api.deleteSupplierOrder(orderId);
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
        } catch (e) {
            alert('Σφάλμα διαγραφής.');
        }
    };

    if (isCreatingOrder) {
        return (
            <MobilePurchaseOrderBuilder
                supplier={supplier}
                onClose={() => setIsCreatingOrder(false)}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="bg-white p-4 border-b border-slate-100 flex justify-between items-center shadow-sm z-10">
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="p-2 -ml-2 text-slate-500 hover:text-slate-800"><ChevronLeft size={24} /></button>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 leading-tight">{supplier.name}</h2>
                        {supplier.contact_person && <p className="text-xs text-slate-500">{supplier.contact_person}</p>}
                    </div>
                </div>
                <button onClick={() => setIsCreatingOrder(true)} className="bg-slate-900 text-white p-2 rounded-xl shadow-md active:scale-95">
                    <Plus size={20} />
                </button>
            </div>

            <div className="flex p-2 bg-white border-b border-slate-100">
                <button onClick={() => setViewTab('orders')} className={`flex-1 py-2 font-bold text-xs rounded-lg transition-colors ${viewTab === 'orders' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}>Παραγγελίες</button>
                <button onClick={() => setViewTab('info')} className={`flex-1 py-2 font-bold text-xs rounded-lg transition-colors ${viewTab === 'info' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}>Πληροφορίες</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 custom-scrollbar">
                {viewTab === 'info' ? (
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
                        <div className="space-y-3">
                            {supplier.phone && (
                                <a href={`tel:${supplier.phone}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-400"><Phone size={16} /></div>
                                    <span className="font-bold text-slate-700">{supplier.phone}</span>
                                </a>
                            )}
                            {supplier.email && (
                                <a href={`mailto:${supplier.email}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-400"><Mail size={16} /></div>
                                    <span className="font-bold text-slate-700 truncate">{supplier.email}</span>
                                </a>
                            )}
                            {supplier.address && (
                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-400"><MapPin size={16} /></div>
                                    <span className="font-bold text-slate-700">{supplier.address}</span>
                                </div>
                            )}
                        </div>
                        {supplier.notes && (
                            <div className="p-3 bg-yellow-50 text-yellow-800 text-xs rounded-xl border border-yellow-100 italic leading-relaxed">
                                {supplier.notes}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {supplierOrders.map(order => (
                            <div key={order.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="text-[10px] font-mono text-slate-400 mb-0.5">PO #{order.id.slice(0, 6)}</div>
                                        <div className="font-black text-slate-900 text-lg">{formatCurrency(order.total_amount)}</div>
                                    </div>
                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1 ${getSupplierOrderStatusClasses(order.status)}`}>
                                        {getSupplierOrderStatusIcon(order.status, 16)} {order.status}
                                    </span>
                                </div>
                                <div className="text-xs text-slate-500 font-medium mb-3">
                                    {new Date(order.created_at).toLocaleDateString('el-GR')} • {order.items.length} είδη
                                </div>
                                <div className="flex items-center gap-2">
                                    {order.status === 'Pending' && (
                                        <button
                                            onClick={async () => {
                                                if (confirm("Παραλαβή παραγγελίας;")) {
                                                    await api.receiveSupplierOrder(order);
                                                }
                                            }}
                                            className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-sm active:scale-95 transition-transform"
                                        >
                                            Παραλαβή
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeleteOrder(order.id)}
                                        className="p-2 bg-red-50 text-red-600 rounded-lg active:scale-95 transition-transform"
                                        title="Διαγραφή"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {supplierOrders.length === 0 && <div className="text-center py-10 text-slate-400 italic">Δεν υπάρχουν παραγγελίες.</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
