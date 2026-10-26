import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, PackageCheck, PackagePlus } from 'lucide-react';
import type { Product } from '../../../types';
import {
  formatSizeLabel,
  planConsignmentDraws,
  stockSizeOptions,
  type ConsignmentDrawPlan,
} from '../../../features/inventory';
import { useInventoryAvailability } from '../../../hooks/api/useInventory';
import { SizeChips } from '../../inventory/ui/StockControls';

/**
 * Optional size for a consignment line. «Χωρίς μέγεθος» is the default and is
 * always allowed, also for rings and bracelets.
 */
export function ConsignmentSizeSelect({
  product,
  value,
  onChange,
  disabled = false,
}: {
  product?: Product | null;
  value: string;
  onChange: (sizeInfo: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-label="Μέγεθος"
        className={`inline-flex min-h-[40px] w-full items-center justify-between gap-1 rounded-xl border px-2.5 text-xs font-bold disabled:opacity-50 ${value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
      >
        <span className="truncate">{formatSizeLabel(value)}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <SizeChips
            options={stockSizeOptions(product)}
            value={value}
            onChange={(sizeInfo) => { onChange(sizeInfo); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}

interface DrawLine {
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  quantity: number;
}

/** Live preview of what handoff will take from the warehouse vs. book directly. */
export function useConsignmentDrawPlans(lines: DrawLine[], sourceWarehouseId: string): Array<ConsignmentDrawPlan | null> {
  const availabilityQuery = useInventoryAvailability({ refetchOnMount: false });
  const availability = availabilityQuery.data;
  return useMemo(() => {
    if (!availability || !sourceWarehouseId) return lines.map(() => null);
    const valid = lines.map((line) => Boolean(line.sku) && line.quantity > 0);
    const plans = planConsignmentDraws(
      lines.filter((_, index) => valid[index]).map((line) => ({
        productSku: line.sku,
        variantSuffix: line.variantSuffix,
        sizeInfo: line.sizeInfo,
        quantity: line.quantity,
      })),
      availability,
      sourceWarehouseId,
    );
    let cursor = 0;
    return valid.map((isValid) => (isValid ? plans[cursor++] : null));
  }, [availability, lines, sourceWarehouseId]);
}

/** Never blocking: it only explains where the pieces will come from. */
export function ConsignmentStockHint({ plan }: { plan: ConsignmentDrawPlan | null }) {
  if (!plan) return null;
  if (plan.direct === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
        <PackageCheck size={11} /> από αποθήκη
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700" title="Δεν μπλοκάρει: τα τεμάχια που λείπουν καταγράφονται απευθείας στον πελάτη.">
      <PackagePlus size={11} />
      {plan.fromStock > 0 ? `${plan.fromStock} από αποθήκη · ${plan.direct} νέα` : 'νέα τεμάχια (όχι στην αποθήκη)'}
    </span>
  );
}
