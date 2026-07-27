import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit3,
  FileText,
  Link2,
  Loader2,
  PackageSearch,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import {
  Customer,
  LegalArchiveFilterState,
  LegalArchiveLineMatch,
  LegalArchiveRecord,
  LegalDocument,
  LegalExternalItemAlias,
  Order,
  Product,
  ProformaDocument,
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
  LEGAL_DOCUMENT_KIND_LABELS,
} from '../../utils/legalDocuments';
import { formatOrderId } from '../../utils/orderUtils';

const PAGE_SIZE = 50;

const money = (value: number) => new Intl.NumberFormat('el-GR', {
  style: 'currency',
  currency: 'EUR',
}).format(Number(value || 0));

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
  all: 'Όλα τα matches',
  matched: 'Πλήρη matches',
  partial: 'Μερικά matches',
  ambiguous: 'Ασαφή matches',
  unmatched: 'Χωρίς match',
};

const externalSourceFilterLabel: Record<LegalArchiveFilterState['externalSource'], string> = {
  all: 'Όλες οι πηγές',
  aade_sync: 'Συγχρονισμός AADE',
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
    label: 'Ασαφές',
    className: 'border-orange-200 bg-orange-50 text-orange-700',
    icon: AlertTriangle,
  },
  unmatched: {
    label: 'Χρειάζεται έλεγχο',
    className: 'border-red-200 bg-red-50 text-red-700',
    icon: AlertTriangle,
  },
} as const;

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
        Η AADE δεν παρέχει itemCode για αυτή τη γραμμή. Δεν δημιουργείται τεχνητό SKU· συνδέστε παραγγελία για ασφαλή αναγνώριση.
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(110px,180px)_auto]">
      <label className="min-w-0">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Προϊόν ERP</span>
        <input
          value={productSku}
          onChange={(event) => {
            setProductSku(event.target.value.trim());
            setVariantSuffix('');
          }}
          list={listId}
          placeholder="SKU ή περιγραφή"
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

