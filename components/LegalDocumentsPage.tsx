import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Edit3,
  FileCheck2,
  FileText,
  Info,
  KeyRound,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { AadeVatRegistryResult, Customer, Product, LegalArchiveLineMatch, LegalArchiveRecord, LegalCarrier, LegalDocument, LegalDocumentKind, LegalDocumentLine, LegalEnvironment, LegalExternalItemAlias, LegalNumberingSequence, LegalOrderLineAllocation, LegalOrderLinkMode, LegalRegistryConnectionStatus, LegalSettings, ProformaDocument, ProformaDocumentLine } from '../types';
import DesktopPageHeader from './DesktopPageHeader';
import SkuProductPicker, { SkuProductSelection } from './legal/SkuProductPicker';
import ProformaConvertModal from './legal/ProformaConvertModal';
import IncomeClassificationTypeSelect from './legal/IncomeClassificationTypeSelect';
import LegalArchiveWorkspace from './legal/LegalArchiveWorkspace';
import { useUI } from './UIProvider';
import { useAuth } from './AuthContext';
import { useAllShipmentItems, useAllShipments, useCustomers, useOrdersWithItems } from '../hooks/api/useOrders';
import {
  useCancelLegalDocument,
  useAllLegalDocumentLines,
  useAllProformaDocumentLines,
  useConfirmLegalDelivery,
  useAadeCredentialStatus,
  useLegalCarriers,
  useLegalDocuments,
  useLegalNumberingSequences,
  useLegalSettings,
  useLegalSyncRuns,
  useMarkLegalDocumentPrinted,
  usePollLegalDeliveryStatus,
  useProformaDocuments,
  useRegisterLegalTransfer,
  useSaveProformaDraft,
  useSaveLegalCarrier,
  useSaveAadeCredentials,
  useSaveAadeRegistryCredentials,
  useSaveLegalDraft,
  useSaveLegalSequence,
  useSaveLegalSettings,
  useSubmitLegalDocument,
  useSyncTransmittedLegalDocuments,
  useClearLegalSyncRuns,
  useVoidProformaDocument,
  useDeleteProformaDocument,
  useDeleteLegalDocument,
  useMarkProformaConverted,
  useInspectionExitPinStatus,
  useLegalExternalItemAliases,
  useEnrichLegalArchive,
  useSaveLegalItemAlias,
  useDeleteLegalItemAlias,
  useLinkLegalArchiveCustomer,
  useLinkLegalArchiveOrder,
  useLinkLegalArchiveSeller,
  useSetInspectionExitPin,
} from '../hooks/api/useLegalDocuments';
import { useSellers } from '../hooks/api/useSellers';
import { ordersRepository } from '../features/orders/repository';
import { isInspectionModeActive } from '../lib/inspectionMode';
import {
  buildLegalArchiveRecords,
  LEGAL_ARCHIVE_PARSE_VERSION,
  legalKeys,
  legalRepository,
  normalizeExternalItemCode,
} from '../features/legal';
import {
  applyLegalDocumentDeliveryToggle,
  buildDefaultDeliveryDetails,
  buildCounterpartFromCustomer,
  buildLegalDocumentFromOrder,
  buildLegalDocumentFromShipment,
  buildManualLegalDocument,
  buildManualProforma,
  buildProformaFromOrder,
  canPrintLegalDocument,
  canPrintProforma,
  convertProformaToLegalDraft,
  createManualLegalDocumentLine,
  documentIncludesDeliveryNote,
  getLegalCatalogLineDetails,
  isOfficialLegalDocumentPrint,
  AADE_INCOME_CATEGORY_OPTIONS,
  AADE_INCOME_TYPE_OPTIONS,
  AADE_VAT_EXEMPTION_CATEGORY_OPTIONS,
  AADE_VAT_CATEGORY_LINE_OPTIONS,
  AADE_VAT_CATEGORY_OPTIONS,
  DEFAULT_LEGAL_SETTINGS,
  formatLegalNumberingAlignmentPreview,
  getLegalDocumentDeletePrompt,
  getLegalDocumentDisplayNumber,
  getProformaDeletePrompt,
  isLegalDocumentEditable,
  LEGAL_DOCUMENT_KIND_LABELS,
  normalizeLegalDocumentAddresses,
  normalizeLegalSeriesKey,
  normalizeProformaDocumentAddresses,
  normalizeVatNumber,
  PAYMENT_METHOD_CODES,
  PAYMENT_METHOD_LABELS,
  recalculateLegalDocument,
  recalculateProforma,
  validateLegalDocument,
  vatRateToAadeCategory,
} from '../utils/legalDocuments';
import {
  LEGAL_REMAINING_SOURCE_VALUE,
  buildLegalLineSourceOptions,
  buildLegalOrderPickerRows,
  buildOrderWithRemainingItems,
  getShipmentItemsForOrder,
} from '../utils/legalOrderSources';
import { formatOrderId } from '../utils/orderUtils';

export type LegalTab = 'new' | 'archive' | 'sync' | 'delivery' | 'settings';
type DocumentCreationSource = 'order' | 'manual';
type CreationDocumentType = LegalDocumentKind | 'proforma';

interface LegalDocumentsPageProps {
  products: Product[];
  onPrintLegalDocument: (payload: { document: LegalDocument; lines: LegalDocumentLine[] } | null) => void;
  onPrintProforma?: (payload: { document: ProformaDocument; lines: ProformaDocumentLine[] } | null) => void;
  presentation?: 'default' | 'inspection';
  activeTab?: LegalTab;
  onActiveTabChange?: (tab: LegalTab) => void;
}

const secondaryTabItems: Array<{ id: LegalTab; label: string; icon: LucideIcon }> = [
  { id: 'sync', label: 'Συγχρονισμός', icon: RefreshCw },
  { id: 'delivery', label: 'Διακίνηση', icon: Truck },
  { id: 'settings', label: 'Τεχνικές ρυθμίσεις', icon: Settings },
];

const creationTypeItems: Array<{ id: CreationDocumentType; label: string; help: string }> = [
  {
    id: 'invoice',
    label: 'Τιμολόγιο',
    help: 'Τιμολόγιο 1.1 χωρίς δελτίο διακίνησης — το συνηθισμένο για B2B πωλήσεις.',
  },
  {
    id: 'delivery_note',
    label: 'Δελτίο αποστολής',
    help: 'Αυτόνομο δελτίο αποστολής 9.3 με υποχρεωτικά στοιχεία διακίνησης.',
  },
  {
    id: 'credit',
    label: 'Πιστωτικό',
    help: 'Πιστωτικό τιμολόγιο 5.2.',
  },
  {
    id: 'proforma',
    label: 'Προτιμολόγιο',
    help: 'Εμπορικό/ενημερωτικό έγγραφο μόνο. Δεν είναι νόμιμο παραστατικό, δεν παίρνει MARK και δεν αποστέλλεται στη myDATA.',
  },
];
const vatRateOptions = AADE_VAT_CATEGORY_OPTIONS;
const vatLineOptions = AADE_VAT_CATEGORY_LINE_OPTIONS;
const incomeCategoryOptions = AADE_INCOME_CATEGORY_OPTIONS;
const incomeTypeOptions = AADE_INCOME_TYPE_OPTIONS;
const proformaStatusLabel: Record<ProformaDocument['status'], string> = {
  draft: 'Πρόχειρο',
  converted: 'Μετατράπηκε',
  void: 'Ακυρωμένο',
};
const proformaStatusClass: Record<ProformaDocument['status'], string> = {
  draft: 'bg-sky-50 text-sky-700 border-sky-200',
  converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  void: 'bg-slate-100 text-slate-500 border-slate-200',
};

const credentialSecretLabel = (name: string) => {
  if (name === 'AADE_USER_ID_DEV') return 'Λείπει User ID για δοκιμές';
  if (name === 'AADE_SUBSCRIPTION_KEY_DEV') return 'Λείπει Subscription Key για δοκιμές';
  if (name === 'AADE_USER_ID_PROD') return 'Λείπει User ID παραγωγής';
  if (name === 'AADE_SUBSCRIPTION_KEY_PROD') return 'Λείπει Subscription Key παραγωγής';
  if (name === 'AADE_REGISTRY_USERNAME') return 'Λείπει όνομα χρήστη Μητρώου ΑΑΔΕ';
  if (name === 'AADE_REGISTRY_PASSWORD') return 'Λείπει κωδικός Μητρώου ΑΑΔΕ';
  if (name === 'CLOUDFLARE_API_TOKEN') return 'Λείπει Cloudflare API Token για αποθήκευση μυστικών';
  if (name === 'CLOUDFLARE_ACCOUNT_ID') return 'Λείπει Cloudflare Account ID';
  return name;
};

const statusLabel: Record<LegalDocument['status'], string> = {
  draft: 'Πρόχειρο',
  submitted: 'Σε αποστολή',
  issued: 'Αποδεκτό',
  failed: 'Απορρίφθηκε',
  cancelled: 'Ακυρωμένο',
};

const statusClass: Record<LegalDocument['status'], string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  submitted: 'border-blue-200 bg-blue-50 text-blue-700',
  issued: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-600',
};

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

const today = () => new Date().toISOString().slice(0, 10);

const InfoTip = ({ text }: { text: string }) => (
  <span
    title={text}
    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-slate-500"
  >
    <Info size={11} />
  </span>
);

const TextInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  help,
  disabled,
  min,
  max,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  help?: string;
  disabled?: boolean;
  min?: string | number;
  max?: string | number;
}) => (
  <label className="block min-w-0">
    <span className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
      {label} {help && <InfoTip text={help} />}
    </span>
    <input
      type={type}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
    />
  </label>
);

const SelectInput = ({
  label,
  value,
  onChange,
  children,
  help,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
  help?: string;
}) => (
  <label className="block min-w-0">
    <span className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
      {label} {help && <InfoTip text={help} />}
    </span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
    >
      {children}
    </select>
  </label>
);

