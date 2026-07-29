import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit3,
  FileClock,
  FileText,
  Link2,
  Loader2,
  PackageCheck,
  PackageSearch,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Truck,
  Undo2,
  Users,
  UserCheck,
  WalletCards,
  X,
} from 'lucide-react';
import {
  AadeVatRegistryResult,
  Customer,
  LegalArchiveFilterState,
  LegalArchiveLineMatch,
  LegalArchiveRecord,
  LegalDocument,
  LegalDocumentLine,
  LegalExternalItemAlias,
  LegalOrderLineAllocation,
  LegalOrderLinkMode,
  Order,
  Product,
  ProformaDocument,
  UserProfile,
} from '../../types';
import {
  createDefaultLegalArchiveFilters,
  filterLegalArchiveRecords,
  getLegalArchiveStats,
} from '../../features/legal/archive';
import {
  canPrintLegalDocument,
  canPrintProforma,
  getLegalDocumentDisplayNumber,
  isOfficialLegalDocumentPrint,
} from '../../utils/legalDocuments';
import { formatOrderId } from '../../utils/orderUtils';

const PAGE_SIZE = 50;

const euroFormatter = new Intl.NumberFormat('el-GR', {
  style: 'currency',
  currency: 'EUR',
});
const money = (value: number) => euroFormatter.format(Number(value || 0));

const legalStatusLabel: Record<LegalDocument['status'], string> = {
  draft: 'Πρόχειρο',
  submitted: 'Υποβλήθηκε',
  issued: 'Εκδόθηκε',
  failed: 'Απέτυχε',
  cancelled: 'Ακυρώθηκε',
};

const proformaStatusLabel: Record<ProformaDocument['status'], string> = {
  draft: 'Πρόχειρο',
  converted: 'Μετατράπηκε',
  void: 'Ακυρωμένο',
};

const datePresetLabel: Record<LegalArchiveFilterState['datePreset'], string> = {
  all: 'Όλες οι ημερομηνίες',
  today: 'Σήμερα',
  current_month: 'Τρέχων μήνας',
  previous_month: 'Προηγούμενος μήνας',
  last_3_months: 'Τελευταίοι 3 μήνες',
  last_6_months: 'Τελευταίοι 6 μήνες',
  last_12_months: 'Τελευταίοι 12 μήνες',
  specific_month: 'Συγκεκριμένος μήνας',
  custom: 'Προσαρμοσμένο εύρος',
};

const documentKindFilterLabel: Record<LegalArchiveFilterState['documentKind'], string> = {
  all: 'Όλοι οι τύποι',
  invoice: 'Τιμολόγια',
  credit: 'Πιστωτικά',
  delivery_note: 'Δελτία αποστολής',
  invoice_delivery: 'Τιμολόγια-ΔΑ',
  proforma: 'Προτιμολόγια',
};

const matchFilterLabel: Record<LegalArchiveFilterState['matchState'], string> = {
  all: 'Όλες οι αντιστοιχίσεις',
  matched: 'Πλήρως αντιστοιχισμένα',
  partial: 'Μερικώς αντιστοιχισμένα',
  ambiguous: 'Διπλές εγγραφές ΑΦΜ',
  unmatched: 'Χωρίς αντιστοίχιση',
  operational: 'Λειτουργικά παραστατικά',
};

const externalSourceFilterLabel: Record<LegalArchiveFilterState['externalSource'], string> = {
  all: 'Όλες οι πηγές',
  aade_sync: 'Συγχρονισμός ΑΑΔΕ',
  ilios: 'Έκδοση Ilios',
  proforma: 'Προτιμολόγια',
};

const customerOptionLabel = (customer: Customer) =>
  `${customer.full_name} · ΑΦΜ ${customer.vat_number || '—'}`;

const statusClass: Record<string, string> = {
  draft: 'border-sky-200 bg-sky-50 text-sky-700',
  submitted: 'border-blue-200 bg-blue-50 text-blue-700',
  issued: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-600',
  converted: 'border-violet-200 bg-violet-50 text-violet-700',
  void: 'border-slate-300 bg-slate-100 text-slate-500',
};

const matchPresentation = {
  matched: {
    label: 'Πλήρης αντιστοίχιση',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: BadgeCheck,
  },
  partial: {
    label: 'Μερική αντιστοίχιση',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: Sparkles,
  },
  ambiguous: {
    label: 'Διπλή εγγραφή ΑΦΜ',
    className: 'border-orange-200 bg-orange-50 text-orange-700',
    icon: AlertTriangle,
  },
  unmatched: {
    label: 'Δεν βρέθηκε αντιστοίχιση',
    className: 'border-red-200 bg-red-50 text-red-700',
    icon: AlertTriangle,
  },
  operational: {
    label: 'Λειτουργικό παραστατικό',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    icon: Truck,
  },
} as const;

const externalSourcePresentation: Record<LegalArchiveFilterState['externalSource'], string> = {
  all: 'Όλες οι πηγές',
  aade_sync: 'Συγχρονισμός ΑΑΔΕ',
  ilios: 'Έκδοση Ilios',
  proforma: 'Προτιμολόγιο',
};

const documentPresentation = {
  invoice: {
    label: 'Τιμολόγιο Πώλησης',
    icon: ReceiptText,
    badge: 'border-emerald-200 bg-emerald-100 text-emerald-900',
    row: 'border-l-4 border-l-emerald-500 bg-emerald-50/35 hover:bg-emerald-50/75',
    openRow: 'border-l-4 border-l-emerald-600 bg-emerald-50/80',
    mobile: 'border-l-4 border-l-emerald-500 bg-emerald-50/35',
    number: 'text-emerald-900',
  },
  credit: {
    label: 'Πιστωτικό Τιμολόγιο',
    icon: Undo2,
    badge: 'border-rose-200 bg-rose-100 text-rose-900',
    row: 'border-l-4 border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/75',
    openRow: 'border-l-4 border-l-rose-600 bg-rose-50/80',
    mobile: 'border-l-4 border-l-rose-500 bg-rose-50/35',
    number: 'text-rose-900',
  },
  delivery_note: {
    label: 'Δελτίο Αποστολής',
    icon: Truck,
    badge: 'border-sky-200 bg-sky-100 text-sky-800',
    row: 'border-l-4 border-l-sky-300 bg-sky-50/20 hover:bg-sky-50/55',
    openRow: 'border-l-4 border-l-sky-400 bg-sky-50/65',
    mobile: 'border-l-4 border-l-sky-300 bg-sky-50/20',
    number: 'text-sky-800',
  },
  invoice_delivery: {
    label: 'Τιμολόγιο - Δελτίο Αποστολής',
    icon: PackageCheck,
    badge: 'border-teal-200 bg-teal-100 text-teal-900',
    row: 'border-l-4 border-l-teal-500 bg-teal-50/35 hover:bg-teal-50/75',
    openRow: 'border-l-4 border-l-teal-600 bg-teal-50/80',
    mobile: 'border-l-4 border-l-teal-500 bg-teal-50/35',
    number: 'text-teal-900',
  },
  proforma: {
    label: 'Προτιμολόγιο',
    icon: FileClock,
    badge: 'border-violet-200 bg-violet-100 text-violet-900',
    row: 'border-l-4 border-l-violet-400 bg-violet-50/30 hover:bg-violet-50/70',
    openRow: 'border-l-4 border-l-violet-500 bg-violet-50/75',
    mobile: 'border-l-4 border-l-violet-400 bg-violet-50/30',
    number: 'text-violet-900',
  },
} as const;

