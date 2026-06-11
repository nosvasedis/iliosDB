import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
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
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Product, LegalCarrier, LegalDocument, LegalDocumentKind, LegalDocumentLine, LegalEnvironment, LegalSettings } from '../types';
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
  useMarkLegalDocumentPrinted,
  usePollLegalDeliveryStatus,
  useRegisterLegalTransfer,
  useSaveLegalCarrier,
  useSaveAadeCredentials,
  useSaveLegalDraft,
  useSaveLegalSequence,
  useSaveLegalSettings,
  useSubmitLegalDocument,
} from '../hooks/api/useLegalDocuments';
import { legalRepository } from '../features/legal';
import {
  buildDefaultDeliveryDetails,
  buildLegalDocumentFromOrder,
  buildLegalDocumentFromShipment,
  canPrintLegalDocument,
  DEFAULT_LEGAL_SETTINGS,
  getLegalDocumentDisplayNumber,
  LEGAL_DOCUMENT_KIND_LABELS,
  normalizeVatNumber,
  PAYMENT_METHOD_LABELS,
  validateLegalDocument,
} from '../utils/legalDocuments';

type LegalTab = 'new' | 'archive' | 'delivery' | 'settings';

interface LegalDocumentsPageProps {
  products: Product[];
  onPrintLegalDocument: (payload: { document: LegalDocument; lines: LegalDocumentLine[] } | null) => void;
}

const tabItems: Array<{ id: LegalTab; label: string; icon: LucideIcon }> = [
  { id: 'new', label: 'Νέο Παραστατικό', icon: FileCheck2 },
  { id: 'archive', label: 'Αρχείο', icon: Archive },
  { id: 'delivery', label: 'Διακίνηση', icon: Truck },
  { id: 'settings', label: 'Ρυθμίσεις', icon: Settings },
];

const kindItems: LegalDocumentKind[] = ['invoice', 'delivery_note', 'invoice_delivery', 'credit'];

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

const TextInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) => (
  <label className="block min-w-0">
    <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">{label}</span>
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
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) => (
  <label className="block min-w-0">
    <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">{label}</span>
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

export default function LegalDocumentsPage({ products, onPrintLegalDocument }: LegalDocumentsPageProps) {
  const [activeTab, setActiveTab] = useState<LegalTab>('new');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [documentKind, setDocumentKind] = useState<LegalDocumentKind>('invoice');
  const [draftBundle, setDraftBundle] = useState<{ document: LegalDocument; lines: LegalDocumentLine[] } | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [settingsDraft, setSettingsDraft] = useState<LegalSettings>({ ...DEFAULT_LEGAL_SETTINGS });
  const [newCarrier, setNewCarrier] = useState({ name: '', vat_number: '', vehicle_number: '', phone: '' });
  const [credentialEnvironment, setCredentialEnvironment] = useState<LegalEnvironment>('dev');
  const [credentialDraft, setCredentialDraft] = useState({ userId: '', subscriptionKey: '' });

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

  const saveSettings = useSaveLegalSettings();
  const saveAadeCredentials = useSaveAadeCredentials();
  const saveSequence = useSaveLegalSequence();
  const saveCarrier = useSaveLegalCarrier();
  const saveDraft = useSaveLegalDraft();
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
  }), [legalDocuments]);

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

  const deliveryDocuments = useMemo(
    () => legalDocuments.filter((document) =>
      document.document_kind === 'delivery_note' || document.document_kind === 'invoice_delivery'
    ),
    [legalDocuments]
  );

  const updateDraftDocument = (updater: (document: LegalDocument) => LegalDocument) => {
    setDraftBundle((current) => current ? { ...current, document: updater(current.document) } : current);
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

  const handleSaveDraft = async () => {
    if (!draftBundle) return;
    try {
      await saveDraft.mutateAsync(draftBundle);
      showToast('Το παραστατικό αποθηκεύτηκε ως πρόχειρο.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε το πρόχειρο.', 'error');
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
    if (!userId || !subscriptionKey) {
      showToast('Συμπληρώστε AADE User ID και Subscription Key.', 'warning');
      return;
    }

    try {
      await saveAadeCredentials.mutateAsync({
        environment: credentialEnvironment,
        userId,
        subscriptionKey,
      });
      setCredentialDraft({ userId: '', subscriptionKey: '' });
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

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <TextInput label="Ημερομηνία" type="date" value={document.issue_date} onChange={(value) => updateDraftDocument((current) => ({ ...current, issue_date: value }))} />
            <TextInput label="ΑΦΜ Πελάτη" value={document.counterpart.vat_number || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, vat_number: normalizeVatNumber(value) } }))} />
            <TextInput label="Επωνυμία Πελάτη" value={document.counterpart.name || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, name: value } }))} />
            <SelectInput label="Πληρωμή" value={document.payment_method_code} onChange={(value) => updateDraftDocument((current) => ({ ...current, payment_method_code: Number(value) }))}>
              {[5, 1, 6, 3].map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
            </SelectInput>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <TextInput label="Οδός Πελάτη" value={document.counterpart.address?.street || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), street: value } } }))} />
            <TextInput label="Αριθμός" value={document.counterpart.address?.number || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), number: value } } }))} />
            <TextInput label="Τ.Κ." value={document.counterpart.address?.postal_code || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), postal_code: value } } }))} />
            <TextInput label="Πόλη" value={document.counterpart.address?.city || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), city: value } } }))} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <TextInput label="Αιτία απαλλαγής ΦΠΑ" type="number" value={document.vat_exemption_category || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, vat_exemption_category: value ? Number(value) : null }))} />
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
            <div className="text-sm font-black text-slate-700">{draftBundle.lines.length} γραμμές | {money(document.totals.gross)}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Περιγραφή</th>
                  <th className="px-3 py-2 text-right">Ποσ.</th>
                  <th className="px-3 py-2 text-right">Καθαρή</th>
                  <th className="px-3 py-2 text-right">ΦΠΑ</th>
                  <th className="px-3 py-2 text-right">Σύνολο</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draftBundle.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 font-bold">{line.line_number}</td>
                    <td className="px-3 py-2 font-mono text-xs">{line.item_code}</td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-right">{line.quantity}</td>
                    <td className="px-3 py-2 text-right">{money(line.net_value)}</td>
                    <td className="px-3 py-2 text-right">{money(line.vat_amount)}</td>
                    <td className="px-3 py-2 text-right font-black">{money(line.gross_value)}</td>
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
        </div>
      </section>

      {renderDraftEditor()}
      {renderValidation()}
    </div>
  );

  const renderDocumentRow = (document: LegalDocument) => (
    <tr key={document.id} className="border-b border-slate-100 bg-white align-top">
      <td className="px-4 py-3">
        <div className="font-black text-slate-900">{getLegalDocumentDisplayNumber(document)}</div>
        <div className="text-xs font-medium text-slate-500">{LEGAL_DOCUMENT_KIND_LABELS[document.document_kind]} | {document.aade_document_type}</div>
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
          {(document.status === 'failed' || document.status === 'draft') && (
            <ActionButton variant="quiet" onClick={() => handleRetry(document)} disabled={submitDocument.isPending}>
              <RefreshCw size={16} /> Retry
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
              <th className="px-4 py-3">MARK / QR</th>
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
              <ActionButton variant="quiet" disabled={document.status !== 'issued'} onClick={() => handleDeliveryAction(document, 'poll')}><RefreshCw size={16} /> Status</ActionButton>
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
              <h2 className="font-black text-slate-900">AADE Credentials</h2>
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
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              Λείπει από το Worker: {missingSecretManager.join(', ')}. Χωρίς αυτό δεν μπορεί να αποθηκεύσει νέα AADE credentials από το UI.
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr_1fr_auto] md:items-end">
            <SelectInput label="Περιβάλλον" value={credentialEnvironment} onChange={(value) => setCredentialEnvironment(value === 'prod' ? 'prod' : 'dev')}>
              <option value="dev">AADE Dev</option>
              <option value="prod">AADE Production</option>
            </SelectInput>
            <TextInput label="AADE User ID" value={credentialDraft.userId} onChange={(value) => setCredentialDraft((current) => ({ ...current, userId: value }))} />
            <TextInput label="Subscription Key" type="password" value={credentialDraft.subscriptionKey} onChange={(value) => setCredentialDraft((current) => ({ ...current, subscriptionKey: value }))} />
            <ActionButton onClick={handleSaveAadeCredentials} disabled={saveAadeCredentials.isPending || credentialStatus?.workerCanStoreSecrets === false}>
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
          <div className="mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-600" /><h2 className="font-black text-slate-900">Εκδότης / AADE</h2></div>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectInput label="Περιβάλλον" value={settingsDraft.environment} onChange={handleEnvironmentChange}>
              <option value="dev">AADE Dev</option>
              <option value="prod">AADE Production</option>
            </SelectInput>
            <TextInput label="ΑΦΜ Εκδότη" value={settingsDraft.issuer.vat_number || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, vat_number: normalizeVatNumber(value) } }))} />
            <TextInput label="Επωνυμία" value={settingsDraft.issuer.business_name || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, business_name: value, name: value } }))} />
            <TextInput label="Υποκατάστημα" type="number" value={settingsDraft.issuer.branch ?? 0} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, branch: Number(value) || 0 } }))} />
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
              {[5, 1, 6, 3].map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
            </SelectInput>
            <TextInput label="Απαλλαγή ΦΠΑ Default" type="number" value={settingsDraft.default_vat_exemption_category || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_vat_exemption_category: value ? Number(value) : null }))} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <TextInput label="E3 Χονδρικής" value={settingsDraft.default_income_classification_type} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_income_classification_type: value, inhouse_income_classification_type: value, imported_income_classification_type: value }))} />
            <TextInput label="Κατηγορία In-house" value={settingsDraft.inhouse_income_classification_category} onChange={(value) => setSettingsDraft((current) => ({ ...current, inhouse_income_classification_category: value }))} />
            <TextInput label="Κατηγορία Εισαγόμενα" value={settingsDraft.imported_income_classification_category} onChange={(value) => setSettingsDraft((current) => ({ ...current, imported_income_classification_category: value }))} />
            <TextInput label="Σκοπός Διακίνησης" type="number" value={settingsDraft.default_move_purpose} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_move_purpose: Number(value) || 1 }))} />
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
                  <div className="text-xs font-medium text-slate-500">AADE {sequence.aade_document_type}</div>
                </div>
                <TextInput label="Σειρά" value={sequence.series} onChange={(value) => saveSequence.mutate({ ...sequence, series: value })} />
                <TextInput label="Επόμενο" type="number" value={sequence.next_aa} onChange={(value) => saveSequence.mutate({ ...sequence, next_aa: Number(value) || 1 })} />
                <SelectInput label="Ενεργό" value={sequence.is_active ? 'yes' : 'no'} onChange={(value) => saveSequence.mutate({ ...sequence, is_active: value === 'yes' })}>
                  <option value="yes">Ναι</option>
                  <option value="no">Όχι</option>
                </SelectInput>
                <div className="pb-2 text-xs font-bold text-slate-500">Atomic RPC</div>
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
      {activeTab === 'archive' && renderArchiveTab()}
      {activeTab === 'delivery' && renderDeliveryTab()}
      {activeTab === 'settings' && renderSettingsTab()}
    </div>
  );
}
