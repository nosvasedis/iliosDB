import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  History,
  Loader2,
  MapPin,
  Package,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Warehouse } from '../../types';
import type {
  InventoryAvailability,
  InventoryCountSessionRecord,
  InventoryEvent,
  InventoryTotals,
} from '../../features/inventory';
import {
  calculateInventoryTotals,
  formatInventoryDateTime,
  formatInventoryInteger,
  getInventoryOperationLabel,
  getWarehouseTypeLabel,
  INVENTORY_TERMS,
} from '../../features/inventory';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '../ui/designTokens';

export interface InventoryHealth {
  /** Distinct SKU/variant identities with physical stock. */
  inStock: number;
  /** Identities at or under an active reorder point. */
  low: number;
  /** Identities with demand but nothing available. */
  shortage: number;
  /** Identity/location rows whose projection is negative. */
  negativeProjection: number;
}

export function calculateInventoryHealth(rows: InventoryAvailability[]): InventoryHealth {
  const byIdentity = new Map<string, { onHand: number; available: number; demand: number; low: boolean }>();
  let negativeProjection = 0;
  rows.forEach((row) => {
    const key = `${row.productSku}::${row.variantSuffix}`;
    const current = byIdentity.get(key) || { onHand: 0, available: 0, demand: 0, low: false };
    current.onHand += row.onHand;
    current.available += row.available;
    current.demand += row.outstandingDemand;
    current.low ||= row.reorderPoint > 0 && row.available <= row.reorderPoint;
    byIdentity.set(key, current);
    if (row.projectedAvailable < 0) negativeProjection += 1;
  });
  let inStock = 0;
  let low = 0;
  let shortage = 0;
  byIdentity.forEach((identity) => {
    if (identity.onHand > 0) inStock += 1;
    if (identity.low) low += 1;
    if (identity.demand > 0 && identity.available <= 0) shortage += 1;
  });
  return { inStock, low, shortage, negativeProjection };
}

interface InventoryOverviewPanelProps {
  rows: InventoryAvailability[];
  totals: InventoryTotals;
  warehouses: Warehouse[];
  events: InventoryEvent[];
  eventsLoading: boolean;
  activeSessions: InventoryCountSessionRecord[];
  isAdmin: boolean;
  onOpenStock: (filter?: { warehouseId?: string; status?: 'low' | 'unavailable' | 'negative' | 'in-stock' }) => void;
  onFocusRow: (row: InventoryAvailability) => void;
  onOpenMovements: () => void;
  onOpenCountSession: () => void;
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: React.ElementType;
  tone: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`} aria-hidden="true">
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 sm:text-[1.7rem]">{formatInventoryInteger(value)}</p>
      {hint && <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={`${CARD} p-4 text-left transition hover:border-slate-300 hover:shadow-md`}>
      {content}
    </button>
  ) : (
    <div className={`${CARD} p-4`}>{content}</div>
  );
}

function percent(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${(Math.round((part / whole) * 1000) / 10).toLocaleString('el-GR')}%`;
}