interface LegalArchiveWorkspaceProps {
  records: LegalArchiveRecord[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
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
  onLinkOrder: (record: LegalArchiveRecord, orderId: string | null) => void;
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
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => filterLegalArchiveRecords(props.records, filters),
    [props.records, filters],
  );
  const stats = useMemo(() => getLegalArchiveStats(filtered), [filtered]);
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
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${presentation.className}`}>
        <Icon size={12} /> {presentation.label}
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
            disabled={!canPrintLegalDocument(document)}
            title={isOfficialLegalDocumentPrint(document) ? 'Νόμιμη εκτύπωση MARK/QR' : 'Πρόχειρη εκτύπωση'}
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
    const customerOrders = record.customerMatch.customer
      ? props.orders.filter((order) => order.customer_id === record.customerMatch.customer?.id)
      : record.suggestedOrders;
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
              <h3 className="font-black text-slate-900">Αντιστοίχιση πελάτη</h3>
            </div>
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
                    : record.customerMatch.state === 'ambiguous'
                      ? `${record.customerMatch.candidates.length} πιθανοί πελάτες`
                      : 'Χωρίς match'}
              </span>
            </div>
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
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Link2 size={17} className="text-sky-600" />
              <h3 className="font-black text-slate-900">Σύνδεση παραγγελίας</h3>
            </div>
            <select
              value={record.linkedOrder?.id || ''}
              onChange={(event) => props.onLinkOrder(record, event.target.value || null)}
              disabled={props.mutating}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-sky-500"
            >
              <option value="">Χωρίς συνδεδεμένη παραγγελία</option>
              {customerOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {formatOrderId(order.id)} · {order.created_at.slice(0, 10)} · {money(order.total_price)}
                  {record.autoOrderCandidate?.id === order.id ? ' · 100% match' : ''}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs font-medium text-slate-500">
              {record.linkedOrder
                ? 'Επιβεβαιωμένη σύνδεση ERP.'
                : record.autoOrderCandidate
                  ? 'Βρέθηκε μοναδική πλήρης συμφωνία πελάτη, αξίας, SKU και ποσοτήτων.'
                  : record.suggestedOrders.length
                    ? `${record.suggestedOrders.length} παραγγελίες έχουν ίδιο πελάτη και συνολική αξία· απαιτείται επιβεβαίωση.`
                    : 'Δεν βρέθηκε ασφαλής πρόταση. Δεν γίνεται αυτόματο guessing.'}
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="font-black text-slate-900">Γραμμές και προϊόντα</h3>
              <div className="text-xs font-medium text-slate-500">
                {record.lines.length} γραμμές · πηγή {externalSource}
              </div>
            </div>
            <PackageSearch size={19} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {record.lineMatches.length === 0 ? (
              <div className="p-6 text-center text-sm font-medium text-slate-500">Δεν υπάρχουν αποθηκευμένες γραμμές.</div>
            ) : record.lineMatches.map((match) => (
              <div key={match.line.id} className="space-y-3 p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_130px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-black text-slate-700">
                        {match.rawItemCode || 'χωρίς itemCode'}
                      </span>
                      {match.product ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                          {match.masterSku}{match.variantSuffix || ''} · {match.method === 'alias' ? 'μαθημένο alias' : match.method === 'order' ? 'από παραγγελία' : 'κατάλογος'}
                        </span>
                      ) : (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black text-red-700">
                          Χρειάζεται αντιστοίχιση
                        </span>
                      )}
                    </div>
                    <div className="mt-2 font-bold text-slate-800">
                      {match.product?.description || match.line.source_metadata?.item_description || match.line.description}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {match.product?.category || 'Άγνωστη κατηγορία'}
                      {match.line.source_metadata?.line_comments ? ` · ${match.line.source_metadata.line_comments}` : ''}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Ποσότητα</div>
                    <div className="mt-1 font-black text-slate-800">{match.line.quantity}</div>
                    <div className="text-xs text-slate-500">Μ.Μ. {match.line.measurement_unit || 1}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Καθαρή / Σύνολο</div>
                    <div className="mt-1 font-bold text-slate-700">{money(match.line.net_value)}</div>
                    <div className="font-black text-slate-900">{money(match.line.gross_value)}</div>
                  </div>
                </div>
                {record.source === 'legal' && (
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
              : 'Εσωτερική εγγραφή ERP'}
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
              ['all', 'Όλα', props.records.length],
              ['legal', 'myDATA', props.records.filter((record) => record.source === 'legal').length],
              ['proforma', 'Προτιμολόγια', props.records.filter((record) => record.source === 'proforma').length],
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
                placeholder="Αναζήτηση σε πελάτη, ΑΦΜ, MARK, αριθμό, SKU ή προϊόν…"
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
                <option value="cancelled">Ακυρωμένα AADE</option>
                <option value="converted">Μετατραπέντα</option>
                <option value="void">Ακυρωμένα proforma</option>
              </select>
              <select value={filters.externalSource} onChange={(event) => setFilters((current) => ({ ...current, externalSource: event.target.value as LegalArchiveFilterState['externalSource'] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <option value="all">Όλες οι πηγές</option>
                <option value="aade_sync">Συγχρονισμός AADE</option>
                <option value="ilios">Έκδοση Ilios</option>
                <option value="proforma">Προτιμολόγια</option>
              </select>
              <select value={filters.matchState} onChange={(event) => setFilters((current) => ({ ...current, matchState: event.target.value as LegalArchiveFilterState['matchState'] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <option value="all">Όλα τα matches</option>
                <option value="matched">Πλήρη</option>
                <option value="partial">Μερικά</option>
                <option value="ambiguous">Ασαφή</option>
                <option value="unmatched">Χωρίς match</option>
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
            label: 'Ποιότητα match',
            value: stats.count ? `${Math.round((stats.matched / stats.count) * 100)}%` : '—',
            detail: `${stats.matched} πλήρη · ${stats.needsReview} για έλεγχο`,
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
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-bold text-slate-600">
            {filtered.length} από {props.records.length} εγγραφές
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
                    <th className="px-3 py-3">Πελάτης</th>
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
                    const label = record.source === 'legal'
                      ? LEGAL_DOCUMENT_KIND_LABELS[(document as LegalDocument).document_kind]
                      : 'Προτιμολόγιο';
                    return (
                      <React.Fragment key={record.key}>
                        <tr className={`border-b border-slate-100 align-top transition ${open ? 'bg-emerald-50/30' : 'bg-white hover:bg-slate-50/70'}`}>
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
                            <button type="button" onClick={() => toggleExpanded(record.key)} className="mt-1 text-left font-black text-emerald-800 hover:underline">
                              {getLegalDocumentDisplayNumber(document)}
                            </button>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${record.source === 'legal' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{record.source === 'legal' ? 'myDATA' : 'Proforma'}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-bold text-slate-800">{record.customerMatch.customer?.full_name || document.counterpart?.name || 'Άγνωστος πελάτης'}</div>
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
                                  {match.product ? `${match.masterSku}${match.variantSuffix || ''}` : match.rawItemCode || 'χωρίς SKU'}
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
                return (
                  <article key={record.key} className="bg-white">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(record.key)}
                      aria-expanded={open}
                      className="w-full p-4 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-slate-950">{getLegalDocumentDisplayNumber(document)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${record.source === 'legal' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{record.source === 'legal' ? 'myDATA' : 'Proforma'}</span>
                          </div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{document.issue_date}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right font-black text-slate-950">{money(document.totals.gross)}</div>
                          {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                        </div>
                      </div>
                      <div className="mt-3 font-bold text-slate-800">{record.customerMatch.customer?.full_name || document.counterpart?.name || 'Άγνωστος πελάτης'}</div>
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
