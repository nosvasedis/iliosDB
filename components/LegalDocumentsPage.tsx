import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
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
import { Customer, Product, LegalCarrier, LegalDocument, LegalDocumentKind, LegalDocumentLine, LegalEnvironment, LegalSettings, ProformaDocument, ProformaDocumentLine } from '../types';
import DesktopPageHeader from './DesktopPageHeader';
import { useUI } from './UIProvider';
import { useAuth } from './AuthContext';
import { useAllShipmentItems, useAllShipments, useCustomers, useOrdersWithItems } from '../hooks/api/useOrders';
import {
  useCancelLegalDocument,
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
  useSaveLegalDraft,
  useSaveLegalSequence,
  useSaveLegalSettings,
  useSubmitLegalDocument,
  useSyncTransmittedLegalDocuments,
  useVoidProformaDocument,
  useMarkProformaConverted,
} from '../hooks/api/useLegalDocuments';
import { legalRepository } from '../features/legal';
import {
  buildDefaultDeliveryDetails,
  buildLegalDocumentFromOrder,
  buildLegalDocumentFromShipment,
  buildProformaFromOrder,
  canPrintLegalDocument,
  canPrintProforma,
  convertProformaToLegalDraft,
  createManualLegalDocumentLine,
  AADE_VAT_CATEGORY_OPTIONS,
  DEFAULT_LEGAL_SETTINGS,
  getLegalDocumentDisplayNumber,
  LEGAL_DOCUMENT_KIND_LABELS,
  normalizeVatNumber,
  PAYMENT_METHOD_CODES,
  PAYMENT_METHOD_LABELS,
  recalculateLegalDocument,
  recalculateProforma,
  validateLegalDocument,
  vatRateToAadeCategory,
} from '../utils/legalDocuments';

type LegalTab = 'new' | 'proformas' | 'archive' | 'sync' | 'delivery' | 'settings';

interface LegalDocumentsPageProps {
  products: Product[];
  onPrintLegalDocument: (payload: { document: LegalDocument; lines: LegalDocumentLine[] } | null) => void;
  onPrintProforma?: (payload: { document: ProformaDocument; lines: ProformaDocumentLine[] } | null) => void;
}

const tabItems: Array<{ id: LegalTab; label: string; icon: LucideIcon }> = [
  { id: 'new', label: 'Δημιουργία', icon: FileCheck2 },
  { id: 'proformas', label: 'Προτιμολόγια', icon: FileText },
  { id: 'archive', label: 'Αρχείο', icon: Archive },
  { id: 'sync', label: 'Συγχρονισμός', icon: RefreshCw },
  { id: 'delivery', label: 'Διακίνηση', icon: Truck },
  { id: 'settings', label: 'Τεχνικές ρυθμίσεις', icon: Settings },
];

const kindItems: LegalDocumentKind[] = ['invoice', 'delivery_note', 'invoice_delivery', 'credit'];
const vatRateOptions = AADE_VAT_CATEGORY_OPTIONS;
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
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  help?: string;
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
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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

