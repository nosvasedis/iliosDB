import React from 'react';
import { Box, Clock, Gem, Mail, MapPin, Phone, Plus, ShoppingCart, UserRound } from 'lucide-react';
import type { Supplier } from '../../types';
import { formatNumber } from '../../utils/numberFormat';
import { formatRelativeDay, supplierAvatarTone, supplierInitials, type SupplierStats } from './supplierUi';

export function SupplierAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
    const sizing = {
        sm: 'h-9 w-9 rounded-xl text-xs',
        md: 'h-12 w-12 rounded-2xl text-base',
        lg: 'h-16 w-16 rounded-[1.25rem] text-xl',
    }[size];
    return (
        <div className={`flex shrink-0 items-center justify-center bg-gradient-to-br font-black tracking-tight text-white shadow-md ring-1 ring-inset ring-white/20 ${supplierAvatarTone(name || '?')} ${sizing}`}>
            {supplierInitials(name || '?')}
        </div>
    );
}

function Metric({ icon: Icon, label, value, highlight }: { icon: typeof Gem; label: string; value: number; highlight?: boolean }) {
    return (
        <div className={`flex flex-col items-start rounded-xl px-2.5 py-2 ${highlight ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-100' : 'bg-slate-50 text-slate-700'}`}>
            <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wide ${highlight ? 'text-amber-600' : 'text-slate-400'}`}>
                <Icon size={10} /> {label}
            </span>
            <span className="mt-0.5 text-base font-black tabular-nums">{formatNumber(value)}</span>
        </div>
    );
}

interface Props {
    supplier: Supplier;
    stats: SupplierStats;
    onOpen: () => void;
    onNewOrder: () => void;
}

export default function SupplierCard({ supplier, stats, onOpen, onNewOrder }: Props) {
    const stop = (event: React.SyntheticEvent) => event.stopPropagation();

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}
            className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
            {stats.pendingOrderCount > 0 && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400" />}

            <div className="flex items-start gap-3">
                <SupplierAvatar name={supplier.name} />
                <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="truncate text-base font-black leading-tight text-slate-900" title={supplier.name}>{supplier.name}</h3>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs font-semibold text-slate-500">
                        <UserRound size={12} className="shrink-0 text-slate-400" />
                        {supplier.contact_person || <span className="italic text-slate-400">Χωρίς υπεύθυνο</span>}
                    </p>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
                <Metric icon={Gem} label="Προϊόντα" value={stats.productCount} />
                <Metric icon={Box} label="Υλικά" value={stats.materialCount} />
                <Metric icon={Clock} label="Εκκρεμείς" value={stats.pendingOrderCount} highlight={stats.pendingOrderCount > 0} />
            </div>

            <div className="mt-4 space-y-1.5 text-xs font-semibold text-slate-600">
                {supplier.phone ? (
                    <a href={`tel:${supplier.phone}`} onClick={stop} className="flex w-fit max-w-full items-center gap-2 truncate rounded-md hover:text-emerald-700">
                        <Phone size={12} className="shrink-0 text-slate-400" /> {supplier.phone}
                    </a>
                ) : null}
                {supplier.email ? (
                    <a href={`mailto:${supplier.email}`} onClick={stop} className="flex w-fit max-w-full items-center gap-2 truncate rounded-md hover:text-emerald-700">
                        <Mail size={12} className="shrink-0 text-slate-400" /> <span className="truncate">{supplier.email}</span>
                    </a>
                ) : null}
                {supplier.address ? (
                    <div className="flex items-center gap-2 truncate" title={supplier.address}>
                        <MapPin size={12} className="shrink-0 text-slate-400" /> <span className="truncate">{supplier.address}</span>
                    </div>
                ) : null}
                {!supplier.phone && !supplier.email && !supplier.address && (
                    <p className="italic text-slate-400">Δεν έχουν καταχωριστεί στοιχεία επικοινωνίας.</p>
                )}
            </div>

            <div className="mt-auto pt-4">
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-bold text-slate-400">
                    <ShoppingCart size={12} className="shrink-0" />
                    {stats.lastOrderAt ? `Τελευταία εντολή: ${formatRelativeDay(stats.lastOrderAt)}` : 'Καμία εντολή ακόμη'}
                </span>
                <button
                    type="button"
                    onClick={(event) => { stop(event); onNewOrder(); }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-white opacity-0 shadow-sm transition-all hover:bg-black focus:opacity-100 group-hover:opacity-100"
                    title="Νέα εντολή αγοράς"
                >
                    <Plus size={12} strokeWidth={3} /> Εντολή
                </button>
            </div>
            </div>
        </div>
    );
}