export default function InventoryOverviewPanel({
  rows,
  totals,
  warehouses,
  events,
  eventsLoading,
  activeSessions,
  isAdmin,
  onOpenStock,
  onFocusRow,
  onOpenMovements,
  onOpenCountSession,
}: InventoryOverviewPanelProps) {
  const health = useMemo(() => calculateInventoryHealth(rows), [rows]);
  const warehouseNames = useMemo(() => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])), [warehouses]);

  const warehouseSummaries = useMemo(() => {
    const byWarehouse = new Map<string, InventoryAvailability[]>();
    rows.forEach((row) => {
      const current = byWarehouse.get(row.warehouseId);
      if (current) current.push(row);
      else byWarehouse.set(row.warehouseId, [row]);
    });
    warehouses.forEach((warehouse) => {
      if (!byWarehouse.has(warehouse.id)) byWarehouse.set(warehouse.id, []);
    });
    return Array.from(byWarehouse.entries())
      .map(([warehouseId, warehouseRows]) => ({
        warehouseId,
        warehouseName: warehouseRows[0]?.warehouseName || warehouseNames.get(warehouseId)?.name || 'Αποθήκη',
        warehouseType: warehouseRows[0]?.warehouseType || warehouseNames.get(warehouseId)?.type || 'Other',
        totals: calculateInventoryTotals(warehouseRows),
        skuCount: new Set(warehouseRows.filter((row) => row.onHand > 0).map((row) => `${row.productSku}::${row.variantSuffix}`)).size,
      }))
      .sort((left, right) => right.totals.onHand - left.totals.onHand);
  }, [rows, warehouseNames, warehouses]);
  const maxOnHand = Math.max(1, ...warehouseSummaries.map((summary) => summary.totals.onHand));

  const exceptionRows = useMemo(
    () => rows
      .filter((row) => (
        (row.reorderPoint > 0 && row.available <= row.reorderPoint)
        || row.projectedAvailable < 0
      ))
      .sort((left, right) => left.projectedAvailable - right.projectedAvailable)
      .slice(0, 8),
    [rows],
  );

  return (
    <div className="space-y-4">
      {isAdmin && activeSessions.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-4 sm:flex-row sm:items-center" aria-label="Ενεργή Συνεδρία Απογραφής">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white" aria-hidden="true">
            <ClipboardCheck size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-black text-blue-950">
              {activeSessions.length === 1 ? 'Ενεργή Συνεδρία Απογραφής' : `${formatInventoryInteger(activeSessions.length)} ενεργές Συνεδρίες Απογραφής`}
            </p>
            {activeSessions.slice(0, 2).map((record) => (
              <p key={record.id} className="mt-0.5 truncate text-sm text-blue-900/80">
                {record.name} · {formatInventoryInteger(record.countedTargetCount)} / {formatInventoryInteger(record.totalTargetCount)} SKU · από {formatInventoryDateTime(record.createdAt)}
              </p>
            ))}
          </div>
          <button type="button" onClick={onOpenCountSession} className={`${BTN_PRIMARY} shrink-0 justify-center`}>
            Συνέχεια ή κλείσιμο <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label={INVENTORY_TERMS.onHand} value={totals.onHand} hint={`${formatInventoryInteger(health.inStock)} κωδικοί με απόθεμα`} icon={Package} tone="bg-slate-100 text-slate-700" onClick={() => onOpenStock({ status: 'in-stock' })} />
        <Metric label={INVENTORY_TERMS.reserved} value={totals.reserved} hint={`${percent(totals.reserved, totals.onHand)} του φυσικού`} icon={ClipboardList} tone="bg-indigo-50 text-indigo-700" />
        <Metric label={INVENTORY_TERMS.available} value={totals.available} hint="Φυσικό μείον δεσμευμένο" icon={Boxes} tone="bg-emerald-50 text-emerald-700" />
        <Metric label={INVENTORY_TERMS.incoming} value={totals.incoming} hint="Παραγωγή και παραλαβές" icon={TrendingUp} tone="bg-blue-50 text-blue-700" />
        <Metric label={INVENTORY_TERMS.outstandingDemand} value={totals.outstandingDemand} hint={`${formatInventoryInteger(health.shortage)} κωδικοί χωρίς κάλυψη`} icon={Activity} tone="bg-amber-50 text-amber-700" onClick={() => onOpenStock({ status: 'negative' })} />
        <Metric label="Κάτω από Σημείο Αναπαραγγελίας" value={health.low} hint={`${formatInventoryInteger(health.negativeProjection)} θέσεις με αρνητική πρόβλεψη`} icon={AlertTriangle} tone="bg-rose-50 text-rose-700" onClick={() => onOpenStock({ status: 'low' })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className={`${CARD} overflow-hidden`} aria-labelledby="inventory-control-center-title">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h2 id="inventory-control-center-title" className="font-black text-slate-900">Κέντρο Ελέγχου Αποθέματος</h2>
              <p className="mt-1 text-sm text-slate-600">Θέσεις κάτω από το όριο ή με αρνητική πρόβλεψη, ταξινομημένες κατά κρισιμότητα.</p>
            </div>
            <button type="button" onClick={() => onOpenStock()} className={`${BTN_SECONDARY} justify-center`}>
              Αναλυτικά Υπόλοιπα <ArrowRight size={16} aria-hidden="true" />
            </button>
          </header>
          {exceptionRows.length === 0 ? (
            <div className="flex items-start gap-3 p-5 text-emerald-800">
              <CheckCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <div>
                <p className="font-black">Δεν υπάρχουν άμεσες εξαιρέσεις αποθέματος.</p>
                <p className="mt-1 text-sm text-emerald-700">Δεν εντοπίστηκαν αρνητικές προβλέψεις ή είδη κάτω από ενεργό Σημείο Αναπαραγγελίας.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {exceptionRows.map((row) => (
                <button
                  key={`${row.productSku}:${row.variantSuffix}:${row.sizeInfo}:${row.warehouseId}`}
                  type="button"
                  onClick={() => onFocusRow(row)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${row.projectedAvailable < 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                    {row.projectedAvailable < 0 ? <TrendingDown size={17} aria-hidden="true" /> : <AlertTriangle size={17} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm font-black text-slate-900">{row.productSku}{row.variantSuffix}{row.sizeInfo ? ` · ${row.sizeInfo}` : ''}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {row.warehouseName}{row.reorderPoint > 0 ? ` · όριο ${formatInventoryInteger(row.reorderPoint)}` : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-black tabular-nums text-slate-900">{formatInventoryInteger(row.available)} <span className="text-xs font-bold text-slate-500">διαθ.</span></span>
                    <span className={`block text-xs font-bold tabular-nums ${row.projectedAvailable < 0 ? 'text-rose-700' : 'text-slate-500'}`}>Πρόβλεψη {formatInventoryInteger(row.projectedAvailable)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={`${CARD} overflow-hidden`} aria-labelledby="warehouse-distribution-title">
          <header className="border-b border-slate-100 p-5">
            <h2 id="warehouse-distribution-title" className="font-black text-slate-900">Κατανομή ανά Αποθήκη</h2>
            <p className="mt-1 text-sm text-slate-600">Φυσικό και Διαθέσιμο Απόθεμα κάθε θέσης.</p>
          </header>
          <div className="divide-y divide-slate-100">
            {warehouseSummaries.map((summary) => (
              <button
                key={summary.warehouseId}
                type="button"
                onClick={() => onOpenStock({ warehouseId: summary.warehouseId })}
                className="block w-full px-5 py-3.5 text-left transition hover:bg-slate-50"
              >
                <span className="flex items-center gap-3">
                  <MapPin size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-slate-800">{summary.warehouseName}</span>
                    <span className="block text-[11px] font-semibold text-slate-400">{getWarehouseTypeLabel(summary.warehouseType)} · {formatInventoryInteger(summary.skuCount)} κωδικοί</span>
                  </span>
                  <span className="text-right text-xs text-slate-500">
                    <strong className="block text-sm tabular-nums text-slate-900">{formatInventoryInteger(summary.totals.onHand)}</strong>
                    {formatInventoryInteger(summary.totals.available)} διαθέσιμα
                  </span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(summary.totals.onHand / maxOnHand) * 100}%` }} />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className={`${CARD} overflow-hidden`} aria-labelledby="recent-inventory-movements-title">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 id="recent-inventory-movements-title" className="font-black text-slate-900">Πρόσφατες Κινήσεις</h2>
            <p className="mt-1 text-sm text-slate-600">Οι τελευταίες καταχωρίσεις που επηρέασαν ή δέσμευσαν απόθεμα.</p>
          </div>
          <button type="button" onClick={onOpenMovements} className={`${BTN_SECONDARY} justify-center`}>
            Πλήρες Ιστορικό <ArrowRight size={16} aria-hidden="true" />
          </button>
        </header>
        {eventsLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-slate-500"><Loader2 size={18} className="animate-spin" /> Φόρτωση πρόσφατων κινήσεων...</div>
        ) : events.length === 0 ? (
          <p className="p-8 text-center text-sm font-semibold text-slate-500">Δεν υπάρχουν ακόμη καταχωρισμένες κινήσεις.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.slice(0, 6).map((event) => (
              <div key={event.id} className="flex items-center gap-3 px-5 py-3">
                <History size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{getInventoryOperationLabel(event.operationType)}</p>
                  <p className="truncate text-xs text-slate-500">
                    <span className="font-mono">{event.productSku}{event.variantSuffix}</span>
                    {event.sizeInfo ? ` · ${event.sizeInfo}` : ''} · {warehouseNames.get(event.warehouseId)?.name || 'Αποθήκη'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-black tabular-nums ${event.onHandDelta > 0 ? 'text-emerald-700' : event.onHandDelta < 0 ? 'text-rose-700' : 'text-indigo-700'}`}>
                    {event.onHandDelta !== 0
                      ? `${event.onHandDelta > 0 ? '+' : ''}${formatInventoryInteger(event.onHandDelta)}`
                      : `Δεσμ. ${event.reservedDelta > 0 ? '+' : ''}${formatInventoryInteger(event.reservedDelta)}`}
                  </p>
                  <p className="text-xs tabular-nums text-slate-400">{formatInventoryDateTime(event.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