function getDocumentPresentation(record: LegalArchiveRecord) {
  return record.source === 'proforma'
    ? documentPresentation.proforma
    : documentPresentation[(record.document as LegalDocument).document_kind];
}

interface AliasEditorProps {
  record: LegalArchiveRecord;
  match: LegalArchiveLineMatch;
  products: Product[];
  busy: boolean;
  onSave: (record: LegalArchiveRecord, match: LegalArchiveLineMatch, productSku: string, variantSuffix: string) => void;
  onDelete: (alias: LegalExternalItemAlias) => void;
}

function AliasEditor({ record, match, products, busy, onSave, onDelete }: AliasEditorProps) {
  const [productSku, setProductSku] = useState(match.masterSku || '');
  const [variantSuffix, setVariantSuffix] = useState(match.variantSuffix || '');
  const product = products.find((item) => item.sku.toLocaleLowerCase('el-GR') === productSku.toLocaleLowerCase('el-GR'));
  const listId = `archive-products-${record.id}-${match.line.id}`;

  useEffect(() => {
    setProductSku(match.masterSku || '');
    setVariantSuffix(match.variantSuffix || '');
  }, [match.masterSku, match.variantSuffix]);

  if (!match.rawItemCode) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
        Η ΑΑΔΕ δεν παρέχει κωδικό είδους για αυτή τη γραμμή. Δεν δημιουργείται τεχνητός κωδικός προϊόντος· συνδέστε παραγγελία για ασφαλή αναγνώριση.
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(110px,180px)_auto]">
      <label className="min-w-0">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Προϊόν καταλόγου</span>
        <input
          value={productSku}
          onChange={(event) => {
            setProductSku(event.target.value.trim());
            setVariantSuffix('');
          }}
          list={listId}
          placeholder="Κωδικός ή περιγραφή"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        <datalist id={listId}>
          {products.map((item) => (
            <option key={item.sku} value={item.sku}>{item.description || item.category}</option>
          ))}
        </datalist>
      </label>
      <label>
        <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Παραλλαγή</span>
        <select
          value={variantSuffix}
          onChange={(event) => setVariantSuffix(event.target.value)}
          disabled={!product}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none disabled:bg-slate-100"
        >
          <option value="">Βασικό</option>
          {(product?.variants || []).filter((variant) => variant.suffix).map((variant) => (
            <option key={variant.suffix} value={variant.suffix}>{variant.suffix} · {variant.description}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button
          type="button"
          disabled={!product || busy}
          onClick={() => onSave(record, match, product!.sku, variantSuffix)}
          className="min-h-10 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : match.alias ? 'Ενημέρωση' : 'Αποθήκευση'}
        </button>
        {match.alias && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(match.alias!)}
            className="min-h-10 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function VatRegistryCard({
  vatNumber,
  ready,
  onLookup,
  onApply,
}: {
  vatNumber?: string | null;
  ready: boolean;
  onLookup: (vatNumber: string, referenceDate?: string) => Promise<AadeVatRegistryResult>;
  onApply: (result: AadeVatRegistryResult) => void;
}) {
  const [referenceDate, setReferenceDate] = useState('');
  const [result, setResult] = useState<AadeVatRegistryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const normalizedVat = String(vatNumber || '').replace(/^EL/i, '').replace(/\D/g, '');
  const todayDate = new Date().toISOString().slice(0, 10);
  const earliestReferenceDate = (() => {
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() - 3);
    return date.toISOString().slice(0, 10);
  })();

  const runLookup = async () => {
    if (!normalizedVat) return;
    setLoading(true);
    setError('');
    try {
      setResult(await onLookup(normalizedVat, referenceDate || undefined));
    } catch (lookupError: any) {
      setResult(null);
      setError(lookupError?.message || 'Ο έλεγχος ΑΦΜ στην ΑΑΔΕ απέτυχε.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-40">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-indigo-700">
            Ημερομηνία αναφοράς
          </span>
          <input
            type="date"
            value={referenceDate}
            onChange={(event) => setReferenceDate(event.target.value)}
            min={earliestReferenceDate}
            max={todayDate}
            className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
          />
        </label>
        <button
          type="button"
          onClick={() => void runLookup()}
          disabled={!ready || normalizedVat.length !== 9 || loading}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
          Έλεγχος στην ΑΑΔΕ
        </button>
        <span className="text-[11px] font-medium text-indigo-800">
          {ready ? 'Επίσημο Μητρώο Επιχειρήσεων' : 'Ρυθμίστε πρώτα τους ειδικούς κωδικούς Μητρώου'}
        </span>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-3 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-xs font-black ${
              result.active === true
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : result.active === false
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              {result.active === true ? 'Ενεργό ΑΦΜ' : result.active === false ? 'Ανενεργό ΑΦΜ' : 'Άγνωστη κατάσταση'}
            </span>
            <span className="text-xs font-bold text-slate-500">
              Στοιχεία στις {result.referenceDate}
            </span>
          </div>
          <div>
            <div className="font-black text-slate-900">{result.businessName || 'Χωρίς διαθέσιμη επωνυμία'}</div>
            {result.tradeName && <div className="text-sm font-bold text-slate-600">{result.tradeName}</div>}
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div><span className="font-black text-slate-500">ΔΟΥ:</span> {result.taxOfficeCode || '—'} {result.taxOfficeDescription || ''}</div>
            <div><span className="font-black text-slate-500">Μορφή:</span> {result.legalStatus || result.personType || '—'}</div>
            <div><span className="font-black text-slate-500">Ιδιότητα:</span> {result.businessStatus || '—'}</div>
            <div><span className="font-black text-slate-500">Κανονικό καθεστώς ΦΠΑ:</span> {result.normalVatRegime === true ? 'Ναι' : result.normalVatRegime === false ? 'Όχι' : '—'}</div>
            <div><span className="font-black text-slate-500">Έναρξη:</span> {result.registrationDate || '—'}</div>
            <div><span className="font-black text-slate-500">Διακοπή:</span> {result.stopDate || '—'}</div>
            <div className="sm:col-span-2">
              <span className="font-black text-slate-500">Έδρα:</span>{' '}
              {[result.address.street, result.address.number, result.address.postalCode, result.address.city].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
          {result.activities.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Δραστηριότητες</div>
              <div className="space-y-1">
                {result.activities.map((activity, index) => (
                  <div key={`${activity.code}-${index}`} className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                    <span className="font-mono font-black">{activity.code}</span>
                    {' · '}{activity.description}
                    {activity.kindDescription ? ` · ${activity.kindDescription}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onApply(result)}
              className="min-h-9 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-800 transition hover:bg-indigo-100"
            >
              Εφαρμογή στο πελατολόγιο ή στο πρόχειρο
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function orderLineKey(order: Order, index: number): string {
  const item = order.items[index];
  return item.line_id || `${index}:${item.sku}:${item.variant_suffix || ''}`;
}

function OrderLinkEditor({
  record,
  orders,
  busy,
  onSave,
}: {
  record: LegalArchiveRecord;
  orders: Order[];
  busy: boolean;
  onSave: (
    link: { orderId: string; mode: LegalOrderLinkMode; allocations: LegalOrderLineAllocation[] } | null,
  ) => void;
}) {
  const storedMode = record.document.order_link_mode || 'whole';
  const storedAllocations = record.document.order_line_allocations || [];
  const [orderId, setOrderId] = useState(record.linkedOrder?.id || '');
  const [mode, setMode] = useState<LegalOrderLinkMode>(storedMode);
  const [allocations, setAllocations] = useState<LegalOrderLineAllocation[]>(storedAllocations);
  const selectedOrder = orders.find((order) => order.id === orderId);

  useEffect(() => {
    setOrderId(record.linkedOrder?.id || '');
    setMode(record.document.order_link_mode || 'whole');
    setAllocations(record.document.order_line_allocations || []);
  }, [
    record.key,
    record.linkedOrder?.id,
    record.document.order_link_mode,
    record.document.order_line_allocations,
  ]);

  const toggleLine = (order: Order, index: number) => {
    const item = order.items[index];
    const key = orderLineKey(order, index);
    setAllocations((current) => current.some((allocation) => allocation.orderLineKey === key)
      ? current.filter((allocation) => allocation.orderLineKey !== key)
      : [...current, {
          orderLineKey: key,
          sku: item.sku,
          variantSuffix: item.variant_suffix || null,
          quantity: Number(item.quantity || 0),
        }]);
  };

  const setLineQuantity = (key: string, quantity: number, maximum: number) => {
    const safeQuantity = Math.max(0, Math.min(maximum, quantity || 0));
    setAllocations((current) => current.map((allocation) =>
      allocation.orderLineKey === key ? { ...allocation, quantity: safeQuantity } : allocation
    ));
  };

  return (
    <div className="space-y-3">
      <select
        value={orderId}
        onChange={(event) => {
          setOrderId(event.target.value);
          setMode('whole');
          setAllocations([]);
        }}
        disabled={busy}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-sky-500"
      >
        <option value="">Επιλέξτε παραγγελία</option>
        {orders.map((order) => (
          <option key={order.id} value={order.id}>
            {formatOrderId(order.id)} · {order.created_at.slice(0, 10)} · {money(order.total_price)}
            {record.autoOrderCandidate?.id === order.id ? ' · πλήρης συμφωνία' : ''}
          </option>
        ))}
      </select>

      {selectedOrder && (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('whole');
                setAllocations([]);
              }}
              className={`rounded-md px-2 py-2 text-xs font-black ${mode === 'whole' ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-500'}`}
            >
              Ολόκληρη παραγγελία
            </button>
            <button
              type="button"
              onClick={() => setMode('partial')}
              className={`rounded-md px-2 py-2 text-xs font-black ${mode === 'partial' ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-500'}`}
            >
              Επιλεγμένες γραμμές
            </button>
          </div>

          {mode === 'partial' && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {selectedOrder.items.map((item, index) => {
                const key = orderLineKey(selectedOrder, index);
                const allocation = allocations.find((candidate) => candidate.orderLineKey === key);
                return (
                  <div key={key} className="grid grid-cols-[auto_minmax(0,1fr)_76px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={!!allocation}
                      onChange={() => toggleLine(selectedOrder, index)}
                      className="h-4 w-4 accent-sky-600"
                    />
                    <div className="min-w-0 text-xs">
                      <div className="truncate font-black text-slate-800">{item.sku}{item.variant_suffix || ''}</div>
                      <div className="truncate text-slate-500">{item.product_details?.description || item.notes || 'Γραμμή παραγγελίας'}</div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={item.quantity}
                      step="0.01"
                      disabled={!allocation}
                      value={allocation?.quantity ?? ''}
                      onChange={(event) => setLineQuantity(key, Number(event.target.value), Number(item.quantity || 0))}
                      aria-label={`Ποσότητα ${item.sku}`}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-xs font-black disabled:bg-slate-100"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (mode === 'partial' && !allocations.some((allocation) => allocation.quantity > 0))}
              onClick={() => onSave({
                orderId: selectedOrder.id,
                mode,
                allocations: mode === 'partial'
                  ? allocations.filter((allocation) => allocation.quantity > 0)
                  : [],
              })}
              className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-black text-white hover:bg-sky-700 disabled:bg-slate-300"
            >
              Αποθήκευση σύνδεσης
            </button>
            {record.linkedOrder && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSave(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                Αφαίρεση
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface LegalArchiveWorkspaceProps {
  records: LegalArchiveRecord[];
  customers: Customer[];
  products: Product[];
  sellers: UserProfile[];
  registryLookupReady: boolean;
  loading: boolean;
  mutating: boolean;
  initialQuery?: string;
  onCreate: () => void;
  onOpenLegal: (document: LegalDocument) => void;
  onPrintLegal: (document: LegalDocument) => void;
  onSubmitLegal: (document: LegalDocument) => void;
  onCancelLegal: (document: LegalDocument) => void;
  onDeleteLegal: (document: LegalDocument) => void;
  onEditProforma: (document: ProformaDocument) => void;
  onPrintProforma: (document: ProformaDocument) => void;
  onConvertProforma: (document: ProformaDocument) => void;
  onVoidProforma: (document: ProformaDocument) => void;
  onDeleteProforma: (document: ProformaDocument) => void;
  onLinkCustomer: (record: LegalArchiveRecord, customerId: string | null) => void;
  onLinkOrder: (
    record: LegalArchiveRecord,
    link: { orderId: string; mode: LegalOrderLinkMode; allocations: LegalOrderLineAllocation[] } | null,
  ) => void;
  onLinkSeller: (record: LegalArchiveRecord, sellerId: string | null) => void;
  onLookupVat: (vatNumber: string, referenceDate?: string) => Promise<AadeVatRegistryResult>;
  onApplyVat: (record: LegalArchiveRecord, result: AadeVatRegistryResult) => void;
  onSaveAlias: (record: LegalArchiveRecord, match: LegalArchiveLineMatch, productSku: string, variantSuffix: string) => void;
  onDeleteAlias: (alias: LegalExternalItemAlias) => void;
}

function ArchiveActionButton({
  children,
  onClick,
  disabled,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
  title?: string;
}) {
  const tones = {
    neutral: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    primary: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
    danger: 'border-red-200 bg-white text-red-600 hover:bg-red-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export default function LegalArchiveWorkspace(props: LegalArchiveWorkspaceProps) {
  const [filters, setFilters] = useState<LegalArchiveFilterState>(createDefaultLegalArchiveFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingAliases, setEditingAliases] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const deferredFilters = useDeferredValue(filters);

  const filtered = useMemo(
    () => filterLegalArchiveRecords(props.records, deferredFilters),
    [props.records, deferredFilters],
  );
  const stats = useMemo(() => getLegalArchiveStats(filtered), [filtered]);
  const sourceCounts = useMemo(() => props.records.reduce((counts, record) => {
    counts.all += 1;
    counts[record.source] += 1;
    return counts;
  }, { all: 0, legal: 0, proforma: 0 }), [props.records]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRecords = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [filters]);
  useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages]);
  useEffect(() => {
    if (!props.initialQuery) return;
    setFilters((current) => ({ ...current, query: props.initialQuery || '' }));
  }, [props.initialQuery]);

  const activeFilterChips: Array<{
    key: string;
    label: string;
    clear: Partial<LegalArchiveFilterState>;
  }> = [];
  if (filters.datePreset !== 'all') {
    const rangeDetail = filters.datePreset === 'specific_month' && filters.month
      ? ` · ${filters.month}`
      : filters.datePreset === 'custom'
        ? ` · ${filters.dateFrom || '…'} έως ${filters.dateTo || '…'}`
        : '';
    activeFilterChips.push({
      key: 'date',
      label: `${datePresetLabel[filters.datePreset]}${rangeDetail}`,
      clear: { datePreset: 'all', dateFrom: '', dateTo: '', month: '' },
    });
  }
  if (filters.customerId || filters.customerQuery) {
    const selectedCustomer = props.customers.find((customer) => customer.id === filters.customerId);
    activeFilterChips.push({
      key: 'customer',
      label: selectedCustomer ? customerOptionLabel(selectedCustomer) : `Πελάτης: ${filters.customerQuery}`,
      clear: { customerId: '', customerQuery: '' },
    });
  }
  if (filters.documentKind !== 'all') {
    activeFilterChips.push({
      key: 'document-kind',
      label: documentKindFilterLabel[filters.documentKind],
      clear: { documentKind: 'all' },
    });
  }
  if (filters.status !== 'all') {
    const label = filters.status in legalStatusLabel
      ? legalStatusLabel[filters.status as LegalDocument['status']]
      : proformaStatusLabel[filters.status as ProformaDocument['status']];
    activeFilterChips.push({ key: 'status', label, clear: { status: 'all' } });
  }
  if (filters.externalSource !== 'all') {
    activeFilterChips.push({
      key: 'source',
      label: externalSourceFilterLabel[filters.externalSource],
      clear: { externalSource: 'all' },
    });
  }
  if (filters.matchState !== 'all') {
    activeFilterChips.push({
      key: 'match',
      label: matchFilterLabel[filters.matchState],
      clear: { matchState: 'all' },
    });
  }
  if (filters.productSku) {
    const selectedProduct = props.products.find((product) => product.sku === filters.productSku);
    activeFilterChips.push({
      key: 'product',
      label: selectedProduct
        ? `${selectedProduct.sku} · ${selectedProduct.description || selectedProduct.category}`
        : filters.productSku,
      clear: { productSku: '' },
    });
  }
  const activeFilterCount = activeFilterChips.length;

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetFilters = () => {
    setFilters(createDefaultLegalArchiveFilters());
    setAdvancedOpen(false);
  };

  const renderMatchBadge = (record: LegalArchiveRecord) => {
    const presentation = matchPresentation[record.matchState];
    const Icon = presentation.icon;
    const unresolvedLines = record.lineMatches.filter((line) => !line.product).length;
    const customerMissing = record.customerMatch.state === 'unmatched';
    const label = record.matchState === 'partial'
      ? customerMissing && unresolvedLines
        ? `Λείπουν πελάτης και ${unresolvedLines} ${unresolvedLines === 1 ? 'προϊόν' : 'προϊόντα'}`
        : customerMissing
          ? 'Δεν συνδέθηκε πελάτης'
          : `${unresolvedLines} ${unresolvedLines === 1 ? 'προϊόν χωρίς αντιστοίχιση' : 'προϊόντα χωρίς αντιστοίχιση'}`
      : record.matchState === 'ambiguous'
        ? 'Πολλαπλές εγγραφές με ίδιο ΑΦΜ'
        : presentation.label;
    return (
      <span
        title={record.matchState === 'operational'
          ? 'Το Δελτίο Αποστολής είναι παραστατικό διακίνησης και δεν επηρεάζει την αξιολόγηση εμπορικών αντιστοιχίσεων.'
          : undefined}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${presentation.className}`}
      >
        <Icon size={12} /> {label}
      </span>
    );
  };

  const renderActions = (record: LegalArchiveRecord) => {
    if (record.source === 'legal') {
      const document = record.document as LegalDocument;
      return (
        <div className="flex flex-wrap justify-end gap-1.5">
          <ArchiveActionButton
            onClick={() => props.onPrintLegal(document)}
            disabled={!canPrintLegalDocument(document, record.lines as LegalDocumentLine[])}
            title={isOfficialLegalDocumentPrint(document, record.lines as LegalDocumentLine[]) ? 'Νόμιμη εκτύπωση MARK/QR' : 'Πρόχειρη εκτύπωση'}
          >
            <Printer size={14} /> Εκτύπωση
          </ArchiveActionButton>
          <ArchiveActionButton onClick={() => props.onOpenLegal(document)}>
            <Edit3 size={14} /> Άνοιγμα
          </ArchiveActionButton>
          {document.status === 'draft' && (
            <ArchiveActionButton tone="primary" onClick={() => props.onSubmitLegal(document)} disabled={props.mutating}>
              <Send size={14} /> Υποβολή
            </ArchiveActionButton>
          )}
          {document.status === 'failed' && (
            <ArchiveActionButton tone="primary" onClick={() => props.onSubmitLegal(document)} disabled={props.mutating}>
              <RefreshCw size={14} /> Επανάληψη
            </ArchiveActionButton>
          )}
          {document.status === 'issued' && (
            <ArchiveActionButton tone="danger" onClick={() => props.onCancelLegal(document)} disabled={props.mutating}>
              <Ban size={14} /> Ακύρωση
            </ArchiveActionButton>
          )}
          <ArchiveActionButton tone="danger" onClick={() => props.onDeleteLegal(document)} disabled={props.mutating}>
            <Trash2 size={14} /> Διαγραφή
          </ArchiveActionButton>
        </div>
      );
    }

    const document = record.document as ProformaDocument;
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        <ArchiveActionButton onClick={() => props.onEditProforma(document)} disabled={document.status === 'void'}>
          <Edit3 size={14} /> Άνοιγμα
        </ArchiveActionButton>
        <ArchiveActionButton onClick={() => props.onPrintProforma(document)} disabled={!canPrintProforma(document)}>
          <Printer size={14} /> Εκτύπωση
        </ArchiveActionButton>
        <ArchiveActionButton onClick={() => props.onConvertProforma(document)} disabled={document.status !== 'draft' || props.mutating}>
          <Copy size={14} /> Μετατροπή
        </ArchiveActionButton>
        <ArchiveActionButton tone="danger" onClick={() => props.onVoidProforma(document)} disabled={document.status !== 'draft'}>
          <Ban size={14} /> Ακύρωση
        </ArchiveActionButton>
        <ArchiveActionButton tone="danger" onClick={() => props.onDeleteProforma(document)} disabled={props.mutating}>
          <Trash2 size={14} /> Διαγραφή
        </ArchiveActionButton>
      </div>
    );
  };

  const renderDetails = (record: LegalArchiveRecord) => {
    const customerOrders = record.customerOrders;
    const isOperationalDeliveryNote = record.matchState === 'operational';
    const externalSource = record.source === 'proforma'
      ? 'proforma'
      : ((record.document as LegalDocument).external_source || 'ilios');
    const documentNotes = record.source === 'legal'
      ? (record.document as LegalDocument).local_notes
      : (record.document as ProformaDocument).notes;

    return (
      <div className="space-y-4 bg-slate-50/80 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users size={17} className="text-emerald-600" />
              <h3 className="font-black text-slate-900">
                {isOperationalDeliveryNote ? 'Σύνδεση Πλασιέ' : 'Αντιστοίχιση πελάτη'}
              </h3>
            </div>
            {isOperationalDeliveryNote ? (
              <>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    value={record.sellerMatch.seller?.id || ''}
                    onChange={(event) => props.onLinkSeller(record, event.target.value || null)}
                    disabled={props.mutating}
                    className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-sky-500"
                  >
                    <option value="">Δεν έχει συνδεθεί με Πλασιέ</option>
                    {props.sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>{seller.full_name}</option>
                    ))}
                  </select>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
                    <UserCheck size={14} />
                    {record.sellerMatch.method === 'manual'
                      ? 'Επιβεβαιωμένη σύνδεση'
                      : record.sellerMatch.method === 'name'
                        ? 'Ακριβής συμφωνία ονόματος'
                        : record.sellerMatch.state === 'suggested'
                          ? 'Υπάρχει πρόταση'
                          : 'Χωρίς Πλασιέ'}
                  </span>
                </div>
                {!record.sellerMatch.seller && record.sellerMatch.candidates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {record.sellerMatch.candidates.slice(0, 3).map((seller) => (
                      <button
                        key={seller.id}
                        type="button"
                        onClick={() => props.onLinkSeller(record, seller.id)}
                        disabled={props.mutating}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs font-black text-sky-900 hover:bg-sky-100"
                      >
                        Σύνδεση με {seller.full_name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    value={record.customerMatch.customer?.id || ''}
                    onChange={(event) => props.onLinkCustomer(record, event.target.value || null)}
                    disabled={props.mutating}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
                  >
                    <option value="">Δεν έχει αντιστοιχιστεί</option>
                    {props.customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.full_name} · ΑΦΜ {customer.vat_number || '—'}
                      </option>
                    ))}
                  </select>
                  <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                    {record.customerMatch.method === 'manual'
                      ? 'Χειροκίνητη σύνδεση'
                      : record.customerMatch.method === 'vat'
                        ? 'Ακριβές ΑΦΜ'
                        : record.customerMatch.method === 'vat_name'
                          ? 'Ακριβές ΑΦΜ και επωνυμία'
                          : record.customerMatch.state === 'ambiguous'
                            ? 'Διπλή εγγραφή ίδιου ΑΦΜ'
                            : 'Χωρίς αντιστοίχιση'}
                  </span>
                </div>
                {record.customerMatch.state === 'ambiguous' && record.customerMatch.candidates.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <div className="mb-2 text-xs font-bold text-amber-900">
                      {record.customerMatch.explanation}. Επιλέξτε τη σωστή εγγραφή:
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {record.customerMatch.candidates.slice(0, 4).map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => props.onLinkCustomer(record, customer.id)}
                          disabled={props.mutating}
                          className={`rounded-lg border bg-white p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50 ${
                            record.customerMatch.recommendedCustomer?.id === customer.id
                              ? 'border-emerald-300 ring-1 ring-emerald-100'
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-black text-slate-900">{customer.full_name}</span>
                            {record.customerMatch.recommendedCustomer?.id === customer.id && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">
                                Προτεινόμενο
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] font-bold text-slate-500">ΑΦΜ {customer.vat_number || '—'}</div>
                          <div className="mt-2 text-[11px] font-black text-emerald-700">Σύνδεση πελάτη</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="mt-2 text-xs text-slate-500">
              Πηγή: {record.document.counterpart?.name || 'χωρίς επωνυμία'} · ΑΦΜ {record.document.counterpart?.vat_number || '—'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {[record.document.counterpart?.address?.street, record.document.counterpart?.address?.number]
                .filter(Boolean).join(' ') || 'Χωρίς οδό'}
              {' · '}
              {[record.document.counterpart?.address?.postal_code, record.document.counterpart?.address?.city]
                .filter(Boolean).join(' ') || 'χωρίς πόλη'}
              {' · '}
              {record.document.counterpart?.country || 'GR'} / υποκ. {record.document.counterpart?.branch ?? 0}
            </div>
            <VatRegistryCard
              vatNumber={record.document.counterpart?.vat_number}
              ready={props.registryLookupReady}
              onLookup={props.onLookupVat}
              onApply={(result) => props.onApplyVat(record, result)}
            />
          </section>

          <section className={`rounded-xl border p-4 ${isOperationalDeliveryNote ? 'border-sky-200 bg-sky-50/60' : 'border-slate-200 bg-white'}`}>
            <div className="mb-3 flex items-center gap-2">
              {isOperationalDeliveryNote ? <Truck size={17} className="text-sky-600" /> : <Link2 size={17} className="text-sky-600" />}
              <h3 className="font-black text-slate-900">
                {isOperationalDeliveryNote ? 'Χειρισμός Δελτίου Αποστολής' : 'Σύνδεση παραγγελίας'}
              </h3>
            </div>
            {isOperationalDeliveryNote ? (
              <p className="text-sm font-medium leading-6 text-sky-900">
                Πρόκειται για λειτουργικό παραστατικό διακίνησης. Ο αντισυμβαλλόμενος και οι συγκεντρωτικοί κωδικοί ειδών
                εμφανίζονται για πληροφόρηση, χωρίς να απαιτείται σύνδεση με πελάτη, προϊόν ή παραγγελία και χωρίς να
                επηρεάζεται η αξιολόγηση των εμπορικών παραστατικών.
              </p>
            ) : (
              <>
                <OrderLinkEditor
                  record={record}
                  orders={customerOrders}
                  busy={props.mutating}
                  onSave={(link) => props.onLinkOrder(record, link)}
                />
                <div className="mt-2 text-xs font-medium text-slate-500">
                  {record.linkedOrder
                    ? record.document.order_link_mode === 'partial'
                      ? `${record.document.order_line_allocations?.length || 0} επιλεγμένες γραμμές συνδέονται με την παραγγελία.`
                      : 'Ολόκληρη η παραγγελία είναι συνδεδεμένη.'
                    : record.autoOrderCandidate
                      ? 'Βρέθηκε μοναδική πλήρης συμφωνία πελάτη, αξίας, κωδικών προϊόντων και ποσοτήτων.'
                      : record.suggestedOrders.length
                        ? `${record.suggestedOrders.length} παραγγελίες έχουν ίδιο πελάτη και συνολική αξία· απαιτείται επιβεβαίωση.`
                        : 'Δεν βρέθηκε ασφαλής πρόταση. Δεν γίνεται αυθαίρετη αυτόματη αντιστοίχιση.'}
                </div>
              </>
            )}
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="font-black text-slate-900">Γραμμές και προϊόντα</h3>
              <div className="text-xs font-medium text-slate-500">
                {record.lines.length} γραμμές · πηγή {externalSourcePresentation[externalSource]}
              </div>
            </div>
            <PackageSearch size={19} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {record.lineMatches.length === 0 ? (
              <div className="p-6 text-center text-sm font-medium text-slate-500">Δεν υπάρχουν αποθηκευμένες γραμμές.</div>
            ) : record.lineMatches.map((match) => (
              <div key={match.line.id} className="space-y-2 p-3">
                <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_72px_105px]">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-black text-slate-700">
                        {match.rawItemCode || 'χωρίς κωδικό είδους'}
                      </span>
                      {match.product ? (
                        <span className="inline-flex min-w-0 items-center gap-1 font-black text-emerald-700">
                          <ChevronRight size={12} />
                          <span className="font-mono">{match.masterSku}{match.variantSuffix || ''}</span>
                          <span className="truncate font-sans font-bold text-emerald-600">
                            ({match.method === 'alias' ? 'κανόνας' : match.method === 'order' ? 'παραγγελία' : 'κατάλογος'})
                          </span>
                        </span>
                      ) : isOperationalDeliveryNote ? (
                        <span className="font-bold text-sky-700">
                          Κατηγορία διακίνησης
                        </span>
                      ) : (
                        <span className="font-black text-red-700">
                          Χρειάζεται αντιστοίχιση
                        </span>
                      )}
                      {record.source === 'legal' && !isOperationalDeliveryNote && match.product && match.rawItemCode && (
                        <button
                          type="button"
                          onClick={() => setEditingAliases((current) => {
                            const next = new Set(current);
                            if (next.has(match.line.id)) next.delete(match.line.id);
                            else next.add(match.line.id);
                            return next;
                          })}
                          className="ml-1 rounded px-1.5 py-0.5 font-black text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          {editingAliases.has(match.line.id) ? 'Κλείσιμο' : 'Αλλαγή'}
                        </button>
                      )}
                    </div>
                    <div className="mt-1 truncate text-sm font-bold text-slate-800" title={match.product?.description || match.line.source_metadata?.item_description || match.line.description}>
                      {match.product?.description || match.line.source_metadata?.item_description || match.line.description}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">
                      {match.product?.category || 'Άγνωστη κατηγορία'}
                      {match.line.source_metadata?.line_comments ? ` · ${match.line.source_metadata.line_comments}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Ποσ.</div>
                    <div className="font-black text-slate-800">{match.line.quantity}</div>
                    <div className="text-[10px] text-slate-500">Μ.Μ. {match.line.measurement_unit || 1}</div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Καθαρή / Σύνολο</div>
                    <div className="font-bold text-slate-600">{money(match.line.net_value)}</div>
                    <div className="font-black text-slate-900">{money(match.line.gross_value)}</div>
                  </div>
                </div>
                {record.source === 'legal'
                  && !isOperationalDeliveryNote
                  && (!match.product || editingAliases.has(match.line.id))
                  && (
                  <AliasEditor
                    record={record}
                    match={match}
                    products={props.products}
                    busy={props.mutating}
                    onSave={props.onSaveAlias}
                    onDelete={props.onDeleteAlias}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {documentNotes && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <span className="font-black text-slate-800">Σημειώσεις:</span> {documentNotes}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-medium text-slate-500">
            {record.source === 'legal' && (record.document as LegalDocument).aade_uid
              ? `UID ${(record.document as LegalDocument).aade_uid}`
              : 'Εσωτερική εγγραφή συστήματος'}
          </div>
          {renderActions(record)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-emerald-600 p-2 text-white"><FileText size={20} /></div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">Έξυπνο Αρχείο</h2>
                  <p className="text-sm font-medium text-slate-600">Παραστατικά, πελάτες και προϊόντα σε μία ενιαία εικόνα.</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={props.onCreate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Plus size={17} /> Νέο παραστατικό
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-100/80 p-1 sm:flex sm:w-fit">
            {([
              ['all', 'Όλα', sourceCounts.all],
              ['legal', 'myDATA', sourceCounts.legal],
              ['proforma', 'Προτιμολόγια', sourceCounts.proforma],
            ] as const).map(([scope, label, count]) => (
              <button
                key={scope}
                type="button"
                onClick={() => setFilters((current) => ({ ...current, scope }))}
                className={`rounded-lg px-3 py-2 text-xs font-black transition sm:min-w-28 ${filters.scope === scope ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label} <span className="ml-1 text-[10px] text-slate-400">{count}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(260px,1fr)_220px_auto]">
            <label className="relative">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Αναζήτηση σε πελάτη, ΑΦΜ, MARK, αριθμό, κωδικό ή προϊόν…"
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-10 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              {filters.query && (
                <button
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, query: '' }))}
                  aria-label="Καθαρισμός αναζήτησης"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <select
              value={filters.datePreset}
              onChange={(event) => setFilters((current) => ({
                ...current,
                datePreset: event.target.value as LegalArchiveFilterState['datePreset'],
              }))}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="all">Όλες οι ημερομηνίες</option>
              <option value="today">Σήμερα</option>
              <option value="current_month">Τρέχων μήνας</option>
              <option value="previous_month">Προηγούμενος μήνας</option>
              <option value="last_3_months">Τελευταίοι 3 μήνες</option>
              <option value="last_6_months">Τελευταίοι 6 μήνες</option>
              <option value="last_12_months">Τελευταίοι 12 μήνες</option>
              <option value="specific_month">Συγκεκριμένος μήνας</option>
              <option value="custom">Προσαρμοσμένο εύρος</option>
            </select>
            <button
              type="button"
              onClick={() => setAdvancedOpen((current) => !current)}
              aria-expanded={advancedOpen}
              aria-controls="legal-archive-advanced-filters"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-black transition ${advancedOpen || activeFilterCount ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <SlidersHorizontal size={17} /> Φίλτρα
              {activeFilterCount > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
              {advancedOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>

          {filters.datePreset === 'specific_month' && (
            <div className="mt-2 max-w-xs">
              <input
                type="month"
                value={filters.month}
                onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
                className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
              />
            </div>
          )}
          {filters.datePreset === 'custom' && (
            <div className="mt-2 grid max-w-xl grid-cols-2 gap-2">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
              />
            </div>
          )}

          {advancedOpen && (
            <div id="legal-archive-advanced-filters" className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 sm:grid-cols-2 xl:grid-cols-6">
              <label>
                <span className="sr-only">Πελάτης με όνομα ή ΑΦΜ</span>
                <input
                  list="legal-archive-customer-options"
                  value={filters.customerQuery}
                  onChange={(event) => {
                    const value = event.target.value;
                    const exactCustomer = props.customers.find((customer) =>
                      customerOptionLabel(customer).toLocaleLowerCase('el-GR') === value.toLocaleLowerCase('el-GR')
                    );
                    setFilters((current) => ({
                      ...current,
                      customerId: exactCustomer?.id || '',
                      customerQuery: value,
                    }));
                  }}
                  placeholder="Πελάτης ή ΑΦΜ"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                />
                <datalist id="legal-archive-customer-options">
                  {props.customers.map((customer) => (
                    <option key={customer.id} value={customerOptionLabel(customer)} />
                  ))}
                </datalist>
              </label>
              <select value={filters.documentKind} onChange={(event) => setFilters((current) => ({ ...current, documentKind: event.target.value as LegalArchiveFilterState['documentKind'] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <option value="all">Όλοι οι τύποι</option>
                <option value="invoice">Τιμολόγια</option>
                <option value="credit">Πιστωτικά</option>
                <option value="delivery_note">Δελτία αποστολής</option>
                <option value="invoice_delivery">Τιμολόγια-ΔΑ</option>
                <option value="proforma">Προτιμολόγια</option>
              </select>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as LegalArchiveFilterState['status'] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <option value="all">Όλες οι καταστάσεις</option>
                <option value="draft">Πρόχειρα</option>
                <option value="submitted">Υποβληθέντα</option>
                <option value="issued">Εκδοθέντα</option>
                <option value="failed">Αποτυχημένα</option>
                <option value="cancelled">Ακυρωμένα στην ΑΑΔΕ</option>
                <option value="converted">Μετατραπέντα</option>
                <option value="void">Ακυρωμένα προτιμολόγια</option>
              </select>
              <select value={filters.externalSource} onChange={(event) => setFilters((current) => ({ ...current, externalSource: event.target.value as LegalArchiveFilterState['externalSource'] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <option value="all">Όλες οι πηγές</option>
                <option value="aade_sync">Συγχρονισμός ΑΑΔΕ</option>
                <option value="ilios">Έκδοση Ilios</option>
                <option value="proforma">Προτιμολόγια</option>
              </select>
              <select value={filters.matchState} onChange={(event) => setFilters((current) => ({ ...current, matchState: event.target.value as LegalArchiveFilterState['matchState'] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <option value="all">Όλες οι αντιστοιχίσεις</option>
                <option value="matched">Πλήρως αντιστοιχισμένα</option>
                <option value="partial">Μερικώς αντιστοιχισμένα</option>
                <option value="ambiguous">Διπλές εγγραφές ίδιου ΑΦΜ</option>
                <option value="unmatched">Χωρίς αντιστοίχιση</option>
                <option value="operational">Λειτουργικά παραστατικά</option>
              </select>
              <select value={filters.productSku} onChange={(event) => setFilters((current) => ({ ...current, productSku: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <option value="">Όλα τα προϊόντα</option>
                {props.products.map((product) => <option key={product.sku} value={product.sku}>{product.sku} · {product.description || product.category}</option>)}
              </select>
              <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as LegalArchiveFilterState['sort'] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <option value="date_desc">Νεότερα πρώτα</option>
                <option value="date_asc">Παλαιότερα πρώτα</option>
                <option value="gross_desc">Μεγαλύτερη αξία</option>
                <option value="gross_asc">Μικρότερη αξία</option>
                <option value="customer_asc">Πελάτης Α-Ω</option>
              </select>
              <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50">
                <RotateCcw size={15} /> Καθαρισμός
              </button>
            </div>
          )}
          {activeFilterChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Ενεργά φίλτρα">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Ενεργά φίλτρα</span>
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, ...chip.clear }))}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800 hover:bg-emerald-100"
                  aria-label={`Αφαίρεση φίλτρου ${chip.label}`}
                >
                  {chip.label} <X size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          { label: 'Εγγραφές', value: String(stats.count), icon: FileText, tone: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
          { label: 'Καθαρή αξία', value: money(stats.net), icon: WalletCards, tone: 'text-sky-700', bg: 'bg-sky-50 border-sky-200' },
          { label: 'ΦΠΑ', value: money(stats.vat), icon: CalendarDays, tone: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
          { label: 'Σύνολο', value: money(stats.gross), icon: WalletCards, tone: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          {
            label: 'Αντιστοίχιση εμπορικών',
            value: stats.reviewable ? `${stats.matched} από ${stats.reviewable}` : '—',
            detail: `${stats.needsReview} χρειάζονται έλεγχο${stats.operational ? ` · ${stats.operational} λειτουργικά εκτός αξιολόγησης` : ''}`,
            icon: stats.needsReview ? AlertTriangle : BadgeCheck,
            tone: stats.needsReview ? 'text-amber-700' : 'text-emerald-700',
            bg: stats.needsReview ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200',
          },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border p-3 sm:p-4 ${card.bg}`}>
            <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wide ${card.tone}`}><card.icon size={14} /> {card.label}</div>
            <div className="mt-2 text-lg font-black text-slate-950">{card.value}</div>
            {'detail' in card && card.detail && (
              <div className="mt-1 text-[10px] font-bold text-slate-500">{card.detail}</div>
            )}
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-bold text-slate-600">
              {filtered.length} από {props.records.length} εγγραφές
            </div>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Χρωματική σήμανση τύπων παραστατικών">
              {([
                documentPresentation.invoice,
                documentPresentation.invoice_delivery,
                documentPresentation.credit,
                documentPresentation.delivery_note,
                documentPresentation.proforma,
              ] as const).map((presentation) => {
                const Icon = presentation.icon;
                return (
                  <span key={presentation.label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${presentation.badge}`}>
                    <Icon size={11} /> {presentation.label}
                  </span>
                );
              })}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-800">
              <X size={14} /> Καθαρισμός φίλτρων
            </button>
          )}
        </div>

        {props.loading ? (
          <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 size={28} className="animate-spin" /></div>
        ) : pageRecords.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center">
            <div className="rounded-2xl bg-slate-100 p-4 text-slate-400"><PackageSearch size={30} /></div>
            <div>
              <div className="font-black text-slate-800">Δεν βρέθηκαν εγγραφές</div>
              <div className="mt-1 text-sm font-medium text-slate-500">Δοκιμάστε διαφορετικά φίλτρα ή καθαρίστε την αναζήτηση.</div>
            </div>
            <button type="button" onClick={resetFilters} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700">Καθαρισμός</button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-3" />
                    <th className="px-3 py-3">Ημερομηνία / Παραστατικό</th>
                    <th className="px-3 py-3">Αντισυμβαλλόμενος / πελάτης</th>
                    <th className="px-3 py-3">Κατάσταση</th>
                    <th className="px-3 py-3">Προϊόντα</th>
                    <th className="px-3 py-3 text-right">Σύνολο</th>
                    <th className="px-3 py-3 text-right">Ενέργειες</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRecords.map((record) => {
                    const document = record.document;
                    const open = expanded.has(record.key);
                    const presentation = getDocumentPresentation(record);
                    const DocumentIcon = presentation.icon;
                    return (
                      <React.Fragment key={record.key}>
                        <tr className={`border-b border-slate-100 align-top transition-colors ${open ? presentation.openRow : presentation.row}`}>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(record.key)}
                              aria-expanded={open}
                              aria-label={`${open ? 'Σύμπτυξη' : 'Ανάπτυξη'} ${getLegalDocumentDisplayNumber(document)}`}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                              {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-black text-slate-950">{document.issue_date}</div>
                            <button type="button" onClick={() => toggleExpanded(record.key)} className={`mt-1 text-left font-black hover:underline ${presentation.number}`}>
                              {getLegalDocumentDisplayNumber(document)}
                            </button>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${record.source === 'legal' ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'}`}>{record.source === 'legal' ? 'myDATA' : 'Προτιμολόγιο'}</span>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${presentation.badge}`}>
                                <DocumentIcon size={11} /> {presentation.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-bold text-slate-800">{record.customerMatch.customer?.full_name || document.counterpart?.name || 'Άγνωστος αντισυμβαλλόμενος'}</div>
                            <div className="mt-1 font-mono text-xs text-slate-500">ΑΦΜ {document.counterpart?.vat_number || '—'}</div>
                            <div className="mt-2">{renderMatchBadge(record)}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-black ${statusClass[document.status]}`}>
                              {record.source === 'legal' ? legalStatusLabel[(document as LegalDocument).status] : proformaStatusLabel[(document as ProformaDocument).status]}
                            </span>
                            {record.source === 'legal' && (document as LegalDocument).aade_mark && (
                              <div className="mt-2 max-w-44 truncate font-mono text-[10px] text-slate-500" title={(document as LegalDocument).aade_mark || ''}>
                                MARK {(document as LegalDocument).aade_mark}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex max-w-64 flex-wrap gap-1">
                              {record.lineMatches.slice(0, 3).map((match) => (
                                <span key={match.line.id} className={`rounded-lg border px-2 py-1 font-mono text-[10px] font-black ${match.product ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                  {match.product ? `${match.masterSku}${match.variantSuffix || ''}` : match.rawItemCode || 'χωρίς κωδικό'}
                                </span>
                              ))}
                              {record.lineMatches.length > 3 && <span className="px-1 py-1 text-[10px] font-bold text-slate-400">+{record.lineMatches.length - 3}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="font-black text-slate-950">{money(document.totals.gross)}</div>
                            <div className="mt-1 text-xs text-slate-500">Καθαρά {money(document.totals.net)}</div>
                          </td>
                          <td className="px-3 py-3">{renderActions(record)}</td>
                        </tr>
                        {open && <tr><td colSpan={7} className="p-0">{renderDetails(record)}</td></tr>}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 lg:hidden">
              {pageRecords.map((record) => {
                const document = record.document;
                const open = expanded.has(record.key);
                const presentation = getDocumentPresentation(record);
                const DocumentIcon = presentation.icon;
                return (
                  <article key={record.key} className={presentation.mobile}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(record.key)}
                      aria-expanded={open}
                      className="w-full p-4 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-black ${presentation.number}`}>{getLegalDocumentDisplayNumber(document)}</span>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${presentation.badge}`}>
                              <DocumentIcon size={11} /> {presentation.label}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{document.issue_date}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right font-black text-slate-950">{money(document.totals.gross)}</div>
                          {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                        </div>
                      </div>
                      <div className="mt-3 font-bold text-slate-800">{record.customerMatch.customer?.full_name || document.counterpart?.name || 'Άγνωστος αντισυμβαλλόμενος'}</div>
                      <div className="mt-1 font-mono text-xs text-slate-500">ΑΦΜ {document.counterpart?.vat_number || '—'}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-black ${statusClass[document.status]}`}>
                          {record.source === 'legal' ? legalStatusLabel[(document as LegalDocument).status] : proformaStatusLabel[(document as ProformaDocument).status]}
                        </span>
                        {renderMatchBadge(record)}
                      </div>
                    </button>
                    {open && renderDetails(record)}
                  </article>
                );
              })}
            </div>
          </>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-bold text-slate-500">
              Εμφάνιση {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} από {filtered.length}
            </div>
            <div className="flex items-center justify-center gap-2">
              <button type="button" aria-label="Προηγούμενη σελίδα" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="min-w-24 text-center text-sm font-black text-slate-700">Σελίδα {page} / {totalPages}</span>
              <button type="button" aria-label="Επόμενη σελίδα" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
