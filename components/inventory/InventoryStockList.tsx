import React, { useEffect, useState } from 'react';
import { ChevronRight, Handshake, PackageSearch } from 'lucide-react';
import type { Product } from '../../types';
import type { InventoryAvailability } from '../../features/inventory';
import { formatInventoryInteger, summarizeSizes } from '../../features/inventory';
import { CARD } from '../ui/designTokens';
import { ProductThumb, SkuLabel } from './ui/StockControls';

export interface InventoryVariantItem {
  key: string;
  productSku: string;
  variantSuffix: string;
  product?: Product;
  /** Balances in manual warehouses (the consignment location excluded). */
  rows: InventoryAvailability[];
  onHand: number;
  available: number;
  reserved: number;
  atCustomers: number;
}

const PAGE = 60;

export default function InventoryStockList({
  items,
  resetKey,
  emptyHint,
  onOpen,
}: {
  items: InventoryVariantItem[];
  resetKey: string;
  emptyHint: string;
  onOpen: (item: InventoryVariantItem) => void;
}) {
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [resetKey]);

  if (items.length === 0) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-2 p-10 text-center text-slate-500`}>
        <PackageSearch size={28} className="text-slate-300" />
        <p className="text-sm font-semibold">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <ul className="divide-y divide-slate-100">
        {items.slice(0, visible).map((item) => {
          const perWarehouse = new Map<string, { name: string; quantity: number }>();
          item.rows.forEach((row) => {
            if (row.onHand === 0) return;
            const current = perWarehouse.get(row.warehouseId) || { name: row.warehouseName, quantity: 0 };
            current.quantity += row.onHand;
            perWarehouse.set(row.warehouseId, current);
          });
          const sizes = summarizeSizes(item.rows);
          return (
            <li key={item.key}>
              <button type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                <ProductThumb product={item.product} />
                <span className="min-w-0 flex-1">
                  <SkuLabel product={item.product} sku={item.productSku} variantSuffix={item.variantSuffix} className="text-base" />
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {Array.from(perWarehouse.values()).map((entry) => (
                      <span key={entry.name} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                        {entry.name} <strong className="tabular-nums text-slate-900">{formatInventoryInteger(entry.quantity)}</strong>
                      </span>
                    ))}
                    {item.atCustomers > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">
                        <Handshake size={11} /> σε πελάτες <strong className="tabular-nums">{formatInventoryInteger(item.atCustomers)}</strong>
                      </span>
                    )}
                    {sizes && sizes.includes('×') && item.rows.some((row) => row.sizeInfo) && (
                      <span className="truncate font-mono text-[11px] text-slate-400">{sizes}</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-lg font-black tabular-nums ${item.onHand > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{formatInventoryInteger(item.onHand)}</span>
                  {item.reserved > 0 && <span className="block text-[11px] font-bold text-emerald-700">{formatInventoryInteger(item.available)} διαθ.</span>}
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-300" />
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > visible && (
        <button type="button" onClick={() => setVisible((current) => current + PAGE)} className="w-full border-t border-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
          Εμφάνιση περισσότερων ({formatInventoryInteger(items.length - visible)})
        </button>
      )}
    </div>
  );
}
