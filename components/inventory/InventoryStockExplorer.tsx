import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Package,
  PencilLine,
  ClipboardPlus,
  Settings2,
} from 'lucide-react';
import type { Product } from '../../types';
import type {
  InventoryAvailability,
  InventorySkuGroup,
  InventoryVariantGroup,
} from '../../features/inventory';
import {
  formatInventoryInteger,
  getWarehouseTypeLabel,
  inventoryIdentityKey,
  INVENTORY_TERMS,
} from '../../features/inventory';
import SkuColorizedText from '../SkuColorizedText';
import { BTN_SECONDARY, CARD } from '../ui/designTokens';

export type InventoryQuickOperation = 'adjustment' | 'transfer' | 'reorder';

interface InventoryStockExplorerProps {
  groups: InventorySkuGroup[];
  productsBySku: ReadonlyMap<string, Product>;
  compact: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  searchTerm: string;
  focusRequest?: { productSku: string; variantSuffix: string; nonce: number } | null;
  onOperation: (kind: InventoryQuickOperation, row: InventoryAvailability) => void;
  onPost: (row: InventoryAvailability) => void;
  onProductSelect?: (product: Product) => void;
}

function quantityTone(value: number, reorderPoint: number): string {
  if (value <= 0) return 'border-rose-100 bg-rose-50 text-rose-700';
  if (reorderPoint > 0 && value <= reorderPoint) return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

function ProductImage({ product, sku, size = 'large' }: { product?: Product; sku: string; size?: 'small' | 'large' }) {
  const dimensions = size === 'large' ? 'h-14 w-14' : 'h-11 w-11';
  return (
    <div className={`flex ${dimensions} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50`}>
      {product?.image_url ? (
        <img
          src={product.image_url}
          alt={`Εικόνα προϊόντος ${sku}`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <ImageIcon size={size === 'large' ? 22 : 18} className="text-slate-300" aria-label={`Δεν υπάρχει εικόνα για το προϊόν ${sku}`} />
      )}
    </div>
  );
}

function StructureSummary({ group }: { group: InventorySkuGroup }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-600">
      <span className="rounded-md bg-slate-100 px-2 py-1">
        {formatInventoryInteger(group.variants.length)} {group.variants.length === 1 ? 'παραλλαγή' : 'παραλλαγές'}
      </span>
      {group.sizeCount > 0 && (
        <span className="rounded-md bg-slate-100 px-2 py-1">
          {formatInventoryInteger(group.sizeCount)} {group.sizeCount === 1 ? 'μέγεθος' : 'μεγέθη'}
        </span>
      )}
      <span className="rounded-md bg-slate-100 px-2 py-1">
        {formatInventoryInteger(group.warehouseCount)} {group.warehouseCount === 1 ? 'αποθήκη' : 'αποθήκες'}
      </span>
    </div>
  );
}

function StockActionButtons({
  row,
  isAdmin,
  canOperate,
  onOperation,
  onPost,
}: {
  row: InventoryAvailability;
  isAdmin: boolean;
  canOperate: boolean;
  onOperation: InventoryStockExplorerProps['onOperation'];
  onPost: InventoryStockExplorerProps['onPost'];
}) {
  if (!isAdmin && !canOperate) {
    return <span className="text-xs font-semibold text-slate-400">Μόνο προβολή</span>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {isAdmin && (
        <button
          type="button"
          onClick={() => onPost(row)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"
        >
          <ClipboardPlus size={14} aria-hidden="true" />
          Καταχώριση
        </button>
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onOperation('adjustment', row)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        >
          <PencilLine size={14} aria-hidden="true" />
          Διόρθωση
        </button>
      )}
      {canOperate && (
        <button
          type="button"
          onClick={() => onOperation('transfer', row)}
          disabled={row.available <= 0}
          title={row.available <= 0 ? 'Δεν υπάρχει διαθέσιμο απόθεμα για ενδοδιακίνηση' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeftRight size={14} aria-hidden="true" />
          Ενδοδιακίνηση
        </button>
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onOperation('reorder', row)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        >
          <Settings2 size={14} aria-hidden="true" />
          Όριο
        </button>
      )}
    </div>
  );
}

function VariantHeader({ variant, product }: { variant: InventoryVariantGroup; product?: Product }) {
  const variantDetails = product?.variants?.find((item) => item.suffix === variant.variantSuffix);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <SkuColorizedText
            sku={variant.rows[0]?.productSku || product?.sku || ''}
            suffix={variant.variantSuffix}
            gender={product?.gender}
            className="text-sm"
            masterClassName="text-slate-800"
          />
          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
            {variant.variantSuffix ? 'Παραλλαγή' : 'Βασικό είδος'}
          </span>
        </div>
        {variantDetails?.description && <p className="mt-1 text-xs text-slate-500">{variantDetails.description}</p>}
      </div>
      <div className="flex flex-wrap gap-3 text-xs font-bold">
        <span className="text-slate-600">Φυσικό {formatInventoryInteger(variant.totals.onHand)}</span>
        <span className="text-indigo-700">Δεσμευμένο {formatInventoryInteger(variant.totals.reserved)}</span>
        <span className="text-emerald-700">Διαθέσιμο {formatInventoryInteger(variant.totals.available)}</span>
        {variant.totals.openOrderQuantity > 0 && (
          <>
            <span className="text-blue-700">
              Ενεργές παραγγελίες {formatInventoryInteger(variant.totals.openOrderQuantity)}
            </span>
            <span className="text-cyan-700">
              Ήδη αποσταλμένα {formatInventoryInteger(variant.totals.shippedQuantity)}
            </span>
            <span className="text-amber-700">
              Ανεκτέλεστα {formatInventoryInteger(variant.totals.outstandingDemand)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function VariantBreakdown({
  group,
  product,
  isAdmin,
  canOperate,
  onOperation,
  onPost,
  focusedVariantSuffix,
}: {
  group: InventorySkuGroup;
  product?: Product;
  isAdmin: boolean;
  canOperate: boolean;
  onOperation: InventoryStockExplorerProps['onOperation'];
  onPost: InventoryStockExplorerProps['onPost'];
  focusedVariantSuffix?: string | null;
}) {
  return (
    <div className="space-y-3">
      {group.variants.map((variant) => (
        <section
          key={variant.variantSuffix || 'base'}
          data-inventory-variant={`${group.productSku}::${variant.variantSuffix}`}
          className={`overflow-hidden rounded-xl border bg-white transition ${focusedVariantSuffix === variant.variantSuffix ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}
        >
          <VariantHeader variant={variant} product={product} />
          <div className="divide-y divide-slate-100">
            {variant.rows.map((row) => (
              <div
                key={inventoryIdentityKey(row)}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(13rem,1.35fr)_repeat(6,minmax(5rem,.55fr))_minmax(15rem,1.4fr)] lg:items-center"
              >
                <div>
                  <p className="font-bold text-slate-800">{row.warehouseName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.sizeInfo ? `Μέγεθος ${row.sizeInfo}` : 'Χωρίς διάκριση μεγέθους'} · {getWarehouseTypeLabel(row.warehouseType)}
                  </p>
                  {(row.openOrderQuantity || 0) > 0 && (
                    <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">
                      Ενεργές παραγγελίες {formatInventoryInteger(row.openOrderQuantity || 0)}
                      {' · '}Ήδη αποσταλμένα {formatInventoryInteger(row.shippedQuantity || 0)}
                      {' · '}Καλυμμένα με δέσμευση {formatInventoryInteger(row.allocatedQuantity || 0)}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 lg:contents">
                  <div className="text-center lg:text-right">
                    <span className="block text-[11px] font-bold uppercase text-slate-400 lg:hidden">Φυσικό</span>
                    <strong className="tabular-nums text-slate-800">{formatInventoryInteger(row.onHand)}</strong>
                  </div>
                  <div className="text-center lg:text-right">
                    <span className="block text-[11px] font-bold uppercase text-indigo-400 lg:hidden">Δεσμευμένο</span>
                    <strong className="tabular-nums text-indigo-700">{formatInventoryInteger(row.reserved)}</strong>
                  </div>
                  <div className="text-center lg:text-right">
                    <span className="block text-[11px] font-bold uppercase text-emerald-500 lg:hidden">Διαθέσιμο</span>
                    <strong className={`inline-flex min-w-10 justify-center rounded-lg border px-2 py-1 tabular-nums ${quantityTone(row.available, row.reorderPoint)}`}>
                      {formatInventoryInteger(row.available)}
                    </strong>
                  </div>
                  <div className="text-center lg:text-right">
                    <span className="block text-[11px] font-bold uppercase text-blue-400 lg:hidden">Αναμενόμενο</span>
                    <strong className="tabular-nums text-blue-700">{formatInventoryInteger(row.incoming)}</strong>
                  </div>
                  <div
                    className="text-center lg:text-right"
                    title="Η ποσότητα που απομένει μετά την αφαίρεση των ήδη αποσταλμένων και των ενεργών δεσμεύσεων."
                  >
                    <span className="block text-[11px] font-bold uppercase text-amber-500 lg:hidden">Ανεκτέλεστη</span>
                    <strong className="tabular-nums text-amber-700">{formatInventoryInteger(row.outstandingDemand)}</strong>
                  </div>
                  <div className="text-center lg:text-right">
                    <span className="block text-[11px] font-bold uppercase text-slate-400 lg:hidden">Πρόβλεψη</span>
                    <strong className="tabular-nums text-slate-800">{formatInventoryInteger(row.projectedAvailable)}</strong>
                  </div>
                </div>
                <StockActionButtons row={row} isAdmin={isAdmin} canOperate={canOperate} onOperation={onOperation} onPost={onPost} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DesktopSkuRow({
  group,
  product,
  expanded,
  isAdmin,
  canOperate,
  onToggle,
  onOperation,
  onPost,
  onProductSelect,
  focusedVariantSuffix,
}: {
  group: InventorySkuGroup;
  product?: Product;
  expanded: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  onToggle: () => void;
  onOperation: InventoryStockExplorerProps['onOperation'];
  onPost: InventoryStockExplorerProps['onPost'];
  onProductSelect?: (product: Product) => void;
  focusedVariantSuffix?: string | null;
}) {
  return (
    <>
      <tr className={`${expanded ? 'bg-emerald-50/35' : 'hover:bg-slate-50/70'} transition-colors`}>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex min-w-[18rem] items-center gap-3 text-left"
          >
            <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            <ProductImage product={product} sku={group.productSku} />
            <div className="min-w-0">
              <SkuColorizedText sku={group.productSku} suffix="" gender={product?.gender} className="text-base" masterClassName="text-slate-900" />
              <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{product?.description || product?.category || 'Χωρίς περιγραφή προϊόντος'}</p>
              {product?.category && <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-slate-400">{product.category}</p>}
            </div>
          </button>
        </td>
        <td className="px-4 py-3"><StructureSummary group={group} /></td>
        <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-800">{formatInventoryInteger(group.totals.onHand)}</td>
        <td className="px-4 py-3 text-right font-bold tabular-nums text-indigo-700">{formatInventoryInteger(group.totals.reserved)}</td>
        <td className="px-4 py-3 text-right">
          <span className={`inline-flex min-w-12 justify-center rounded-lg border px-2 py-1 font-black tabular-nums ${quantityTone(group.totals.available, 0)}`}>
            {formatInventoryInteger(group.totals.available)}
          </span>
        </td>
        <td className="px-4 py-3 text-right text-xs font-bold">
          <p className="text-blue-700">Αναμενόμενα +{formatInventoryInteger(group.totals.incoming)}</p>
          {group.totals.openOrderQuantity > 0 && (
            <>
              <p className="mt-1 text-cyan-700">
                Αποσταλμένα {formatInventoryInteger(group.totals.shippedQuantity)}
                {' / '}
                {formatInventoryInteger(group.totals.openOrderQuantity)}
              </p>
              <p className="mt-1 text-slate-500">
                Υπόλοιπο {formatInventoryInteger(group.totals.remainingOrderQuantity)}
                {' · '}Δεσμ. {formatInventoryInteger(group.totals.allocatedQuantity)}
              </p>
            </>
          )}
          <p className="mt-1 text-amber-700">Ανεκτέλεστα −{formatInventoryInteger(group.totals.outstandingDemand)}</p>
        </td>
        <td className="px-4 py-3 text-right font-black tabular-nums text-slate-800">{formatInventoryInteger(group.totals.projectedAvailable)}</td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-2">
            {product && onProductSelect && (
              <button
                type="button"
                onClick={() => onProductSelect(product)}
                className="inline-flex items-center gap-1.5 rounded-lg p-2 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900"
                title={`Άνοιγμα καρτέλας προϊόντος ${group.productSku}`}
              >
                <ExternalLink size={15} aria-hidden="true" />
                Καρτέλα
              </button>
            )}
            <button type="button" onClick={onToggle} className={`${BTN_SECONDARY} whitespace-nowrap px-3 py-2 text-xs`}>
              {expanded ? 'Σύμπτυξη' : 'Παραλλαγές'}
              <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="border-y border-emerald-100 bg-slate-50/70 p-4">
            <VariantBreakdown group={group} product={product} isAdmin={isAdmin} canOperate={canOperate} onOperation={onOperation} onPost={onPost} focusedVariantSuffix={focusedVariantSuffix} />
          </td>
        </tr>
      )}
    </>
  );
}

function CompactSkuCard({
  group,
  product,
  expanded,
  isAdmin,
  canOperate,
  onToggle,
  onOperation,
  onPost,
  onProductSelect,
  focusedVariantSuffix,
}: {
  group: InventorySkuGroup;
  product?: Product;
  expanded: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  onToggle: () => void;
  onOperation: InventoryStockExplorerProps['onOperation'];
  onPost: InventoryStockExplorerProps['onPost'];
  onProductSelect?: (product: Product) => void;
  focusedVariantSuffix?: string | null;
}) {
  return (
    <article className={`${CARD} overflow-hidden`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-3 p-4 text-left">
        <ProductImage product={product} sku={group.productSku} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SkuColorizedText sku={group.productSku} suffix="" gender={product?.gender} className="text-base" masterClassName="text-slate-900" />
              <p className="mt-0.5 truncate text-xs text-slate-500">{product?.description || product?.category || 'Χωρίς περιγραφή προϊόντος'}</p>
            </div>
            <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </div>
          <div className="mt-2"><StructureSummary group={group} /></div>
        </div>
      </button>
      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 px-4 py-3 text-center text-xs">
        <div className="rounded-lg bg-slate-50 p-2">
          <span className="block text-slate-400">Φυσικό</span>
          <strong className="tabular-nums">{formatInventoryInteger(group.totals.onHand)}</strong>
        </div>
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
          <span className="block text-indigo-400">Δεσμευμένο</span>
          <strong className="tabular-nums">{formatInventoryInteger(group.totals.reserved)}</strong>
        </div>
        <div className={`rounded-lg border p-2 ${quantityTone(group.totals.available, 0)}`}>
          <span className="block opacity-70">Διαθέσιμο</span>
          <strong className="tabular-nums">{formatInventoryInteger(group.totals.available)}</strong>
        </div>
      </div>
      {group.totals.openOrderQuantity > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs">
          <p className="font-bold text-cyan-700">
            Ήδη αποσταλμένα {formatInventoryInteger(group.totals.shippedQuantity)}
            {' / '}
            {formatInventoryInteger(group.totals.openOrderQuantity)}
          </p>
          <p className="text-right font-bold text-amber-700">
            Ανεκτέλεστη ζήτηση {formatInventoryInteger(group.totals.outstandingDemand)}
          </p>
          <p className="col-span-2 text-[11px] font-semibold text-slate-500">
            Υπόλοιπο προς εκπλήρωση {formatInventoryInteger(group.totals.remainingOrderQuantity)}
            {' · '}Καλυμμένο με δέσμευση {formatInventoryInteger(group.totals.allocatedQuantity)}
          </p>
        </div>
      )}
      <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
        {product && onProductSelect && (
          <button type="button" onClick={() => onProductSelect(product)} className={`${BTN_SECONDARY} flex-1 justify-center px-3 py-2 text-xs`}>
            <ExternalLink size={14} aria-hidden="true" /> Καρτέλα
          </button>
        )}
        <button type="button" onClick={onToggle} className={`${BTN_SECONDARY} flex-1 justify-center px-3 py-2 text-xs`}>
          <Package size={14} aria-hidden="true" /> {expanded ? 'Σύμπτυξη' : 'Παραλλαγές'}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-emerald-100 bg-slate-50 p-3">
          <VariantBreakdown group={group} product={product} isAdmin={isAdmin} canOperate={canOperate} onOperation={onOperation} onPost={onPost} focusedVariantSuffix={focusedVariantSuffix} />
        </div>
      )}
    </article>
  );
}

function Pagination({
  page,
  totalPages,
  pageSize,
  totalGroups,
  visibleCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  totalGroups: number;
  visibleCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const first = totalGroups === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const last = totalGroups === 0 ? 0 : first + visibleCount - 1;
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="font-semibold text-slate-600">
        Εμφάνιση {formatInventoryInteger(first)}–{formatInventoryInteger(last)} από {formatInventoryInteger(totalGroups)} κύριους κωδικούς
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          Ανά σελίδα
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Προηγούμενη σελίδα"
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-35"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-24 text-center text-xs font-black text-slate-700">
          Σελίδα {formatInventoryInteger(page)} / {formatInventoryInteger(totalPages)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Επόμενη σελίδα"
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-35"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default function InventoryStockExplorer({
  groups,
  productsBySku,
  compact,
  isAdmin,
  canOperate,
  searchTerm,
  focusRequest,
  onOperation,
  onPost,
  onProductSelect,
}: InventoryStockExplorerProps) {
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(compact ? 25 : 50);
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [groups, pageSize]);

  useEffect(() => {
    if (!searchTerm.trim() || groups.length !== 1) return;
    const onlySku = groups[0].productSku;
    setExpandedSkus((current) => {
      if (current.has(onlySku)) return current;
      const next = new Set(current);
      next.add(onlySku);
      return next;
    });
  }, [groups, searchTerm]);

  useEffect(() => {
    if (!focusRequest) return;
    const groupIndex = groups.findIndex((group) => group.productSku === focusRequest.productSku);
    if (groupIndex < 0) return;
    setPage(Math.floor(groupIndex / pageSize) + 1);
    setExpandedSkus((current) => {
      if (current.has(focusRequest.productSku)) return current;
      const next = new Set(current);
      next.add(focusRequest.productSku);
      return next;
    });
    const timeoutId = window.setTimeout(() => {
      const identity = `${focusRequest.productSku}::${focusRequest.variantSuffix}`;
      const target = Array.from(document.querySelectorAll<HTMLElement>('[data-inventory-variant]'))
        .find((element) => element.dataset.inventoryVariant === identity);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [focusRequest, groups, pageSize]);

  const visibleGroups = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return groups.slice(start, start + pageSize);
  }, [groups, pageSize, safePage]);
  const groupSummary = useMemo(() => groups.reduce(
    (summary, group) => ({
      variants: summary.variants + group.variants.length,
      locations: summary.locations + group.rows.length,
    }),
    { variants: 0, locations: 0 },
  ), [groups]);

  const toggleSku = (sku: string) => {
    setExpandedSkus((current) => {
      const next = new Set(current);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className={`${CARD} mx-4 p-10 text-center text-slate-500 sm:mx-0`}>
        <Package className="mx-auto mb-3 text-slate-300" size={32} />
        <p className="font-bold">Δεν βρέθηκαν κύριοι κωδικοί με τα επιλεγμένα κριτήρια.</p>
        <p className="mt-1 text-sm">Αλλάξτε αναζήτηση ή φίλτρα για να εμφανιστούν προϊόντα.</p>
      </div>
    );
  }

  return (
    <section className={`${CARD} mx-4 overflow-hidden sm:mx-0`} aria-label="Ομαδοποιημένα υπόλοιπα ανά κύριο κωδικό">
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black text-slate-900">{formatInventoryInteger(groups.length)} κύριοι κωδικοί</p>
          <p className="text-xs text-slate-500">
            {formatInventoryInteger(groupSummary.variants)} παραλλαγές ·{' '}
            {formatInventoryInteger(groupSummary.locations)} θέσεις αποθέματος
          </p>
        </div>
        <p className="max-w-xl text-xs font-semibold text-slate-500">
          Ανοίξτε έναν κύριο κωδικό για ασφαλή επιλογή παραλλαγής, μεγέθους και αποθήκης πριν από κάθε μεταβολή.
        </p>
      </div>

      {compact ? (
        <div className="space-y-3 bg-slate-50/60 p-3">
          {visibleGroups.map((group) => (
            <CompactSkuCard
              key={group.productSku}
              group={group}
              product={productsBySku.get(group.productSku)}
              expanded={expandedSkus.has(group.productSku)}
              isAdmin={isAdmin}
              canOperate={canOperate}
              onToggle={() => toggleSku(group.productSku)}
              onOperation={onOperation}
              onPost={onPost}
              onProductSelect={onProductSelect}
              focusedVariantSuffix={focusRequest?.productSku === group.productSku ? focusRequest.variantSuffix : null}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Κύριο SKU & εικόνα</th>
                <th className="px-4 py-3">Δομή είδους</th>
                <th className="px-4 py-3 text-right">{INVENTORY_TERMS.onHand}</th>
                <th className="px-4 py-3 text-right">{INVENTORY_TERMS.reserved}</th>
                <th className="px-4 py-3 text-right">{INVENTORY_TERMS.available}</th>
                <th className="px-4 py-3 text-right">Ροή</th>
                <th className="px-4 py-3 text-right">{INVENTORY_TERMS.projectedAvailable}</th>
                <th className="px-4 py-3 text-right">Διαχείριση</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleGroups.map((group) => (
                <DesktopSkuRow
                  key={group.productSku}
                  group={group}
                  product={productsBySku.get(group.productSku)}
                  expanded={expandedSkus.has(group.productSku)}
                  isAdmin={isAdmin}
                  canOperate={canOperate}
                  onToggle={() => toggleSku(group.productSku)}
                  onOperation={onOperation}
                  onPost={onPost}
                  onProductSelect={onProductSelect}
                  focusedVariantSuffix={focusRequest?.productSku === group.productSku ? focusRequest.variantSuffix : null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalGroups={groups.length}
        visibleCount={visibleGroups.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </section>
  );
}