const VatExemptionCategorySelect = ({
  label = 'Αιτία απαλλαγής ΦΠΑ',
  value,
  onChange,
}: {
  label?: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) => {
  const hasInvalidStoredValue = value !== null
    && value !== undefined
    && !AADE_VAT_EXEMPTION_CATEGORY_OPTIONS.some((option) => option.category === value);

  return (
    <SelectInput
      label={label}
      value={value ?? ''}
      onChange={(nextValue) => onChange(nextValue ? Number(nextValue) : null)}
      help="Επίσημες αιτίες myDATA v2.0.1, Παράρτημα 8.3 (ισχύων Κώδικας ΦΠΑ, ν. 5144/2024). Υποχρεωτικό όταν η κατηγορία ΦΠΑ γραμμής είναι 7 (0%)."
    >
      <option value="">Επιλέξτε αιτία απαλλαγής...</option>
      {hasInvalidStoredValue && (
        <option value={value}>Μη έγκυρος αποθηκευμένος κωδικός: {value}</option>
      )}
      {AADE_VAT_EXEMPTION_CATEGORY_OPTIONS.map((option) => (
        <option key={option.category} value={option.category}>
          {option.category} - {option.description}
        </option>
      ))}
    </SelectInput>
  );
};

const ActionButton = ({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  type?: 'button' | 'submit';
  title?: string;
}) => {
  const classes = {
    primary: 'bg-[#060b00] text-white hover:bg-emerald-900 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
    quiet: 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:text-slate-400',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed ${classes[variant]}`}
    >
      {children}
    </button>
  );
};

export default function LegalDocumentsPage({
  products,
  onPrintLegalDocument,
  onPrintProforma,
  presentation = 'default',
  activeTab: activeTabProp,
  onActiveTabChange,
}: LegalDocumentsPageProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<LegalTab>('new');
  const isControlledTab = activeTabProp !== undefined;
  const activeTab = isControlledTab ? activeTabProp : internalActiveTab;
  const setActiveTab = (tab: LegalTab) => {
    if (!isControlledTab) setInternalActiveTab(tab);
    onActiveTabChange?.(tab);
  };
  const isInspectionPresentation = presentation === 'inspection';
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [creationDocumentType, setCreationDocumentType] = useState<CreationDocumentType>('invoice');
  const [creationSource, setCreationSource] = useState<DocumentCreationSource>('order');
  const [draftBundle, setDraftBundle] = useState<{ document: LegalDocument; lines: LegalDocumentLine[] } | null>(null);
  const [proformaBundle, setProformaBundle] = useState<{ document: ProformaDocument; lines: ProformaDocumentLine[] } | null>(null);
  const [legalSkuFocusLineId, setLegalSkuFocusLineId] = useState<string | null>(null);
  const [proformaSkuFocusLineId, setProformaSkuFocusLineId] = useState<string | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [proformaSearch, setProformaSearch] = useState('');
  const [proformaStatusFilter, setProformaStatusFilter] = useState<'all' | ProformaDocument['status']>('all');
  const [convertModal, setConvertModal] = useState<{
    proforma: ProformaDocument | null;
    lines: ProformaDocumentLine[];
    step: 'preview' | 'converting' | 'success';
    createdDocument: LegalDocument | null;
    error: string | null;
  }>({ proforma: null, lines: [], step: 'preview', createdDocument: null, error: null });
  const [syncDraft, setSyncDraft] = useState({
    dateFrom: today(),
    dateTo: today(),
    markFrom: '0',
    entityVatNumber: '',
    receiverVatNumber: '',
    invType: '',
    maxMark: '',
  });
  const [settingsDraft, setSettingsDraft] = useState<LegalSettings>({ ...DEFAULT_LEGAL_SETTINGS });
  const [sequenceDrafts, setSequenceDrafts] = useState<Record<string, LegalNumberingSequence>>({});
  const [newCarrier, setNewCarrier] = useState({ name: '', vat_number: '', vehicle_number: '', phone: '' });
  const [credentialEnvironment, setCredentialEnvironment] = useState<LegalEnvironment>('dev');
  const [credentialDraft, setCredentialDraft] = useState({ userId: '', subscriptionKey: '' });
  const [registryCredentialDraft, setRegistryCredentialDraft] = useState({ username: '', password: '' });
  const [registryConnectionStatus, setRegistryConnectionStatus] = useState<LegalRegistryConnectionStatus>({
    configured: false,
    verified: false,
  });
  const [cloudflareBootstrapDraft, setCloudflareBootstrapDraft] = useState({ apiToken: '', accountId: '' });
  const [deliveryPaneOpen, setDeliveryPaneOpen] = useState(false);
  const [showInspectionPinSection, setShowInspectionPinSection] = useState(false);
  const [inspectionPinDraft, setInspectionPinDraft] = useState('');
  const [inspectionPinConfirm, setInspectionPinConfirm] = useState('');
  const settingsSecretClickRef = useRef({ count: 0, timer: null as ReturnType<typeof setTimeout> | null });

  const { showToast, confirm } = useUI();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const userName = profile?.full_name || profile?.email || null;

  const { data: orders = [], isLoading: loadingOrders } = useOrdersWithItems();
  const { data: customers = [] } = useCustomers();
  const { data: sellers = [], isLoading: loadingSellers } = useSellers();
  const { data: shipments = [] } = useAllShipments();
  const { data: shipmentItems = [] } = useAllShipmentItems();
  const { data: legalSettings } = useLegalSettings();
  const { data: credentialStatus, isLoading: loadingCredentialStatus, refetch: refetchCredentialStatus } = useAadeCredentialStatus();
  const { data: sequences = [] } = useLegalNumberingSequences();
  const { data: carriers = [] } = useLegalCarriers();
  const { data: legalDocuments = [], isLoading: loadingDocuments } = useLegalDocuments();
  const { data: allLegalDocumentLines = [], isLoading: loadingArchiveLines } = useAllLegalDocumentLines();
  const { data: proformas = [], isLoading: loadingProformas } = useProformaDocuments();
  const { data: allProformaDocumentLines = [], isLoading: loadingArchiveProformaLines } = useAllProformaDocumentLines();
  const { data: legalItemAliases = [], isLoading: loadingLegalItemAliases } = useLegalExternalItemAliases();
  const { data: syncRuns = [] } = useLegalSyncRuns();

  const saveSettings = useSaveLegalSettings();
  const saveAadeCredentials = useSaveAadeCredentials();
  const saveAadeRegistryCredentials = useSaveAadeRegistryCredentials();
  const { data: inspectionPinConfigured } = useInspectionExitPinStatus();
  const setInspectionExitPin = useSetInspectionExitPin();
  const enrichLegalArchive = useEnrichLegalArchive();
  const saveLegalItemAlias = useSaveLegalItemAlias();
  const deleteLegalItemAlias = useDeleteLegalItemAlias();
  const linkLegalArchiveCustomer = useLinkLegalArchiveCustomer();
  const linkLegalArchiveOrder = useLinkLegalArchiveOrder();
  const linkLegalArchiveSeller = useLinkLegalArchiveSeller();
  const saveSequence = useSaveLegalSequence();
  const saveCarrier = useSaveLegalCarrier();
  const saveDraft = useSaveLegalDraft();
  const saveProforma = useSaveProformaDraft();
  const voidProforma = useVoidProformaDocument();
  const deleteProforma = useDeleteProformaDocument();
  const deleteLegalDocument = useDeleteLegalDocument();
  const markProformaConverted = useMarkProformaConverted();
  const syncTransmittedDocuments = useSyncTransmittedLegalDocuments();
  const clearSyncRuns = useClearLegalSyncRuns();
  const submitDocument = useSubmitLegalDocument();
  const cancelDocument = useCancelLegalDocument();
  const markPrinted = useMarkLegalDocumentPrinted();
  const registerTransfer = useRegisterLegalTransfer();
  const confirmDelivery = useConfirmLegalDelivery();
  const pollDeliveryStatus = usePollLegalDeliveryStatus();

  useEffect(() => {
    if (legalSettings) {
      setSettingsDraft({
        ...DEFAULT_LEGAL_SETTINGS,
        ...legalSettings,
        issuer: { ...DEFAULT_LEGAL_SETTINGS.issuer, ...(legalSettings.issuer || {}) },
        loading_address: legalSettings.loading_address || DEFAULT_LEGAL_SETTINGS.loading_address,
      });
    }
  }, [legalSettings]);

  useEffect(() => {
    setSequenceDrafts(Object.fromEntries(
      sequences.map((sequence) => [sequence.id, { ...sequence }]),
    ));
  }, [sequences]);

  useEffect(() => {
    setRegistryConnectionStatus((current) => ({
      ...current,
      configured: !!credentialStatus?.registry?.ready,
      verified: !!credentialStatus?.registry?.ready
        && !!settingsDraft.issuer.registry_verified_at,
      verifiedAt: settingsDraft.issuer.registry_verified_at || null,
    }));
  }, [credentialStatus?.registry?.ready, settingsDraft.issuer.registry_verified_at]);

  useEffect(() => {
    setCredentialEnvironment(settingsDraft.environment);
  }, [settingsDraft.environment]);

  useEffect(() => {
    if (!draftBundle) {
      setDeliveryPaneOpen(false);
      return;
    }
    const kind = draftBundle.document.document_kind;
    setDeliveryPaneOpen(kind === 'delivery_note' || kind === 'invoice_delivery');
  }, [draftBundle?.document.id, draftBundle?.document.document_kind]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const selectedCustomer = useMemo(() => {
    if (!selectedOrder) return null;
    return customers.find((customer) => customer.id === selectedOrder.customer_id)
      || customers.find((customer) => customer.full_name === selectedOrder.customer_name)
      || null;
  }, [customers, selectedOrder]);

  const orderShipments = useMemo(
    () => shipments.filter((shipment) => shipment.order_id === selectedOrderId),
    [shipments, selectedOrderId]
  );

  const orderShipmentItemsAll = useMemo(
    () => getShipmentItemsForOrder(selectedOrderId, shipments, shipmentItems),
    [selectedOrderId, shipments, shipmentItems]
  );

  const legalOrderPickerRows = useMemo(
    () => buildLegalOrderPickerRows(orders),
    [orders]
  );

  const selectedPickerRow = useMemo(
    () => legalOrderPickerRows.find((row) => row.order.id === selectedOrderId) || null,
    [legalOrderPickerRows, selectedOrderId]
  );

  const lineSourceOptions = useMemo(() => {
    if (!selectedOrder) return [];
    return buildLegalLineSourceOptions({
      order: selectedOrder,
      shipments: orderShipments,
      shipmentItems: orderShipmentItemsAll,
    });
  }, [selectedOrder, orderShipments, orderShipmentItemsAll]);

  const selectedLineSource = useMemo(
    () => lineSourceOptions.find((option) => option.value === selectedShipmentId) || null,
    [lineSourceOptions, selectedShipmentId]
  );

  useEffect(() => {
    if (!selectedShipmentId) return;
    const stillValid = lineSourceOptions.some((option) => option.value === selectedShipmentId);
    if (!stillValid) setSelectedShipmentId('');
  }, [lineSourceOptions, selectedShipmentId]);

  const selectedShipment = useMemo(
    () => orderShipments.find((shipment) => shipment.id === selectedShipmentId) || null,
    [orderShipments, selectedShipmentId]
  );

  const canUseSelectedOrder = Boolean(selectedPickerRow?.selectable);

  const stats = useMemo(() => ({
    issued: legalDocuments.filter((document) => document.status === 'issued').length,
    failed: legalDocuments.filter((document) => document.status === 'failed').length,
    cancelled: legalDocuments.filter((document) => document.status === 'cancelled').length,
    printable: legalDocuments.filter((document) => canPrintLegalDocument(document)).length,
    proformas: proformas.filter((document) => document.status === 'draft').length,
  }), [legalDocuments, proformas]);

  const validationIssues = useMemo(() => {
    if (!draftBundle) return [];
    return validateLegalDocument(draftBundle.document, draftBundle.lines);
  }, [draftBundle]);
  const validationErrors = validationIssues.filter((issue) => issue.severity === 'error');
  const activeCredentialStatus = credentialStatus?.[settingsDraft.environment];
  const missingSecretManager = credentialStatus?.missingWorkerSecretManager || [];
  const missingAadeCredentials = credentialStatus?.missingAadeCredentials || [];
  const missingRegistryCredentials = credentialStatus?.missingRegistryCredentials || [];

  const filteredArchive = useMemo(() => {
    const needle = archiveSearch.trim().toLowerCase();
    if (!needle) return legalDocuments;
    return legalDocuments.filter((document) => [
      getLegalDocumentDisplayNumber(document),
      document.counterpart.name,
      document.counterpart.vat_number,
      document.aade_mark,
      document.last_error,
    ].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [archiveSearch, legalDocuments]);

  const legalDocumentById = useMemo(
    () => new Map(legalDocuments.map((document) => [document.id, document])),
    [legalDocuments],
  );

  const proformaArchiveStats = useMemo(() => ({
    all: proformas.length,
    draft: proformas.filter((document) => document.status === 'draft').length,
    converted: proformas.filter((document) => document.status === 'converted').length,
    void: proformas.filter((document) => document.status === 'void').length,
  }), [proformas]);

  const filteredProformas = useMemo(() => {
    const needle = proformaSearch.trim().toLowerCase();
    return proformas.filter((document) => {
      if (proformaStatusFilter !== 'all' && document.status !== proformaStatusFilter) return false;
      if (!needle) return true;
      const linkedInvoice = document.converted_legal_document_id
        ? legalDocumentById.get(document.converted_legal_document_id)
        : null;
      return [
        getLegalDocumentDisplayNumber(document),
        document.counterpart.name,
        document.counterpart.vat_number,
        document.notes,
        linkedInvoice ? getLegalDocumentDisplayNumber(linkedInvoice) : '',
      ].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [proformaSearch, proformaStatusFilter, proformas, legalDocumentById]);

  const archiveRecords = useMemo(
    () => buildLegalArchiveRecords({
      legalDocuments,
      legalLines: allLegalDocumentLines,
      proformas,
      proformaLines: allProformaDocumentLines,
      customers,
      products,
      orders,
      aliases: legalItemAliases,
      sellers,
    }),
    [
      legalDocuments,
      allLegalDocumentLines,
      proformas,
      allProformaDocumentLines,
      customers,
      products,
      orders,
      legalItemAliases,
      sellers,
    ],
  );

  const archiveAutoLinkingRef = useRef(new Set<string>());
  const archiveAutoSellerLinkingRef = useRef(new Set<string>());

  useEffect(() => {
    if (activeTab !== 'archive' || enrichLegalArchive.isPending) return;
    const needsEnrichment = legalDocuments.some((document) =>
      document.external_source === 'aade_sync'
      && !!document.raw_xml
      && Number(document.archive_parse_version || 0) < LEGAL_ARCHIVE_PARSE_VERSION,
    );
    if (!needsEnrichment) return;
    void enrichLegalArchive.mutateAsync().catch((error: any) => {
      showToast(error?.message || 'Δεν ολοκληρώθηκε η ευρετηρίαση του αρχείου AADE.', 'warning');
    });
  }, [activeTab, legalDocuments, enrichLegalArchive.isPending]);

  useEffect(() => {
    if (activeTab !== 'archive' || linkLegalArchiveOrder.isPending) return;
    const candidate = archiveRecords.find((record) =>
      !!record.autoOrderCandidate
      && !record.linkedOrder
      && !archiveAutoLinkingRef.current.has(record.key),
    );
    if (!candidate?.autoOrderCandidate) return;
    archiveAutoLinkingRef.current.add(candidate.key);
    void linkLegalArchiveOrder.mutateAsync({
      source: candidate.source,
      documentId: candidate.id,
      orderId: candidate.autoOrderCandidate.id,
      userName,
      method: 'automatic',
      linkMode: 'whole',
      allocations: [],
    }).catch(() => {
      archiveAutoLinkingRef.current.delete(candidate.key);
    });
  }, [activeTab, archiveRecords, linkLegalArchiveOrder.isPending, userName]);

  useEffect(() => {
    if (activeTab !== 'archive' || linkLegalArchiveSeller.isPending) return;
    const candidate = archiveRecords.find((record) =>
      record.source === 'legal'
      && !!record.autoSellerCandidate
      && !(record.document as LegalDocument).counterpart_seller_id
      && !archiveAutoSellerLinkingRef.current.has(record.key),
    );
    if (!candidate?.autoSellerCandidate) return;
    archiveAutoSellerLinkingRef.current.add(candidate.key);
    void linkLegalArchiveSeller.mutateAsync({
      documentId: candidate.id,
      sellerId: candidate.autoSellerCandidate.id,
      userName,
      method: 'automatic',
    }).catch(() => {
      archiveAutoSellerLinkingRef.current.delete(candidate.key);
    });
  }, [activeTab, archiveRecords, linkLegalArchiveSeller.isPending, userName]);

  const deliveryDocuments = useMemo(
    () => legalDocuments.filter((document) =>
      document.document_kind === 'delivery_note' || document.document_kind === 'invoice_delivery'
    ),
    [legalDocuments]
  );

  const updateDraftDocument = (updater: (document: LegalDocument) => LegalDocument) => {
    setDraftBundle((current) => current ? { ...current, document: updater(current.document) } : current);
  };

  const updateDraftBundle = (updater: (document: LegalDocument, lines: LegalDocumentLine[]) => { document: LegalDocument; lines: LegalDocumentLine[] }) => {
    setDraftBundle((current) => current ? updater(current.document, current.lines) : current);
  };

  const updateProformaBundle = (updater: (document: ProformaDocument, lines: ProformaDocumentLine[]) => { document: ProformaDocument; lines: ProformaDocumentLine[] }) => {
    setProformaBundle((current) => current ? updater(current.document, current.lines) : current);
  };

  const applyCustomerToDraft = (customerId: string, target: 'legal' | 'proforma') => {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    const counterpart = buildCounterpartFromCustomer(customer);
    if (target === 'legal') {
      updateDraftDocument((current) => ({
        ...current,
        counterpart,
        vat_rate: customer.vat_rate ?? current.vat_rate,
      }));
    } else {
      updateProformaBundle((document, lines) => recalculateProforma({
        ...document,
        counterpart,
        vat_rate: customer.vat_rate ?? document.vat_rate,
      }, lines, settingsDraft));
    }
  };

  const applyCatalogToLegalLine = (lineId: string, selection: SkuProductSelection) => {
    updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((line) => {
      if (line.id !== lineId) return line;
      const product = products.find((item) => item.sku === selection.sku);
      if (!product) {
        return {
          ...line,
          sku: selection.displaySku,
          variant_suffix: null,
          item_code: selection.displaySku,
        };
      }
      return {
        ...line,
        ...getLegalCatalogLineDetails(product, settingsDraft, selection.variant_suffix, current.aade_document_type),
      };
    }), settingsDraft));
  };

  const applyCatalogToProformaLine = (lineId: string, selection: SkuProductSelection) => {
    updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((line) => {
      if (line.id !== lineId) return line;
      const product = products.find((item) => item.sku === selection.sku);
      if (!product) {
        return {
          ...line,
          sku: selection.displaySku,
          variant_suffix: null,
          item_code: selection.displaySku,
        };
      }
      return {
        ...line,
        ...getLegalCatalogLineDetails(product, settingsDraft, selection.variant_suffix, '1.1'),
      };
    }), settingsDraft));
  };

  const appendLegalLineAfter = (lineId: string) => {
    if (!draftBundle || !isLegalDocumentEditable(draftBundle.document)) return;
    const newLine = createManualLegalDocumentLine({
      documentId: draftBundle.document.id,
      lineNumber: draftBundle.lines.length + 1,
      settings: settingsDraft,
      vatRate: draftBundle.document.vat_rate ?? 0.24,
      aadeDocumentType: draftBundle.document.aade_document_type,
    });
    setLegalSkuFocusLineId(newLine.id);
    updateDraftBundle((current, lines) => {
      const currentIndex = lines.findIndex((line) => line.id === lineId);
      const insertionIndex = currentIndex >= 0 ? currentIndex + 1 : lines.length;
      const nextLines = [
        ...lines.slice(0, insertionIndex),
        newLine,
        ...lines.slice(insertionIndex),
      ];
      return recalculateLegalDocument(current, nextLines, settingsDraft);
    });
  };

  const appendProformaLineAfter = (lineId: string) => {
    if (!proformaBundle) return;
    const baseLine = createManualLegalDocumentLine({
      documentId: proformaBundle.document.id,
      lineNumber: proformaBundle.lines.length + 1,
      settings: settingsDraft,
      vatRate: proformaBundle.document.vat_rate ?? 0.24,
    });
    const newLine: ProformaDocumentLine = {
      ...baseLine,
      proforma_id: proformaBundle.document.id,
    };
    setProformaSkuFocusLineId(newLine.id);
    updateProformaBundle((current, lines) => {
      const currentIndex = lines.findIndex((line) => line.id === lineId);
      const insertionIndex = currentIndex >= 0 ? currentIndex + 1 : lines.length;
      const nextLines = [
        ...lines.slice(0, insertionIndex),
        newLine,
        ...lines.slice(insertionIndex),
      ];
      return recalculateProforma(current, nextLines, settingsDraft);
    });
  };

  const applyLegalVatProfile = (vatRate: number) => {
    updateDraftBundle((current, lines) => recalculateLegalDocument({
      ...current,
      vat_rate: vatRate,
      vat_exemption_category: vatRate === 0 ? current.vat_exemption_category : null,
    }, lines.map((line) => ({ ...line, vat_category: vatRateToAadeCategory(vatRate) })), settingsDraft));
  };

  const applyProformaVatProfile = (vatRate: number) => {
    updateProformaBundle((current, lines) => recalculateProforma({
      ...current,
      vat_rate: vatRate,
      vat_exemption_category: vatRate === 0 ? current.vat_exemption_category : null,
    }, lines.map((line) => ({ ...line, vat_category: vatRateToAadeCategory(vatRate) })), settingsDraft));
  };

  const handleGenerateDraft = () => {
    if (creationDocumentType === 'proforma') {
      handleGenerateProforma();
      return;
    }
    const settings = legalSettings || settingsDraft;
    const documentKind = creationDocumentType;
    if (creationSource === 'manual') {
      const document = buildManualLegalDocument({
        settings,
        kind: documentKind,
        userName,
        customer: selectedCustomer,
      });
      setProformaBundle(null);
      setDraftBundle({ document, lines: document.lines || [] });
      return;
    }

    if (!selectedOrder) {
      showToast('Επιλέξτε παραγγελία.', 'warning');
      return;
    }
    if (!canUseSelectedOrder) {
      showToast(selectedPickerRow?.hint || 'Η παραγγελία δεν έχει διαθέσιμα είδη για τιμολόγηση.', 'warning');
      return;
    }

    if (selectedShipmentId === LEGAL_REMAINING_SOURCE_VALUE) {
      const remainingOrder = buildOrderWithRemainingItems(selectedOrder, orderShipmentItemsAll);
      if (!remainingOrder) {
        showToast('Δεν υπάρχουν υπόλειπα είδη για αυτήν την παραγγελία.', 'warning');
        return;
      }
      const document = buildLegalDocumentFromOrder({
        order: remainingOrder,
        customer: selectedCustomer,
        products,
        settings,
        kind: documentKind,
        userName,
      });
      setProformaBundle(null);
      setDraftBundle({ document, lines: document.lines || [] });
      return;
    }

    if (selectedShipment) {
      const selectedItems = shipmentItems.filter((item) => item.shipment_id === selectedShipment.id);
      const document = buildLegalDocumentFromShipment({
        order: selectedOrder,
        shipment: selectedShipment,
        shipmentItems: selectedItems,
        customer: selectedCustomer,
        products,
        settings,
        kind: documentKind,
        userName,
      });
      setProformaBundle(null);
      setDraftBundle({ document, lines: document.lines || [] });
      return;
    }

    const document = buildLegalDocumentFromOrder({
      order: selectedOrder,
      customer: selectedCustomer,
      products,
      settings,
      kind: documentKind,
      userName,
    });
    setProformaBundle(null);
    setDraftBundle({ document, lines: document.lines || [] });
  };

  const handleGenerateProforma = (source: DocumentCreationSource = creationSource) => {
    const settings = legalSettings || settingsDraft;
    setCreationDocumentType('proforma');
    setDraftBundle(null);
    if (source === 'manual') {
      const proforma = buildManualProforma({
        settings,
        userName,
        customer: selectedCustomer,
      });
      setProformaBundle({ document: proforma, lines: proforma.lines || [] });
      return;
    }
    if (!selectedOrder) {
      showToast('Επιλέξτε παραγγελία για το προτιμολόγιο.', 'warning');
      return;
    }
    if (!canUseSelectedOrder) {
      showToast(selectedPickerRow?.hint || 'Η παραγγελία δεν έχει διαθέσιμα είδη για προτιμολόγιο.', 'warning');
      return;
    }
    const proforma = buildProformaFromOrder({
      order: selectedOrder,
      customer: selectedCustomer,
      products,
      settings,
      userName,
    });
    setProformaBundle({ document: proforma, lines: proforma.lines || [] });
  };

  const handleSaveDraft = async () => {
    if (!draftBundle) return;
    if (!isLegalDocumentEditable(draftBundle.document)) {
      showToast('Το παραστατικό είναι κλειδωμένο. Δείτε το στο Αρχείο.', 'info');
      setDraftBundle(null);
      setActiveTab('archive');
      return;
    }
    try {
      await saveDraft.mutateAsync(draftBundle);
      showToast('Το παραστατικό αποθηκεύτηκε ως πρόχειρο.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε το πρόχειρο.', 'error');
    }
  };

  const handleSaveProforma = async () => {
    if (!proformaBundle) return;
    try {
      await saveProforma.mutateAsync(proformaBundle);
      showToast('Το προτιμολόγιο αποθηκεύτηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε το προτιμολόγιο.', 'error');
    }
  };

  const handlePrintProforma = async (document: ProformaDocument, lines?: ProformaDocumentLine[]) => {
    if (!canPrintProforma(document)) {
      showToast('Το προτιμολόγιο δεν είναι εκτυπώσιμο.', 'warning');
      return;
    }
    try {
      const activeLines = lines || await legalRepository.getProformaLines(document.id);
      if (onPrintProforma) onPrintProforma({ document: { ...document, lines: activeLines }, lines: activeLines });
      else showToast('Η εκτύπωση προτιμολογίων δεν είναι διαθέσιμη σε αυτή την προβολή.', 'warning');
    } catch (error: any) {
      showToast(error?.message || 'Δεν ήταν δυνατή η εκτύπωση προτιμολογίου.', 'error');
    }
  };

  const handleDeleteProforma = async (document: ProformaDocument) => {
    const prompt = getProformaDeletePrompt(document);
    const ok = await confirm({
      title: prompt.title,
      message: prompt.message,
      confirmText: prompt.confirmText,
      cancelText: prompt.cancelText,
      isDestructive: prompt.isDestructive,
    });
    if (!ok) return;
    try {
      await deleteProforma.mutateAsync({ documentId: document.id, userName });
      if (proformaBundle?.document.id === document.id) setProformaBundle(null);
      showToast('Το προτιμολόγιο διαγράφηκε οριστικά.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν διαγράφηκε το προτιμολόγιο.', 'error');
    }
  };

  const handleDeleteLegalDocument = async (document: LegalDocument) => {
    const prompt = getLegalDocumentDeletePrompt(document);
    const ok = await confirm({
      title: prompt.title,
      message: prompt.message,
      confirmText: prompt.confirmText,
      cancelText: prompt.cancelText,
      isDestructive: prompt.isDestructive,
    });
    if (!ok) return;

    if (document.status === 'issued') {
      const confirmed = await confirm({
        title: 'Τελική επιβεβαίωση',
        message: [
          `Το ${getLegalDocumentDisplayNumber(document)} παραμένει ισχύον στην ΑΑΔΕ.`,
          document.aade_mark ? `MARK ${document.aade_mark} δεν ακυρώνεται με αυτή την ενέργεια.` : '',
          '',
          'Να αφαιρεθεί μόνο από το αρχείο του Ilios;',
        ].filter(Boolean).join('\n'),
        confirmText: 'Ναι, διαγραφή από Ilios',
        cancelText: 'Όχι',
        isDestructive: true,
      });
      if (!confirmed) return;
    }

    try {
      await deleteLegalDocument.mutateAsync({ documentId: document.id, userName });
      if (draftBundle?.document.id === document.id) setDraftBundle(null);
      showToast('Το παραστατικό διαγράφηκε από το Ilios.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν διαγράφηκε το παραστατικό.', 'error');
    }
  };

  const handleVoidProforma = async (document: ProformaDocument) => {
    const ok = await confirm({
      title: 'Ακύρωση προτιμολογίου',
      message: 'Το προτιμολόγιο θα μείνει στο αρχείο ως ανενεργό και δεν θα εκτυπώνεται για χρήση.',
      confirmText: 'Ακύρωση προτιμολογίου',
      cancelText: 'Πίσω',
      isDestructive: true,
    });
    if (!ok) return;
    try {
      await voidProforma.mutateAsync(document.id);
      if (proformaBundle?.document.id === document.id) setProformaBundle(null);
      showToast('Το προτιμολόγιο ακυρώθηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν ακυρώθηκε το προτιμολόγιο.', 'error');
    }
  };

  const handleEditProforma = async (document: ProformaDocument) => {
    try {
      const lines = await legalRepository.getProformaLines(document.id);
      setProformaBundle(recalculateProforma(normalizeProformaDocumentAddresses({ ...document, lines }), lines, settingsDraft));
      setCreationDocumentType('proforma');
      setDraftBundle(null);
      setActiveTab('new');
    } catch (error: any) {
      showToast(error?.message || 'Δεν φορτώθηκε το προτιμολόγιο.', 'error');
    }
  };

  const openConvertModal = async (document: ProformaDocument, activeLines?: ProformaDocumentLine[]) => {
    try {
      const lines = activeLines || await legalRepository.getProformaLines(document.id);
      setConvertModal({ proforma: document, lines, step: 'preview', createdDocument: null, error: null });
    } catch (error: any) {
      showToast(error?.message || 'Δεν φορτώθηκε το προτιμολόγιο.', 'error');
    }
  };

  const closeConvertModal = () => {
    setConvertModal({ proforma: null, lines: [], step: 'preview', createdDocument: null, error: null });
  };

  const runProformaConvert = async () => {
    const { proforma, lines } = convertModal;
    if (!proforma) return;
    setConvertModal((current) => ({ ...current, step: 'converting', error: null }));
    try {
      const draft = convertProformaToLegalDraft({
        proforma,
        lines,
        settings: settingsDraft,
        kind: 'invoice',
        userName,
      });
      await saveDraft.mutateAsync(draft);
      if (proformas.some((item) => item.id === proforma.id)) {
        await markProformaConverted.mutateAsync({ proformaId: proforma.id, legalDocumentId: draft.document.id });
      }
      setDraftBundle(draft);
      setCreationDocumentType('invoice');
      if (proformaBundle?.document.id === proforma.id) setProformaBundle(null);
      setConvertModal((current) => ({ ...current, step: 'success', createdDocument: draft.document, error: null }));
    } catch (error: any) {
      setConvertModal((current) => ({
        ...current,
        step: 'preview',
        error: error?.message || 'Δεν έγινε μετατροπή σε τιμολόγιο.',
      }));
    }
  };

  const handleOpenConvertedInvoice = () => {
    closeConvertModal();
    setActiveTab('new');
  };

  const promptLegalNumberingAlignment = async (options?: { silentIfUpToDate?: boolean }) => {
    try {
      const preview = await legalRepository.previewNumberingAlignment();
      if (!preview.changes.length && options?.silentIfUpToDate) return;
      const ok = await confirm({
        title: 'Ευθυγράμμιση με το τρέχον Αρχείο',
        message: formatLegalNumberingAlignmentPreview(preview),
        confirmText: preview.changes.length ? 'Εφαρμογή ασφαλών αλλαγών' : 'Κλείσιμο',
        cancelText: preview.changes.length ? 'Όχι τώρα' : 'Πίσω',
      });
      if (!ok || !preview.changes.length) return;

      const result = await legalRepository.applyNumberingAlignment(preview.preview_token);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: legalKeys.documents() }),
        queryClient.invalidateQueries({ queryKey: legalKeys.sequences() }),
      ]);
      showToast(
        result.applied.length
          ? `Η αρίθμηση ενημερώθηκε με τα τρέχοντα δεδομένα: ${result.applied
              .map((item) => `${item.series} ${item.old_next_aa} → ${item.new_next_aa}`)
              .join(', ')}.`
          : 'Δεν χρειάστηκε αλλαγή. Η βάση επανέλεγξε την αρίθμηση.',
        result.applied.length ? 'success' : 'info',
      );
    } catch (error: any) {
      showToast(error?.message || 'Δεν ολοκληρώθηκε ο έλεγχος της τρέχουσας αρίθμησης.', 'error');
    }
  };

  const handleSyncTransmitted = async () => {
    if (!(await ensureAadeCredentialsReady())) return;
    try {
      const result = await syncTransmittedDocuments.mutateAsync({
        environment: settingsDraft.environment,
        dateFrom: syncDraft.dateFrom,
        dateTo: syncDraft.dateTo,
        markFrom: syncDraft.markFrom || '0',
        entityVatNumber: syncDraft.entityVatNumber || null,
        receiverVatNumber: syncDraft.receiverVatNumber || null,
        invType: syncDraft.invType || null,
        maxMark: syncDraft.maxMark || null,
        userName,
      });
      if (result.imported_count === 0 && result.updated_count === 0) {
        showToast('Ο συγχρονισμός ολοκληρώθηκε. Δεν βρέθηκαν παραστατικά για τα επιλεγμένα φίλτρα.', 'info');
      } else {
        showToast(`Συγχρονισμός ολοκληρώθηκε: ${result.imported_count} νέα, ${result.updated_count} ενημερώσεις.`, 'success');
      }
      await promptLegalNumberingAlignment({ silentIfUpToDate: true });
    } catch (error: any) {
      showToast(error?.message || 'Ο συγχρονισμός AADE απέτυχε.', 'error');
    }
  };

  const ensureAadeCredentialsReady = async () => {
    if (settingsDraft.require_aade_credentials === false) return true;
    const status = credentialStatus || (await refetchCredentialStatus()).data;
    if (status?.[settingsDraft.environment]?.ready) return true;

    setCredentialEnvironment(settingsDraft.environment);
    setActiveTab('settings');
    showToast(`Συμπληρώστε AADE credentials για ${settingsDraft.environment.toUpperCase()} πριν από αποστολή στη myDATA.`, 'warning');
    return false;
  };

  const handleSubmitDraft = async () => {
    if (!draftBundle || validationErrors.length > 0) return;
    if (!isLegalDocumentEditable(draftBundle.document)) {
      showToast('Το παραστατικό έχει ήδη εκδοθεί. Βρίσκεται στο Αρχείο.', 'info');
      setArchiveSearch(getLegalDocumentDisplayNumber(draftBundle.document));
      setDraftBundle(null);
      setActiveTab('archive');
      return;
    }
    if (!(await ensureAadeCredentialsReady())) return;
    try {
      await saveDraft.mutateAsync(draftBundle);
      const issued = await submitDocument.mutateAsync({ documentId: draftBundle.document.id, userName });
      setArchiveSearch(getLegalDocumentDisplayNumber(issued));
      setDraftBundle(null);
      setActiveTab('archive');
      showToast(`Αποδοχή myDATA με MARK ${issued.aade_mark}. Το παραστατικό μεταφέρθηκε στο Αρχείο.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Η AADE απέρριψε το παραστατικό.', 'error');
    }
  };

  const startNewDocumentWorkspace = () => {
    setDraftBundle(null);
    setProformaBundle(null);
    setActiveTab('new');
  };

  const handleSubmitLegalDocument = async (document: LegalDocument) => {
    if (!(await ensureAadeCredentialsReady())) return;
    try {
      const lines = await legalRepository.getDocumentLines(document.id);
      const issues = validateLegalDocument(document, lines).filter((issue) => issue.severity === 'error');
      if (issues.length > 0) {
        showToast(issues[0].message, 'warning');
        if (document.status === 'draft') {
          await handleOpenLegalDocument(document);
        }
        return;
      }
      const issued = await submitDocument.mutateAsync({ documentId: document.id, userName });
      const successMessage = document.status === 'failed'
        ? `Επιτυχής αποστολή με MARK ${issued.aade_mark}.`
        : `Αποδοχή myDATA με MARK ${issued.aade_mark}.`;
      showToast(successMessage, 'success');
    } catch (error: any) {
      const fallback = document.status === 'failed' ? 'Η επανάληψη απέτυχε.' : 'Η υποβολή απέτυχε.';
      showToast(error?.message || fallback, 'error');
    }
  };

  const handleCancel = async (document: LegalDocument) => {
    if (!(await ensureAadeCredentialsReady())) return;
    const ok = await confirm({
      title: 'Ακύρωση παραστατικού',
      message: `Να σταλεί ακύρωση για το ${getLegalDocumentDisplayNumber(document)};`,
      confirmText: 'Ακύρωση',
      cancelText: 'Πίσω',
      isDestructive: true,
    });
    if (!ok) return;
    try {
      await cancelDocument.mutateAsync({ documentId: document.id, userName });
      showToast('Το παραστατικό ακυρώθηκε στη myDATA.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Η ακύρωση απέτυχε.', 'error');
    }
  };

  const handlePrint = async (document: LegalDocument) => {
    try {
      const lines = await legalRepository.getDocumentLines(document.id);
      if (!canPrintLegalDocument(document, lines)) {
        showToast(
          document.status === 'submitted'
            ? 'Η εκτύπωση είναι διαθέσιμη μετά την αποδοχή από την ΑΑΔΕ.'
            : 'Το παραστατικό δεν περνά τον έλεγχο νόμιμης εκτύπωσης. Ελέγξτε τα στοιχεία εκδότη, πελάτη, MARK/QR, γραμμές και σύνολα.',
          'warning',
        );
        return;
      }
      onPrintLegalDocument({ document: { ...document, lines }, lines });
      if (isOfficialLegalDocumentPrint(document, lines)) {
        await markPrinted.mutateAsync(document.id);
      }
    } catch (error: any) {
      showToast(error?.message || 'Δεν ήταν δυνατή η εκτύπωση.', 'error');
    }
  };

  const handleOpenLegalDocument = async (document: LegalDocument) => {
    if (document.status !== 'draft' && document.status !== 'failed') {
      showToast('Το εκδομένο ή ακυρωμένο παραστατικό είναι κλειδωμένο. Για αλλαγές χρειάζεται ακύρωση/επανέκδοση ή πιστωτικό.', 'info');
      return;
    }
    try {
      const lines = await legalRepository.getDocumentLines(document.id);
      setDraftBundle(recalculateLegalDocument(normalizeLegalDocumentAddresses({ ...document, lines }), lines, settingsDraft));
      setCreationDocumentType(document.document_kind);
      setProformaBundle(null);
      setSelectedOrderId(document.order_id || '');
      setSelectedShipmentId(document.shipment_id || '');
      setActiveTab('new');
    } catch (error: any) {
      showToast(error?.message || 'Δεν φορτώθηκε το παραστατικό.', 'error');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await saveSettings.mutateAsync(settingsDraft);
      showToast('Οι ρυθμίσεις αποθηκεύτηκαν.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκαν οι ρυθμίσεις.', 'error');
    }
  };

  const handleSaveAadeCredentials = async () => {
    const userId = credentialDraft.userId.trim();
    const subscriptionKey = credentialDraft.subscriptionKey.trim();
    const cloudflareApiToken = cloudflareBootstrapDraft.apiToken.trim();
    const cloudflareAccountId = cloudflareBootstrapDraft.accountId.trim();
    if (!userId || !subscriptionKey) {
      showToast('Συμπληρώστε AADE User ID και Subscription Key.', 'warning');
      return;
    }
    if (!credentialStatus?.workerCanStoreSecrets && (!cloudflareApiToken || !cloudflareAccountId)) {
      showToast('Στην πρώτη ρύθμιση χρειάζονται και Cloudflare API Token + Account ID.', 'warning');
      return;
    }

    try {
      await saveAadeCredentials.mutateAsync({
        environment: credentialEnvironment,
        userId,
        subscriptionKey,
        ...(!credentialStatus?.workerCanStoreSecrets ? { cloudflareApiToken, cloudflareAccountId } : {}),
      });
      setCredentialDraft({ userId: '', subscriptionKey: '' });
      setCloudflareBootstrapDraft({ apiToken: '', accountId: '' });
      showToast(`Τα AADE credentials για ${credentialEnvironment.toUpperCase()} αποθηκεύτηκαν με ασφάλεια στο Cloudflare Worker.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκαν τα AADE credentials.', 'error');
    }
  };

  const handleEnvironmentChange = (value: string) => {
    setSettingsDraft((current) => ({ ...current, environment: value === 'prod' ? 'prod' : 'dev' }));
  };

  const handleSaveAadeRegistryCredentials = async () => {
    const username = registryCredentialDraft.username.trim();
    const password = registryCredentialDraft.password.trim();
    const cloudflareApiToken = cloudflareBootstrapDraft.apiToken.trim();
    const cloudflareAccountId = cloudflareBootstrapDraft.accountId.trim();
    if (!username || !password) {
      showToast('Συμπληρώστε τους ειδικούς κωδικούς της υπηρεσίας Μητρώου ΑΑΔΕ.', 'warning');
      return;
    }
    if (!credentialStatus?.workerCanStoreSecrets && (!cloudflareApiToken || !cloudflareAccountId)) {
      showToast('Στην πρώτη ρύθμιση χρειάζονται και Cloudflare API Token + Account ID.', 'warning');
      return;
    }
    try {
      await saveAadeRegistryCredentials.mutateAsync({
        username,
        password,
        ...(!credentialStatus?.workerCanStoreSecrets ? { cloudflareApiToken, cloudflareAccountId } : {}),
      });
      const unverifiedSettings: LegalSettings = {
        ...settingsDraft,
        issuer: {
          ...settingsDraft.issuer,
          registry_verified_at: null,
        },
      };
      await saveSettings.mutateAsync(unverifiedSettings);
      setSettingsDraft(unverifiedSettings);
      setRegistryConnectionStatus({
        configured: true,
        verified: false,
        verifiedAt: null,
        message: 'Οι κωδικοί αποθηκεύτηκαν αλλά δεν έχουν ακόμη δοκιμαστεί.',
      });
      setRegistryCredentialDraft({ username: '', password: '' });
      setCloudflareBootstrapDraft({ apiToken: '', accountId: '' });
      showToast('Οι ειδικοί κωδικοί Μητρώου ΑΑΔΕ αποθηκεύτηκαν με ασφάλεια.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκαν οι κωδικοί Μητρώου ΑΑΔΕ.', 'error');
    }
  };

  const handleAddCarrier = async () => {
    if (!newCarrier.name.trim()) return;
    const carrier: LegalCarrier = {
      id: crypto.randomUUID(),
      name: newCarrier.name.trim(),
      vat_number: normalizeVatNumber(newCarrier.vat_number) || null,
      vehicle_number: newCarrier.vehicle_number.trim() || null,
      phone: newCarrier.phone.trim() || null,
      is_default: carriers.length === 0,
    };
    try {
      await saveCarrier.mutateAsync(carrier);
      setNewCarrier({ name: '', vat_number: '', vehicle_number: '', phone: '' });
      showToast('Ο μεταφορέας αποθηκεύτηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε ο μεταφορέας.', 'error');
    }
  };

  const handleSettingsTabClick = () => {
    setActiveTab('settings');
    if (isInspectionModeActive()) return;
    settingsSecretClickRef.current.count += 1;
    if (settingsSecretClickRef.current.timer) {
      clearTimeout(settingsSecretClickRef.current.timer);
    }
    settingsSecretClickRef.current.timer = setTimeout(() => {
      settingsSecretClickRef.current.count = 0;
    }, 700);
    if (settingsSecretClickRef.current.count >= 3) {
      settingsSecretClickRef.current.count = 0;
      setShowInspectionPinSection(true);
    }
  };

  const handleSaveInspectionPin = async () => {
    if (inspectionPinDraft.length < 4) {
      showToast('Ο κωδικός πρέπει να έχει τουλάχιστον 4 χαρακτήρες.', 'warning');
      return;
    }
    if (inspectionPinDraft !== inspectionPinConfirm) {
      showToast('Οι κωδικοί δεν ταιριάζουν.', 'warning');
      return;
    }
    try {
      await setInspectionExitPin.mutateAsync(inspectionPinDraft);
      setInspectionPinDraft('');
      setInspectionPinConfirm('');
      showToast('Ο κωδικός εξόδου αποθηκεύτηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε ο κωδικός εξόδου.', 'error');
    }
  };

  const handleDeliveryAction = async (document: LegalDocument, action: 'register' | 'confirm' | 'failed' | 'poll') => {
    if (!(await ensureAadeCredentialsReady())) return;
    try {
      if (action === 'register') await registerTransfer.mutateAsync({ documentId: document.id, userName });
      if (action === 'confirm') await confirmDelivery.mutateAsync({ documentId: document.id, userName, failed: false });
      if (action === 'failed') await confirmDelivery.mutateAsync({ documentId: document.id, userName, failed: true });
      if (action === 'poll') await pollDeliveryStatus.mutateAsync({ documentId: document.id, userName });
      showToast('Η ενέργεια διακίνησης καταγράφηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Η ενέργεια διακίνησης απέτυχε.', 'error');
    }
  };

  const renderDraftEditor = () => {
    if (!draftBundle) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          <FileCheck2 size={36} className="mx-auto mb-3 text-slate-300" />
          <div className="font-black text-slate-700">Καμία προεπισκόπηση</div>
          <div className="mt-1 text-sm">Δημιουργήστε από παραγγελία ή ξεκινήστε κενό χειροκίνητο παραστατικό.</div>
        </div>
      );
    }

    const document = draftBundle.document;
    const editable = isLegalDocumentEditable(document);
    const includesDelivery = documentIncludesDeliveryNote(document);
    const isStandaloneDeliveryNote = document.document_kind === 'delivery_note';
    const canToggleDelivery = document.document_kind === 'invoice' || document.document_kind === 'invoice_delivery';

    return (
      <div className="min-w-0 space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">{LEGAL_DOCUMENT_KIND_LABELS[document.document_kind]}</h2>
              <div className="text-sm font-medium text-slate-500">
                {document.counterpart.name || 'Πελάτης'} | {money(document.totals.gross)}
              </div>
            </div>
            <span className={`rounded-lg border px-3 py-1 text-xs font-black ${statusClass[document.status]}`}>
              {statusLabel[document.status]}
            </span>
          </div>

          {!editable && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              <div className="font-black">Το παραστατικό δεν είναι πλέον πρόχειρο.</div>
              <div className="mt-1 text-emerald-800">
                {document.status === 'issued'
                  ? `Εκδόθηκε με MARK ${document.aade_mark || '—'}. Δείτε το στο Αρχείο για εκτύπωση ή ακύρωση.`
                  : 'Δείτε το στο Αρχείο για τις διαθέσιμες ενέργειες.'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton variant="secondary" onClick={() => { setArchiveSearch(getLegalDocumentDisplayNumber(document)); setDraftBundle(null); setActiveTab('archive'); }}>
                  <Archive size={16} /> Μετάβαση στο Αρχείο
                </ActionButton>
                <ActionButton variant="quiet" onClick={startNewDocumentWorkspace}>
                  <Plus size={16} /> Νέο παραστατικό
                </ActionButton>
              </div>
            </div>
          )}

          <fieldset disabled={!editable} className={`mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${!editable ? 'opacity-60' : ''}`}>
            <SelectInput label="Πελάτης εφαρμογής" value="" onChange={(value) => applyCustomerToDraft(value, 'legal')} help="Γεμίζει αυτόματα ΑΦΜ, επωνυμία, στοιχεία επικοινωνίας και καθεστώς ΦΠΑ από τους πελάτες του ERP.">
              <option value="">Χειροκίνητα / χωρίς αλλαγή</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.vat_number ? ` | ΑΦΜ ${customer.vat_number}` : ''}</option>)}
            </SelectInput>
            <TextInput label="Ημερομηνία" type="date" value={document.issue_date} onChange={(value) => updateDraftDocument((current) => ({ ...current, issue_date: value }))} />
            <SelectInput label="Πληρωμή" value={document.payment_method_code} onChange={(value) => updateDraftDocument((current) => ({ ...current, payment_method_code: Number(value) }))}>
              {PAYMENT_METHOD_CODES.map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
            </SelectInput>
            <TextInput label="ΑΦΜ Πελάτη" value={document.counterpart.vat_number || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, vat_number: normalizeVatNumber(value) } }))} />
            <TextInput label="Επωνυμία Πελάτη" value={document.counterpart.name || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, name: value } }))} />
            <SelectInput label="Καθεστώς ΦΠΑ" value={document.vat_rate ?? 0.24} onChange={(value) => applyLegalVatProfile(Number(value))} help="Ο βασικός συντελεστής ΦΠΑ για τις γραμμές. Αν χρειάζεται, κάθε γραμμή μπορεί να έχει διαφορετική κατηγορία ΦΠΑ.">
              {vatRateOptions.map((option) => <option key={option.category} value={option.value}>{option.label}</option>)}
            </SelectInput>
            <TextInput label="Οδός Πελάτη" value={document.counterpart.address?.street || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), street: value } } }))} />
            <TextInput label="Αριθμός" value={document.counterpart.address?.number || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), number: value } } }))} />
            <TextInput label="Τ.Κ." value={document.counterpart.address?.postal_code || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), postal_code: value } } }))} />
            <TextInput label="Πόλη" value={document.counterpart.address?.city || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), city: value } } }))} />
            <VatExemptionCategorySelect
              value={document.vat_exemption_category}
              onChange={(value) => updateDraftDocument((current) => ({ ...current, vat_exemption_category: value }))}
            />
          </fieldset>

          {(isStandaloneDeliveryNote || canToggleDelivery) && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70">
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryPaneOpen((open) => !open)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-black text-slate-800 hover:bg-white"
                    aria-expanded={deliveryPaneOpen}
                  >
                    {deliveryPaneOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <Truck size={16} />
                    Διακίνηση
                  </button>
                  {canToggleDelivery ? (
                    <label className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                      <input
                        type="checkbox"
                        checked={includesDelivery}
                        onChange={(event) => {
                          updateDraftDocument((current) => applyLegalDocumentDeliveryToggle(
                            current,
                            event.target.checked,
                            settingsDraft,
                            selectedCustomer,
                          ));
                          if (event.target.checked) setDeliveryPaneOpen(true);
                        }}
                      />
                      Με δελτίο διακίνησης
                    </label>
                  ) : null}
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                  {isStandaloneDeliveryNote
                    ? 'Υποχρεωτικά για δελτίο αποστολής 9.3.'
                    : includesDelivery
                      ? 'Προαιρετικό συνδυασμένο τιμολόγιο–διακίνηση (Α 1170/2023).'
                      : 'Το απλό τιμολόγιο 1.1 δεν απαιτεί στοιχεία διακίνησης.'}
                </span>
              </div>
              {deliveryPaneOpen && includesDelivery ? (
                <div className="border-t border-slate-200 px-3 pb-3 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <TextInput label="Ημ/νία Έναρξης" type="date" value={document.delivery?.dispatch_date || today()} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), dispatch_date: value } }))} />
                    <TextInput label="Ώρα Έναρξης" type="time" value={(document.delivery?.dispatch_time || '10:00').slice(0, 5)} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), dispatch_time: `${value}:00` } }))} />
                    <TextInput label="Όχημα" value={document.delivery?.vehicle_number || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), vehicle_number: value } }))} />
                    <SelectInput label="Μεταφορέας" value={document.delivery?.carrier_id || ''} onChange={(value) => {
                      const carrier = carriers.find((item) => item.id === value);
                      updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), carrier_id: value || null, carrier_name: carrier?.name || null, carrier_vat_number: carrier?.vat_number || null, carrier_vehicle_number: carrier?.vehicle_number || null } }));
                    }}>
                      <option value="">Ίδια μέσα</option>
                      {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name}</option>)}
                    </SelectInput>
                    <TextInput label="Φόρτωση" value={document.delivery?.loading_address?.street || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), loading_address: { ...(current.delivery?.loading_address || {}), street: value } } }))} />
                    <TextInput label="Παράδοση" value={document.delivery?.delivery_address?.street || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), delivery_address: { ...(current.delivery?.delivery_address || {}), street: value } } }))} />
                    <TextInput label="Σκοπός" type="number" value={document.delivery?.move_purpose || settingsDraft.default_move_purpose} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), move_purpose: Number(value) || 1 } }))} help="Κωδικός σκοπού διακίνησης ΑΑΔΕ. Συνήθως 1 για πώληση." />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className={`rounded-lg border border-slate-200 bg-white p-4 ${!editable ? 'opacity-60' : ''}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-black text-slate-900">Γραμμές</h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-black text-slate-700">{draftBundle.lines.length} γραμμές | {money(document.totals.gross)}</div>
              <ActionButton variant="secondary" disabled={!editable} onClick={() => updateDraftBundle((current, lines) => recalculateLegalDocument(current, [
                ...lines,
                createManualLegalDocumentLine({
                  documentId: current.id,
                  lineNumber: lines.length + 1,
                  settings: settingsDraft,
                  vatRate: current.vat_rate ?? 0.24,
                  aadeDocumentType: current.aade_document_type,
                }),
              ], settingsDraft))}>
                <Plus size={16} /> Γραμμή
              </ActionButton>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-2 py-2">#</th>
                  <th className="w-[7.5rem] px-2 py-2">SKU</th>
                  <th className="px-2 py-2">Περιγραφή</th>
                  <th className="w-14 px-2 py-2 text-right">Ποσ.</th>
                  <th className="w-16 px-2 py-2 text-right">Τιμή</th>
                  <th className="w-20 px-2 py-2 text-right">ΦΠΑ</th>
                  <th className="w-24 px-2 py-2 text-right" title="Καθαρή / ΦΠΑ / Σύνολο">Ποσά</th>
                  <th className="min-w-[11rem] px-2 py-2" title="Χαρακτηρισμός εσόδου myDATA">Χαρ.</th>
                  <th className="w-8 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draftBundle.lines.map((line, index) => (
                  <tr key={line.id} className="align-middle">
                    <td className="whitespace-nowrap px-2 py-1.5 font-bold">{line.line_number}</td>
                    <td className="px-2 py-1.5">
                      <SkuProductPicker
                        sku={line.sku}
                        variantSuffix={line.variant_suffix}
                        products={products}
                        onSelect={(selection) => applyCatalogToLegalLine(line.id, selection)}
                        onEnterCommit={() => appendLegalLineAfter(line.id)}
                        autoFocus={legalSkuFocusLineId === line.id}
                        inputClassName="px-1.5 py-1"
                        compact
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={line.description} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item), settingsDraft))} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none" />
                      <input value={line.item_code || ''} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, item_code: event.target.value } : item), settingsDraft))} className="mt-1 w-full rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 outline-none" placeholder="Κωδικός είδους" title="Κωδικός είδους AADE (itemCode)" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, quantity: Number(event.target.value) || 0 } : item), settingsDraft))} className="w-full rounded-lg border border-slate-200 px-1 py-1 text-right outline-none" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" step="0.01" value={line.unit_price} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, unit_price: Number(event.target.value) || 0 } : item), settingsDraft))} className="w-full rounded-lg border border-slate-200 px-1 py-1 text-right outline-none" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <select value={line.vat_category} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, vat_category: Number(event.target.value) } : item), settingsDraft))} className="w-full rounded-lg border border-slate-200 px-1 py-1 text-right text-[10px] outline-none" title="Κωδικός κατηγορίας ΦΠΑ myDATA (vatCategory)">
                        {vatLineOptions.map((option) => <option key={option.category} value={option.category}>{option.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right leading-tight">
                      <div className="font-medium text-slate-600">{money(line.net_value)}</div>
                      <div className="text-[10px] text-slate-400">{money(line.vat_amount)}</div>
                      <div className="font-black text-slate-900">{money(line.gross_value)}</div>
                    </td>
                    <td className="px-2 py-1.5">
                      <IncomeClassificationTypeSelect
                        documentType={draftBundle.document.aade_document_type}
                        category={line.income_classification.classification_category}
                        value={line.income_classification.classification_type || ''}
                        onChange={(classification_type) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, income_classification: { ...item.income_classification, classification_type } } : item), settingsDraft))}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.filter((_, itemIndex) => itemIndex !== index), settingsDraft))}
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                        title="Διαγραφή γραμμής"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  };

  const renderValidation = () => {
    const editable = draftBundle ? isLegalDocumentEditable(draftBundle.document) : false;

    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardCheck size={18} className="text-emerald-600" />
          <h3 className="font-black text-slate-900">Έλεγχος & υποβολή</h3>
        </div>
        {!draftBundle ? (
          <div className="text-sm font-medium text-slate-500">Δημιουργήστε πρόχειρο για έλεγχο και αποστολή στη myDATA.</div>
        ) : !editable ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
              <CheckCircle2 size={16} />
              {draftBundle.document.status === 'issued' ? 'Εκδόθηκε — δεν μπορεί να ξανασταλεί' : 'Κλειδωμένο παραστατικό'}
            </div>
            <ActionButton variant="secondary" onClick={() => { setArchiveSearch(getLegalDocumentDisplayNumber(draftBundle.document)); setDraftBundle(null); setActiveTab('archive'); }}>
              <Archive size={16} /> Άνοιγμα στο Αρχείο
            </ActionButton>
          </div>
        ) : validationIssues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
            <CheckCircle2 size={16} /> Έτοιμο για υποβολή στη myDATA
          </div>
        ) : (
          <div className="space-y-2">
            {validationIssues.map((issue) => (
              <div key={`${issue.field}-${issue.message}`} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${issue.severity === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {issue.severity === 'error' ? <XCircle size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        )}
        {editable && (
          <div className="mt-5 flex flex-wrap gap-2">
            <ActionButton variant="secondary" onClick={handleSaveDraft} disabled={!draftBundle || saveDraft.isPending}>
              {saveDraft.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση πρόχειρου
            </ActionButton>
            {draftBundle && canPrintLegalDocument(draftBundle.document, draftBundle.lines) && (
              <ActionButton variant="secondary" onClick={() => void handlePrint(draftBundle.document)}>
                <Printer size={16} />
                {isOfficialLegalDocumentPrint(draftBundle.document, draftBundle.lines) ? 'Εκτύπωση' : 'Εκτύπωση πρόχειρου'}
              </ActionButton>
            )}
            <ActionButton onClick={handleSubmitDraft} disabled={!draftBundle || validationErrors.length > 0 || submitDocument.isPending || saveDraft.isPending}>
              {submitDocument.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Υποβολή στη myDATA
            </ActionButton>
          </div>
        )}
      </section>
    );
  };

  const renderNewTab = () => {
    const selectedCreationType = creationTypeItems.find((item) => item.id === creationDocumentType) || creationTypeItems[0];
    const isProformaWorkspace = Boolean(proformaBundle) || (creationDocumentType === 'proforma' && !draftBundle);

    return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <span className="font-black">Δημιουργία</span> — νέο πρόχειρο τιμολόγιο, προτιμολόγιο, έλεγχος και υποβολή στη myDATA.
        {' '}Μετά την έκδοση, το παραστατικό μεταφέρεται αυτόματα στο <span className="font-black">Αρχείο</span>.
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(250px,290px)_minmax(0,1fr)]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 lg:sticky lg:top-4 lg:self-start">
        <div className="mb-4 flex items-center gap-2">
          <FileCheck2 size={18} className="text-slate-700" />
          <h2 className="font-black text-slate-900">Νέο παραστατικό</h2>
        </div>
        <div className="space-y-4">
          <div>
            <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">Πηγή</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setCreationSource('order'); setDraftBundle(null); setProformaBundle(null); }}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-black transition ${creationSource === 'order' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                Από παραγγελία
              </button>
              <button
                type="button"
                onClick={() => { setCreationSource('manual'); setSelectedShipmentId(''); setDraftBundle(null); setProformaBundle(null); }}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-black transition ${creationSource === 'manual' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                Χειροκίνητα
              </button>
            </div>
          </div>
          {creationSource === 'order' ? (
            <>
              <SelectInput
                label="Παραγγελία"
                value={selectedOrderId}
                onChange={(value) => { setSelectedOrderId(value); setSelectedShipmentId(''); setDraftBundle(null); setProformaBundle(null); }}
                help="Εμφανίζει το πραγματικό ποσό τιμολόγησης από τα τρέχοντα είδη. Παραγγελίες που άδειασαν από μεταφορά υπόλοιπου δείχνουν πού μεταφέρθηκαν τα είδη."
              >
                <option value="">Επιλογή παραγγελίας</option>
                {legalOrderPickerRows.some((row) => row.selectable) && (
                  <optgroup label="Διαθέσιμες για τιμολόγηση">
                    {legalOrderPickerRows.filter((row) => row.selectable).map((row) => (
                      <option key={row.order.id} value={row.order.id}>{row.label}</option>
                    ))}
                  </optgroup>
                )}
                {legalOrderPickerRows.some((row) => !row.selectable) && (
                  <optgroup label="Μεταφέρθηκαν σε νεότερη παραγγελία">
                    {legalOrderPickerRows.filter((row) => !row.selectable).map((row) => (
                      <option key={row.order.id} value={row.order.id} disabled>{row.label}</option>
                    ))}
                  </optgroup>
                )}
              </SelectInput>
              {selectedPickerRow?.hint ? (
                <div className={`rounded-lg border px-3 py-2 text-xs font-medium leading-relaxed ${selectedPickerRow.selectable ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                  <div>{selectedPickerRow.hint}</div>
                  {!selectedPickerRow.selectable && selectedPickerRow.redirectOrderId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderId(selectedPickerRow.redirectOrderId!);
                        setSelectedShipmentId('');
                        setDraftBundle(null);
                        setProformaBundle(null);
                      }}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-black text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      Μετάβαση στη #{formatOrderId(selectedPickerRow.redirectOrderId)}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <SelectInput
                label="Πηγή γραμμών"
                value={selectedShipmentId}
                onChange={(value) => { setSelectedShipmentId(value); setDraftBundle(null); setProformaBundle(null); }}
                help="Επιλέξτε ολόκληρη την παραγγελία, μόνο τα υπόλοιπα είδη ή μια συγκεκριμένη μερική αποστολή (ΔΑ)."
              >
                {lineSourceOptions.some((option) => option.group === 'base') ? (
                  <optgroup label="Παραγγελία">
                    {lineSourceOptions.filter((option) => option.group === 'base').map((option) => (
                      <option key={option.value || 'full'} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ) : (
                  <option value="">Όλη η παραγγελία</option>
                )}
                {lineSourceOptions.some((option) => option.group === 'shipment') ? (
                  <optgroup label="Μερικές αποστολές">
                    {lineSourceOptions.filter((option) => option.group === 'shipment').map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ) : null}
              </SelectInput>
              {selectedLineSource?.description ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                  {selectedLineSource.description}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
              {creationDocumentType === 'proforma'
                ? 'Ξεκινάτε κενό προτιμολόγιο. Συμπληρώστε πελάτη, γραμμές και σημειώσεις χειροκίνητα στον επεξεργαστή.'
                : 'Ξεκινάτε κενό παραστατικό. Συμπληρώστε πελάτη, γραμμές και στοιχεία χειροκίνητα στον επεξεργαστή.'}
            </div>
          )}
          <div>
            <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">Τύπος</span>
            <div className="grid gap-2">
              {creationTypeItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setCreationDocumentType(item.id); setDraftBundle(null); setProformaBundle(null); }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm font-black transition ${creationDocumentType === item.id ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {selectedCreationType.help ? (
              <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">{selectedCreationType.help}</p>
            ) : null}
          </div>
          <ActionButton onClick={handleGenerateDraft} disabled={(creationSource === 'order' && (!selectedOrder || !canUseSelectedOrder)) || loadingOrders}>
            {loadingOrders ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Δημιουργία
          </ActionButton>
        </div>
      </section>

      <div className="min-w-0 space-y-4">
        {isProformaWorkspace ? renderProformaEditor() : (
          <>
            {renderDraftEditor()}
            {renderValidation()}
          </>
        )}
      </div>
    </div>
    </div>
    );
  };

  const renderProformaEditor = () => {
    if (!proformaBundle) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          <FileText size={36} className="mx-auto mb-3 text-slate-300" />
          <div className="font-black text-slate-700">Δεν έχει ανοιχτεί προτιμολόγιο</div>
          <div className="mt-1 text-sm">Επιλέξτε «Προτιμολόγιο» ως τύπο και πατήστε Δημιουργία, ή ανοίξτε παλιότερο από το Αρχείο.</div>
        </div>
      );
    }

    const document = proformaBundle.document;

    return (
      <div className="space-y-5">
        <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-800">
          Προτιμολόγιο: εμπορικό/ενημερωτικό έγγραφο μόνο. Δεν είναι νόμιμο φορολογικό παραστατικό, δεν παίρνει MARK και δεν αποστέλλεται στη myDATA.
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Προτιμολόγιο</h2>
              <div className="text-sm font-medium text-slate-500">{document.counterpart.name || 'Πελάτης'} | {money(document.totals.gross)}</div>
            </div>
            <span className={`rounded-lg border px-3 py-1 text-xs font-black ${proformaStatusClass[document.status]}`}>
              {proformaStatusLabel[document.status]}
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <SelectInput label="Πελάτης εφαρμογής" value="" onChange={(value) => applyCustomerToDraft(value, 'proforma')} help="Γεμίζει αυτόματα τα στοιχεία πελάτη από το ERP, αλλά όλα μένουν χειροκίνητα επεξεργάσιμα.">
              <option value="">Χειροκίνητα / χωρίς αλλαγή</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.vat_number ? ` | ΑΦΜ ${customer.vat_number}` : ''}</option>)}
            </SelectInput>
            <TextInput label="Ημερομηνία" type="date" value={document.issue_date} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, issue_date: value }, lines, settingsDraft))} />
            <TextInput label="Ισχύει έως" type="date" value={document.valid_until || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, valid_until: value || null }, lines, settingsDraft))} />
            <TextInput label="ΑΦΜ Πελάτη" value={document.counterpart.vat_number || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, counterpart: { ...current.counterpart, vat_number: normalizeVatNumber(value) } }, lines, settingsDraft))} />
            <TextInput label="Επωνυμία Πελάτη" value={document.counterpart.name || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, counterpart: { ...current.counterpart, name: value } }, lines, settingsDraft))} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-5">
            <TextInput label="Οδός" value={document.counterpart.address?.street || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), street: value } } }, lines, settingsDraft))} />
            <TextInput label="Αριθμός" value={document.counterpart.address?.number || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), number: value } } }, lines, settingsDraft))} />
            <TextInput label="Τ.Κ." value={document.counterpart.address?.postal_code || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), postal_code: value } } }, lines, settingsDraft))} />
            <TextInput label="Πόλη" value={document.counterpart.address?.city || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), city: value } } }, lines, settingsDraft))} />
            <SelectInput label="Πληρωμή" value={document.payment_method_code} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, payment_method_code: Number(value) }, lines, settingsDraft))}>
              {PAYMENT_METHOD_CODES.map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
            </SelectInput>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[160px_160px_1fr]">
            <SelectInput label="Καθεστώς ΦΠΑ" value={document.vat_rate ?? 0.24} onChange={(value) => applyProformaVatProfile(Number(value))} help="Το προφίλ ΦΠΑ του προτιμολογίου. Κάθε γραμμή μπορεί να αλλαχθεί ξεχωριστά.">
              {vatRateOptions.map((option) => <option key={option.category} value={option.value}>{option.label}</option>)}
            </SelectInput>
            <VatExemptionCategorySelect
              label="Αιτία απαλλαγής ΦΠΑ"
              value={document.vat_exemption_category}
              onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, vat_exemption_category: value }, lines, settingsDraft))}
            />
            <TextInput label="Σημειώσεις" value={document.notes || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, notes: value }, lines, settingsDraft))} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-black text-slate-900">Γραμμές προτιμολογίου</h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-black text-slate-700">{proformaBundle.lines.length} γραμμές | {money(document.totals.gross)}</div>
              <ActionButton variant="secondary" onClick={() => updateProformaBundle((current, lines) => {
                const baseLine = createManualLegalDocumentLine({
                  documentId: current.id,
                  lineNumber: lines.length + 1,
                  settings: settingsDraft,
                  vatRate: current.vat_rate ?? 0.24,
                });
                return recalculateProforma(current, [...lines, { ...baseLine, proforma_id: current.id }], settingsDraft);
              })}>
                <Plus size={16} /> Γραμμή
              </ActionButton>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Κωδ.</th>
                  <th className="px-3 py-2">Περιγραφή</th>
                  <th className="px-3 py-2 text-right">Ποσ.</th>
                  <th className="px-3 py-2 text-right">Μον.</th>
                  <th className="px-3 py-2 text-right">Τιμή</th>
                  <th className="px-3 py-2 text-right">ΦΠΑ %</th>
                  <th className="px-3 py-2 text-right">Σύνολο</th>
                  <th className="px-3 py-2">Χαρακτ.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proformaBundle.lines.map((line, index) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 font-bold">{line.line_number}</td>
                    <td className="px-3 py-2">
                      <SkuProductPicker
                        sku={line.sku}
                        variantSuffix={line.variant_suffix}
                        products={products}
                        onSelect={(selection) => applyCatalogToProformaLine(line.id, selection)}
                        onEnterCommit={() => appendProformaLineAfter(line.id)}
                        autoFocus={proformaSkuFocusLineId === line.id}
                      />
                    </td>
                    <td className="px-3 py-2"><input value={line.item_code || ''} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, item_code: event.target.value } : item), settingsDraft))} className="w-28 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs outline-none" /></td>
                    <td className="px-3 py-2"><input value={line.description} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item), settingsDraft))} className="min-w-56 rounded-lg border border-slate-200 px-2 py-1 outline-none" /></td>
                    <td className="px-3 py-2 text-right"><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, quantity: Number(event.target.value) || 0 } : item), settingsDraft))} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none" /></td>
                    <td className="px-3 py-2 text-right"><input type="number" min="1" step="1" value={line.measurement_unit} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, measurement_unit: Number(event.target.value) || 1 } : item), settingsDraft))} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none" title="Μονάδα μέτρησης. Συνήθως 1 για τεμάχιο." /></td>
                    <td className="px-3 py-2 text-right"><input type="number" step="0.01" value={line.unit_price} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, unit_price: Number(event.target.value) || 0 } : item), settingsDraft))} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none" /></td>
                    <td className="px-3 py-2 text-right">
                      <select value={line.vat_category} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, vat_category: Number(event.target.value) } : item), settingsDraft))} className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none">
                        {vatRateOptions.map((option) => <option key={option.category} value={option.category}>{option.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-black">{money(line.gross_value)}</td>
                    <td className="min-w-[11rem] px-3 py-2">
                      <IncomeClassificationTypeSelect
                        documentType="1.1"
                        category={line.income_classification.classification_category}
                        value={line.income_classification.classification_type || ''}
                        onChange={(classification_type) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, income_classification: { ...item.income_classification, classification_type } } : item), settingsDraft))}
                        selectClassName="text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => updateProformaBundle((current, lines) => recalculateProforma(current, lines.filter((_, itemIndex) => itemIndex !== index), settingsDraft))} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Διαγραφή γραμμής">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ActionButton variant="secondary" onClick={handleSaveProforma} disabled={saveProforma.isPending}>
              {saveProforma.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
            </ActionButton>
            <ActionButton onClick={() => handlePrintProforma(document, proformaBundle.lines)}>
              <Printer size={16} /> Εκτύπωση
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => void openConvertModal(document, proformaBundle.lines)} disabled={document.status !== 'draft' || saveDraft.isPending}>
              <Copy size={16} /> Μετατροπή σε τιμολόγιο
            </ActionButton>
          </div>
        </section>
      </div>
    );
  };

  const handleArchiveCustomerLink = async (record: LegalArchiveRecord, customerId: string | null) => {
    try {
      await linkLegalArchiveCustomer.mutateAsync({
        source: record.source,
        documentId: record.id,
        customerId,
        userName,
      });
      showToast(customerId ? 'Ο πελάτης συνδέθηκε με το παραστατικό.' : 'Η σύνδεση πελάτη αφαιρέθηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε η σύνδεση πελάτη.', 'error');
    }
  };

  const handleTestAadeRegistryConnection = async () => {
    try {
      const status = await legalRepository.testRegistryConnection(
        normalizeVatNumber(settingsDraft.issuer.vat_number),
      );
      const result = status.result;
      const apply = await confirm({
        title: 'Η σύνδεση Μητρώου ΑΑΔΕ λειτουργεί',
        message: result
          ? [
              `ΑΦΜ: ${result.vatNumber}`,
              `Κατάσταση: ${result.active === true ? 'Ενεργό' : result.active === false ? 'Ανενεργό' : 'Άγνωστη'}`,
              `Επωνυμία: ${result.businessName || '—'}`,
              `ΔΟΥ: ${result.taxOfficeDescription || result.taxOfficeCode || '—'}`,
              '',
              'Να εφαρμοστούν τα επίσημα στοιχεία στις Ρυθμίσεις επιχείρησης;',
            ].join('\n')
          : 'Οι ειδικοί κωδικοί επαληθεύτηκαν. Δεν επιστράφηκαν πρόσθετα στοιχεία.',
        confirmText: result ? 'Εφαρμογή στοιχείων' : 'Ολοκλήρωση',
        cancelText: result ? 'Μόνο επιβεβαίωση' : 'Κλείσιμο',
      });
      const primaryActivity = result?.activities.find((activity) =>
        String(activity.kindDescription || '').toLocaleUpperCase('el-GR').includes('ΚΥΡΙΑ')
      ) || result?.activities[0];
      const verifiedSettings: LegalSettings = {
        ...settingsDraft,
        issuer: {
          ...settingsDraft.issuer,
          ...(apply && result ? {
            business_name: result.businessName || settingsDraft.issuer.business_name,
            name: result.businessName || settingsDraft.issuer.name,
            trade_name: result.tradeName || settingsDraft.issuer.trade_name,
            doy: result.taxOfficeDescription || result.taxOfficeCode || settingsDraft.issuer.doy,
            legal_form: result.legalStatus || settingsDraft.issuer.legal_form,
            activity: primaryActivity
              ? `${primaryActivity.code} · ${primaryActivity.description}`
              : settingsDraft.issuer.activity,
            address: {
              ...settingsDraft.issuer.address,
              street: result.address.street || settingsDraft.issuer.address?.street,
              number: result.address.number || settingsDraft.issuer.address?.number,
              postal_code: result.address.postalCode || settingsDraft.issuer.address?.postal_code,
              city: result.address.city || settingsDraft.issuer.address?.city,
            },
          } : {}),
          registry_verified_at: status.verifiedAt || new Date().toISOString(),
        },
      };
      await saveSettings.mutateAsync(verifiedSettings);
      setSettingsDraft(verifiedSettings);
      setRegistryConnectionStatus(status);
      showToast(
        apply && result
          ? 'Η σύνδεση επαληθεύτηκε και τα επίσημα στοιχεία εφαρμόστηκαν.'
          : 'Η σύνδεση με το Μητρώο ΑΑΔΕ επαληθεύτηκε.',
        'success',
      );
    } catch (error: any) {
      setRegistryConnectionStatus({
        configured: !!credentialStatus?.registry?.ready,
        verified: false,
        verifiedAt: null,
        message: error?.message || 'Η σύνδεση δεν επαληθεύτηκε.',
      });
      showToast(error?.message || 'Η σύνδεση Μητρώου ΑΑΔΕ δεν επαληθεύτηκε.', 'error');
    }
  };

  const updateSequenceDraft = (
    sequenceId: string,
    updates: Partial<LegalNumberingSequence>,
  ) => {
    setSequenceDrafts((current) => {
      const existing = current[sequenceId];
      if (!existing) return current;
      return { ...current, [sequenceId]: { ...existing, ...updates } };
    });
  };

  const handleSaveSequenceDraft = async (sequence: LegalNumberingSequence) => {
    const persisted = sequences.find((item) => item.id === sequence.id);
    if (!persisted) return;
    if (!sequence.series.trim()) {
      showToast('Η σειρά δεν μπορεί να είναι κενή. Χρησιμοποιήστε 0 μόνο για ρητή σειρά χωρίς πρόθεμα.', 'warning');
      return;
    }
    if (!Number.isInteger(sequence.next_aa) || sequence.next_aa < persisted.next_aa) {
      showToast(
        `Το «Επόμενο» μπορεί μόνο να αυξηθεί. Η αποθηκευμένη τιμή είναι ${persisted.next_aa}.`,
        'warning',
      );
      return;
    }
    try {
      await saveSequence.mutateAsync(sequence);
      showToast(`Η σειρά «${sequence.series}» αποθηκεύτηκε με επόμενο ${sequence.next_aa}.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε η σειρά.', 'error');
    }
  };

  const handleArchiveOrderLink = async (
    record: LegalArchiveRecord,
    link: {
      orderId: string;
      mode: LegalOrderLinkMode;
      allocations: LegalOrderLineAllocation[];
    } | null,
  ) => {
    try {
      await linkLegalArchiveOrder.mutateAsync({
        source: record.source,
        documentId: record.id,
        orderId: link?.orderId || null,
        userName,
        method: 'manual',
        linkMode: link?.mode || 'whole',
        allocations: link?.allocations || [],
      });
      showToast(
        link
          ? link.mode === 'partial'
            ? 'Οι επιλεγμένες γραμμές της παραγγελίας συνδέθηκαν με το παραστατικό.'
            : 'Ολόκληρη η παραγγελία συνδέθηκε με το παραστατικό.'
          : 'Η σύνδεση παραγγελίας αφαιρέθηκε.',
        'success',
      );
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε η σύνδεση παραγγελίας.', 'error');
    }
  };

  const handleArchiveSellerLink = async (record: LegalArchiveRecord, sellerId: string | null) => {
    if (record.source !== 'legal') return;
    try {
      await linkLegalArchiveSeller.mutateAsync({
        documentId: record.id,
        sellerId,
        userName,
        method: 'manual',
      });
      showToast(sellerId ? 'Ο Πλασιέ συνδέθηκε με το Δελτίο Αποστολής.' : 'Η σύνδεση Πλασιέ αφαιρέθηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε η σύνδεση Πλασιέ.', 'error');
    }
  };

  const handleArchiveVatLookup = async (
    vatNumber: string,
    referenceDate?: string,
  ): Promise<AadeVatRegistryResult> => legalRepository.lookupVatRegistry({
    vatNumber,
    requestedByVat: settingsDraft.issuer.vat_number,
    referenceDate: referenceDate || undefined,
  });

  const handleApplyArchiveVatResult = async (
    record: LegalArchiveRecord,
    result: AadeVatRegistryResult,
  ) => {
    const customer = record.customerMatch.customer;
    const editableLegal = record.source === 'legal'
      && ['draft', 'failed'].includes((record.document as LegalDocument).status);
    const editableProforma = record.source === 'proforma'
      && (record.document as ProformaDocument).status === 'draft';
    if (!customer && !editableLegal && !editableProforma) {
      showToast(
        'Το εκδοθέν παραστατικό παραμένει αμετάβλητο. Συνδέστε πρώτα πελάτη για να ενημερωθεί το πελατολόγιο.',
        'info',
      );
      return;
    }

    const ok = await confirm({
      title: 'Εφαρμογή επίσημων στοιχείων ΑΑΔΕ',
      message: [
        `Επωνυμία: ${result.businessName || '—'}`,
        `ΑΦΜ: ${result.vatNumber}`,
        `Έδρα: ${[result.address.street, result.address.number, result.address.postalCode, result.address.city].filter(Boolean).join(', ') || '—'}`,
        '',
        customer ? `Θα ενημερωθεί ο πελάτης «${customer.full_name}».` : '',
        editableLegal || editableProforma
          ? 'Θα ενημερωθεί και το επεξεργάσιμο πρόχειρο.'
          : 'Το εκδοθέν παραστατικό δεν θα μεταβληθεί.',
      ].filter(Boolean).join('\n'),
      confirmText: 'Εφαρμογή',
      cancelText: 'Άκυρο',
    });
    if (!ok) return;

    const address = [
      result.address.street,
      result.address.number,
      result.address.postalCode,
      result.address.city,
    ].filter(Boolean).join(', ');
    const counterpart = {
      ...record.document.counterpart,
      vat_number: result.vatNumber || record.document.counterpart.vat_number,
      name: result.businessName || record.document.counterpart.name,
      address: {
        ...record.document.counterpart.address,
        street: result.address.street || record.document.counterpart.address?.street,
        number: result.address.number || record.document.counterpart.address?.number,
        postal_code: result.address.postalCode || record.document.counterpart.address?.postal_code,
        city: result.address.city || record.document.counterpart.address?.city,
      },
    };

    try {
      if (customer) {
        await ordersRepository.updateCustomer(customer.id, {
          ...customer,
          full_name: result.businessName || customer.full_name,
          vat_number: result.vatNumber || customer.vat_number,
          address: address || customer.address,
        });
      }
      if (editableLegal) {
        await legalRepository.saveDraft(
          { ...(record.document as LegalDocument), counterpart },
          record.lines as LegalDocumentLine[],
        );
      } else if (editableProforma) {
        await legalRepository.saveProforma(
          { ...(record.document as ProformaDocument), counterpart },
          record.lines as ProformaDocumentLine[],
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: legalKeys.documents() }),
        queryClient.invalidateQueries({ queryKey: legalKeys.proformas() }),
      ]);
      showToast('Τα επίσημα στοιχεία εφαρμόστηκαν χωρίς αλλαγή εκδοθέντος παραστατικού.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν εφαρμόστηκαν τα στοιχεία Μητρώου.', 'error');
    }
  };

  const handleArchiveAliasSave = async (
    record: LegalArchiveRecord,
    match: LegalArchiveLineMatch,
    productSku: string,
    variantSuffix: string,
  ) => {
    if (!match.rawItemCode) return;
    const externalSource = record.source === 'legal'
      ? ((record.document as LegalDocument).external_source || 'ilios')
      : 'proforma';
    const now = new Date().toISOString();
    const alias: LegalExternalItemAlias = {
      id: match.alias?.id || crypto.randomUUID(),
      external_source: externalSource,
      normalized_item_code: normalizeExternalItemCode(match.rawItemCode),
      raw_item_code: match.rawItemCode,
      product_sku: productSku,
      variant_suffix: variantSuffix || null,
      created_by: match.alias?.created_by || userName,
      updated_by: userName,
      created_at: match.alias?.created_at || now,
      updated_at: now,
    };
    try {
      await saveLegalItemAlias.mutateAsync({ alias, userName });
      showToast(`Ο κωδικός ${match.rawItemCode} θα αναγνωρίζεται ως ${productSku}${variantSuffix || ''}.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε η αντιστοίχιση κωδικού.', 'error');
    }
  };

  const handleArchiveAliasDelete = async (alias: LegalExternalItemAlias) => {
    const ok = await confirm({
      title: 'Αφαίρεση μαθημένης αντιστοίχισης',
      message: `Να αφαιρεθεί η αντιστοίχιση ${alias.raw_item_code} → ${alias.product_sku}${alias.variant_suffix || ''};`,
      confirmText: 'Αφαίρεση',
      cancelText: 'Πίσω',
      isDestructive: true,
    });
    if (!ok) return;
    try {
      await deleteLegalItemAlias.mutateAsync({ alias, userName });
      showToast('Η μαθημένη αντιστοίχιση αφαιρέθηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αφαιρέθηκε η αντιστοίχιση.', 'error');
    }
  };

  const renderProformaArchiveSection = () => (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-black text-slate-900">Αρχείο προτιμολογίων</h2>
            <div className="text-sm font-medium text-slate-500">{filteredProformas.length} από {proformas.length} εγγραφές</div>
          </div>
          <label className="relative w-full md:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={proformaSearch}
              onChange={(event) => setProformaSearch(event.target.value)}
              placeholder="Αναζήτηση προτιμολογίων ή τιμολογίου"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {([
            ['all', 'Όλα', proformaArchiveStats.all, 'border-slate-200 bg-slate-50 text-slate-700'],
            ['draft', 'Πρόχειρα', proformaArchiveStats.draft, 'border-sky-200 bg-sky-50 text-sky-700'],
            ['converted', 'Μετατράπηκαν', proformaArchiveStats.converted, 'border-emerald-200 bg-emerald-50 text-emerald-700'],
            ['void', 'Ακυρωμένα', proformaArchiveStats.void, 'border-slate-200 bg-slate-100 text-slate-500'],
          ] as const).map(([id, label, count, className]) => (
            <button
              key={id}
              type="button"
              onClick={() => setProformaStatusFilter(id)}
              className={`rounded-xl border px-3 py-2 text-left transition ${proformaStatusFilter === id ? 'ring-2 ring-sky-300' : 'hover:brightness-95'} ${className}`}
            >
              <div className="text-[10px] font-black uppercase tracking-wide">{label}</div>
              <div className="text-xl font-black">{count}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Προτιμολόγιο</th>
              <th className="px-4 py-3">Πελάτης</th>
              <th className="px-4 py-3">Κατάσταση</th>
              <th className="px-4 py-3">Σύνδεση</th>
              <th className="px-4 py-3 text-right">Αξία</th>
              <th className="px-4 py-3 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {loadingProformas ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500"><Loader2 size={24} className="mx-auto animate-spin" /></td></tr>
            ) : filteredProformas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {proformas.length === 0
                    ? 'Δεν υπάρχουν προτιμολόγια. Δημιουργήστε ένα από την καρτέλα Δημιουργία.'
                    : 'Δεν βρέθηκαν προτιμολόγια με τα τρέχοντα φίλτρα.'}
                </td>
              </tr>
            ) : filteredProformas.map((document) => {
              const linkedInvoice = document.converted_legal_document_id
                ? legalDocumentById.get(document.converted_legal_document_id)
                : null;
              return (
                <tr key={document.id} className="border-b border-slate-100 bg-white align-top">
                  <td className="px-4 py-3">
                    <div className="font-black text-slate-900">{getLegalDocumentDisplayNumber(document)}</div>
                    <div className="text-xs font-bold text-sky-700">Δεν αποστέλλεται στη myDATA</div>
                    {document.issue_date && <div className="mt-1 text-xs text-slate-500">{document.issue_date}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-800">{document.counterpart.name || '-'}</div>
                    <div className="text-xs font-mono text-slate-500">ΑΦΜ {document.counterpart.vat_number || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-black ${proformaStatusClass[document.status]}`}>{proformaStatusLabel[document.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {linkedInvoice ? (
                      <button
                        type="button"
                        onClick={() => void handleOpenLegalDocument(linkedInvoice)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-left text-xs font-black text-emerald-800 hover:bg-emerald-100"
                      >
                        {getLegalDocumentDisplayNumber(linkedInvoice)}
                        <div className="font-medium text-emerald-600">{statusLabel[linkedInvoice.status]}</div>
                      </button>
                    ) : document.status === 'draft' ? (
                      <span className="text-xs font-medium text-slate-400">Έτοιμο για μετατροπή</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-black">{money(document.totals.gross)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <ActionButton variant="secondary" onClick={() => void handleEditProforma(document)} disabled={document.status === 'void'}>
                        <Edit3 size={16} /> Άνοιγμα
                      </ActionButton>
                      <ActionButton variant="secondary" onClick={() => void handlePrintProforma(document)} disabled={!canPrintProforma(document)}>
                        <Printer size={16} /> Εκτύπωση
                      </ActionButton>
                      <ActionButton variant="secondary" onClick={() => void openConvertModal(document)} disabled={document.status !== 'draft' || saveDraft.isPending}>
                        <Copy size={16} /> Μετατροπή
                      </ActionButton>
                      <ActionButton variant="danger" onClick={() => void handleVoidProforma(document)} disabled={document.status !== 'draft'}>
                        <Ban size={16} /> Ακύρωση
                      </ActionButton>
                      <ActionButton
                        variant="danger"
                        onClick={() => void handleDeleteProforma(document)}
                        disabled={deleteProforma.isPending}
                      >
                        <Trash2 size={16} /> Διαγραφή
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderDocumentRow = (document: LegalDocument) => (
    <tr key={document.id} className="border-b border-slate-100 bg-white align-top">
      <td className="px-4 py-3">
        <div className="font-black text-slate-900">{getLegalDocumentDisplayNumber(document)}</div>
        <div className="text-xs font-medium text-slate-500">{LEGAL_DOCUMENT_KIND_LABELS[document.document_kind]} | Τύπος ΑΑΔΕ {document.aade_document_type}</div>
      </td>
      <td className="px-4 py-3">
        <div className="font-bold text-slate-800">{document.counterpart.name || '-'}</div>
        <div className="text-xs font-mono text-slate-500">ΑΦΜ {document.counterpart.vat_number || '-'}</div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-black ${statusClass[document.status]}`}>{statusLabel[document.status]}</span>
        {document.last_error && <div className="mt-2 max-w-sm rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{document.last_error}</div>}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="font-mono text-xs">{document.aade_mark || '-'}</div>
        <div className="mt-1 text-xs text-slate-500">{document.qr_url ? 'QR αποθηκευμένο' : 'Χωρίς QR'}</div>
      </td>
      <td className="px-4 py-3 text-right font-black">{money(document.totals.gross)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton
            variant="secondary"
            onClick={() => handlePrint(document)}
            disabled={!canPrintLegalDocument(document)}
            title={isOfficialLegalDocumentPrint(document) ? 'Εκτύπωση νόμιμου παραστατικού με MARK/QR' : 'Πρόχειρη εκτύπωση χωρίς MARK/QR'}
          >
            <Printer size={16} /> {isOfficialLegalDocumentPrint(document) ? 'Εκτύπωση' : 'Εκτύπωση πρόχειρου'}
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => void handleOpenLegalDocument(document)}>
            <Edit3 size={16} /> Άνοιγμα
          </ActionButton>
          {document.status === 'draft' && (
            <ActionButton onClick={() => void handleSubmitLegalDocument(document)} disabled={submitDocument.isPending}>
              {submitDocument.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Υποβολή στη myDATA
            </ActionButton>
          )}
          {document.status === 'failed' && (
            <ActionButton variant="quiet" onClick={() => void handleSubmitLegalDocument(document)} disabled={submitDocument.isPending}>
              {submitDocument.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Επανάληψη
            </ActionButton>
          )}
          {document.status === 'issued' && (
            <ActionButton variant="danger" onClick={() => handleCancel(document)} disabled={cancelDocument.isPending}>
              <Ban size={16} /> Ακύρωση myDATA
            </ActionButton>
          )}
          <ActionButton
            variant="danger"
            onClick={() => void handleDeleteLegalDocument(document)}
            disabled={deleteLegalDocument.isPending}
            title="Οριστική διαγραφή από Ilios"
          >
            <Trash2 size={16} /> Διαγραφή
          </ActionButton>
        </div>
      </td>
    </tr>
  );

  const renderArchiveTabLegacy = () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <span className="font-black">Αρχείο</span> — όλα τα πρόχειρα, εκδοθέντα και ακυρωμένα παραστατικά και προτιμολόγια.
        {' '}Εδώ βλέπετε MARK, QR και ενέργειες (εκτύπωση, ακύρωση myDATA, διαγραφή από Ilios).
      </div>
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-black text-slate-900">Αρχείο παραστατικών</h2>
          <div className="text-sm font-medium text-slate-500">{filteredArchive.length} εγγραφές</div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
          <ActionButton onClick={() => { setDraftBundle(null); setProformaBundle(null); setActiveTab('new'); }}>
            <Plus size={16} /> Νέο παραστατικό
          </ActionButton>
        <label className="relative w-full sm:min-w-[14rem] md:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={archiveSearch}
            onChange={(event) => setArchiveSearch(event.target.value)}
            placeholder="Αναζήτηση με πελάτη, MARK, αριθμό"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Παραστατικό</th>
              <th className="px-4 py-3">Πελάτης</th>
              <th className="px-4 py-3">Κατάσταση</th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1">MARK / QR <InfoTip text="MARK είναι ο μοναδικός αριθμός που δίνει η ΑΑΔΕ μετά την αποδοχή. Το QR είναι ο σύνδεσμος ελέγχου του νόμιμου παραστατικού." /></span>
              </th>
              <th className="px-4 py-3 text-right">Αξία</th>
              <th className="px-4 py-3 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {loadingDocuments ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500"><Loader2 size={24} className="mx-auto animate-spin" /></td></tr>
            ) : filteredArchive.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Δεν υπάρχουν παραστατικά.</td></tr>
            ) : filteredArchive.map(renderDocumentRow)}
          </tbody>
        </table>
      </div>
    </section>
    {renderProformaArchiveSection()}
    </div>
  );

  const renderArchiveTab = () => (
    <LegalArchiveWorkspace
      records={archiveRecords}
      customers={customers}
      products={products}
      sellers={sellers}
      registryLookupReady={registryConnectionStatus.verified}
      loading={
        loadingDocuments
        || loadingProformas
        || loadingArchiveLines
        || loadingArchiveProformaLines
        || loadingLegalItemAliases
        || loadingSellers
      }
      initialQuery={archiveSearch}
      mutating={
        submitDocument.isPending
        || cancelDocument.isPending
        || deleteLegalDocument.isPending
        || deleteProforma.isPending
        || voidProforma.isPending
        || saveDraft.isPending
        || saveLegalItemAlias.isPending
        || deleteLegalItemAlias.isPending
        || linkLegalArchiveCustomer.isPending
        || linkLegalArchiveOrder.isPending
        || linkLegalArchiveSeller.isPending
      }
      onCreate={() => {
        setDraftBundle(null);
        setProformaBundle(null);
        setActiveTab('new');
      }}
      onOpenLegal={(document) => void handleOpenLegalDocument(document)}
      onPrintLegal={(document) => void handlePrint(document)}
      onSubmitLegal={(document) => void handleSubmitLegalDocument(document)}
      onCancelLegal={(document) => void handleCancel(document)}
      onDeleteLegal={(document) => void handleDeleteLegalDocument(document)}
      onEditProforma={(document) => void handleEditProforma(document)}
      onPrintProforma={(document) => void handlePrintProforma(document)}
      onConvertProforma={(document) => void openConvertModal(document)}
      onVoidProforma={(document) => void handleVoidProforma(document)}
      onDeleteProforma={(document) => void handleDeleteProforma(document)}
      onLinkCustomer={(record, customerId) => void handleArchiveCustomerLink(record, customerId)}
      onLinkOrder={(record, link) => void handleArchiveOrderLink(record, link)}
      onLinkSeller={(record, sellerId) => void handleArchiveSellerLink(record, sellerId)}
      onLookupVat={handleArchiveVatLookup}
      onApplyVat={(record, result) => void handleApplyArchiveVatResult(record, result)}
      onSaveAlias={(record, match, productSku, variantSuffix) =>
        void handleArchiveAliasSave(record, match, productSku, variantSuffix)}
      onDeleteAlias={(alias) => void handleArchiveAliasDelete(alias)}
    />
  );

  const renderSyncTab = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,460px)_1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <RefreshCw size={18} className="text-emerald-600" />
          <h2 className="font-black text-slate-900">Συγχρονισμός παλιών παραστατικών</h2>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          Φέρνει παραστατικά που έχουν ήδη εκδοθεί ή ακυρωθεί με τα ίδια AADE credentials. Δεν καταναλώνει σειρές· μετά τον συγχρονισμό προτείνεται ευθυγράμμιση του «Επόμενου» με το Αρχείο.
        </div>
        <div className="mt-4 space-y-4">
          <TextInput label="Από ημερομηνία" type="date" value={syncDraft.dateFrom} onChange={(value) => setSyncDraft((current) => ({ ...current, dateFrom: value }))} help="Η εφαρμογή μετατρέπει αυτόματα σε μορφή ΑΑΔΕ (ηη/μμ/εεεε)." />
          <TextInput label="Έως ημερομηνία" type="date" value={syncDraft.dateTo} onChange={(value) => setSyncDraft((current) => ({ ...current, dateTo: value }))} help="Αν δεν υπάρχουν παραστατικά στο διάστημα, ο συγχρονισμός ολοκληρώνεται κανονικά με 0 εισαγωγές." />
          <TextInput label="Από MARK" value={syncDraft.markFrom} onChange={(value) => setSyncDraft((current) => ({ ...current, markFrom: value }))} help="Προαιρετικό σημείο εκκίνησης της ΑΑΔΕ. Αφήστε 0 για συγχρονισμό με βάση ημερομηνίες." />
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
              Προαιρετικά φίλτρα ΑΑΔΕ
              <InfoTip text="Χρησιμοποιήστε τα μόνο όταν θέλετε να περιορίσετε τον συγχρονισμό σε συγκεκριμένο ΑΦΜ, τύπο παραστατικού ή μέχρι συγκεκριμένο MARK." />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput label="ΑΦΜ οντότητας" value={syncDraft.entityVatNumber} onChange={(value) => setSyncDraft((current) => ({ ...current, entityVatNumber: normalizeVatNumber(value) }))} help="Για λογιστή/εκπρόσωπο: ο ΑΦΜ της επιχείρησης για την οποία γίνεται η αναζήτηση. Συνήθως μένει κενό." />
              <TextInput label="ΑΦΜ αντισυμβαλλόμενου" value={syncDraft.receiverVatNumber} onChange={(value) => setSyncDraft((current) => ({ ...current, receiverVatNumber: normalizeVatNumber(value) }))} help="Φέρνει μόνο παραστατικά για συγκεκριμένο πελάτη/λήπτη." />
              <SelectInput label="Τύπος παραστατικού" value={syncDraft.invType} onChange={(value) => setSyncDraft((current) => ({ ...current, invType: value }))} help="Επίσημος τύπος myDATA. Κενό σημαίνει όλοι οι τύποι.">
                <option value="">Όλοι</option>
                <option value="1.1">Τιμολόγιο Πώλησης (1.1)</option>
                <option value="5.1">Πιστωτικό Συσχετιζόμενο (5.1)</option>
                <option value="5.2">Πιστωτικό Μη Συσχετιζόμενο (5.2)</option>
                <option value="9.3">Δελτίο Αποστολής (9.3)</option>
              </SelectInput>
              <TextInput label="Έως MARK" value={syncDraft.maxMark} onChange={(value) => setSyncDraft((current) => ({ ...current, maxMark: value.replace(/\D/g, '') }))} help="Ανώτερο MARK που θα ζητηθεί από την ΑΑΔΕ. Κενό σημαίνει χωρίς άνω όριο." />
            </div>
          </div>
          <SelectInput label="Περιβάλλον" value={settingsDraft.environment} onChange={handleEnvironmentChange} help="Δοκιμές για ελέγχους, Παραγωγή για πραγματικά παραστατικά.">
            <option value="dev">myDATA Δοκιμών</option>
            <option value="prod">myDATA Παραγωγής</option>
          </SelectInput>
          <ActionButton onClick={handleSyncTransmitted} disabled={syncTransmittedDocuments.isPending}>
            {syncTransmittedDocuments.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Συγχρονισμός
          </ActionButton>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="font-black text-slate-900">Ιστορικό συγχρονισμών</h2>
            <div className="text-sm font-medium text-slate-500">{syncRuns.length} εκτελέσεις</div>
          </div>
          <ActionButton
            variant="secondary"
            onClick={async () => {
              if (!syncRuns.length) return;
              const ok = await confirm({
                title: 'Διαγραφή ιστορικού συγχρονισμών',
                message: 'Θα διαγραφούν όλες οι εγγραφές ιστορικού συγχρονισμού AADE από την εφαρμογή. Τα ήδη εισαγμένα παραστατικά δεν επηρεάζονται.',
                confirmText: 'Διαγραφή ιστορικού',
                cancelText: 'Πίσω',
                isDestructive: true,
              });
              if (!ok) return;
              try {
                await clearSyncRuns.mutateAsync();
                showToast('Το ιστορικό συγχρονισμών διαγράφηκε.', 'success');
              } catch (error: any) {
                showToast(error?.message || 'Δεν διαγράφηκε το ιστορικό συγχρονισμών.', 'error');
              }
            }}
            disabled={!syncRuns.length || clearSyncRuns.isPending}
          >
            {clearSyncRuns.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Διαγραφή ιστορικού
          </ActionButton>
        </div>
        <div className="divide-y divide-slate-100">
          {syncRuns.length === 0 ? (
            <div className="p-8 text-center text-sm font-medium text-slate-500">Δεν έχει γίνει ακόμη συγχρονισμός.</div>
          ) : syncRuns.map((run) => (
            <div key={run.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-lg border px-2 py-1 text-xs font-black ${run.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : run.status === 'failed' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {run.status === 'success' ? 'Ολοκληρώθηκε' : run.status === 'failed' ? 'Απέτυχε' : 'Μερικό αποτέλεσμα'}
                  </span>
                  <span className="text-sm font-black text-slate-900">{run.environment.toUpperCase()}</span>
                  <span className="text-xs font-medium text-slate-500">{new Date(run.started_at).toLocaleString('el-GR')}</span>
                </div>
                <div className="mt-1 text-sm font-medium text-slate-600">
                  {run.date_from || '-'} έως {run.date_to || '-'} | MARK από {run.mark_from || '0'}
                </div>
                {run.error_message && <div className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{run.error_message}</div>}
                {(run.next_partition_key || run.next_row_key) && (
                  <div className="mt-2 text-xs font-bold text-slate-500">
                    Υπάρχουν επιπλέον σελίδες από την ΑΑΔΕ. Τα κλειδιά συνέχειας εμφανίζονται στις τεχνικές λεπτομέρειες.
                  </div>
                )}
              </div>
              <div className="text-right text-sm">
                <div className="font-black text-emerald-700">{run.imported_count} νέα</div>
                <div className="font-black text-slate-700">{run.updated_count} ενημερώσεις</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderDeliveryTab = () => (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-black text-slate-900">Διακίνηση</h2>
        <div className="text-sm font-medium text-slate-500">{deliveryDocuments.length} δελτία ή συνδυασμένα παραστατικά</div>
        <p className="mt-2 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">
          Προαιρετική ροή μετά την έκδοση: καταγραφή έναρξης/παράδοσης για παραστατικά με δελτίο διακίνησης.
          Τα απλά τιμολόγια 1.1 δεν χρειάζονται αυτή τη διαδικασία.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {deliveryDocuments.length === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-slate-500">Δεν υπάρχουν παραστατικά διακίνησης.</div>
        ) : deliveryDocuments.map((document) => (
          <div key={document.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black text-slate-900">{getLegalDocumentDisplayNumber(document)}</span>
                <span className={`rounded-lg border px-2 py-1 text-xs font-black ${statusClass[document.status]}`}>{statusLabel[document.status]}</span>
              </div>
              <div className="mt-1 text-sm font-medium text-slate-500">{document.counterpart.name || '-'} | MARK {document.aade_mark || '-'}</div>
              <div className="mt-1 text-xs text-slate-500">
                {document.delivery?.dispatch_date || '-'} {document.delivery?.dispatch_time || ''} | {document.delivery?.carrier_name || 'Ίδια μέσα'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <ActionButton variant="secondary" disabled={document.status !== 'issued'} onClick={() => handleDeliveryAction(document, 'register')}><Truck size={16} /> Έναρξη</ActionButton>
              <ActionButton variant="secondary" disabled={document.status !== 'issued'} onClick={() => handleDeliveryAction(document, 'confirm')}><CheckCircle2 size={16} /> Παραδόθηκε</ActionButton>
              <ActionButton variant="danger" disabled={document.status !== 'issued'} onClick={() => handleDeliveryAction(document, 'failed')}><XCircle size={16} /> Απέτυχε</ActionButton>
              <ActionButton variant="quiet" disabled={document.status !== 'issued'} onClick={() => handleDeliveryAction(document, 'poll')}><RefreshCw size={16} /> Έλεγχος</ActionButton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const renderSettingsTab = () => (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <KeyRound size={18} className="text-emerald-600" />
              <h2 className="font-black text-slate-900">Στοιχεία σύνδεσης ΑΑΔΕ</h2>
            </div>
            <ActionButton variant="quiet" onClick={() => void refetchCredentialStatus()} disabled={loadingCredentialStatus}>
              {loadingCredentialStatus ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Έλεγχος
            </ActionButton>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {(['dev', 'prod'] as LegalEnvironment[]).map((environment) => {
              const status = credentialStatus?.[environment];
              const ready = !!status?.ready;
              return (
                <div key={environment} className={`rounded-lg border px-3 py-2 ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <div className="text-[10px] font-black uppercase">
                    myDATA {environment === 'prod' ? 'Παραγωγής' : 'Δοκιμών'}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-black">
                    {ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    {ready ? 'Έτοιμο' : 'Λείπουν στοιχεία'}
                  </div>
                </div>
              );
            })}
            <div className={`rounded-lg border px-3 py-2 ${
              registryConnectionStatus.verified
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : credentialStatus?.registry?.ready
                  ? 'border-sky-200 bg-sky-50 text-sky-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              <div className="text-[10px] font-black uppercase">Μητρώο ΑΦΜ ΑΑΔΕ</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-black">
                {registryConnectionStatus.verified
                  ? <CheckCircle2 size={16} />
                  : credentialStatus?.registry?.ready
                    ? <Info size={16} />
                    : <AlertTriangle size={16} />}
                {registryConnectionStatus.verified
                  ? 'Σύνδεση επαληθευμένη'
                  : credentialStatus?.registry?.ready
                    ? 'Κωδικοί αποθηκευμένοι'
                    : 'Χρειάζεται ειδικούς κωδικούς'}
              </div>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${credentialStatus?.workerCanStoreSecrets ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              <div className="text-[10px] font-black uppercase">Cloudflare Secrets</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-black">
                {credentialStatus?.workerCanStoreSecrets ? <ShieldCheck size={16} /> : <XCircle size={16} />}
                {credentialStatus?.workerCanStoreSecrets ? 'Μπορεί να αποθηκεύσει' : 'Χρειάζεται ρύθμιση'}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800">
            Τα περιβάλλοντα είναι ανεξάρτητα. Για πραγματική έκδοση αρκεί το myDATA Παραγωγής να εμφανίζεται ως «Έτοιμο»· δεν απαιτείται προηγούμενη έκδοση στο περιβάλλον Δοκιμών.
          </div>

          {missingSecretManager.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Πρώτη ρύθμιση: συμπληρώστε παρακάτω Cloudflare API Token και Account ID μαζί με τα AADE credentials. Αποθηκεύονται μόνο στο Worker, όχι στη βάση ή στον browser.
            </div>
          )}

          {(missingAadeCredentials.length > 0 || missingSecretManager.length > 0) && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="mb-2 flex items-center gap-2 font-black text-slate-800">
                Τι χρειάζεται ακόμη
                <InfoTip text={`Τεχνικά ονόματα μυστικών: ${[...missingAadeCredentials, ...missingSecretManager].join(', ') || 'κανένα'}`} />
              </div>
              <div className="flex flex-wrap gap-2">
                {[...missingAadeCredentials, ...missingSecretManager].map((name) => (
                  <span key={name} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
                    {credentialSecretLabel(name)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!credentialStatus?.workerCanStoreSecrets && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <TextInput
                label="Cloudflare API Token (μία φορά)"
                type="password"
                value={cloudflareBootstrapDraft.apiToken}
                onChange={(value) => setCloudflareBootstrapDraft((current) => ({ ...current, apiToken: value }))}
                help="Χρειάζεται μόνο την πρώτη φορά ώστε το Worker να αποθηκεύσει με ασφάλεια τα μυστικά ΑΑΔΕ."
              />
              <TextInput
                label="Cloudflare Account ID (μία φορά)"
                value={cloudflareBootstrapDraft.accountId}
                onChange={(value) => setCloudflareBootstrapDraft((current) => ({ ...current, accountId: value }))}
                help="Ο λογαριασμός Cloudflare όπου είναι ανεβασμένο το Worker του ERP."
              />
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr_1fr_auto] md:items-end">
            <SelectInput label="Περιβάλλον" value={credentialEnvironment} onChange={(value) => setCredentialEnvironment(value === 'prod' ? 'prod' : 'dev')} help="Δοκιμές για ελέγχους, Παραγωγή για πραγματικά παραστατικά.">
              <option value="dev">myDATA Δοκιμών</option>
              <option value="prod">myDATA Παραγωγής</option>
            </SelectInput>
            <TextInput label="AADE User ID" value={credentialDraft.userId} onChange={(value) => setCredentialDraft((current) => ({ ...current, userId: value }))} help="Το όνομα χρήστη API που εκδίδεται από την ΑΑΔΕ για το myDATA." />
            <TextInput label="Subscription Key" type="password" value={credentialDraft.subscriptionKey} onChange={(value) => setCredentialDraft((current) => ({ ...current, subscriptionKey: value }))} help="Το κλειδί πρόσβασης myDATA. Αποθηκεύεται ως μυστικό στο Cloudflare Worker." />
            <ActionButton onClick={handleSaveAadeCredentials} disabled={saveAadeCredentials.isPending}>
              {saveAadeCredentials.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
            </ActionButton>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <span className={`rounded-lg border px-2 py-1 ${activeCredentialStatus?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              Ενεργό περιβάλλον {settingsDraft.environment === 'prod' ? 'Παραγωγής' : 'Δοκιμών'}: {activeCredentialStatus?.ready ? 'έτοιμο για myDATA' : 'δεν θα επιτρέψει αποστολή'}
            </span>
            <span>Τα credentials δεν εμφανίζονται ξανά μετά την αποθήκευση.</span>
          </div>

          <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-black text-indigo-950">Επίσημος έλεγχος Μητρώου ΑΦΜ</div>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-indigo-800">
                  Είναι ξεχωριστή υπηρεσία από το myDATA. Επιστρέφει ενεργό ή ανενεργό ΑΦΜ, επωνυμία,
                  διακριτικό τίτλο, ΔΟΥ, νομική μορφή, ημερομηνίες έναρξης/διακοπής, έδρα, καθεστώς ΦΠΑ
                  και δραστηριότητες. Η αναζήτηση γίνεται μόνο όταν τη ζητήσει ο χρήστης.
                </p>
              </div>
              <span className={`rounded-lg border px-2 py-1 text-xs font-black ${
                registryConnectionStatus.verified
                  ? 'border-emerald-200 bg-white text-emerald-700'
                  : credentialStatus?.registry?.ready
                    ? 'border-sky-200 bg-white text-sky-700'
                    : 'border-amber-200 bg-white text-amber-800'
              }`}>
                {registryConnectionStatus.verified
                  ? 'Επαληθευμένο'
                  : credentialStatus?.registry?.ready
                    ? 'Αναμένει έλεγχο σύνδεσης'
                    : 'Δεν έχει ρυθμιστεί'}
              </span>
            </div>
            {missingRegistryCredentials.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {missingRegistryCredentials.map((name) => (
                  <span key={name} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-bold text-amber-800">
                    {credentialSecretLabel(name)}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
              <TextInput
                label="Όνομα χρήστη ειδικών κωδικών"
                value={registryCredentialDraft.username}
                onChange={(value) => setRegistryCredentialDraft((current) => ({ ...current, username: value }))}
                help="Ο ειδικός κωδικός της υπηρεσίας «Αναζήτηση Βασικών Στοιχείων Μητρώου Επιχειρήσεων»."
              />
              <TextInput
                label="Κωδικός ειδικών κωδικών"
                type="password"
                value={registryCredentialDraft.password}
                onChange={(value) => setRegistryCredentialDraft((current) => ({ ...current, password: value }))}
                help="Δεν είναι ο κωδικός TAXISnet ούτε το Subscription Key του myDATA."
              />
              <ActionButton
                onClick={handleSaveAadeRegistryCredentials}
                disabled={saveAadeRegistryCredentials.isPending}
              >
                {saveAadeRegistryCredentials.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Save size={16} />}
                Αποθήκευση
              </ActionButton>
              <ActionButton
                variant="secondary"
                onClick={() => void handleTestAadeRegistryConnection()}
                disabled={!credentialStatus?.registry?.ready}
                title="Κάνει μία ρητή αναζήτηση του ΑΦΜ της επιχείρησης για να επαληθεύσει τους ειδικούς κωδικούς."
              >
                <ShieldCheck size={16} />
                Έλεγχος σύνδεσης
              </ActionButton>
            </div>
            {registryConnectionStatus.message && (
              <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${
                registryConnectionStatus.verified
                  ? 'border-emerald-200 bg-white text-emerald-700'
                  : 'border-amber-200 bg-white text-amber-800'
              }`}>
                {registryConnectionStatus.message}
                {registryConnectionStatus.verifiedAt
                  ? ` · Τελευταία επαλήθευση ${new Date(registryConnectionStatus.verifiedAt).toLocaleString('el-GR')}`
                  : ''}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-600" /><h2 className="font-black text-slate-900">Εκδότης / ΑΑΔΕ</h2></div>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectInput label="Περιβάλλον" value={settingsDraft.environment} onChange={handleEnvironmentChange} help="Το ενεργό περιβάλλον που θα χρησιμοποιείται για αποστολή και συγχρονισμό.">
              <option value="dev">myDATA Δοκιμών</option>
              <option value="prod">myDATA Παραγωγής</option>
            </SelectInput>
            <TextInput label="ΑΦΜ Εκδότη" value={settingsDraft.issuer.vat_number || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, vat_number: normalizeVatNumber(value) } }))} help="Πρέπει να είναι ο πραγματικός ΑΦΜ της εγγραφής API myDATA (ίδιος με το αναγνωριστικό χρήστη ΑΑΔΕ). Το περιβάλλον Δοκιμών δεν δέχεται πλασματικούς αριθμούς." />
            <TextInput label="Επωνυμία" value={settingsDraft.issuer.business_name || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, business_name: value, name: value } }))} />
            <TextInput label="Υποκατάστημα" type="number" value={settingsDraft.issuer.branch ?? 0} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, branch: Number(value) || 0 } }))} help="0 για έδρα. Άλλος αριθμός μόνο αν έχει δηλωθεί υποκατάστημα στην ΑΑΔΕ." />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <TextInput label="Οδός" value={settingsDraft.issuer.address?.street || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, address: { ...(current.issuer.address || {}), street: value } } }))} />
            <TextInput label="Αριθμός" value={settingsDraft.issuer.address?.number || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, address: { ...(current.issuer.address || {}), number: value } } }))} />
            <TextInput label="Τ.Κ." value={settingsDraft.issuer.address?.postal_code || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, address: { ...(current.issuer.address || {}), postal_code: value } } }))} />
            <TextInput label="Πόλη" value={settingsDraft.issuer.address?.city || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, address: { ...(current.issuer.address || {}), city: value } } }))} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <TextInput label="Διακριτικός τίτλος" value={settingsDraft.issuer.trade_name || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, trade_name: value } }))} />
            <TextInput label="ΔΟΥ" value={settingsDraft.issuer.doy || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, doy: value } }))} help="Μπορεί να συμπληρωθεί από τον επίσημο έλεγχο Μητρώου." />
            <TextInput label="Νομική μορφή" value={settingsDraft.issuer.legal_form || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, legal_form: value } }))} />
            <TextInput label="Αριθμός ΓΕΜΗ" value={settingsDraft.issuer.gemi || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, gemi: value } }))} help="Συμπληρώνεται χειροκίνητα· δεν επιστρέφεται από το Μητρώο ΑΑΔΕ." />
          </div>
          <div className="mt-4">
            <TextInput label="Κύρια δραστηριότητα" value={settingsDraft.issuer.activity || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, activity: value } }))} help="Προαιρετικό στοιχείο εκτύπωσης. Μπορεί να συμπληρωθεί από το Μητρώο ΑΑΔΕ." />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <TextInput label="Τηλέφωνο" value={settingsDraft.issuer.phone || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, phone: value } }))} />
            <TextInput label="Email" value={settingsDraft.issuer.email || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, email: value } }))} />
            <SelectInput label="Προεπιλογή πληρωμής" value={settingsDraft.default_payment_method} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_payment_method: Number(value) }))}>
              {PAYMENT_METHOD_CODES.map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
            </SelectInput>
            <VatExemptionCategorySelect
              label="Προεπιλογή αιτίας απαλλαγής ΦΠΑ"
              value={settingsDraft.default_vat_exemption_category}
              onChange={(value) => setSettingsDraft((current) => ({ ...current, default_vat_exemption_category: value }))}
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <SelectInput label="Προεπιλογή πώλησης" value={settingsDraft.default_income_classification_type} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_income_classification_type: value, inhouse_income_classification_type: value, imported_income_classification_type: value }))} help="Ο χαρακτηρισμός εσόδου που θα μπαίνει αυτόματα στις γραμμές. Ο κωδικός ΑΑΔΕ φαίνεται σε παρένθεση.">
              {!incomeTypeOptions.some((option) => option.value === settingsDraft.default_income_classification_type) && (
                <option value={settingsDraft.default_income_classification_type}>{settingsDraft.default_income_classification_type}</option>
              )}
              {incomeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectInput>
            <SelectInput label="Προϊόντα δικής μας παραγωγής" value={settingsDraft.inhouse_income_classification_category} onChange={(value) => setSettingsDraft((current) => ({ ...current, inhouse_income_classification_category: value }))} help="Ποια κατηγορία εσόδου θα χρησιμοποιείται για προϊόντα που παράγονται εσωτερικά. Ο κωδικός ΑΑΔΕ φαίνεται σε παρένθεση.">
              {!incomeCategoryOptions.some((option) => option.value === settingsDraft.inhouse_income_classification_category) && (
                <option value={settingsDraft.inhouse_income_classification_category}>{settingsDraft.inhouse_income_classification_category}</option>
              )}
              {incomeCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectInput>
            <SelectInput label="Εμπορεύματα / εισαγόμενα" value={settingsDraft.imported_income_classification_category} onChange={(value) => setSettingsDraft((current) => ({ ...current, imported_income_classification_category: value }))} help="Ποια κατηγορία εσόδου θα χρησιμοποιείται για εμπορεύματα ή εισαγόμενα προϊόντα. Ο κωδικός ΑΑΔΕ φαίνεται σε παρένθεση.">
              {!incomeCategoryOptions.some((option) => option.value === settingsDraft.imported_income_classification_category) && (
                <option value={settingsDraft.imported_income_classification_category}>{settingsDraft.imported_income_classification_category}</option>
              )}
              {incomeCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectInput>
            <TextInput label="Σκοπός Διακίνησης" type="number" value={settingsDraft.default_move_purpose} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_move_purpose: Number(value) || 1 }))} help="Κωδικός σκοπού διακίνησης της ΑΑΔΕ. Συνήθως 1 για πώληση." />
          </div>
          <div className="mt-5">
            <ActionButton onClick={handleSaveSettings} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση ρυθμίσεων
            </ActionButton>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-black text-slate-900">Σειρές και αρίθμηση</h2>
            <ActionButton variant="secondary" onClick={() => void promptLegalNumberingAlignment()} disabled={saveSequence.isPending}>
              <RefreshCw size={16} /> Ευθυγράμμιση με Αρχείο
            </ActionButton>
          </div>
          <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
            Το «Επόμενο» ενημερώνεται μόνο με επιβεβαίωση, βάσει του μεγαλύτερου αριθμού στο Αρχείο (συμπεριλαμβανομένων συγχρονισμένων από PrismaNET). Ποτέ δεν μειώνεται αυτόματα.
          </div>
          <div className="space-y-3">
            {sequences.map((sequence) => {
              const draft = sequenceDrafts[sequence.id] || sequence;
              const hasHistory = sequence.next_aa > 1 || legalDocuments.some((document) =>
                document.document_kind === sequence.document_kind
                && document.aade_document_type === sequence.aade_document_type
                && normalizeLegalSeriesKey(document.series) === normalizeLegalSeriesKey(sequence.series)
                && !!document.aa,
              );
              const changed = JSON.stringify(draft) !== JSON.stringify(sequence);
              return (
                <div key={sequence.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_120px_120px_120px_auto] md:items-end">
                  <div>
                    <div className="text-sm font-black text-slate-900">{LEGAL_DOCUMENT_KIND_LABELS[sequence.document_kind]}</div>
                    <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                      Τύπος ΑΑΔΕ {sequence.aade_document_type}
                      <InfoTip text="Ο επίσημος τύπος παραστατικού myDATA για αυτή τη σειρά." />
                    </div>
                    {hasHistory && (
                      <div className="mt-1 text-[11px] font-bold text-slate-500">
                        Η ονομασία έχει κλειδωθεί επειδή η σειρά έχει χρησιμοποιηθεί.
                      </div>
                    )}
                  </div>
                  <TextInput
                    label="Σειρά"
                    value={draft.series}
                    disabled={hasHistory}
                    onChange={(value) => updateSequenceDraft(sequence.id, { series: value })}
                    help={hasHistory ? 'Για νέο namespace δημιουργείται νέα σειρά.' : 'Το πρόθεμα που θα φαίνεται στο παραστατικό.'}
                  />
                  <TextInput
                    label="Επόμενο"
                    type="number"
                    min={sequence.next_aa}
                    value={draft.next_aa}
                    onChange={(value) => updateSequenceDraft(sequence.id, {
                      next_aa: Math.max(sequence.next_aa, Math.trunc(Number(value) || sequence.next_aa)),
                    })}
                    help={`Δεν μπορεί να γίνει μικρότερο από ${sequence.next_aa}.`}
                  />
                  <SelectInput
                    label="Ενεργό"
                    value={draft.is_active ? 'yes' : 'no'}
                    onChange={(value) => updateSequenceDraft(sequence.id, { is_active: value === 'yes' })}
                  >
                    <option value="yes">Ναι</option>
                    <option value="no">Όχι</option>
                  </SelectInput>
                  <ActionButton
                    variant={changed ? 'primary' : 'secondary'}
                    disabled={!changed || saveSequence.isPending}
                    onClick={() => void handleSaveSequenceDraft(draft)}
                    title="Η βάση απορρίπτει κάθε μείωση του επόμενου αριθμού."
                  >
                    {saveSequence.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Αποθήκευση
                  </ActionButton>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-black text-slate-900">Μεταφορείς</h2>
        <div className="space-y-3">
          <TextInput label="Όνομα" value={newCarrier.name} onChange={(value) => setNewCarrier((current) => ({ ...current, name: value }))} />
          <TextInput label="ΑΦΜ" value={newCarrier.vat_number} onChange={(value) => setNewCarrier((current) => ({ ...current, vat_number: value }))} />
          <TextInput label="Όχημα" value={newCarrier.vehicle_number} onChange={(value) => setNewCarrier((current) => ({ ...current, vehicle_number: value }))} />
          <TextInput label="Τηλέφωνο" value={newCarrier.phone} onChange={(value) => setNewCarrier((current) => ({ ...current, phone: value }))} />
          <ActionButton variant="secondary" onClick={handleAddCarrier} disabled={saveCarrier.isPending || !newCarrier.name.trim()}>
            <Plus size={16} /> Προσθήκη
          </ActionButton>
        </div>
        <div className="mt-5 divide-y divide-slate-100">
          {carriers.map((carrier) => (
            <div key={carrier.id} className="py-3">
              <div className="font-black text-slate-900">{carrier.name}</div>
              <div className="text-xs font-medium text-slate-500">ΑΦΜ {carrier.vat_number || '-'} | Όχημα {carrier.vehicle_number || '-'}</div>
            </div>
          ))}
        </div>
      </section>

      {showInspectionPinSection && !isInspectionModeActive() && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound size={18} className="text-slate-600" />
            <h2 className="font-black text-slate-900">Κωδικός εξόδου λειτουργίας ελέγχου</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Χρησιμοποιείται για επιστροφή στην πλήρη λειτουργία ERP μετά από κλείδωμα σε λειτουργία παραστατικών μόνο.
          </p>
          <div className="mb-3 text-xs font-bold text-slate-500">
            Κατάσταση: {inspectionPinConfigured ? 'Ορισμένος' : 'Μη ορισμένος'}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput
              label="Νέος κωδικός"
              type="password"
              value={inspectionPinDraft}
              onChange={setInspectionPinDraft}
              help="Τουλάχιστον 4 χαρακτήρες."
            />
            <TextInput
              label="Επιβεβαίωση κωδικού"
              type="password"
              value={inspectionPinConfirm}
              onChange={setInspectionPinConfirm}
            />
          </div>
          <div className="mt-4">
            <ActionButton
              onClick={() => void handleSaveInspectionPin()}
              disabled={setInspectionExitPin.isPending || !inspectionPinDraft.trim()}
            >
              {setInspectionExitPin.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Αποθήκευση κωδικού
            </ActionButton>
          </div>
        </section>
      )}
    </div>
  );

  const statsStrip = (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700"><div className="text-[10px] font-black uppercase">Αποδεκτά</div><div className="text-lg font-black">{stats.issued}</div></div>
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700"><div className="text-[10px] font-black uppercase">Σφάλματα</div><div className="text-lg font-black">{stats.failed}</div></div>
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700"><div className="text-[10px] font-black uppercase">Εκτυπώσιμα</div><div className="text-lg font-black">{stats.printable}</div></div>
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-700"><div className="text-[10px] font-black uppercase">Προτιμολόγια</div><div className="text-lg font-black">{stats.proformas}</div></div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700"><div className="text-[10px] font-black uppercase">Περιβάλλον</div><div className="text-lg font-black">{settingsDraft.environment.toUpperCase()}</div></div>
    </div>
  );

  return (
    <div className="space-y-5">
      {isInspectionPresentation ? (
        statsStrip
      ) : (
        <DesktopPageHeader
          icon={FileCheck2}
          title="Παραστατικά"
          subtitle="Προτιμολόγια, τιμολόγια myDATA, αρχείο και εκτύπωση"
          roundedClassName="rounded-lg"
          tail={statsStrip}
          below={(
            <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-50 p-1.5 border border-slate-200/60 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 ${activeTab === 'new' ? 'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}
              >
                <FileCheck2 size={16} /> Δημιουργία
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('archive')}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 ${activeTab === 'archive' ? 'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}
              >
                <Archive size={16} /> Αρχείο
              </button>
              {secondaryTabItems.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => (tab.id === 'settings' ? handleSettingsTabClick() : setActiveTab(tab.id))}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 ${activeTab === tab.id ? 'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}
                  >
                    <Icon size={16} /> {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        />
      )}

      <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === 'new' && renderNewTab()}
        {activeTab === 'archive' && renderArchiveTab()}
        {activeTab === 'sync' && renderSyncTab()}
        {activeTab === 'delivery' && renderDeliveryTab()}
        {activeTab === 'settings' && renderSettingsTab()}
      </div>

      <ProformaConvertModal
        isOpen={!!convertModal.proforma}
        step={convertModal.step}
        proforma={convertModal.proforma}
        lines={convertModal.lines}
        createdDocument={convertModal.createdDocument}
        errorMessage={convertModal.error}
        onConfirm={() => void runProformaConvert()}
        onClose={closeConvertModal}
        onOpenInvoice={handleOpenConvertedInvoice}
        money={money}
      />
    </div>
  );
}
