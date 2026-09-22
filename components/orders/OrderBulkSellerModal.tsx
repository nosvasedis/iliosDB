import React, { useState } from 'react';
import { Loader2, UserCheck, X } from 'lucide-react';
import { SellerPicker } from '../OrderBuilder/SellerPicker';

export function OrderBulkSellerModal({
    count,
    isProcessing,
    onClose,
    onSave,
}: {
    count: number;
    isProcessing: boolean;
    onClose: () => void;
    onSave: (seller: {
        sellerId: string | undefined;
        sellerName: string | undefined;
        commission: number | undefined;
    }) => void;
}) {
    const [sellerId, setSellerId] = useState<string | undefined>(undefined);
    const [sellerName, setSellerName] = useState<string | undefined>(undefined);
    const [commission, setCommission] = useState<number | undefined>(undefined);

    return (
        <div className="fixed inset-0 z-[350] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-sky-50/70">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <UserCheck size={18} /> Μαζική Ανάθεση Πλασιέ
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Θα εφαρμοστεί σε {count} παραγγελίες</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-500">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <SellerPicker
                        selectedSellerId={sellerId}
                        selectedSellerName={sellerName}
                        commissionPercent={commission}
                        onSellerChange={(id, name, defaultCommission) => {
                            setSellerId(id);
                            setSellerName(name);
                            if (defaultCommission != null) setCommission(defaultCommission);
                        }}
                        onCommissionChange={setCommission}
                    />
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button type="button" onClick={onClose} disabled={isProcessing} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">
                            Ακύρωση
                        </button>
                        <button
                            type="button"
                            onClick={() => onSave({ sellerId, sellerName, commission })}
                            disabled={isProcessing}
                            className="px-6 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : null}
                            Αποθήκευση
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
