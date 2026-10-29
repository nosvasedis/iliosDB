import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Download,
  History,
  Loader2,
  MoreHorizontal,
  PackagePlus,
  RefreshCw,
  ScanBarcode,
  Search,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Product } from '../../types';
import type { ParsedStockEntry } from '../../features/inventory';
import {
  ensureCatalogInventoryAvailability,
  formatInventoryInteger,
  inventoryRepository,
  parseStockEntryInput,
} from '../../features/inventory';
import {
  applyInventoryPostingBalances,
  inventoryKeys,
  refreshInventoryAuditQueries,
  refreshInventoryAvailability,
  useActiveInventoryCountSessions,
  useInventoryAvailability,
  useInventoryReconciliationStatus,
} from '../../hooks/api/useInventory';
import { useWarehouses, warehouseKeys } from '../../hooks/api/useWarehouses';
import { SYSTEM_IDS } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIProvider';
import DesktopPageHeader, { HeaderPrimaryButton } from '../DesktopPageHeader';
import MobileScreenHeader from '../mobile/MobileScreenHeader';
import { BTN_SECONDARY, CARD, PAGE_CONTAINER } from '../ui/designTokens';
import BarcodeScanner from '../BarcodeScanner';
import { searchSkuProductOptions, type SkuPickerOption } from '../../utils/skuProductPicker';
import InventoryStockList, { type InventoryVariantItem } from './InventoryStockList';
import InventoryItemDrawer from './InventoryItemDrawer';
import StockEntryDialog from './StockEntryDialog';
import InventoryCountSessionDialog from './InventoryCountSessionDialog';
import { InventoryHistoryDialog, ReconciliationDialog, WarehousesDialog } from './InventoryAdminDialogs';
import { downloadInventoryCsv } from './inventoryCsv';

/** Locations owned by another workflow; manual stock commands never target them. */
const CONSIGNMENT_WAREHOUSE_ID = SYSTEM_IDS.CONSIGNMENTS;
const WORKFLOW_OWNED_WAREHOUSE_IDS: ReadonlySet<string> = new Set([CONSIGNMENT_WAREHOUSE_ID]);
const AT_CUSTOMERS = '__customers';

type ScanPurpose = 'navigate' | 'entry' | 'count-session';
type Panel = 'history' | 'warehouses' | 'reconciliation' | null;

interface InventoryWorkspaceProps {
  products?: Product[];
  compact?: boolean;
  onProductSelect?: (product: Product) => void;
  onOpenConsignments?: () => void;
}

function variantKey(productSku: string, variantSuffix: string) {
  return `${productSku}::${variantSuffix}`;
}