const ActionButton = ({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  type?: 'button' | 'submit';
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
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed ${classes[variant]}`}
    >
      {children}
    </button>
  );
};

export default function LegalDocumentsPage({ products, onPrintLegalDocument, onPrintProforma }: LegalDocumentsPageProps) {
  const [activeTab, setActiveTab] = useState<LegalTab>('new');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [documentKind, setDocumentKind] = useState<LegalDocumentKind>('invoice');
  const [draftBundle, setDraftBundle] = useState<{ document: LegalDocument; lines: LegalDocumentLine[] } | null>(null);
  const [proformaBundle, setProformaBundle] = useState<{ document: ProformaDocument; lines: ProformaDocumentLine[] } | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [proformaSearch, setProformaSearch] = useState('');
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
  const [newCarrier, setNewCarrier] = useState({ name: '', vat_number: '', vehicle_number: '', phone: '' });
  const [credentialEnvironment, setCredentialEnvironment] = useState<LegalEnvironment>('dev');
  const [credentialDraft, setCredentialDraft] = useState({ userId: '', subscriptionKey: '' });
  const [cloudflareBootstrapDraft, setCloudflareBootstrapDraft] = useState({ apiToken: '', accountId: '' });

  const { showToast, confirm } = useUI();
  const { profile } = useAuth();
  const userName = profile?.full_name || profile?.email || null;

  const { data: orders = [], isLoading: loadingOrders } = useOrdersWithItems();
  const { data: customers = [] } = useCustomers();
  const { data: shipments = [] } = useAllShipments();
  const { data: shipmentItems = [] } = useAllShipmentItems();
  const { data: legalSettings } = useLegalSettings();
  const { data: credentialStatus, isLoading: loadingCredentialStatus, refetch: refetchCredentialStatus } = useAadeCredentialStatus();
  const { data: sequences = [] } = useLegalNumberingSequences();
  const { data: carriers = [] } = useLegalCarriers();
  const { data: legalDocuments = [], isLoading: loadingDocuments } = useLegalDocuments();
  const { data: proformas = [], isLoading: loadingProformas } = useProformaDocuments();
  const { data: syncRuns = [] } = useLegalSyncRuns();

  const saveSettings = useSaveLegalSettings();
  const saveAadeCredentials = useSaveAadeCredentials();
  const saveSequence = useSaveLegalSequence();
  const saveCarrier = useSaveLegalCarrier();
  const saveDraft = useSaveLegalDraft();
  const saveProforma = useSaveProformaDraft();
  const voidProforma = useVoidProformaDocument();
  const markProformaConverted = useMarkProformaConverted();
  const syncTransmittedDocuments = useSyncTransmittedLegalDocuments();
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
    setCredentialEnvironment(settingsDraft.environment);
  }, [settingsDraft.environment]);

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

  const selectedShipment = useMemo(
    () => orderShipments.find((shipment) => shipment.id === selectedShipmentId) || null,
    [orderShipments, selectedShipmentId]
  );

  const stats = useMemo(() => ({
    issued: legalDocuments.filter((document) => document.status === 'issued').length,
    failed: legalDocuments.filter((document) => document.status === 'failed').length,
    cancelled: legalDocuments.filter((document) => document.status === 'cancelled').length,
    printable: legalDocuments.filter(canPrintLegalDocument).length,
    proformas: proformas.filter((document) => document.status === 'draft').length,
  }), [legalDocuments, proformas]);

  const hasDevValidation = useMemo(
    () => legalDocuments.some((document) => document.status === 'issued'),
    [legalDocuments]
  );

  const validationIssues = useMemo(() => {
    if (!draftBundle) return [];
    return validateLegalDocument(draftBundle.document, draftBundle.lines);
  }, [draftBundle]);
  const validationErrors = validationIssues.filter((issue) => issue.severity === 'error');
  const activeCredentialStatus = credentialStatus?.[settingsDraft.environment];
  const missingSecretManager = credentialStatus?.missingWorkerSecretManager || [];
  const missingAadeCredentials = credentialStatus?.missingAadeCredentials || [];

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

  const filteredProformas = useMemo(() => {
    const needle = proformaSearch.trim().toLowerCase();
    if (!needle) return proformas;
    return proformas.filter((document) => [
      getLegalDocumentDisplayNumber(document as any),
      document.counterpart.name,
      document.counterpart.vat_number,
      document.notes,
    ].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [proformaSearch, proformas]);

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
    const counterpart = {
      vat_number: normalizeVatNumber(customer.vat_number),
      country: 'GR',
      branch: 0,
      name: customer.full_name,
      address: customer.address ? { street: customer.address, number: '', postal_code: '', city: '' } : null,
      phone: customer.phone || null,
      email: customer.email || null,
    };
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

  const applyProductToLegalLine = (lineId: string, sku: string) => {
    const product = products.find((item) => item.sku === sku);
    updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((line) => line.id === lineId ? {
      ...line,
      sku,
      item_code: sku,
      description: product?.description || product?.category || line.description,
      unit_price: product?.selling_price || product?.active_price || line.unit_price,
    } : line), settingsDraft));
  };

  const applyProductToProformaLine = (lineId: string, sku: string) => {
    const product = products.find((item) => item.sku === sku);
    updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((line) => line.id === lineId ? {
      ...line,
      sku,
      item_code: sku,
      description: product?.description || product?.category || line.description,
      unit_price: product?.selling_price || product?.active_price || line.unit_price,
    } : line), settingsDraft));
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
    const settings = legalSettings || settingsDraft;
    if (!selectedOrder) {
      showToast('Επιλέξτε παραγγελία.', 'warning');
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
    setDraftBundle({ document, lines: document.lines || [] });
  };

  const handleGenerateProforma = () => {
    const settings = legalSettings || settingsDraft;
    if (!selectedOrder) {
      showToast('Επιλέξτε παραγγελία για το προτιμολόγιο.', 'warning');
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
    setActiveTab('proformas');
  };

  const handleSaveDraft = async () => {
    if (!draftBundle) return;
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
      setProformaBundle(recalculateProforma({ ...document, lines }, lines, settingsDraft));
      setActiveTab('proformas');
    } catch (error: any) {
      showToast(error?.message || 'Δεν φορτώθηκε το προτιμολόγιο.', 'error');
    }
  };

  const handleConvertProforma = async (document: ProformaDocument, activeLines?: ProformaDocumentLine[]) => {
    try {
      const lines = activeLines || await legalRepository.getProformaLines(document.id);
      const draft = convertProformaToLegalDraft({
        proforma: document,
        lines,
        settings: settingsDraft,
        kind: 'invoice',
        userName,
      });
      await saveDraft.mutateAsync(draft);
      if (proformas.some((item) => item.id === document.id)) {
        await markProformaConverted.mutateAsync({ proformaId: document.id, legalDocumentId: draft.document.id });
      }
      setDraftBundle(draft);
      setActiveTab('new');
      showToast('Το προτιμολόγιο μετατράπηκε σε πρόχειρο τιμολόγιο.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν έγινε μετατροπή σε τιμολόγιο.', 'error');
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
      showToast(`Συγχρονισμός ολοκληρώθηκε: ${result.imported_count} νέα, ${result.updated_count} ενημερώσεις.`, 'success');
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
    if (!(await ensureAadeCredentialsReady())) return;
    try {
      await saveDraft.mutateAsync(draftBundle);
      const issued = await submitDocument.mutateAsync({ documentId: draftBundle.document.id, userName });
      setDraftBundle({ document: issued, lines: draftBundle.lines });
      setActiveTab('archive');
      showToast(`Αποδοχή myDATA με MARK ${issued.aade_mark}.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Η AADE απέρριψε το παραστατικό.', 'error');
    }
  };

  const handleRetry = async (document: LegalDocument) => {
    if (!(await ensureAadeCredentialsReady())) return;
    try {
      const issued = await submitDocument.mutateAsync({ documentId: document.id, userName });
      showToast(`Επιτυχής αποστολή με MARK ${issued.aade_mark}.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Η επανάληψη απέτυχε.', 'error');
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
    if (!canPrintLegalDocument(document)) {
      showToast('Η εκτύπωση ενεργοποιείται μόνο μετά από MARK και QR.', 'warning');
      return;
    }
    try {
      const lines = await legalRepository.getDocumentLines(document.id);
      onPrintLegalDocument({ document: { ...document, lines }, lines });
      await markPrinted.mutateAsync(document.id);
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
      setDraftBundle(recalculateLegalDocument({ ...document, lines }, lines, settingsDraft));
      setDocumentKind(document.document_kind);
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
      await refetchCredentialStatus();
      showToast(`Τα AADE credentials για ${credentialEnvironment.toUpperCase()} αποθηκεύτηκαν με ασφάλεια στο Cloudflare Worker.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκαν τα AADE credentials.', 'error');
    }
  };

  const handleEnvironmentChange = (value: string) => {
    if (value === 'prod' && !hasDevValidation) {
      showToast('Η παραγωγή ανοίγει μετά από επιτυχή έκδοση στο dev περιβάλλον.', 'warning');
      return;
    }
    setSettingsDraft((current) => ({ ...current, environment: value === 'prod' ? 'prod' : 'dev' }));
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
          <div className="mt-1 text-sm">Επιλέξτε παραγγελία και τύπο παραστατικού.</div>
        </div>
      );
    }

    const document = draftBundle.document;
    const isDelivery = document.document_kind === 'delivery_note' || document.document_kind === 'invoice_delivery';

    return (
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
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

          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <SelectInput label="Πελάτης εφαρμογής" value="" onChange={(value) => applyCustomerToDraft(value, 'legal')} help="Γεμίζει αυτόματα ΑΦΜ, επωνυμία, στοιχεία επικοινωνίας και καθεστώς ΦΠΑ από τους πελάτες του ERP.">
              <option value="">Χειροκίνητα / χωρίς αλλαγή</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.vat_number ? ` | ΑΦΜ ${customer.vat_number}` : ''}</option>)}
            </SelectInput>
            <TextInput label="Ημερομηνία" type="date" value={document.issue_date} onChange={(value) => updateDraftDocument((current) => ({ ...current, issue_date: value }))} />
            <TextInput label="ΑΦΜ Πελάτη" value={document.counterpart.vat_number || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, vat_number: normalizeVatNumber(value) } }))} />
            <TextInput label="Επωνυμία Πελάτη" value={document.counterpart.name || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, name: value } }))} />
            <SelectInput label="Πληρωμή" value={document.payment_method_code} onChange={(value) => updateDraftDocument((current) => ({ ...current, payment_method_code: Number(value) }))}>
              {PAYMENT_METHOD_CODES.map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
            </SelectInput>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <TextInput label="Οδός Πελάτη" value={document.counterpart.address?.street || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), street: value } } }))} />
            <TextInput label="Αριθμός" value={document.counterpart.address?.number || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), number: value } } }))} />
            <TextInput label="Τ.Κ." value={document.counterpart.address?.postal_code || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), postal_code: value } } }))} />
            <TextInput label="Πόλη" value={document.counterpart.address?.city || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), city: value } } }))} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-5">
            <TextInput label="Αιτία απαλλαγής ΦΠΑ" type="number" value={document.vat_exemption_category || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, vat_exemption_category: value ? Number(value) : null }))} />
            <SelectInput label="Καθεστώς ΦΠΑ" value={document.vat_rate ?? 0.24} onChange={(value) => applyLegalVatProfile(Number(value))} help="Ο βασικός συντελεστής ΦΠΑ για τις γραμμές. Αν χρειάζεται, κάθε γραμμή μπορεί να έχει διαφορετική κατηγορία ΦΠΑ.">
              {vatRateOptions.map((option) => <option key={option.category} value={option.value}>{option.label}</option>)}
            </SelectInput>
          </div>

          {isDelivery && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800"><Truck size={16} /> Διακίνηση</div>
              <div className="grid gap-4 md:grid-cols-4">
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
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <TextInput label="Φόρτωση" value={document.delivery?.loading_address?.street || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), loading_address: { ...(current.delivery?.loading_address || {}), street: value } } }))} />
                <TextInput label="Παράδοση" value={document.delivery?.delivery_address?.street || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), delivery_address: { ...(current.delivery?.delivery_address || {}), street: value } } }))} />
                <TextInput label="Σκοπός" type="number" value={document.delivery?.move_purpose || settingsDraft.default_move_purpose} onChange={(value) => updateDraftDocument((current) => ({ ...current, delivery: { ...(current.delivery || buildDefaultDeliveryDetails(settingsDraft)), move_purpose: Number(value) || 1 } }))} />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-black text-slate-900">Γραμμές</h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-black text-slate-700">{draftBundle.lines.length} γραμμές | {money(document.totals.gross)}</div>
              <ActionButton variant="secondary" onClick={() => updateDraftBundle((current, lines) => recalculateLegalDocument(current, [
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
                  <th className="px-3 py-2 text-right">Καθαρή</th>
                  <th className="px-3 py-2 text-right">ΦΠΑ</th>
                  <th className="px-3 py-2 text-right">Σύνολο</th>
                  <th className="px-3 py-2">Χαρακτ.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draftBundle.lines.map((line, index) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 font-bold">{line.line_number}</td>
                    <td className="px-3 py-2">
                      <select
                        value={line.sku}
                        onChange={(event) => {
                          applyProductToLegalLine(line.id, event.target.value);
                        }}
                        className="w-36 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold outline-none"
                      >
                        <option value={line.sku}>{line.sku}</option>
                        <option value="MANUAL">MANUAL</option>
                        {products.map((product) => <option key={product.sku} value={product.sku}>{product.sku}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input value={line.item_code || ''} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, item_code: event.target.value } : item), settingsDraft))} className="w-28 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs outline-none" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={line.description} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item), settingsDraft))} className="min-w-56 rounded-lg border border-slate-200 px-2 py-1 outline-none" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, quantity: Number(event.target.value) || 0 } : item), settingsDraft))} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="1" step="1" value={line.measurement_unit} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, measurement_unit: Number(event.target.value) || 1 } : item), settingsDraft))} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none" title="Μονάδα μέτρησης AADE. Συνήθως 1 για τεμάχιο." />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" step="0.01" value={line.unit_price} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, unit_price: Number(event.target.value) || 0 } : item), settingsDraft))} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <select value={line.vat_category} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, vat_category: Number(event.target.value) } : item), settingsDraft))} className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none">
                        {vatRateOptions.map((option) => <option key={option.category} value={option.category}>{option.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">{money(line.net_value)}</td>
                    <td className="px-3 py-2 text-right">{money(line.vat_amount)}</td>
                    <td className="px-3 py-2 text-right font-black">{money(line.gross_value)}</td>
                    <td className="px-3 py-2">
                      <input value={line.income_classification.classification_type || ''} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, income_classification: { ...item.income_classification, classification_type: event.target.value } } : item), settingsDraft))} className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none" title="Χαρακτηρισμός εσόδου myDATA, π.χ. E3_561_001." />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.filter((_, itemIndex) => itemIndex !== index), settingsDraft))}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                        title="Διαγραφή γραμμής"
                      >
                        <Trash2 size={15} />
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

  const renderValidation = () => (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardCheck size={18} className="text-emerald-600" />
        <h3 className="font-black text-slate-900">Έλεγχος πριν την υποβολή</h3>
      </div>
      {!draftBundle ? (
        <div className="text-sm font-medium text-slate-500">Δεν υπάρχει πρόχειρο για έλεγχο.</div>
      ) : validationIssues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
          <CheckCircle2 size={16} /> Έτοιμο για υποβολή
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
      <div className="mt-5 flex flex-wrap gap-2">
        <ActionButton variant="secondary" onClick={handleSaveDraft} disabled={!draftBundle || saveDraft.isPending}>
          {saveDraft.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
        </ActionButton>
        <ActionButton onClick={handleSubmitDraft} disabled={!draftBundle || validationErrors.length > 0 || submitDocument.isPending || saveDraft.isPending}>
          {submitDocument.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Υποβολή στη myDATA
        </ActionButton>
      </div>
    </section>
  );

  const renderNewTab = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(280px,360px)_1fr_minmax(280px,360px)]">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileCheck2 size={18} className="text-slate-700" />
          <h2 className="font-black text-slate-900">Πηγή</h2>
        </div>
        <div className="space-y-4">
          <SelectInput label="Παραγγελία" value={selectedOrderId} onChange={(value) => { setSelectedOrderId(value); setSelectedShipmentId(''); setDraftBundle(null); }}>
            <option value="">Επιλογή παραγγελίας</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.customer_name} | {order.id} | {money(order.total_price)}
              </option>
            ))}
          </SelectInput>
          <SelectInput label="Μερική αποστολή" value={selectedShipmentId} onChange={(value) => { setSelectedShipmentId(value); setDraftBundle(null); }}>
            <option value="">Όλη η παραγγελία</option>
            {orderShipments.map((shipment) => (
              <option key={shipment.id} value={shipment.id}>
                ΔΑ #{shipment.shipment_number} | {new Date(shipment.shipped_at).toLocaleDateString('el-GR')}
              </option>
            ))}
          </SelectInput>
          <div>
            <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">Τύπος</span>
            <div className="grid gap-2">
              {kindItems.map((kind) => (
                <button
                  key={kind}
                  onClick={() => { setDocumentKind(kind); setDraftBundle(null); }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm font-black transition ${documentKind === kind ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {LEGAL_DOCUMENT_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>
          <ActionButton onClick={handleGenerateDraft} disabled={!selectedOrder || loadingOrders}>
            {loadingOrders ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Δημιουργία
          </ActionButton>
          <ActionButton variant="secondary" onClick={handleGenerateProforma} disabled={!selectedOrder || loadingOrders}>
            <FileText size={16} /> Προτιμολόγιο
          </ActionButton>
        </div>
      </section>

      {renderDraftEditor()}
      {renderValidation()}
    </div>
  );

  const renderProformaEditor = () => {
    if (!proformaBundle) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          <FileText size={36} className="mx-auto mb-3 text-slate-300" />
          <div className="font-black text-slate-700">Δεν έχει ανοιχτεί προτιμολόγιο</div>
          <div className="mt-1 text-sm">Δημιουργήστε ένα από παραγγελία ή ανοίξτε παλιότερο από τη λίστα.</div>
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
            <TextInput label="Απαλλαγή ΦΠΑ" type="number" value={document.vat_exemption_category || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, vat_exemption_category: value ? Number(value) : null }, lines, settingsDraft))} />
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
                      <select value={line.sku} onChange={(event) => applyProductToProformaLine(line.id, event.target.value)} className="w-36 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold outline-none">
                        <option value={line.sku}>{line.sku}</option>
                        <option value="MANUAL">MANUAL</option>
                        {products.map((product) => <option key={product.sku} value={product.sku}>{product.sku}</option>)}
                      </select>
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
                    <td className="px-3 py-2"><input value={line.income_classification.classification_type || ''} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, income_classification: { ...item.income_classification, classification_type: event.target.value } } : item), settingsDraft))} className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none" /></td>
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
            <ActionButton variant="secondary" onClick={() => handleConvertProforma(document, proformaBundle.lines)} disabled={saveDraft.isPending}>
              <Copy size={16} /> Μετατροπή σε τιμολόγιο
            </ActionButton>
          </div>
        </section>
      </div>
    );
  };

  const renderProformasTab = () => (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-sky-600" />
          <h2 className="font-black text-slate-900">Νέο προτιμολόγιο</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <SelectInput label="Παραγγελία" value={selectedOrderId} onChange={(value) => { setSelectedOrderId(value); setSelectedShipmentId(''); }}>
            <option value="">Επιλογή παραγγελίας</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.customer_name} | {order.id} | {money(order.total_price)}
              </option>
            ))}
          </SelectInput>
          <ActionButton onClick={handleGenerateProforma} disabled={!selectedOrder || loadingOrders}>
            {loadingOrders ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Δημιουργία
          </ActionButton>
          <ActionButton variant="quiet" onClick={() => setProformaBundle(null)} disabled={!proformaBundle}>
            Καθαρισμός
          </ActionButton>
        </div>
      </section>

      {renderProformaEditor()}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-black text-slate-900">Αρχείο προτιμολογίων</h2>
            <div className="text-sm font-medium text-slate-500">{filteredProformas.length} εγγραφές</div>
          </div>
          <label className="relative w-full md:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={proformaSearch}
              onChange={(event) => setProformaSearch(event.target.value)}
              placeholder="Αναζήτηση προτιμολογίων"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Προτιμολόγιο</th>
                <th className="px-4 py-3">Πελάτης</th>
                <th className="px-4 py-3">Κατάσταση</th>
                <th className="px-4 py-3 text-right">Αξία</th>
                <th className="px-4 py-3 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {loadingProformas ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500"><Loader2 size={24} className="mx-auto animate-spin" /></td></tr>
              ) : filteredProformas.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Δεν υπάρχουν προτιμολόγια.</td></tr>
              ) : filteredProformas.map((document) => (
                <tr key={document.id} className="border-b border-slate-100 bg-white align-top">
                  <td className="px-4 py-3">
                    <div className="font-black text-slate-900">{getLegalDocumentDisplayNumber(document as any)}</div>
                    <div className="text-xs font-bold text-sky-700">Δεν αποστέλλεται στη myDATA</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-800">{document.counterpart.name || '-'}</div>
                    <div className="text-xs font-mono text-slate-500">ΑΦΜ {document.counterpart.vat_number || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-black ${proformaStatusClass[document.status]}`}>{proformaStatusLabel[document.status]}</span>
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
                      <ActionButton variant="secondary" onClick={() => void handleConvertProforma(document)} disabled={document.status !== 'draft'}>
                        <Copy size={16} /> Μετατροπή
                      </ActionButton>
                      <ActionButton variant="danger" onClick={() => void handleVoidProforma(document)} disabled={document.status !== 'draft'}>
                        <Ban size={16} /> Ακύρωση
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
          <ActionButton variant="secondary" onClick={() => handlePrint(document)} disabled={!canPrintLegalDocument(document)}>
            <Printer size={16} /> Εκτύπωση
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => void handleOpenLegalDocument(document)}>
            <Edit3 size={16} /> Άνοιγμα
          </ActionButton>
          {(document.status === 'failed' || document.status === 'draft') && (
            <ActionButton variant="quiet" onClick={() => handleRetry(document)} disabled={submitDocument.isPending}>
              <RefreshCw size={16} /> Επανάληψη
            </ActionButton>
          )}
          {document.status === 'issued' && (
            <ActionButton variant="danger" onClick={() => handleCancel(document)} disabled={cancelDocument.isPending}>
              <Ban size={16} /> Ακύρωση
            </ActionButton>
          )}
        </div>
      </td>
    </tr>
  );

  const renderArchiveTab = () => (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-black text-slate-900">Αρχείο παραστατικών</h2>
          <div className="text-sm font-medium text-slate-500">{filteredArchive.length} εγγραφές</div>
        </div>
        <label className="relative w-full md:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={archiveSearch}
            onChange={(event) => setArchiveSearch(event.target.value)}
            placeholder="Αναζήτηση με πελάτη, MARK, αριθμό"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
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
  );

  const renderSyncTab = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,460px)_1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <RefreshCw size={18} className="text-emerald-600" />
          <h2 className="font-black text-slate-900">Συγχρονισμός παλιών παραστατικών</h2>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          Φέρνει παραστατικά που έχουν ήδη εκδοθεί ή ακυρωθεί με τα ίδια AADE credentials. Δεν καταναλώνει σειρές ή αρίθμηση του ERP.
        </div>
        <div className="mt-4 space-y-4">
          <TextInput label="Από ημερομηνία" type="date" value={syncDraft.dateFrom} onChange={(value) => setSyncDraft((current) => ({ ...current, dateFrom: value }))} />
          <TextInput label="Έως ημερομηνία" type="date" value={syncDraft.dateTo} onChange={(value) => setSyncDraft((current) => ({ ...current, dateTo: value }))} />
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
          <SelectInput label="Περιβάλλον" value={settingsDraft.environment} onChange={handleEnvironmentChange} help="Dev για δοκιμές, Production για πραγματικά παραστατικά.">
            <option value="dev">AADE Dev</option>
            <option value="prod">AADE Production</option>
          </SelectInput>
          <ActionButton onClick={handleSyncTransmitted} disabled={syncTransmittedDocuments.isPending}>
            {syncTransmittedDocuments.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Συγχρονισμός
          </ActionButton>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-black text-slate-900">Ιστορικό συγχρονισμών</h2>
          <div className="text-sm font-medium text-slate-500">{syncRuns.length} εκτελέσεις</div>
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

          <div className="grid gap-3 md:grid-cols-3">
            {(['dev', 'prod'] as LegalEnvironment[]).map((environment) => {
              const status = credentialStatus?.[environment];
              const ready = !!status?.ready;
              return (
                <div key={environment} className={`rounded-lg border px-3 py-2 ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <div className="text-[10px] font-black uppercase">AADE {environment.toUpperCase()}</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-black">
                    {ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    {ready ? 'Έτοιμο' : 'Λείπουν στοιχεία'}
                  </div>
                </div>
              );
            })}
            <div className={`rounded-lg border px-3 py-2 ${credentialStatus?.workerCanStoreSecrets ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              <div className="text-[10px] font-black uppercase">Cloudflare Secrets</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-black">
                {credentialStatus?.workerCanStoreSecrets ? <ShieldCheck size={16} /> : <XCircle size={16} />}
                {credentialStatus?.workerCanStoreSecrets ? 'Μπορεί να αποθηκεύσει' : 'Χρειάζεται ρύθμιση'}
              </div>
            </div>
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
            <SelectInput label="Περιβάλλον" value={credentialEnvironment} onChange={(value) => setCredentialEnvironment(value === 'prod' ? 'prod' : 'dev')} help="Dev για δοκιμές, Production για πραγματικά παραστατικά.">
              <option value="dev">AADE Dev</option>
              <option value="prod">AADE Production</option>
            </SelectInput>
            <TextInput label="AADE User ID" value={credentialDraft.userId} onChange={(value) => setCredentialDraft((current) => ({ ...current, userId: value }))} help="Το όνομα χρήστη API που εκδίδεται από την ΑΑΔΕ για το myDATA." />
            <TextInput label="Subscription Key" type="password" value={credentialDraft.subscriptionKey} onChange={(value) => setCredentialDraft((current) => ({ ...current, subscriptionKey: value }))} help="Το κλειδί πρόσβασης myDATA. Αποθηκεύεται ως μυστικό στο Cloudflare Worker." />
            <ActionButton onClick={handleSaveAadeCredentials} disabled={saveAadeCredentials.isPending}>
              {saveAadeCredentials.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
            </ActionButton>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <span className={`rounded-lg border px-2 py-1 ${activeCredentialStatus?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              Ενεργό περιβάλλον {settingsDraft.environment.toUpperCase()}: {activeCredentialStatus?.ready ? 'έτοιμο για myDATA' : 'δεν θα επιτρέψει αποστολή'}
            </span>
            <span>Τα credentials δεν εμφανίζονται ξανά μετά την αποθήκευση.</span>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-600" /><h2 className="font-black text-slate-900">Εκδότης / ΑΑΔΕ</h2></div>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectInput label="Περιβάλλον" value={settingsDraft.environment} onChange={handleEnvironmentChange} help="Το ενεργό περιβάλλον που θα χρησιμοποιείται για αποστολή και συγχρονισμό.">
              <option value="dev">AADE Dev</option>
              <option value="prod">AADE Production</option>
            </SelectInput>
            <TextInput label="ΑΦΜ Εκδότη" value={settingsDraft.issuer.vat_number || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, vat_number: normalizeVatNumber(value) } }))} />
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
            <TextInput label="Τηλέφωνο" value={settingsDraft.issuer.phone || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, phone: value } }))} />
            <TextInput label="Email" value={settingsDraft.issuer.email || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, email: value } }))} />
            <SelectInput label="Πληρωμή Default" value={settingsDraft.default_payment_method} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_payment_method: Number(value) }))}>
              {PAYMENT_METHOD_CODES.map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
            </SelectInput>
            <TextInput label="Απαλλαγή ΦΠΑ Default" type="number" value={settingsDraft.default_vat_exemption_category || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_vat_exemption_category: value ? Number(value) : null }))} help="Συμπληρώνεται μόνο όταν η γραμμή έχει ΦΠΑ 0% και απαιτείται αιτία απαλλαγής." />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <TextInput label="E3 Χονδρικής" value={settingsDraft.default_income_classification_type} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_income_classification_type: value, inhouse_income_classification_type: value, imported_income_classification_type: value }))} help="Κωδικός χαρακτηρισμού εσόδου myDATA που εμφανίζεται στις γραμμές, π.χ. E3_561_001." />
            <TextInput label="Κατηγορία In-house" value={settingsDraft.inhouse_income_classification_category} onChange={(value) => setSettingsDraft((current) => ({ ...current, inhouse_income_classification_category: value }))} help="Κατηγορία εσόδων για προϊόντα που παράγονται εσωτερικά." />
            <TextInput label="Κατηγορία Εισαγόμενα" value={settingsDraft.imported_income_classification_category} onChange={(value) => setSettingsDraft((current) => ({ ...current, imported_income_classification_category: value }))} help="Κατηγορία εσόδων για εμπορεύματα/εισαγόμενα προϊόντα." />
            <TextInput label="Σκοπός Διακίνησης" type="number" value={settingsDraft.default_move_purpose} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_move_purpose: Number(value) || 1 }))} help="Κωδικός σκοπού διακίνησης της ΑΑΔΕ. Συνήθως 1 για πώληση." />
          </div>
          <div className="mt-5">
            <ActionButton onClick={handleSaveSettings} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση ρυθμίσεων
            </ActionButton>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-black text-slate-900">Σειρές και αρίθμηση</h2>
          <div className="space-y-3">
            {sequences.map((sequence) => (
              <div key={sequence.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_120px_120px_120px_auto] md:items-end">
                <div>
                  <div className="text-sm font-black text-slate-900">{LEGAL_DOCUMENT_KIND_LABELS[sequence.document_kind]}</div>
                  <div className="flex items-center gap-1 text-xs font-medium text-slate-500">Τύπος ΑΑΔΕ {sequence.aade_document_type} <InfoTip text="Ο επίσημος τύπος παραστατικού myDATA για αυτή τη σειρά." /></div>
                </div>
                <TextInput label="Σειρά" value={sequence.series} onChange={(value) => saveSequence.mutate({ ...sequence, series: value })} help="Το πρόθεμα που θα φαίνεται στο παραστατικό." />
                <TextInput label="Επόμενο" type="number" value={sequence.next_aa} onChange={(value) => saveSequence.mutate({ ...sequence, next_aa: Number(value) || 1 })} help="Ο επόμενος αριθμός που θα πάρει νέο νόμιμο παραστατικό." />
                <SelectInput label="Ενεργό" value={sequence.is_active ? 'yes' : 'no'} onChange={(value) => saveSequence.mutate({ ...sequence, is_active: value === 'yes' })}>
                  <option value="yes">Ναι</option>
                  <option value="no">Όχι</option>
                </SelectInput>
                <div className="flex items-center gap-1 pb-2 text-xs font-bold text-slate-500">
                  Ασφαλής αρίθμηση <InfoTip text="Το ERP κλειδώνει την αρίθμηση ώστε δύο χρήστες να μη βγάλουν το ίδιο νούμερο." />
                </div>
              </div>
            ))}
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
    </div>
  );

  return (
    <div className="space-y-5">
      <DesktopPageHeader
        icon={FileCheck2}
        title="Νόμιμα Παραστατικά"
        subtitle="myDATA, MARK, QR, διακίνηση και νόμιμη εκτύπωση"
        roundedClassName="rounded-lg"
        tail={(
          <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700"><div className="text-[10px] font-black uppercase">Αποδεκτά</div><div className="text-lg font-black">{stats.issued}</div></div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700"><div className="text-[10px] font-black uppercase">Σφάλματα</div><div className="text-lg font-black">{stats.failed}</div></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700"><div className="text-[10px] font-black uppercase">Εκτυπώσιμα</div><div className="text-lg font-black">{stats.printable}</div></div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-700"><div className="text-[10px] font-black uppercase">Προτιμολόγια</div><div className="text-lg font-black">{stats.proformas}</div></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700"><div className="text-[10px] font-black uppercase">Περιβάλλον</div><div className="text-lg font-black">{settingsDraft.environment.toUpperCase()}</div></div>
          </div>
        )}
        below={(
          <div className="flex flex-wrap gap-2">
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition ${activeTab === tab.id ? 'bg-[#060b00] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <Icon size={16} /> {tab.label}
                </button>
              );
            })}
          </div>
        )}
      />

      {activeTab === 'new' && renderNewTab()}
      {activeTab === 'proformas' && renderProformasTab()}
      {activeTab === 'archive' && renderArchiveTab()}
      {activeTab === 'sync' && renderSyncTab()}
      {activeTab === 'delivery' && renderDeliveryTab()}
      {activeTab === 'settings' && renderSettingsTab()}
    </div>
  );
}
