import React from 'react';
import { Percent } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useFinanceWorkspace } from '../../hooks/api/useFinance';
import { normalizeSplit } from '../../features/finance/financeMath';
import type { FinanceBillingMode } from '../../features/finance/types';

type Split = { mode: FinanceBillingMode; tPercent: number };

/** Admin-only Χ/Τ selector in the order builder; defaults to the order's saved terms, then the customer's. */
export default function OrderBillingPicker({ orderId, customerId, value, onChange }: {
  orderId?: string;
  customerId?: string | null;
  value: Split | null;
  onChange: (split: Split) => void;
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const workspace = useFinanceWorkspace(isAdmin).data;
  if (!isAdmin || !workspace) return null;

  const saved = orderId ? workspace.orderBilling.find((row) => row.order_id === orderId) : undefined;
  const terms = customerId ? workspace.customerTerms.find((row) => row.customer_id === customerId) : undefined;
  const effective = value || (saved ? normalizeSplit(saved.mode, saved.t_percent) : normalizeSplit(terms?.default_mode, terms?.t_percent));
  const source = value ? 'αυτή η παραγγελία' : saved ? 'αποθηκευμένο' : terms ? 'από τον πελάτη' : 'προεπιλογή';

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500"><Percent size={12} /> Χ/Τ</span>
        <span className="text-[10px] font-bold text-slate-400">{source}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-0.5 text-xs font-black">
        {([['T', 'Τ'], ['split', 'Μικτό'], ['X', 'Χ']] as Array<[FinanceBillingMode, string]>).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ mode, tPercent: mode === 'T' ? 100 : mode === 'X' ? 0 : (effective.mode === 'split' ? effective.tPercent : 50) })}
            className={`rounded-lg py-1.5 ${effective.mode === mode ? (mode === 'T' ? 'bg-indigo-600 text-white' : mode === 'X' ? 'bg-amber-400 text-amber-950' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {effective.mode === 'split' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-10 text-right text-[11px] font-black text-indigo-700">Τ {effective.tPercent}%</span>
          <input type="range" min={0} max={100} step={5} value={effective.tPercent} onChange={(event) => onChange({ mode: 'split', tPercent: Number(event.target.value) })} className="flex-1 accent-indigo-600" />
          <span className="w-10 text-[11px] font-black text-amber-700">Χ {100 - effective.tPercent}%</span>
        </div>
      )}
    </div>
  );
}