function OverflowMenu({ items }: { items: Array<{ label: string; icon: React.ElementType; onClick: () => void; badge?: number; hidden?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const badge = items.reduce((sum, item) => sum + (item.hidden ? 0 : item.badge || 0), 0);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open} aria-label="Περισσότερα" className={`${BTN_SECONDARY} relative justify-center`}>
        <MoreHorizontal size={18} />
        {badge > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-600" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {items.filter((item) => !item.hidden).map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); item.onClick(); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">
                <Icon size={16} className="text-slate-400" /> <span className="flex-1">{item.label}</span>
                {(item.badge || 0) > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-black text-white">{item.badge}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InventoryWorkspace({ products = [], compact = false, onProductSelect, onOpenConsignments }: InventoryWorkspaceProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { showToast } = useUI();
  const isAdmin = profile?.role === 'admin';
  const canOperate = profile?.role === 'admin' || profile?.role === 'user';

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);
  const [openItemKey, setOpenItemKey] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ entries: ParsedStockEntry[]; warehouseId?: string } | null>(null);
  const [incomingScan, setIncomingScan] = useState<{ entry: ParsedStockEntry; nonce: number } | null>(null);
  const [scanPurpose, setScanPurpose] = useState<ScanPurpose | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [countSessionOpen, setCountSessionOpen] = useState(false);
  const [countScan, setCountScan] = useState<SkuPickerOption | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const availabilityQuery = useInventoryAvailability();
  const reconciliationQuery = useInventoryReconciliationStatus(isAdmin);
  const activeSessionsQuery = useActiveInventoryCountSessions(isAdmin);
  const warehousesQuery = useWarehouses();
  const rows = availabilityQuery.data || [];
  const warehouses = warehousesQuery.data || [];
  const manualWarehouses = useMemo(() => warehouses.filter((warehouse) => !WORKFLOW_OWNED_WAREHOUSE_IDS.has(warehouse.id)), [warehouses]);
  const productsBySku = useMemo(() => new Map(products.map((product) => [product.sku, product])), [products]);
  const defaultWarehouse = useMemo(() => warehouses.find((warehouse) => warehouse.type === 'Central') || warehouses[0], [warehouses]);
  const navigationRows = useMemo(() => ensureCatalogInventoryAvailability(rows, products, defaultWarehouse), [rows, products, defaultWarehouse]);
  const blockingIssues = reconciliationQuery.data?.blockingCount || 0;

  const items = useMemo<InventoryVariantItem[]>(() => {
    const map = new Map<string, InventoryVariantItem>();
    navigationRows.forEach((row) => {
      const key = variantKey(row.productSku, row.variantSuffix);
      let item = map.get(key);
      if (!item) {
        item = { key, productSku: row.productSku, variantSuffix: row.variantSuffix, product: productsBySku.get(row.productSku), rows: [], onHand: 0, available: 0, reserved: 0, atCustomers: 0 };
        map.set(key, item);
      }
      if (row.warehouseId === CONSIGNMENT_WAREHOUSE_ID) {
        item.atCustomers += row.onHand;
        return;
      }
      item.rows.push(row);
      item.onHand += row.onHand;
      item.available += row.available;
      item.reserved += row.reserved;
    });
    return Array.from(map.values()).sort((left, right) => (
      left.productSku.localeCompare(right.productSku, 'el-GR', { numeric: true })
      || left.variantSuffix.localeCompare(right.variantSuffix, 'el-GR')
    ));
  }, [navigationRows, productsBySku]);

  const totals = useMemo(() => items.reduce((sum, item) => ({
    onHand: sum.onHand + item.onHand,
    available: sum.available + item.available,
    reserved: sum.reserved + item.reserved,
    atCustomers: sum.atCustomers + item.atCustomers,
  }), { onHand: 0, available: 0, reserved: 0, atCustomers: 0 }), [items]);

  const warehouseTotals = useMemo(() => {
    const map = new Map<string, { onHand: number; reserved: number; skus: number }>();
    rows.forEach((row) => {
      const current = map.get(row.warehouseId) || { onHand: 0, reserved: 0, skus: 0 };
      current.onHand += row.onHand;
      current.reserved += row.reserved;
      if (row.onHand > 0) current.skus += 1;
      map.set(row.warehouseId, current);
    });
    return map;
  }, [rows]);

  const searchTerm = deferredSearch.trim().toLocaleUpperCase('el-GR');
  const filteredItems = useMemo(() => {
    // `RN001P 62` searches the variant; the size tail only narrows nothing further.
    const term = searchTerm.split(/[\s-]+/)[0] || '';
    return items.filter((item) => {
      if (term) {
        const haystack = [
          `${item.productSku}${item.variantSuffix}`,
          item.product?.category,
          item.product?.description,
          item.product?.variants?.find((variant) => variant.suffix === item.variantSuffix)?.description,
        ].map((value) => String(value || '').toLocaleUpperCase('el-GR'));
        if (!haystack.some((value) => value.includes(term))) return false;
      }
      if (warehouseFilter === AT_CUSTOMERS) return item.atCustomers > 0;
      if (warehouseFilter !== 'all') return item.rows.some((row) => row.warehouseId === warehouseFilter && (row.onHand !== 0 || row.reserved !== 0));
      if (!term && !showAll) return item.onHand !== 0 || item.reserved !== 0 || item.atCustomers > 0;
      return true;
    });
  }, [items, searchTerm, warehouseFilter, showAll]);

  const openItem = openItemKey ? items.find((item) => item.key === openItemKey) : undefined;
  const openItemRows = useMemo(
    () => (openItem ? navigationRows.filter((row) => row.productSku === openItem.productSku && row.variantSuffix === openItem.variantSuffix) : []),
    [navigationRows, openItem],
  );

  const refreshInventory = () => refreshInventoryAvailability(queryClient);

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshInventory(), queryClient.invalidateQueries({ queryKey: warehouseKeys.all })]);
      showToast('Τα υπόλοιπα ανανεώθηκαν.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η ανανέωση δεν ολοκληρώθηκε.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleScan = (code: string) => {
    const purpose = scanPurpose;
    setScanPurpose(null);
    const parsed = parseStockEntryInput(code, products);
    if (!parsed.ok) {
      showToast(`Ο κωδικός «${code}» δεν βρέθηκε.`, 'warning');
      return;
    }
    const { product, variantSuffix } = parsed.entry;
    if (purpose === 'entry') {
      setIncomingScan({ entry: parsed.entry, nonce: Date.now() });
    } else if (purpose === 'count-session') {
      setCountScan(searchSkuProductOptions(products, `${product.sku}${variantSuffix}`, 1)[0] || null);
      setCountSessionOpen(true);
    } else {
      setOpenItemKey(variantKey(product.sku, variantSuffix));
    }
  };

  const exportCsv = () => {
    downloadInventoryCsv(
      `apothema-${new Date().toISOString().slice(0, 10)}.csv`,
      ['SKU', 'Παραλλαγή', 'Πλήρες SKU', 'Κατηγορία', 'Μέγεθος', 'Αποθήκη', 'Φυσικό', 'Δεσμευμένο', 'Διαθέσιμο'],
      filteredItems.flatMap((item) => item.rows
        .filter((row) => row.onHand !== 0 || row.reserved !== 0)
        .map((row) => [
          row.productSku, row.variantSuffix, `${row.productSku}${row.variantSuffix}`,
          item.product?.category || '', row.sizeInfo, row.warehouseName, row.onHand, row.reserved, row.available,
        ])),
    );
  };

  const openEntry = (entries: ParsedStockEntry[] = [], warehouseId?: string) => setEntry({ entries, warehouseId });

  const isRefreshing = refreshing || (availabilityQuery.isFetching && !availabilityQuery.isLoading);

  const actions = (
    <div className="flex items-center gap-2">
      {isAdmin && (
        <HeaderPrimaryButton icon={PackagePlus} onClick={() => openEntry()}>
          Καταχώριση
        </HeaderPrimaryButton>
      )}
      <OverflowMenu
        items={[
          { label: 'Συνεδρία απογραφής', icon: ClipboardCheck, onClick: () => setCountSessionOpen(true), hidden: !isAdmin, badge: activeSessionsQuery.data?.length || 0 },
          { label: 'Ιστορικό κινήσεων', icon: History, onClick: () => setPanel('history') },
          { label: 'Αποθήκες', icon: Building2, onClick: () => setPanel('warehouses') },
          { label: 'Συμφωνία αποθέματος', icon: ClipboardList, onClick: () => setPanel('reconciliation'), hidden: !isAdmin, badge: blockingIssues },
          { label: 'Εξαγωγή CSV', icon: Download, onClick: exportCsv },
          { label: isRefreshing ? 'Ανανέωση…' : 'Ανανέωση', icon: RefreshCw, onClick: () => { void manualRefresh(); } },
        ]}
      />
    </div>
  );

  if (availabilityQuery.isLoading) {
    return <div className="flex min-h-[320px] items-center justify-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Φόρτωση αποθέματος…</div>;
  }
  if (availabilityQuery.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert">
        <h2 className="font-black">Δεν φορτώθηκε το απόθεμα</h2>
        <p className="mt-2 text-sm">{availabilityQuery.error instanceof Error ? availabilityQuery.error.message : 'Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.'}</p>
        <button type="button" onClick={() => availabilityQuery.refetch()} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">Επανάληψη</button>
      </div>
    );
  }

  const kpis = [
    { label: 'Στις αποθήκες', value: totals.onHand, tone: 'text-slate-900', onClick: () => { setWarehouseFilter('all'); setShowAll(false); } },
    { label: 'Διαθέσιμα', value: totals.available, tone: 'text-emerald-700' },
    { label: 'Δεσμευμένα', value: totals.reserved, tone: 'text-indigo-700' },
    { label: 'Σε πελάτες', value: totals.atCustomers, tone: 'text-violet-700', onClick: () => setWarehouseFilter(AT_CUSTOMERS) },
  ];

  const chip = (active: boolean) => `shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black transition ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400'}`;

  return (
    <div className={PAGE_CONTAINER}>
      {compact ? (
        <MobileScreenHeader icon={WarehouseIcon} title="Αποθήκη & Στοκ" sticky={false} right={actions} />
      ) : (
        <DesktopPageHeader icon={WarehouseIcon} title="Αποθήκη & Στοκ" tail={actions} />
      )}

      <div className="space-y-4 px-4 sm:px-0">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              onClick={kpi.onClick}
              disabled={!kpi.onClick}
              className={`${CARD} px-4 py-3 text-left enabled:hover:border-slate-300`}
            >
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{kpi.label}</p>
              <p className={`text-2xl font-black tabular-nums ${kpi.tone}`}>{formatInventoryInteger(kpi.value)}</p>
            </button>
          ))}
        </div>

        {isAdmin && blockingIssues > 0 && (
          <button type="button" onClick={() => setPanel('reconciliation')} className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-900">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="flex-1"><strong>{formatInventoryInteger(blockingIssues)} εκκρεμότητες συμφωνίας</strong> μπλοκάρουν κινήσεις σε κάποια είδη.</span>
            <span className="font-black">Άνοιγμα</span>
          </button>
        )}

        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const parsed = parseStockEntryInput(search, products);
                  if (parsed.ok) setOpenItemKey(variantKey(parsed.entry.product.sku, parsed.entry.variantSuffix));
                }}
                placeholder="Αναζήτηση SKU, κατηγορίας…"
                aria-label="Αναζήτηση"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-semibold outline-none focus:border-slate-900"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Καθαρισμός" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"><X size={15} /></button>
              )}
            </label>
            <button type="button" onClick={() => setScanPurpose('navigate')} aria-label="Σάρωση" className={`${BTN_SECONDARY} justify-center`}>
              <ScanBarcode size={17} />
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button type="button" onClick={() => setWarehouseFilter('all')} className={chip(warehouseFilter === 'all')}>Όλες</button>
            {manualWarehouses.map((warehouse) => (
              <button key={warehouse.id} type="button" onClick={() => setWarehouseFilter(warehouse.id)} className={chip(warehouseFilter === warehouse.id)}>
                {warehouse.name} <span className="tabular-nums opacity-60">{formatInventoryInteger(warehouseTotals.get(warehouse.id)?.onHand || 0)}</span>
              </button>
            ))}
            <button type="button" onClick={() => setWarehouseFilter(AT_CUSTOMERS)} className={chip(warehouseFilter === AT_CUSTOMERS)}>
              Σε πελάτες <span className="tabular-nums opacity-60">{formatInventoryInteger(totals.atCustomers)}</span>
            </button>
          </div>
        </div>

        <InventoryStockList
          items={filteredItems}
          resetKey={`${searchTerm}|${warehouseFilter}|${showAll}`}
          emptyHint={searchTerm ? 'Δεν βρέθηκε κωδικός.' : 'Δεν υπάρχει απόθεμα εδώ.'}
          onOpen={(item) => setOpenItemKey(item.key)}
        />
        {!searchTerm && warehouseFilter === 'all' && (
          <button type="button" onClick={() => setShowAll((current) => !current)} className="mx-auto block text-xs font-bold text-slate-500 hover:text-slate-800">
            {showAll ? 'Μόνο κωδικοί με απόθεμα' : 'Εμφάνιση όλου του καταλόγου'}
          </button>
        )}
      </div>

      {openItem && (
        <InventoryItemDrawer
          product={openItem.product}
          productSku={openItem.productSku}
          variantSuffix={openItem.variantSuffix}
          rows={openItemRows}
          manualWarehouses={manualWarehouses}
          consignmentWarehouseId={CONSIGNMENT_WAREHOUSE_ID}
          isAdmin={isAdmin}
          canOperate={canOperate}
          onAddStock={(warehouseId) => {
            if (!openItem.product) return;
            openEntry([{ product: openItem.product, variantSuffix: openItem.variantSuffix, sizeInfo: '', quantity: 1 }], warehouseId);
          }}
          onOpenConsignments={onOpenConsignments}
          onProductSelect={onProductSelect}
          onChanged={refreshInventory}
          onClose={() => setOpenItemKey(null)}
        />
      )}

      {entry && isAdmin && (
        <StockEntryDialog
          products={products}
          warehouses={manualWarehouses}
          availability={navigationRows}
          profileId={profile?.id}
          initialEntries={entry.entries}
          initialWarehouseId={entry.warehouseId}
          incoming={incomingScan}
          onRequestScan={() => setScanPurpose('entry')}
          onPosted={async (result) => {
            applyInventoryPostingBalances(queryClient, result.balances, warehouses);
            await refreshInventoryAuditQueries(queryClient);
          }}
          onClose={() => { setEntry(null); setIncomingScan(null); }}
        />
      )}

      {scanPurpose && (
        // Above the entry sheet, so scanning adds lines without closing it.
        <div className="relative z-[600]">
          <BarcodeScanner products={products} onScan={handleScan} onClose={() => setScanPurpose(null)} />
        </div>
      )}

      {panel === 'history' && (
        <InventoryHistoryDialog warehouses={warehouses} isAdmin={isAdmin} onClose={() => setPanel(null)} onRefresh={refreshInventory} />
      )}
      {panel === 'warehouses' && (
        <WarehousesDialog
          warehouses={warehouses}
          totals={warehouseTotals}
          protectedIds={WORKFLOW_OWNED_WAREHOUSE_IDS}
          isAdmin={isAdmin}
          onClose={() => setPanel(null)}
          onRefresh={refreshInventory}
          onShowWarehouse={(warehouseId) => {
            setWarehouseFilter(warehouseId === CONSIGNMENT_WAREHOUSE_ID ? AT_CUSTOMERS : warehouseId);
            setPanel(null);
          }}
        />
      )}
      {panel === 'reconciliation' && isAdmin && (
        <ReconciliationDialog warehouses={manualWarehouses} onClose={() => setPanel(null)} onResolved={refreshInventory} />
      )}

      {countSessionOpen && isAdmin && (
        <InventoryCountSessionDialog
          products={products}
          warehouses={manualWarehouses}
          availability={navigationRows}
          profileId={profile?.id}
          expectedIdentityCount={products.reduce((total, product) => total + Math.max(1, product.variants?.length || 0), 0)}
          scannedSelection={countScan}
          onRequestScan={() => { setCountSessionOpen(false); setScanPurpose('count-session'); }}
          onConsumeScannedSelection={() => setCountScan(null)}
          onStart={({ clientSessionId, title, reason, warehouseId }) => inventoryRepository.startInventoryCountSession({
            name: title, reason, warehouseIds: [warehouseId], idempotencyKey: clientSessionId,
          })}
          onPostBatch={(sessionId, batch) => inventoryRepository.postInventoryCountBatch({
            sessionId,
            lines: batch.input.lines,
            idempotencyKey: batch.input.idempotencyKey || `inventory-count:${sessionId}:${crypto.randomUUID()}`,
          })}
          onApplyBalances={async (balances) => {
            applyInventoryPostingBalances(queryClient, balances, warehouses);
            await refreshInventoryAuditQueries(queryClient);
          }}
          onComplete={async (session, allowPartial) => {
            await inventoryRepository.completeInventoryCountSession({
              sessionId: session.sessionId,
              idempotencyKey: `inventory-count-complete:${session.sessionId}:${allowPartial ? 'partial' : 'full'}`,
              allowPartial,
            });
            await refreshInventory();
          }}
          onListActiveSessions={() => queryClient.fetchQuery({
            queryKey: inventoryKeys.countSessions(),
            queryFn: () => inventoryRepository.listCountSessions('active'),
            staleTime: 0,
          })}
          onLoadPostedEntries={(sessionId) => inventoryRepository.getCountSessionPostedEntries(sessionId)}
          onAbandon={async (sessionId, reason) => {
            await inventoryRepository.abandonInventoryCountSession({
              sessionId, reason, idempotencyKey: `inventory-count-abandon:${sessionId}:${crypto.randomUUID()}`,
            });
            await queryClient.invalidateQueries({ queryKey: inventoryKeys.countSessions() });
          }}
          onClose={() => {
            setCountSessionOpen(false);
            setCountScan(null);
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.countSessions() });
          }}
        />
      )}
    </div>
  );
}
