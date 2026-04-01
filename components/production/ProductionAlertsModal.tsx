import React from 'react';
import { Bell, Clock, ImageIcon, Package, X } from 'lucide-react';
import { formatOrderId } from '../../utils/orderUtils';
import { PRODUCTION_ALERT_STAGE_STYLES, ProductionAlertGroup } from './productionAlerts';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    groups: ProductionAlertGroup[];
};

export default function ProductionAlertsModal({ isOpen, onClose, groups }: Props) {
    if (!isOpen) return null;

    const totalAlerts = groups.reduce((sum, group) => sum + group.itemCount, 0);
    const totalQuantity = groups.reduce((sum, group) => sum + group.totalQuantity, 0);

    return (
        <div className="fixed inset-0 z-[230] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-5xl max-h-[88vh] rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 bg-white flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Bell size={18} className="text-slate-500" /> Ειδοποιήσεις Παραγωγής
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Ομαδοποιημένες ανά στάδιο, ώστε οι πιο παλιές κρίσιμες καθυστερήσεις να λύνονται πρώτες.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
                        <Bell size={13} className="text-slate-400" /> {totalAlerts} κρίσιμες ειδοποιήσεις
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
                        <Package size={13} className="text-slate-400" /> {totalQuantity} τεμάχια συνολικά
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
                        <Clock size={13} className="text-slate-400" /> {groups.length} στάδια με κρίσιμη καθυστέρηση
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto p-5 bg-slate-50/40 custom-scrollbar space-y-4">
                    {groups.length === 0 ? (
                        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
                            <Bell size={22} className="mx-auto mb-3 text-slate-300" />
                            <p className="text-sm font-bold text-slate-700">Δεν υπάρχουν κρίσιμες ειδοποιήσεις.</p>
                            <p className="text-xs text-slate-500 mt-1">Η Παραγωγή δεν έχει batches σε κρίσιμη καθυστέρηση αυτή τη στιγμή.</p>
                        </div>
                    ) : (
                        groups.map((group) => {
                            const stageStyles = PRODUCTION_ALERT_STAGE_STYLES[group.stageColorKey];

                            return (
                                <section key={group.stageId} className={`rounded-3xl border p-3 md:p-4 shadow-sm ${stageStyles.section}`}>
                                    <div className={`rounded-2xl border px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${stageStyles.header}`}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-2xl bg-white/85 border border-white/70 flex items-center justify-center font-black text-xs shrink-0">
                                                {group.stageShortLabel}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-black text-sm truncate">{group.stageLabel}</div>
                                                <div className="text-[11px] opacity-80">Τα πιο παλιά κρίσιμα batches εμφανίζονται πρώτα</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${stageStyles.badge}`}>
                                                {group.itemCount} ειδοποιήσεις
                                            </span>
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${stageStyles.badge}`}>
                                                {group.totalQuantity} τεμ.
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-3 space-y-2.5">
                                        {group.items.map((item) => (
                                            <article key={item.id} className="rounded-2xl border border-white/90 bg-white/95 p-3 shadow-sm">
                                                <div className="flex gap-3">
                                                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                                                        {item.productImage ? (
                                                            <img src={item.productImage} alt={item.sku} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <ImageIcon size={18} className="text-slate-300" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-black text-slate-900 truncate">{item.sku}</div>
                                                                <div className="mt-1 text-xs font-bold text-slate-600 truncate">{item.customerName}</div>
                                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                                                                        {item.quantity} τεμ.
                                                                    </span>
                                                                    {item.orderId && (
                                                                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                                                                            #{formatOrderId(item.orderId)}
                                                                        </span>
                                                                    )}
                                                                    {item.sizeInfo && (
                                                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${stageStyles.soft}`}>
                                                                            Μέγεθος {item.sizeInfo}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="flex md:flex-col items-start md:items-end gap-2 shrink-0">
                                                                <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-black text-red-600">
                                                                    <Clock size={12} /> {item.timingLabel}
                                                                </span>
                                                                <span className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600">
                                                                    Κρίσιμη
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
