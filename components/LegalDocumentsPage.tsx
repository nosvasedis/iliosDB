import { useRestartDraft } from '../hooks/useRestartBlocker';
import { INTERNAL_CUSTOMER_ID } from '../utils/retailConstants';
import { formatNumber } from '../utils/numberFormat';
import { canIssueCreditForInvoice, remainingCreditQuantityByLine, reservedCreditLinesForOrigin, SBZ_MOVE_PURPOSES } from '../features/legal/sbz';
import SbzSettings, { useSbzStatus } from './legal/SbzSettings';
import CreditDocumentModal from './legal/CreditDocumentModal';
import { api } from '../lib/supabase';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  Ban,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Hash,
  ChevronDown,
  Copy,
  Edit3,
  FileCheck2,
  FileText,
  Filter,
  History,
  Info,
  KeyRound,
  LayoutList,
  Loader2,
  Lock,
  Package,
  Percent,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  FlaskConical,
  Undo2,
  UserRound,
  X,
  Zap,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { AadeVatRegistryResult, Customer, Material, Product, LegalArchiveLineMatch, LegalArchiveRecord, LegalCarrier, LegalDocument, LegalDocumentKind, LegalDocumentLine, LegalEnvironment, LegalExternalItemAlias, LegalNumberingAlignmentPreview, LegalNumberingSequence, LegalOrderLineAllocation, LegalOrderLinkMode, LegalPartyAddress, LegalRegistryConnectionStatus, LegalSettings, ProformaDocument, ProformaDocumentLine } from '../types';
import DesktopPageHeader, { HeaderPrimaryButton } from './DesktopPageHeader';
import SkuProductPicker, { SkuProductSelection } from './legal/SkuProductPicker';
import SystemItemsSettings from './legal/SystemItemsSettings';
import EnvironmentSwitch from './legal/EnvironmentSwitch';
import { CounterpartPickerModal, PickerModal, type CounterpartChoice } from './legal/issue/PickerModal';
import { applyLegalLineUnit, getLegalLineDisplayQuantity, getLegalLineDisplayUnitPrice, getLegalLineUnit, getLegalLineUnitMeta, LEGAL_LINE_UNITS, toStoredLegalQuantity, toStoredLegalUnitPrice, type LegalLineUnit } from '../utils/legalUnits';
import LineIncomeClassificationGear from './legal/LineIncomeClassificationGear';
import ProformaConvertModal from './legal/ProformaConvertModal';
import IncomeClassificationTypeSelect from './legal/IncomeClassificationTypeSelect';
import LegalArchiveWorkspace from './legal/LegalArchiveWorkspace';
import {
  ActionButton,
  Chip,
  chipToneClass,
  cellInputClass,
  DocumentActions,
  documentStatusGroupClass,
  EditorSection,
  FieldGroup,
  FieldMessage,
  type FieldProblem,
  fieldLabelClass,
  focusLegalField,
  iconTextToneClass,
  iconToneClass,
  inputBaseClass,
  InfoTip,
  Notice,
  problemClass,
  SelectInput,
  TextInput,
  type Tone,
} from './legal/issue/ui';
import DeliveryPanel, { withDispatchMethod } from './legal/issue/DeliveryPanel';
import OrderPicker from './legal/issue/OrderPicker';
import CarrierForm, { type CarrierDraft, carrierToDraft, draftToCarrier, EMPTY_CARRIER_DRAFT, linkedSupplier } from './legal/issue/CarrierForm';
import { IssueOutcomePanel, IssueReviewCard, IssuingOverlay } from './legal/issue/IssueFlow';
import { collectDraftIssues, countIssuesBySection, firstIssueMessage, issuesForField, type DraftIssue } from './legal/issue/draftIssues';
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
  useSaveLegalSystemItems,
  useSaveLegalEnvironment,
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
  useLinkLegalArchiveDeliveryNote,
  useSetInspectionExitPin,
} from '../hooks/api/useLegalDocuments';
import { useSellers } from '../hooks/api/useSellers';
import { useSuppliers } from '../hooks/api/useSuppliers';
import { SupplierAvatar } from './suppliers/SupplierCard';
import { ordersRepository } from '../features/orders/repository';
import { isInspectionModeActive } from '../lib/inspectionMode';
import EvidenceSourcesEditor from './inspection/EvidenceSourcesEditor';
import type { InspectionSnapshot } from '../features/inspection/types';
import { useLegalCatalog } from '../hooks/api/useInspection';
import { legalCatalogProducts as mapLegalCatalogProducts } from '../features/inspection/catalog';
import {
  buildLegalArchiveRecords,
  LEGAL_ARCHIVE_PARSE_VERSION,
  legalKeys,
  legalRepository,
  normalizeExternalItemCode,
} from '../features/legal';
import {
  applyAutomaticLegalItemClassification,
  applyCustomerVatProfileToLegalDocument,
  applySupplierToLegalDocument,
  supplierCounterpartCode,
  supplierLegalProfileFromCounterpart,
  applyCustomerVatProfileToProforma,
  applyLegalLineDiscount,
  applyLegalDocumentDeliveryToggle,
  buildDefaultDeliveryDetails,
  buildCounterpartFromCustomer,
  buildPublicVatLookupResult,
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
  getLegalDocumentCatalogProducts,
  applyLegalSystemItemToLine,
  getAllowedIncomeTypeOptions,
  isOfficialLegalDocumentPrint,
  isWholesaleAadeDocumentType,
  AADE_INCOME_CATEGORY_OPTIONS,
  AADE_INCOME_TYPE_OPTIONS,
  AADE_VAT_EXEMPTION_CATEGORY_OPTIONS,
  AADE_VAT_CATEGORY_LINE_OPTIONS,
  applyIssuerSettingsToDocument,
  DEFAULT_LEGAL_SETTINGS,
  getLegalDocumentDeletePrompt,
  getLegalDocumentDisplayNumber,
  getLegalDocumentKindLabel,
  listLegalCountryOptions,
  normalizeLegalCountryCode,
  getProformaDeletePrompt,
  isLegalDocumentEditable,
  resolveLegalMovePurpose,
  normalizeLegalDocumentAddresses,
  normalizeLegalSeriesKey,
  normalizeProformaDocumentAddresses,
  normalizeVatNumber,
  parseLegalPartyAddress,
  PAYMENT_METHOD_CODES,
  PAYMENT_METHOD_LABELS,
  recalculateLegalDocument,
  recalculateProforma,
  resolveSbzDispatchMethod,
  resolveLegalCarrierLabel,
  DEFAULT_SBZ_DISPATCH_METHOD,
  SBZ_CARRIER_DISPATCH_METHOD,
  SBZ_DISPATCH_METHODS,
  SBZ_OWN_MEANS_DISPATCH_METHOD,
  toAthensIsoDate,
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
import { describeCustomerVatLookup, lookupCustomerVat } from '../features/customers/vatLookup';

export type LegalTab = 'new' | 'archive' | 'sync' | 'delivery' | 'settings';
type DocumentCreationSource = 'order' | 'manual';
type CreationDocumentType = LegalDocumentKind | 'proforma' | 'service_invoice';

function creationTypeToLegalKind(type: CreationDocumentType): LegalDocumentKind {
  if (type === 'service_invoice' || type === 'proforma') return 'invoice';
  // Goods invoices default to Τιμολόγιο – Δελτίο Αποστολής (1.1 + isDeliveryNote); untick in «Διακίνηση» when nothing moves.
  if (type === 'invoice') return 'invoice_delivery';
  return type;
}

interface LegalDocumentsPageProps {
  inspectionSnapshot?: InspectionSnapshot;
  inspectionSnapshotPending?: boolean;
  initialDocumentId?: string | null;
  products: Product[];
  materials?: Material[];
  onPrintLegalDocument: (payload: { document: LegalDocument; lines: LegalDocumentLine[] } | null) => void;
  onPrintProforma?: (payload: { document: ProformaDocument; lines: ProformaDocumentLine[] } | null) => void;
  presentation?: 'default' | 'inspection';
  activeTab?: LegalTab;
  onActiveTabChange?: (tab: LegalTab) => void;
}

const secondaryTabItems: Array<{ id: LegalTab; label: string; icon: LucideIcon }> = [
  { id: 'sync', label: 'Συγχρονισμός', icon: RefreshCw },
  { id: 'delivery', label: 'Διακίνηση', icon: Truck },
  { id: 'settings', label: 'Ρυθμίσεις', icon: Settings },
];

const creationTypeItems: Array<{ id: CreationDocumentType; label: string; short: string; code: string; icon: LucideIcon; help: string }> = [
  {
    id: 'invoice',
    label: 'Τιμολόγιο',
    short: 'Πώληση αγαθών · με δελτίο αποστολής',
    code: '1.1',
    icon: ReceiptText,
    help: 'Τιμολόγιο 1.1 με δελτίο αποστολής (προεπιλογή), ώστε η διακίνηση να διαβιβάζεται στη myDATA πριν φύγει το εμπόρευμα. Αν δεν διακινούνται αγαθά, αποεπιλέξτε το «Με δελτίο διακίνησης» στην καρτέλα Διακίνηση.',
  },
  {
    id: 'service_invoice',
    label: 'Τιμολόγιο παροχής υπηρεσιών',
    short: 'Χρέωση υπηρεσιών (ΤΠΥ)',
    code: '2.1',
    icon: Briefcase,
    help: 'Τιμολόγιο Παροχής Υπηρεσιών 2.1 (ΤΠΥ). Δεν συνδυάζεται με δελτίο αποστολής.',
  },
  {
    id: 'delivery_note',
    label: 'Δελτίο αποστολής',
    short: 'Διακίνηση χωρίς τιμολόγηση',
    code: '9.3',
    icon: Truck,
    help: 'Αυτόνομο δελτίο αποστολής 9.3 με υποχρεωτικά στοιχεία διακίνησης.',
  },
  {
    id: 'credit',
    label: 'Πιστωτικό',
    short: 'Επιστροφή ή έκπτωση',
    code: '5.2',
    icon: Undo2,
    help: 'Πιστωτικό τιμολόγιο 5.2.',
  },
  {
    id: 'proforma',
    label: 'Προτιμολόγιο',
    short: 'Προσφορά, χωρίς MARK',
    code: 'Χωρίς MARK',
    icon: FileText,
    help: 'Εμπορικό/ενημερωτικό έγγραφο μόνο. Δεν είναι νόμιμο παραστατικό, δεν παίρνει MARK και δεν αποστέλλεται στη myDATA.',
  },
];

/** Icon shown on the workspace toolbar for a legal document draft. */
const legalKindIcon = (document: Pick<LegalDocument, 'document_kind' | 'aade_document_type'>): LucideIcon => {
  if (document.document_kind === 'credit') return Undo2;
  if (document.document_kind === 'delivery_note') return Truck;
  if (document.aade_document_type === '2.1') return Briefcase;
  return ReceiptText;
};
// Category 8 is reserved by myDATA for accounting entries (e.g. payroll/depreciation),
// not for invoices, credit notes, delivery notes, or proformas created by this screen.
const vatRateOptions = AADE_VAT_CATEGORY_LINE_OPTIONS;
const vatLineOptions = AADE_VAT_CATEGORY_LINE_OPTIONS;
const incomeCategoryOptions = AADE_INCOME_CATEGORY_OPTIONS.map(option => ({ ...option, label: option.label.replace(/\s*\((?:category|E3)[^)]*\)/g, '') }));
const incomeTypeOptions = AADE_INCOME_TYPE_OPTIONS.map(option => ({ ...option, label: option.label.replace(/\s*\((?:category|E3)[^)]*\)/g, '') }));
const proformaIncomeCategoryOptions = incomeCategoryOptions.filter((option) => getAllowedIncomeTypeOptions('1.1', option.value).length > 0);

const withManualIncomeCategory = (
  line: LegalDocumentLine,
  classificationCategory: string,
  documentType: LegalDocument['aade_document_type'],
): LegalDocumentLine => {
  const allowedTypes = getAllowedIncomeTypeOptions(documentType, classificationCategory);
  const currentType = line.income_classification.classification_type || '';
  const classificationType = allowedTypes.some((option) => option.value === currentType)
    ? currentType
    : allowedTypes.find((option) => option.value === 'E3_561_001')?.value || allowedTypes[0]?.value || '';
  return {
    ...line,
    income_classification: {
      ...line.income_classification,
      classification_category: classificationCategory,
      classification_type: classificationType,
    },
    source_metadata: {
      ...(line.source_metadata || {}),
      income_classification_source: 'manual',
    },
  };
};

const withManualIncomeType = (line: LegalDocumentLine, classificationType: string): LegalDocumentLine => ({
  ...line,
  income_classification: {
    ...line.income_classification,
    classification_type: classificationType,
  },
  source_metadata: {
    ...(line.source_metadata || {}),
    income_classification_source: 'manual',
  },
});
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
  submitted: 'Ελέγχεται η έκδοση',
  issued: 'Αποδεκτό',
  failed: 'Χρειάζεται διόρθωση',
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

const today = () => toAthensIsoDate();

/** `YYYY-MM-DD` → `DD/MM/YYYY` without going through Date (no timezone shift). */
const formatIsoDate = (value?: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';

/** ΑΦΜ input with the official registry lookup attached on the right. */
const VatLookupField = ({
  value,
  onChange,
  onLookup,
  loading,
  lookupDisabled,
  problem,
}: {
  value: string;
  onChange: (value: string) => void;
  onLookup: () => void;
  loading: boolean;
  lookupDisabled: boolean;
  problem?: FieldProblem | null;
}) => {
  const id = useId();
  return (
    <div className="min-w-0" data-legal-field="counterpart.vat_number">
      <label htmlFor={id} className={fieldLabelClass}>ΑΦΜ Πελάτη<span className="text-red-500" aria-hidden>*</span></label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          inputMode="numeric"
          maxLength={12}
          placeholder="9 ψηφία"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !lookupDisabled) { event.preventDefault(); onLookup(); } }}
          aria-invalid={problem?.severity === 'error' || undefined}
          className={`${inputBaseClass} ${problemClass(problem)} font-mono tracking-wide`}
        />
        <button
          type="button"
          onClick={onLookup}
          disabled={lookupDisabled}
          title="Επίσημος έλεγχος Μητρώου ΑΑΔΕ με fallback μόνο για βασικά στοιχεία."
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
          <span>Έλεγχος ΑΦΜ</span>
        </button>
      </div>
      <FieldMessage problem={problem} />
    </div>
  );
};

const FieldGroupLabel = ({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 pt-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
    <Icon size={13} /> {children}
    <span className="h-px flex-1 bg-slate-100" />
  </div>
);

const VatExemptionCategorySelect = ({
  label = 'Αιτία απαλλαγής ΦΠΑ',
  value,
  onChange,
  problem,
}: {
  label?: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  problem?: FieldProblem | null;
}) => {
  const hasInvalidStoredValue = value !== null
    && value !== undefined
    && !AADE_VAT_EXEMPTION_CATEGORY_OPTIONS.some((option) => option.category === value);
  const selectedOption = AADE_VAT_EXEMPTION_CATEGORY_OPTIONS.find((option) => option.category === value);

  return (
    <div>
      <SelectInput
        label={label}
        value={value ?? ''}
        onChange={(nextValue) => onChange(nextValue ? Number(nextValue) : null)}
        field="vat_exemption_category"
        problem={problem}
        help="Επίσημοι κωδικοί myDATA v2.0.1, Παράρτημα 8.3. Η επιλογή πρέπει να ανταποκρίνεται στην πραγματική φορολογική μεταχείριση της συναλλαγής."
      >
        <option value="">Επιλέξτε την πραγματική περίπτωση...</option>
        {hasInvalidStoredValue && (
          <option value={value}>Μη έγκυρος αποθηκευμένος κωδικός: {formatNumber(value)}</option>
        )}
        {AADE_VAT_EXEMPTION_CATEGORY_OPTIONS.map((option) => (
          <option key={option.category} value={option.category}>
            {option.category} · {option.label}
          </option>
        ))}
      </SelectInput>
      <div className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${selectedOption ? 'border-sky-200 bg-sky-50 text-sky-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
        {selectedOption ? (
          <>
            <div className="font-semibold">{selectedOption.guidance}</div>
            <div className="mt-1 text-[11px] opacity-75">Νομική βάση myDATA: {selectedOption.description}</div>
          </>
        ) : (
          <>Επιλέξτε αιτία μόνο όταν υπάρχει νόμιμη βάση απαλλαγής. Δεν αρκεί να ζητήσει ο πελάτης παραστατικό χωρίς ΦΠΑ. Αν δεν είστε βέβαιοι, επιβεβαιώστε την επιλογή με τον λογιστή σας.</>
        )}
      </div>
    </div>
  );
};

type DocumentHeaderTab = 'customer' | 'document' | 'delivery';

/** Tabbed card holding the draft's header fields, so they sit side by side instead of stacking. */
const TabbedCard = ({
  tabs,
  active,
  onChange,
  children,
}: {
  tabs: Array<{ id: DocumentHeaderTab; label: string; icon: LucideIcon; hint?: React.ReactNode; attention?: boolean; errors?: number; warnings?: number }>;
  active: DocumentHeaderTab;
  onChange: (tab: DocumentHeaderTab) => void;
  children: React.ReactNode;
}) => (
  <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 pt-2 sm:px-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2.5 text-left transition ${selected ? 'border-emerald-600 bg-emerald-50/40 text-slate-950' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
          >
            <Icon size={15} className={selected ? 'text-emerald-700' : ''} />
            <span className="min-w-0">
              <span className="block text-sm font-black leading-tight">{tab.label}</span>
              {tab.hint ? <span className="block max-w-56 truncate text-[11px] font-medium leading-tight text-slate-400">{tab.hint}</span> : null}
            </span>
            {tab.errors ? (
              <span className="min-w-5 shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white" title={`${tab.errors} ${tab.errors === 1 ? 'σφάλμα' : 'σφάλματα'}`}>{tab.errors}</span>
            ) : tab.warnings ? (
              <span className="min-w-5 shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-amber-950" title={`${tab.warnings} ${tab.warnings === 1 ? 'προειδοποίηση' : 'προειδοποιήσεις'}`}>{tab.warnings}</span>
            ) : tab.attention ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-100" aria-label="Χρειάζεται συμπλήρωση" />
            ) : null}
          </button>
        );
      })}
    </div>
    <div role="tabpanel" className="p-4 sm:p-5">{children}</div>
  </section>
);

type StepState = 'done' | 'active' | 'todo';

const StepIndicator = ({ steps }: { steps: Array<{ label: string; detail: string; state: StepState }> }) => (
  <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
    {steps.map((step, index) => (
      <li key={step.label} className="flex min-w-0 items-center gap-2">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black transition ${
            step.state === 'done'
              ? 'bg-emerald-600 text-white'
              : step.state === 'active'
                ? 'bg-white text-emerald-700 ring-2 ring-emerald-500 shadow-xs shadow-emerald-900/10'
                : 'bg-slate-100 text-slate-400'
          }`}
        >
          {step.state === 'done' ? <CheckCircle2 size={16} /> : index + 1}
        </span>
        <div className="min-w-0">
          <div className={`truncate text-sm font-black ${step.state === 'todo' ? 'text-slate-400' : 'text-slate-900'}`}>{step.label}</div>
          <div className="hidden truncate text-[11px] font-medium text-slate-500 sm:block">{step.detail}</div>
        </div>
        {index < steps.length - 1 && (
          <span className={`ml-1 hidden h-0.5 min-w-4 flex-1 rounded-full md:block ${step.state === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`} />
        )}
      </li>
    ))}
  </ol>
);

/** Sticky document header of the editing workspace: identity, total and the main actions. */
const WorkspaceToolbar = ({
  icon: Icon,
  title,
  code,
  badges,
  subtitle,
  total,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  code?: string;
  badges?: React.ReactNode;
  subtitle: string;
  total: string;
  actions?: React.ReactNode;
}) => (
  <div className="@container/toolbar z-20 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-xs backdrop-blur-sm supports-backdrop-filter:bg-white/85 sm:p-4 2xl:sticky 2xl:top-2">
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 ${actions ? '@min-[72rem]/toolbar:grid-cols-[minmax(0,1fr)_37rem_auto] @min-[72rem]/toolbar:gap-x-5' : ''}`}>
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 sm:gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] text-white shadow-md shadow-[#060b00]/15 ring-1 ring-inset ring-white/10 sm:size-11">
          <Icon size={20} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black leading-tight tracking-tight text-slate-950 sm:text-lg">{title}</h2>
          <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{subtitle}</div>
        </div>
      </div>
      <div className={`col-start-2 row-start-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-right sm:px-3 ${actions ? '@min-[72rem]/toolbar:col-start-3 @min-[72rem]/toolbar:row-span-2' : ''}`}>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Σύνολο</div>
        <div className="whitespace-nowrap text-base font-black tabular-nums leading-tight text-slate-950 sm:text-lg">{total}</div>
      </div>
      {code || badges ? (
        <div className={`${documentStatusGroupClass} col-span-full row-start-2 @min-[72rem]/toolbar:col-span-1 @min-[72rem]/toolbar:col-start-1 @min-[72rem]/toolbar:pl-14`}>
          {code ? <Chip className="font-mono">{code}</Chip> : null}
          {badges}
        </div>
      ) : null}
      {actions ? (
        <div className="col-span-full min-w-0 border-t border-slate-100 pt-2.5 @min-[72rem]/toolbar:col-span-1 @min-[72rem]/toolbar:col-start-2 @min-[72rem]/toolbar:row-span-2 @min-[72rem]/toolbar:row-start-1 @min-[72rem]/toolbar:border-0 @min-[72rem]/toolbar:pt-0">
          <div className="ml-auto max-w-[37rem]">
            <DocumentActions>{actions}</DocumentActions>
          </div>
        </div>
      ) : null}
    </div>
  </div>
);

const TotalsBox = ({
  rows,
  total,
  totalLabel = 'Σύνολο',
}: {
  rows: Array<{ label: string; value: string; className?: string }>;
  total: string;
  totalLabel?: string;
}) => (
  <dl className="w-full space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200 sm:w-80">
    {rows.map((row) => (
      <div key={row.label} className="flex items-center justify-between gap-4">
        <dt className="font-medium text-slate-500">{row.label}</dt>
        <dd className={`font-bold tabular-nums ${row.className || 'text-slate-800'}`}>{row.value}</dd>
      </div>
    ))}
    <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-200 pt-2.5">
      <dt className="text-xs font-black uppercase tracking-wide text-slate-600">{totalLabel}</dt>
      <dd className="text-xl font-black tabular-nums text-slate-950">{total}</dd>
    </div>
  </dl>
);

const KpiTile = ({
  icon: Icon,
  label,
  value,
  tone,
  layout,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: Tone;
  layout: 'chip' | 'tile';
}) => layout === 'chip' ? (
  <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5" title={`${label}: ${value}`}>
    <Icon size={13} className={iconTextToneClass[tone]} />
    <span className="text-[11px] font-semibold text-slate-500">{label}</span>
    <span className="text-xs font-black tabular-nums text-slate-900">{value}</span>
  </div>
) : (
  <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-xs">
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconToneClass[tone]}`}><Icon size={16} /></span>
    <div className="min-w-0">
      <div className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="truncate text-lg font-black leading-tight text-slate-900">{value}</div>
    </div>
  </div>
);

const SettingsCard = ({
  icon: Icon,
  tone = 'slate',
  title,
  subtitle,
  action,
  children,
}: {
  icon: LucideIcon;
  tone?: 'slate' | 'emerald' | 'indigo' | 'sky' | 'amber';
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 max-w-3xl text-sm font-medium leading-5 text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
};

const SettingsGroup = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</h3>
      {description && <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{description}</p>}
    </div>
    {children}
  </div>
);

const SettingsStatusBadge = ({
  tone,
  children,
}: {
  tone: 'emerald' | 'sky' | 'amber' | 'slate';
  children: React.ReactNode;
}) => {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black ${tones[tone]}`}>
      {children}
    </span>
  );
};

type NumberingAlignmentStatus = 'loading' | 'ready' | 'applying';

interface NumberingAlignmentModalProps {
  isOpen: boolean;
  status: NumberingAlignmentStatus;
  preview: LegalNumberingAlignmentPreview | null;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onApply: () => void;
}

const NumberingAlignmentModal = ({
  isOpen,
  status,
  preview,
  error,
  onClose,
  onRetry,
  onApply,
}: NumberingAlignmentModalProps) => {
  if (!isOpen) return null;

  const isBusy = status === 'loading' || status === 'applying';
  const hasChanges = !!preview?.changes.length;
  const generatedAt = preview?.generated_at
    ? new Date(preview.generated_at).toLocaleString('el-GR')
    : null;
  const describe = (entry: LegalNumberingAlignmentPreview['changes'][number]) =>
    `${getLegalDocumentKindLabel(entry.document_kind, entry.aade_document_type)} · σειρά «${entry.series}» · τύπος ${entry.aade_document_type}`;

  return (
    <div
      className="fixed inset-0 z-260 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-xs print:hidden sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="numbering-alignment-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <div className="mb-1 flex items-center gap-2 text-slate-950">
              <RefreshCw size={20} className="text-sky-600" />
              <h2 id="numbering-alignment-title" className="text-lg font-black">Ευθυγράμμιση αρίθμησης με το Αρχείο</h2>
            </div>
            <p className="text-sm font-medium text-slate-500">
              Έλεγχος των ενεργών σειρών απέναντι στα παραστατικά που έχουν ήδη καταχωρηθεί.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Κλείσιμο"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <XCircle size={22} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {status === 'loading' && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <Loader2 size={32} className="animate-spin text-sky-600" />
              <div>
                <div className="font-black text-slate-900">Έλεγχος τρέχουσας αρίθμησης</div>
                <div className="mt-1 text-sm font-medium text-slate-500">Δεν γίνεται καμία αλλαγή σε αυτό το στάδιο.</div>
              </div>
            </div>
          )}

          {status !== 'loading' && error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-black">Ο έλεγχος δεν ολοκληρώθηκε</div>
                  <div className="mt-1 text-sm font-medium">{error}</div>
                </div>
              </div>
            </div>
          )}

          {status !== 'loading' && preview && (
            <div className="space-y-5">
              <div className={`rounded-xl border p-4 ${hasChanges ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="flex items-start gap-3">
                  {hasChanges
                    ? <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-700" />
                    : <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-700" />}
                  <div>
                    <div className={`font-black ${hasChanges ? 'text-amber-950' : 'text-emerald-950'}`}>
                      {hasChanges
                        ? `${formatNumber(preview.changes.length)} ${preview.changes.length === 1 ? 'σειρά χρειάζεται' : 'σειρές χρειάζονται'} ενημέρωση`
                        : 'Η αρίθμηση είναι ήδη ασφαλής'}
                    </div>
                    <div className={`mt-1 text-sm font-medium ${hasChanges ? 'text-amber-800' : 'text-emerald-800'}`}>
                      {hasChanges
                        ? 'Το «Επόμενο» θα αυξηθεί μόνο όπου το Αρχείο έχει ήδη μεγαλύτερο Α/Α. Δεν μειώνεται ποτέ.'
                        : 'Καμία ενεργή σειρά δεν βρίσκεται πίσω από το τρέχον Αρχείο.'}
                    </div>
                    {generatedAt && <div className="mt-2 text-xs font-bold opacity-70">Έλεγχος: {generatedAt}</div>}
                  </div>
                </div>
              </div>

              {hasChanges && (
                <section>
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Προτεινόμενες αλλαγές</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {preview.changes.map((entry) => (
                      <div key={entry.sequence_id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-xs">
                        <div className="text-sm font-black text-slate-900">{describe(entry)}</div>
                        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                          <div className="rounded-lg bg-slate-100 px-3 py-2">
                            <div className="text-[10px] font-black uppercase text-slate-500">Τώρα</div>
                            <div className="text-xl font-black text-slate-800">{entry.current_next_aa}</div>
                          </div>
                          <span className="font-black text-amber-600">→</span>
                          <div className="rounded-lg bg-amber-100 px-3 py-2">
                            <div className="text-[10px] font-black uppercase text-amber-700">Νέο επόμενο</div>
                            <div className="text-xl font-black text-amber-950">{entry.proposed_next_aa}</div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs font-bold text-slate-500">
                          Μέγιστος Α/Α Αρχείου: {entry.max_aa ?? '—'} · {formatNumber(entry.document_count)} εγγραφές
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <details className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4" open={!hasChanges}>
                  <summary className="cursor-pointer text-sm font-black text-emerald-900">
                    Ήδη ασφαλείς ({formatNumber(preview.already_safe.length)})
                  </summary>
                  <div className="mt-3 space-y-2 text-xs font-medium text-emerald-900">
                    {preview.already_safe.length ? preview.already_safe.map((entry) => (
                      <div key={entry.sequence_id} className="rounded-lg bg-white/80 p-2">
                        <div className="font-bold">{describe(entry)}</div>
                        <div className="mt-1 opacity-75">Επόμενο {entry.current_next_aa} · μέγιστος Α/Α {entry.max_aa ?? '—'}</div>
                      </div>
                    )) : <div className="opacity-70">Καμία σειρά με υπάρχον ιστορικό.</div>}
                  </div>
                </details>

                <details className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                  <summary className="cursor-pointer text-sm font-black text-sky-900">
                    Νέες σειρές ({formatNumber(preview.new_namespaces.length)})
                  </summary>
                  <div className="mt-3 space-y-2 text-xs font-medium text-sky-900">
                    {preview.new_namespaces.length ? preview.new_namespaces.map((entry) => (
                      <div key={entry.sequence_id} className="rounded-lg bg-white/80 p-2">
                        <div className="font-bold">{describe(entry)}</div>
                        <div className="mt-1 opacity-75">Ξεκινά ανεξάρτητα από επόμενο {entry.current_next_aa}.</div>
                      </div>
                    )) : <div className="opacity-70">Καμία.</div>}
                  </div>
                </details>

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-black text-slate-800">
                    Ιστορικές σειρές ({formatNumber(preview.historical_series.length)})
                  </summary>
                  <div className="mt-3 space-y-2 text-xs font-medium text-slate-700">
                    {preview.historical_series.length ? preview.historical_series.map((entry) => (
                      <div key={`${entry.active_sequence_id}-${entry.series_key}`} className="rounded-lg bg-white p-2">
                        <div className="font-bold">
                          {getLegalDocumentKindLabel(entry.document_kind, entry.aade_document_type)} · σειρά «{entry.series}»
                        </div>
                        <div className="mt-1 opacity-75">
                          {formatNumber(entry.document_count)} εγγραφές · μέγιστος Α/Α {entry.max_aa ?? '—'} · δεν επηρεάζει τη σειρά «{entry.active_series}»
                        </div>
                      </div>
                    )) : <div className="opacity-70">Καμία.</div>}
                  </div>
                </details>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <ActionButton variant="secondary" onClick={onClose} disabled={isBusy}>Κλείσιμο</ActionButton>
          {status !== 'loading' && error && (
            <ActionButton variant="secondary" onClick={onRetry} disabled={isBusy}>
              <RefreshCw size={16} /> Νέος έλεγχος
            </ActionButton>
          )}
          {preview && hasChanges && !error && (
            <ActionButton onClick={onApply} disabled={isBusy}>
              {status === 'applying' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {status === 'applying' ? 'Εφαρμογή…' : 'Εφαρμογή ασφαλών αλλαγών'}
            </ActionButton>
          )}
        </footer>
      </section>
    </div>
  );
};

export default function LegalDocumentsPage({
  products: suppliedProducts,
  materials = [],
  onPrintLegalDocument,
  onPrintProforma,
  presentation = 'default',
  activeTab: activeTabProp,
  onActiveTabChange,
  inspectionSnapshot,
  inspectionSnapshotPending = false,
  initialDocumentId,
}: LegalDocumentsPageProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<LegalTab>('new');
  const isControlledTab = activeTabProp !== undefined;
  const activeTab = isControlledTab ? activeTabProp : internalActiveTab;
  const setActiveTab = (tab: LegalTab) => {
    if (!isControlledTab) setInternalActiveTab(tab);
    onActiveTabChange?.(tab);
  };
  const isInspectionPresentation = presentation === 'inspection';
  const { query: catalogQuery, canRefresh: canRefreshCatalog, ready: catalogReady } = useLegalCatalog(activeTab === 'new');
  const catalogItems = catalogQuery.data?.items;
  const products = useMemo<Product[]>(() => {
    if (catalogItems) return mapLegalCatalogProducts(catalogItems);
    return isInspectionPresentation ? [] : suppliedProducts;
  }, [catalogItems, isInspectionPresentation, suppliedProducts]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [creationDocumentType, setCreationDocumentType] = useState<CreationDocumentType>('invoice');
  const [creationSource, setCreationSource] = useState<DocumentCreationSource>('order');
  /** Manual documents: to a customer or to a partner, optionally chosen before the editor opens. */
  const [manualCounterpartKind, setManualCounterpartKind] = useState<CounterpartChoice['kind']>('customer');
  const [manualCounterpart, setManualCounterpart] = useState<CounterpartChoice | null>(null);
  const [pickerModal, setPickerModal] = useState<'order' | CounterpartChoice['kind'] | null>(null);
  const creationSourceChoice = creationSource === 'order' ? 'order' : manualCounterpartKind;
  const [draftBundle, setDraftBundle] = useState<{ document: LegalDocument; lines: LegalDocumentLine[] } | null>(null);
  const [proformaBundle, setProformaBundle] = useState<{ document: ProformaDocument; lines: ProformaDocumentLine[] } | null>(null);
  const [legalSkuFocusLineId, setLegalSkuFocusLineId] = useState<string | null>(null);
  const [proformaSkuFocusLineId, setProformaSkuFocusLineId] = useState<string | null>(null);
  const [draftVatLookupTarget, setDraftVatLookupTarget] = useState<'legal' | 'proforma' | null>(null);
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
  const [numberingAlignmentModal, setNumberingAlignmentModal] = useState<{
    isOpen: boolean;
    status: NumberingAlignmentStatus;
    preview: LegalNumberingAlignmentPreview | null;
    error: string | null;
  }>({ isOpen: false, status: 'ready', preview: null, error: null });
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
  const [newCarrier, setNewCarrier] = useState<CarrierDraft>(EMPTY_CARRIER_DRAFT);
  const [editingCarrier, setEditingCarrier] = useState<{ id: string; draft: CarrierDraft } | null>(null);
  const [credentialEnvironment, setCredentialEnvironment] = useState<LegalEnvironment>('dev');
  const [credentialDraft, setCredentialDraft] = useState({ userId: '', subscriptionKey: '' });
  const [registryCredentialDraft, setRegistryCredentialDraft] = useState({ username: '', password: '' });
  const [registryConnectionStatus, setRegistryConnectionStatus] = useState<LegalRegistryConnectionStatus>({
    configured: false,
    verified: false,
  });
  const [cloudflareBootstrapDraft, setCloudflareBootstrapDraft] = useState({ apiToken: '', accountId: '' });
  const [headerTab, setHeaderTab] = useState<DocumentHeaderTab>('customer');
  /** Result of the last «Έκδοση»: shown instead of the editor so the same draft cannot be sent twice. */
  const [issueOutcome, setIssueOutcome] = useState<LegalDocument | null>(null);
  const [issuingDocument, setIssuingDocument] = useState<LegalDocument | null>(null);
  const [reconcilingOutcome, setReconcilingOutcome] = useState(false);
  /** Synchronous single-flight lock: a second click never reaches the provider while one send runs. */
  const issuingRef = useRef(false);
  const [showInspectionPinSection, setShowInspectionPinSection] = useState(false);
  const [inspectionPinDraft, setInspectionPinDraft] = useState('');
  const [inspectionPinConfirm, setInspectionPinConfirm] = useState('');
  const settingsSecretClickRef = useRef({ count: 0, timer: null as ReturnType<typeof setTimeout> | null });
  const numberingAlignmentRequestRef = useRef(0);
  const archivePublicVatLookupCacheRef = useRef(
    new Map<string, Promise<AadeVatRegistryResult>>(),
  );

  const { showToast, confirm } = useUI();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const userName = profile?.full_name || profile?.email || null;
  const legalCatalogProducts = useMemo(
    () => getLegalDocumentCatalogProducts(products, settingsDraft.system_items),
    [products, settingsDraft.system_items],
  );

  const { data: orders = [], isLoading: loadingOrders } = useOrdersWithItems();
  const { data: customers = [] } = useCustomers();
  /** We never issue documents to ourselves: the internal-orders account is not a counterpart. */
  const invoiceableCustomers = useMemo(() => customers.filter(customer => customer.id !== INTERNAL_CUSTOMER_ID), [customers]);
  const { data: sellers = [], isLoading: loadingSellers } = useSellers();
  /** Partners («Προμηθευτές & Συνεργάτες»): carriers link to them for logo and details. */
  const { data: suppliers = [] } = useSuppliers();
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.is_active !== false), [suppliers]);
  const { data: shipments = [] } = useAllShipments();
  const { data: shipmentItems = [] } = useAllShipmentItems();
  const { data: legalSettings } = useLegalSettings();
  const { data: sbzStatus, refetch: refreshSbzStatus } = useSbzStatus();
  const saveEnvironment = useSaveLegalEnvironment();
  /** The environment saved on the server — the one new documents are issued in. */
  const persistedEnvironment: LegalEnvironment = legalSettings?.environment === 'prod' || legalSettings?.environment === 'dev'
    ? legalSettings.environment
    : settingsDraft.environment;
  const [creditSource, setCreditSource] = useState<{document: LegalDocument; lines: LegalDocumentLine[]; reservedLines: LegalDocumentLine[]; available: Record<string, number>} | null>(null);
  const openCredit = async (document: LegalDocument) => {
    try {
      const lines = await legalRepository.getDocumentLines(document.id);
      if (!canIssueCreditForInvoice(document, lines, legalDocuments, allLegalDocumentLines)) {
        showToast('Δεν απομένει ποσότητα για πίστωση σε αυτό το τιμολόγιο.', 'info');
        return;
      }
      const reservedLines = reservedCreditLinesForOrigin(document.id, legalDocuments, allLegalDocumentLines);
      setCreditSource({ document, lines, available: remainingCreditQuantityByLine(lines, reservedLines), reservedLines });
    } catch (e) { showToast((e as Error).message, 'error'); }
  };
  const reconcileSbz = async (document: LegalDocument) => {
    try {
      const result = await api.reconcileLegalDocument(document.id);
      showToast(result.provider_state === 'unknown' ? 'Ο έλεγχος παραμένει εκκρεμής. Δεν έγινε νέα αποστολή.' : 'Ο έλεγχος ολοκληρώθηκε.', 'info');
      return result;
    } catch (e) {
      showToast((e as Error).message, 'error');
      return null;
    } finally {
      void queryClient.invalidateQueries({ queryKey: legalKeys.documents() });
    }
  };
  const attachSbz = async (document: LegalDocument, file: File) => {
    try { const form = new FormData(); form.set('documentId', document.id); form.set('file', file); await api.callSbz('/sbz/attach', form); showToast('Το αρχείο επισυνάφθηκε στον πάροχο.', 'success'); }
    catch (e) { showToast((e as Error).message, 'error'); }
    finally { await queryClient.invalidateQueries({queryKey: legalKeys.documents()}); }
  };

  const { data: credentialStatus, isLoading: loadingCredentialStatus, refetch: refetchCredentialStatus } = useAadeCredentialStatus();
  const { data: sequences = [] } = useLegalNumberingSequences();
  const { data: carriers = [] } = useLegalCarriers();
  const { data: legalDocuments = [], isLoading: loadingDocuments, isError: documentsError } = useLegalDocuments();
  const visibleLegalDocuments = useMemo(
    () => isInspectionPresentation
      ? (inspectionSnapshot?.tables.legal_documents || []) as LegalDocument[]
      : legalDocuments.filter((document) => isWholesaleAadeDocumentType(document.aade_document_type) && (document.environment === settingsDraft.environment || !document.environment)),
    [legalDocuments, settingsDraft.environment, isInspectionPresentation, inspectionSnapshot],
  );
  const { data: allLegalDocumentLines = [], isLoading: loadingArchiveLines, isError: linesError } = useAllLegalDocumentLines();
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
  const linkLegalArchiveDeliveryNote = useLinkLegalArchiveDeliveryNote();
  const saveSequence = useSaveLegalSequence();
  const saveCarrier = useSaveLegalCarrier();
  const saveSystemItems = useSaveLegalSystemItems();
  const productSkuList = useMemo(() => products.map((product) => product.sku), [products]);
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

  useRestartDraft('Μετατροπή προτιμολογίου', convertModal, { enabled: !!convertModal });
  const legalDraftRestart = useRestartDraft('Παραστατικό', draftBundle, { enabled: !!draftBundle && isLegalDocumentEditable(draftBundle.document), identity: draftBundle?.document.id, initiallyDirty: !!draftBundle && !legalDocuments.some(row => row.id === draftBundle.document.id) });
  const proformaRestart = useRestartDraft('Προτιμολόγιο', proformaBundle, { enabled: !!proformaBundle, identity: proformaBundle?.document.id, initiallyDirty: !!proformaBundle && !proformas.some(row => row.id === proformaBundle.document.id) });
  const legalSettingsRestart = useRestartDraft('Ρυθμίσεις παραστατικών', settingsDraft);
  const sequencesRestart = useRestartDraft('Αρίθμηση παραστατικών', sequenceDrafts);
  useRestartDraft('Στοιχεία σύνδεσης παραστατικών', { credentialDraft, registryCredentialDraft, cloudflareBootstrapDraft, inspectionPinDraft, inspectionPinConfirm, newCarrier, editingCarrier });

  useEffect(() => {
    if (legalSettings && !legalSettingsRestart.dirty) {
      const usesLegacyProductDefaults = legalSettings.default_income_classification_category === 'category1_2'
        && legalSettings.inhouse_income_classification_category === 'category1_2'
        && legalSettings.imported_income_classification_category === 'category1_1';
      const nextSettings = {
        ...DEFAULT_LEGAL_SETTINGS,
        ...legalSettings,
        ...(usesLegacyProductDefaults ? {
          default_income_classification_category: 'category1_1',
          inhouse_income_classification_category: 'category1_1',
        } : {}),
        issuer: { ...DEFAULT_LEGAL_SETTINGS.issuer, ...(legalSettings.issuer || {}) },
        loading_address: legalSettings.loading_address || DEFAULT_LEGAL_SETTINGS.loading_address,
      };
      legalSettingsRestart.markSaved(nextSettings);
      setSettingsDraft(nextSettings);
    }
  }, [legalSettings]);

  useEffect(() => {
    if (sequencesRestart.dirty) return;
    const next = Object.fromEntries(sequences.map((sequence) => [sequence.id, { ...sequence }]));
    sequencesRestart.markSaved(next);
    setSequenceDrafts(next);
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

  // Every newly opened draft starts on its customer tab.
  useEffect(() => {
    setHeaderTab('customer');
  }, [draftBundle?.document.id, proformaBundle?.document.id]);

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

  // Proformas go to customers only: leave the partner option if the type changes to proforma.
  useEffect(() => {
    if (creationDocumentType === 'proforma' && manualCounterpartKind === 'supplier') {
      setManualCounterpartKind('customer');
      setManualCounterpart(null);
    }
  }, [creationDocumentType, manualCounterpartKind]);

  const manualCustomer = useMemo(
    () => (creationSource === 'manual' && manualCounterpart?.kind === 'customer' ? customers.find((customer) => customer.id === manualCounterpart.id) || null : null),
    [creationSource, manualCounterpart, customers],
  );
  const manualSupplier = useMemo(
    () => (creationSource === 'manual' && manualCounterpart?.kind === 'supplier' && creationDocumentType !== 'proforma' ? suppliers.find((supplier) => supplier.id === manualCounterpart.id) || null : null),
    [creationSource, manualCounterpart, suppliers, creationDocumentType],
  );
  const manualCounterpartLabel = manualCustomer
    ? { name: manualCustomer.full_name, detail: [manualCustomer.vat_number ? `ΑΦΜ ${manualCustomer.vat_number}` : 'Χωρίς ΑΦΜ', manualCustomer.customer_code ? `κωδ. ${manualCustomer.customer_code}` : '', manualCustomer.address || ''].filter(Boolean).join(' · ') }
    : manualSupplier
      ? { name: manualSupplier.name, detail: [manualSupplier.vat_number ? `ΑΦΜ ${manualSupplier.vat_number}` : 'Χωρίς ΑΦΜ', manualSupplier.legal_profile?.tax_office ? `ΔΟΥ ${manualSupplier.legal_profile.tax_office}` : 'Χωρίς ΔΟΥ · «Έλεγχος ΑΦΜ» στο παραστατικό', manualSupplier.address || ''].filter(Boolean).join(' · ') }
      : null;

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

  /** Issued or in-flight (non-credit) documents per order, to warn before invoicing an order twice. */
  const documentsByOrder = useMemo(() => {
    const map = new Map<string, LegalDocument[]>();
    for (const document of visibleLegalDocuments) {
      if (!document.order_id || document.document_kind === 'credit') continue;
      if (document.status !== 'issued' && document.status !== 'submitted') continue;
      map.set(document.order_id, [...(map.get(document.order_id) || []), document]);
    }
    return map;
  }, [visibleLegalDocuments]);

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

  const stats = useMemo(() => {
    const confirmed = isInspectionPresentation ? visibleLegalDocuments.filter(document => !!document.environment) : visibleLegalDocuments;
    return {
    issued: confirmed.filter((document) => document.status === 'issued').length,
    failed: confirmed.filter((document) => document.status === 'failed').length,
    cancelled: confirmed.filter((document) => document.status === 'cancelled').length,
    printable: confirmed.filter((document) => canPrintLegalDocument(document)).length,
    proformas: proformas.filter((document) => document.status === 'draft').length,
  }; }, [visibleLegalDocuments, proformas, isInspectionPresentation]);

  /** Latest unfinished work shown on the creation screen so it can be resumed in one click. */
  const resumableDrafts = useMemo(() => {
    if (isInspectionPresentation) return [];
    const legal = visibleLegalDocuments
      .filter((document) => document.status === 'draft' || document.status === 'failed')
      .map((document) => ({ source: 'legal' as const, date: document.updated_at || document.created_at, document }));
    const drafts = proformas
      .filter((document) => document.status === 'draft')
      .map((document) => ({ source: 'proforma' as const, date: document.updated_at || document.created_at, document }));
    return [...legal, ...drafts]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 5);
  }, [visibleLegalDocuments, proformas, isInspectionPresentation]);

  /** Field-level issuing checks: errors are the provider checks, warnings the advisory legal checks. */
  const draftIssues = useMemo<DraftIssue[]>(
    () => (draftBundle ? collectDraftIssues(draftBundle.document, draftBundle.lines) : []),
    [draftBundle],
  );
  const validationErrors = draftIssues.filter((issue) => issue.severity === 'error');
  /** Customer of the open draft: the linked ERP customer, else the selected order's customer. */
  const draftCustomer = useMemo(() => {
    const linkedId = draftBundle?.document.counterpart_customer_id;
    return (linkedId ? customers.find((customer) => customer.id === linkedId) : null) || selectedCustomer;
  }, [draftBundle?.document.counterpart_customer_id, customers, selectedCustomer]);
  /** Plates used recently with «Ίδια μέσα», newest first, for one-click reuse. */
  const recentVehicles = useMemo(() => {
    const plates: string[] = [];
    const sorted = [...legalDocuments].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
    for (const document of sorted) {
      if (resolveSbzDispatchMethod(document.delivery) !== SBZ_OWN_MEANS_DISPATCH_METHOD) continue;
      const plate = String(document.delivery?.vehicle_number || '').trim();
      if (plate && !plates.includes(plate)) plates.push(plate);
      if (plates.length >= 4) break;
    }
    return plates;
  }, [legalDocuments]);
  const activeCredentialStatus = credentialStatus?.[settingsDraft.environment];
  const missingSecretManager = credentialStatus?.missingWorkerSecretManager || [];
  const missingAadeCredentials = credentialStatus?.missingAadeCredentials || [];
  const missingRegistryCredentials = credentialStatus?.missingRegistryCredentials || [];

  const filteredArchive = useMemo(() => {
    const needle = archiveSearch.trim().toLowerCase();
    if (!needle) return visibleLegalDocuments;
    return visibleLegalDocuments.filter((document) => [
      getLegalDocumentDisplayNumber(document),
      document.counterpart.name,
      document.counterpart.vat_number,
      document.aade_mark,
      document.last_error,
    ].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [archiveSearch, visibleLegalDocuments]);

  const legalDocumentById = useMemo(
    () => new Map(visibleLegalDocuments.map((document) => [document.id, document])),
    [visibleLegalDocuments],
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
      legalDocuments: visibleLegalDocuments,
      legalLines: isInspectionPresentation ? (inspectionSnapshot?.tables.legal_document_lines || []) as LegalDocumentLine[] : allLegalDocumentLines,
      proformas,
      proformaLines: allProformaDocumentLines,
      customers,
      products,
      orders,
      aliases: legalItemAliases,
      sellers,
    }),
    [
      visibleLegalDocuments,
      inspectionSnapshot,
      isInspectionPresentation,
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
    if (isInspectionPresentation || activeTab !== 'archive' || enrichLegalArchive.isPending) return;
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
    if (isInspectionPresentation || activeTab !== 'archive' || linkLegalArchiveOrder.isPending) return;
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
    if (isInspectionPresentation || activeTab !== 'archive' || linkLegalArchiveSeller.isPending) return;
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
    () => visibleLegalDocuments.filter((document) =>
      document.document_kind === 'delivery_note' || document.document_kind === 'invoice_delivery'
    ),
    [visibleLegalDocuments]
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

  /**
   * New delivery notes ship with ACS by default: «Μεταφορική» + the default carrier (ACS).
   * Only replaces the untouched default, never a method or carrier already set.
   */
  const withPreferredDispatch = (document: LegalDocument): LegalDocument => {
    if (!documentIncludesDeliveryNote(document) || !document.delivery || document.delivery.carrier_id) return document;
    if (resolveSbzDispatchMethod(document.delivery) !== DEFAULT_SBZ_DISPATCH_METHOD) return document;
    return { ...document, delivery: withDispatchMethod(document.delivery, SBZ_CARRIER_DISPATCH_METHOD, carriers, suppliers) };
  };

  const openNewLegalDraft = (document: LegalDocument) => {
    setIssueOutcome(null);
    setProformaBundle(null);
    // A draft belongs to the environment it was created in, even if the setting changes later.
    setDraftBundle({ document: withPreferredDispatch({ ...document, environment: document.environment || persistedEnvironment }), lines: document.lines || [] });
  };

  /** Saves a new or edited carrier; an edit also refreshes the carrier snapshot of the open draft. */
  const persistCarrier = async (draft: CarrierDraft, existing: LegalCarrier | null): Promise<LegalCarrier | null> => {
    if (!draft.name.trim()) return null;
    const carrier = draftToCarrier(draft, existing, carriers.length === 0);
    try {
      await saveCarrier.mutateAsync(carrier);
      if (existing) {
        setDraftBundle((current) => current && current.document.delivery?.carrier_id === carrier.id && isLegalDocumentEditable(current.document)
          ? {
            ...current,
            document: {
              ...current.document,
              delivery: {
                ...current.document.delivery,
                carrier_name: carrier.name,
                carrier_vat_number: carrier.vat_number || null,
                carrier_vehicle_number: carrier.vehicle_number || null,
              },
            },
          }
          : current);
      }
      return carrier;
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε ο μεταφορέας.', 'error');
      return null;
    }
  };

  const handleCreateCarrierInline = async (draft: CarrierDraft) => {
    const carrier = await persistCarrier(draft, null);
    if (carrier) showToast(`Ο μεταφορέας «${carrier.name}» αποθηκεύτηκε και επιλέχθηκε.`, 'success');
    return carrier;
  };

  const applyCustomerToDraft = (customerId: string, target: 'legal' | 'proforma') => {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    if (target === 'legal') {
      updateDraftBundle((document, lines) => applyCustomerVatProfileToLegalDocument(document, lines, customer, settingsDraft));
    } else {
      updateProformaBundle((document, lines) => applyCustomerVatProfileToProforma(document, lines, customer, settingsDraft));
    }
  };

  /** Counterpart picker value: `c:<customer id>` or `s:<partner id>`. */
  const applyCounterpartToDraft = (value: string) => {
    if (value.startsWith('c:')) { applyCustomerToDraft(value.slice(2), 'legal'); return; }
    if (!value.startsWith('s:')) return;
    const supplier = suppliers.find((item) => item.id === value.slice(2));
    if (!supplier) return;
    updateDraftBundle((document, lines) => applySupplierToLegalDocument(document, lines, supplier, settingsDraft));
    if (!supplier.legal_profile?.tax_office || !supplier.legal_profile?.profession || !supplier.vat_number) {
      showToast('Ο συνεργάτης δεν έχει ακόμα πλήρη φορολογικά στοιχεία. Πατήστε «Έλεγχος ΑΦΜ» για να συμπληρωθούν και να αποθηκευτούν.', 'info');
    }
  };

  const [savingSupplierProfile, setSavingSupplierProfile] = useState(false);
  /** Keeps ΔΟΥ, επάγγελμα, έδρα and ΑΦΜ on the partner so the next document is ready without a lookup. */
  const persistSupplierProfile = async (counterpart: LegalDocument['counterpart'], verified: boolean, silent = false) => {
    const supplier = suppliers.find((item) => item.id === counterpart.supplier_id);
    if (!supplier) return;
    setSavingSupplierProfile(true);
    try {
      await api.saveSupplier({
        id: supplier.id,
        vat_number: normalizeVatNumber(counterpart.vat_number) || supplier.vat_number || null,
        legal_profile: supplierLegalProfileFromCounterpart(counterpart, supplier.legal_profile, verified),
      });
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      if (!silent) showToast(`Τα φορολογικά στοιχεία αποθηκεύτηκαν στον συνεργάτη ${supplier.name}.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκαν τα στοιχεία στον συνεργάτη.', 'error');
    } finally {
      setSavingSupplierProfile(false);
    }
  };

  const handleDraftVatLookup = async (target: 'legal' | 'proforma') => {
    const current = target === 'legal' ? draftBundle?.document : proformaBundle?.document;
    const vatNumber = normalizeVatNumber(current?.counterpart.vat_number);
    if (!/^\d{9}$/.test(vatNumber)) {
      showToast('Συμπληρώστε έγκυρο ΑΦΜ πελάτη 9 ψηφίων.', 'error');
      return;
    }
    setDraftVatLookupTarget(target);
    try {
      const result = await lookupCustomerVat(vatNumber);
      // A partner counterpart stays a partner even if a customer shares the ΑΦΜ.
      const linkedSupplierId = target === 'legal' ? current?.counterpart.supplier_id || null : null;
      const matchedCustomer = linkedSupplierId ? undefined : customers.find(customer => normalizeVatNumber(customer.vat_number) === vatNumber);
      const applyResult = <T extends LegalDocument | ProformaDocument>(document: T): T => ({
        ...document,
        counterpart_customer_id: matchedCustomer?.id || document.counterpart_customer_id,
        counterpart: {
          ...document.counterpart,
          customer_code: matchedCustomer?.customer_code || document.counterpart.customer_code,
          name: result.name || document.counterpart.name,
          address: parseLegalPartyAddress(result.address) || document.counterpart.address,
          phone: document.counterpart.phone || result.phone,
          email: document.counterpart.email || result.email,
          profession: result.profession || document.counterpart.profession,
          tax_office: result.taxOffice || document.counterpart.tax_office,
        },
      });
      if (target === 'legal') {
        updateDraftBundle((document, lines) => {
          const profiled = matchedCustomer
            ? applyCustomerVatProfileToLegalDocument(document, lines, matchedCustomer, settingsDraft)
            : recalculateLegalDocument(document, lines, settingsDraft);
          const updated = applyResult(profiled.document);
          // The delivery follows the counterpart's (updated) seat unless another address was chosen.
          const previousAddress = JSON.stringify(profiled.document.counterpart.address || null);
          const keepsDefaultDestination = updated.delivery
            && (!updated.delivery.delivery_address || JSON.stringify(updated.delivery.delivery_address) === previousAddress);
          return {
            ...profiled,
            document: keepsDefaultDestination ? { ...updated, delivery: { ...updated.delivery, delivery_address: updated.counterpart.address || null } } : updated,
          };
        });
        if (linkedSupplierId && current && result.active !== false) {
          void persistSupplierProfile(applyResult(current as LegalDocument).counterpart, true);
        }
      } else {
        updateProformaBundle((document, lines) => {
          const profiled = matchedCustomer
            ? applyCustomerVatProfileToProforma(document, lines, matchedCustomer, settingsDraft)
            : recalculateProforma(document, lines, settingsDraft);
          return { ...profiled, document: applyResult(profiled.document) };
        });
      }
      showToast(describeCustomerVatLookup(result), result.active === false ? 'error' : 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ο έλεγχος ΑΦΜ απέτυχε.', 'error');
    } finally {
      setDraftVatLookupTarget(null);
    }
  };

  const applyCatalogToLegalLine = (lineId: string, selection: SkuProductSelection) => {
    updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((line) => {
      if (line.id !== lineId) return line;
      const product = legalCatalogProducts.find((item) => item.sku === selection.sku);
      if (!product) {
        return applyAutomaticLegalItemClassification({
          ...line,
          sku: selection.displaySku,
          variant_suffix: null,
        }, selection.displaySku, settingsDraft, current.aade_document_type);
      }
      const catalogDetails = getLegalCatalogLineDetails(product, settingsDraft, selection.variant_suffix, current.aade_document_type, products, materials);
      return applyLegalSystemItemToLine({
        ...line,
        ...catalogDetails,
        source_metadata: {
          ...(line.source_metadata || {}),
          ...(catalogDetails.source_metadata || {}),
          income_classification_source: 'automatic',
        },
      }, settingsDraft.system_items);
    }), settingsDraft));
  };

  const applyCatalogToProformaLine = (lineId: string, selection: SkuProductSelection) => {
    updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((line) => {
      if (line.id !== lineId) return line;
      const product = legalCatalogProducts.find((item) => item.sku === selection.sku);
      if (!product) {
        return {
          ...applyAutomaticLegalItemClassification({
            ...line,
            sku: selection.displaySku,
            variant_suffix: null,
          }, selection.displaySku, settingsDraft, '1.1'),
          proforma_id: line.proforma_id,
        };
      }
      const catalogDetails = getLegalCatalogLineDetails(product, settingsDraft, selection.variant_suffix, '1.1', products, materials);
      return {
        ...line,
        ...catalogDetails,
        source_metadata: {
          ...(line.source_metadata || {}),
          ...(catalogDetails.source_metadata || {}),
          income_classification_source: 'automatic',
        },
      };
    }), settingsDraft));
  };

  const appendLegalLineAfter = (lineId: string) => {
    if (!draftBundle || !isLegalDocumentEditable(draftBundle.document)) return;
    const currentIndex = draftBundle.lines.findIndex((line) => line.id === lineId);
    const nextLine = currentIndex >= 0 ? draftBundle.lines[currentIndex + 1] : null;
    if (nextLine) {
      setLegalSkuFocusLineId(nextLine.id);
      return;
    }
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
    const currentIndex = proformaBundle.lines.findIndex((line) => line.id === lineId);
    const nextLine = currentIndex >= 0 ? proformaBundle.lines[currentIndex + 1] : null;
    if (nextLine) {
      setProformaSkuFocusLineId(nextLine.id);
      return;
    }
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

  const applyLegalVatProfile = (vatCategory: number) => {
    const vatRate = vatRateOptions.find((option) => option.category === vatCategory)?.value ?? 0.24;
    updateDraftBundle((current, lines) => recalculateLegalDocument({
      ...current,
      vat_rate: vatRate,
      vat_exemption_category: vatRate === 0 ? current.vat_exemption_category : null,
      vat_exemption_legal_note: vatRate === 0 ? current.vat_exemption_legal_note : null,
    }, lines.map((line) => ({ ...line, vat_category: vatCategory })), settingsDraft));
  };

  const applyProformaVatProfile = (vatCategory: number) => {
    const vatRate = vatRateOptions.find((option) => option.category === vatCategory)?.value ?? 0.24;
    updateProformaBundle((current, lines) => recalculateProforma({
      ...current,
      vat_rate: vatRate,
      vat_exemption_category: vatRate === 0 ? current.vat_exemption_category : null,
      vat_exemption_legal_note: vatRate === 0 ? current.vat_exemption_legal_note : null,
    }, lines.map((line) => ({ ...line, vat_category: vatCategory })), settingsDraft));
  };

  const handleGenerateDraft = () => {
    if (creationDocumentType === 'proforma') {
      handleGenerateProforma();
      return;
    }
    const settings = settingsDraft;
    const documentKind = creationTypeToLegalKind(creationDocumentType);
    const aadeDocumentType = creationDocumentType === 'service_invoice' ? '2.1' : undefined;
    if (creationSource === 'manual') {
      const document = buildManualLegalDocument({
        settings,
        kind: documentKind,
        userName,
        customer: manualCustomer,
        aadeDocumentType,
      });
      if (manualSupplier) {
        const withPartner = applySupplierToLegalDocument(document, document.lines || [], manualSupplier, settings);
        openNewLegalDraft({ ...withPartner.document, lines: withPartner.lines });
        return;
      }
      openNewLegalDraft(document);
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
        materials,
        settings,
        kind: documentKind,
        userName,
        aadeDocumentType,
      });
      openNewLegalDraft(document);
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
        materials,
        settings,
        kind: documentKind,
        userName,
        aadeDocumentType,
      });
      openNewLegalDraft(document);
      return;
    }

    const document = buildLegalDocumentFromOrder({
      order: selectedOrder,
      customer: selectedCustomer,
      products,
      materials,
      settings,
      kind: documentKind,
      userName,
      aadeDocumentType,
    });
    openNewLegalDraft(document);
  };

  const handleGenerateProforma = (source: DocumentCreationSource = creationSource) => {
    const settings = settingsDraft;
    setCreationDocumentType('proforma');
    setDraftBundle(null);
    if (source === 'manual') {
      const proforma = buildManualProforma({
        settings,
        userName,
        customer: manualCustomer,
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
      materials,
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
      legalDraftRestart.markSaved();
      showToast('Το πρόχειρο αποθηκεύτηκε. Θα το βρείτε στο Αρχείο → Πρόχειρα.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε το πρόχειρο.', 'error');
    }
  };

  const handleSaveProforma = async () => {
    if (!proformaBundle) return;
    try {
      await saveProforma.mutateAsync(proformaBundle);
      proformaRestart.markSaved();
      showToast('Το προτιμολόγιο αποθηκεύτηκε. Θα το βρείτε στο Αρχείο → Προτιμολόγια.', 'success');
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
      const converted = convertProformaToLegalDraft({
        proforma,
        lines,
        settings: settingsDraft,
        kind: 'invoice_delivery',
        userName,
      });
      const draft = { ...converted, document: withPreferredDispatch(converted.document) };
      await saveDraft.mutateAsync(draft);
      if (proformas.some((item) => item.id === proforma.id)) {
        await markProformaConverted.mutateAsync({ proformaId: proforma.id, legalDocumentId: draft.document.id });
      }
      setIssueOutcome(null);
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
    const requestId = ++numberingAlignmentRequestRef.current;
    if (!options?.silentIfUpToDate) {
      setNumberingAlignmentModal({ isOpen: true, status: 'loading', preview: null, error: null });
    }

    try {
      const preview = await legalRepository.previewNumberingAlignment();
      if (requestId !== numberingAlignmentRequestRef.current) return;
      if (!preview.changes.length && options?.silentIfUpToDate) return;
      setNumberingAlignmentModal({ isOpen: true, status: 'ready', preview, error: null });
    } catch (error: any) {
      if (requestId !== numberingAlignmentRequestRef.current) return;
      const message = error?.message || 'Δεν ολοκληρώθηκε ο έλεγχος της τρέχουσας αρίθμησης.';
      if (options?.silentIfUpToDate) {
        showToast(message, 'error');
        return;
      }
      setNumberingAlignmentModal({ isOpen: true, status: 'ready', preview: null, error: message });
    }
  };

  const closeLegalNumberingAlignment = () => {
    if (numberingAlignmentModal.status === 'applying') return;
    numberingAlignmentRequestRef.current += 1;
    setNumberingAlignmentModal({ isOpen: false, status: 'ready', preview: null, error: null });
  };

  const applyLegalNumberingAlignment = async () => {
    const preview = numberingAlignmentModal.preview;
    if (!preview?.changes.length || numberingAlignmentModal.status === 'applying') return;

    setNumberingAlignmentModal((current) => ({ ...current, status: 'applying', error: null }));
    try {
      const result = await legalRepository.applyNumberingAlignment(preview.preview_token);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: legalKeys.documents() }),
        queryClient.invalidateQueries({ queryKey: legalKeys.sequences() }),
      ]);
      numberingAlignmentRequestRef.current += 1;
      setNumberingAlignmentModal({ isOpen: false, status: 'ready', preview: null, error: null });
      showToast(
        result.applied.length
          ? `Η αρίθμηση ενημερώθηκε με τα τρέχοντα δεδομένα: ${result.applied
              .map((item) => `${item.series} ${item.old_next_aa} → ${item.new_next_aa}`)
              .join(', ')}.`
          : 'Δεν χρειάστηκε αλλαγή. Η βάση επανέλεγξε την αρίθμηση.',
        result.applied.length ? 'success' : 'info',
      );
    } catch (error: any) {
      setNumberingAlignmentModal((current) => ({
        ...current,
        status: 'ready',
        error: error?.message || 'Δεν εφαρμόστηκε η ευθυγράμμιση αρίθμησης. Εκτελέστε νέο έλεγχο.',
      }));
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
        showToast(`Συγχρονισμός ολοκληρώθηκε: ${formatNumber(result.imported_count)} νέα, ${formatNumber(result.updated_count)} ενημερώσεις.`, 'success');
      }

    } catch (error: any) {
      showToast(error?.message || 'Ο συγχρονισμός AADE απέτυχε.', 'error');
    }
  };

  const ensureAadeCredentialsReady = async () => {
    const status = sbzStatus || (await refreshSbzStatus()).data;
    if (status?.[settingsDraft.environment]?.ready) return true;
    setActiveTab('settings');
    showToast('Η σύνδεση SBZ χρειάζεται ρύθμιση ή ενεργοποίηση πριν από την έκδοση.', 'warning');
    return false;
  };

  /** Server copy of a document after a failed send, to tell «rejected» from «still being checked». */
  const fetchServerDocument = async (documentId: string): Promise<LegalDocument | null> => {
    try {
      const documents = await legalRepository.getDocuments();
      queryClient.setQueryData(legalKeys.documents(), documents);
      return documents.find((document) => document.id === documentId) || null;
    } catch {
      return null;
    }
  };

  const handleSubmitDraft = async () => {
    if (!draftBundle || validationErrors.length > 0 || issuingRef.current) return;
    if (!isLegalDocumentEditable(draftBundle.document)) {
      showToast('Το παραστατικό έχει ήδη εκδοθεί. Βρίσκεται στο Αρχείο.', 'info');
      setArchiveSearch('');
      setDraftBundle(null);
      setActiveTab('archive');
      return;
    }
    if (!(await ensureAadeCredentialsReady())) return;
    const bundle = draftBundle;
    const document = applyIssuerSettingsToDocument(bundle.document, settingsDraft);
    const deliveryLine = documentIncludesDeliveryNote(document)
      ? `Διακίνηση: ${[resolveSbzDispatchMethod(document.delivery), resolveLegalCarrierLabel(document.delivery)].filter((value, index, all) => value && all.indexOf(value) === index).join(' · ')}`
      : 'Χωρίς δελτίο διακίνησης';
    const confirmed = await confirm({
      title: 'Οριστική έκδοση',
      message: [
        `${getLegalDocumentKindLabel(document.document_kind, document.aade_document_type)} (ΑΑΔΕ ${document.aade_document_type})`,
        `Πελάτης: ${document.counterpart.name || '—'} · ΑΦΜ ${document.counterpart.vat_number || '—'}`,
        `Σύνολο: ${money(document.totals.gross)}`,
        deliveryLine,
        settingsDraft.environment === 'dev' ? 'Περιβάλλον: Δοκιμές' : 'Περιβάλλον: Παραγωγή',
        '',
        'Μετά την έκδοση το παραστατικό δεν αλλάζει. Διόρθωση γίνεται μόνο με πιστωτικό.',
      ].join('\n'),
      confirmText: 'Έκδοση',
      cancelText: 'Πίσω',
    });
    if (!confirmed || issuingRef.current) return;
    issuingRef.current = true;
    setIssuingDocument(document);
    try {
      await saveDraft.mutateAsync({ ...bundle, document });
      legalDraftRestart.markSaved();
      const issued = await submitDocument.mutateAsync({ documentId: document.id, userName });
      setDraftBundle(null);
      setIssueOutcome(issued);
      showToast(`Αποδοχή myDATA με MARK ${issued.aade_mark || '—'}.`, 'success');
    } catch (error: any) {
      const message = error?.message || 'Ο πάροχος δεν δέχθηκε το παραστατικό.';
      const server = await fetchServerDocument(document.id);
      if (server && !isLegalDocumentEditable(server)) {
        // Sent but not confirmed (or already accepted): never offer a second send from the editor.
        setDraftBundle(null);
        setIssueOutcome(server);
        if (server.status === 'issued' && server.aade_mark) {
          showToast(`Αποδοχή myDATA με MARK ${server.aade_mark}.`, 'success');
          return;
        }
      } else if (server?.status === 'failed') {
        setDraftBundle((current) => current && current.document.id === server.id
          ? { ...current, document: { ...current.document, status: 'failed', last_error: server.last_error || message } }
          : current);
        setHeaderTab('customer');
      }
      showToast(message, 'error');
    } finally {
      issuingRef.current = false;
      setIssuingDocument(null);
    }
  };

  const archivedOutcome = issueOutcome && legalDocuments.find((document) => document.id === issueOutcome.id);
  // The archive refresh can still contain the rejected row from before the retry.
  const outcomeDocument = issueOutcome && archivedOutcome
    && Date.parse(archivedOutcome.updated_at) > Date.parse(issueOutcome.updated_at)
    && (!issueOutcome.aade_mark || archivedOutcome.aade_mark === issueOutcome.aade_mark)
    ? archivedOutcome : issueOutcome;

  const handleReconcileOutcome = async () => {
    if (!outcomeDocument) return;
    setReconcilingOutcome(true);
    try {
      const reconciled = await reconcileSbz(outcomeDocument);
      if (reconciled) setIssueOutcome((current) => current?.id === reconciled.id ? reconciled : current);
    } finally {
      setReconcilingOutcome(false);
    }
  };

  const startNewDocumentWorkspace = () => {
    setDraftBundle(null);
    setProformaBundle(null);
    setIssueOutcome(null);
    setActiveTab('new');
  };

  /** Same as starting a new workspace, but asks first when the open editor has unsaved changes. */
  const requestFreshWorkspace = async () => {
    const hasUnsavedWork = (!!draftBundle && legalDraftRestart.dirty) || (!!proformaBundle && proformaRestart.dirty);
    if (hasUnsavedWork) {
      const ok = await confirm({
        title: 'Απόρριψη μη αποθηκευμένων αλλαγών',
        message: 'Το ανοιχτό πρόχειρο έχει αλλαγές που δεν έχουν αποθηκευτεί. Αν συνεχίσετε, οι αλλαγές θα χαθούν.',
        confirmText: 'Απόρριψη και νέο',
        cancelText: 'Πίσω',
        isDestructive: true,
      });
      if (!ok) return;
    }
    startNewDocumentWorkspace();
  };

  const handleSubmitLegalDocument = async (document: LegalDocument) => {
    if (issuingRef.current) return;
    if (!(await ensureAadeCredentialsReady())) return;
    if (issuingRef.current) return;
    issuingRef.current = true;
    try {
      const prepared = applyIssuerSettingsToDocument(document, settingsDraft);
      const lines = await legalRepository.getDocumentLines(prepared.id);
      const issues = validateLegalDocument(prepared, lines).filter((issue) => issue.severity === 'error');
      if (issues.length > 0) {
        showToast(issues[0].message, 'warning');
        if (document.status === 'draft') {
          await handleOpenLegalDocument(prepared);
        }
        return;
      }
      if (isLegalDocumentEditable(prepared)) {
        await saveDraft.mutateAsync({ document: prepared, lines });
      }
      const issued = await submitDocument.mutateAsync({ documentId: prepared.id, userName });
      const successMessage = document.status === 'failed'
        ? `Επιτυχής αποστολή με MARK ${issued.aade_mark}.`
        : `Αποδοχή myDATA με MARK ${issued.aade_mark}.`;
      showToast(successMessage, 'success');
    } catch (error: any) {
      const fallback = document.status === 'failed' ? 'Η επανάληψη απέτυχε.' : 'Η υποβολή απέτυχε.';
      showToast(error?.message || fallback, 'error');
    } finally {
      issuingRef.current = false;
    }
  };

  const handleCancel = async (document: LegalDocument) => {
    if (document.document_kind !== 'delivery_note' || document.provider !== 'sbz') { showToast('Για διόρθωση τιμολογίου εκδώστε πιστωτικό.', 'info'); return; }
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
      const lines = isInspectionPresentation && inspectionSnapshot
        ? (inspectionSnapshot.tables.legal_document_lines || []).filter((line) => line.document_id === document.id) as LegalDocumentLine[]
        : await legalRepository.getDocumentLines(document.id);
      if (!canPrintLegalDocument(document, lines)) {
        showToast(
          document.status === 'submitted'
            ? 'Η εκτύπωση είναι διαθέσιμη μετά την αποδοχή από τον πάροχο.'
            : 'Το παραστατικό δεν περνά τον έλεγχο νόμιμης εκτύπωσης. Ελέγξτε τα στοιχεία εκδότη, πελάτη, MARK/QR, γραμμές και σύνολα.',
          'warning',
        );
        return;
      }
      onPrintLegalDocument({ document: { ...document, lines }, lines });
      if (isOfficialLegalDocumentPrint(document, lines) && navigator.onLine && inspectionSnapshot?.status.state !== 'saved') {
        await markPrinted.mutateAsync(document.id);
      }
    } catch (error: any) {
      showToast(error?.message || 'Δεν ήταν δυνατή η εκτύπωση.', 'error');
    }
  };

  const handleOpenLegalDocument = async (document: LegalDocument) => {
    if (document.status !== 'draft' && document.status !== 'failed') {
      showToast('Το εκδομένο ή ακυρωμένο παραστατικό είναι κλειδωμένο. Για αλλαγές χρειάζεται έκδοση πιστωτικού.', 'info');
      return;
    }
    try {
      const lines = await legalRepository.getDocumentLines(document.id);
      setDraftBundle(recalculateLegalDocument(normalizeLegalDocumentAddresses({
        ...document,
        issuer: isLegalDocumentEditable(document) ? { ...settingsDraft.issuer } : document.issuer,
        lines,
      }), lines, settingsDraft));
      setCreationDocumentType(document.aade_document_type === '2.1' ? 'service_invoice' : document.document_kind);
      setProformaBundle(null);
      setSelectedOrderId(document.order_id || '');
      setSelectedShipmentId(document.shipment_id || '');
      setActiveTab('new');
    } catch (error: any) {
      showToast(error?.message || 'Δεν φορτώθηκε το παραστατικό.', 'error');
    }
  };

  useEffect(() => {
    if (!initialDocumentId || !isInspectionPresentation) return;
    const document = visibleLegalDocuments.find((row) => row.id === initialDocumentId);
    if (document) setArchiveSearch(document.aade_mark || getLegalDocumentDisplayNumber(document));
  }, [initialDocumentId]);

  const handleSaveSettings = async () => {
    try {
      // The environment changes only through «Περιβάλλον έκδοσης»; keep the server value here.
      await saveSettings.mutateAsync({ ...settingsDraft, environment: persistedEnvironment });
      legalSettingsRestart.markSaved();
      setDraftBundle((current) => {
        if (!current || !isLegalDocumentEditable(current.document)) return current;
        return { ...current, document: applyIssuerSettingsToDocument(current.document, settingsDraft) };
      });
      showToast('Οι ρυθμίσεις αποθηκεύτηκαν.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκαν οι ρυθμίσεις.', 'error');
    }
  };

  /** Confirmed, immediately saved switch of the issuing environment (never only on screen). */
  const switchEnvironment = async (next: LegalEnvironment) => {
    if (next === persistedEnvironment) return;
    const toProduction = next === 'prod';
    const confirmed = await confirm({
      title: toProduction ? 'Μετάβαση σε ΠΑΡΑΓΩΓΗ' : 'Μετάβαση σε ΔΟΚΙΜΕΣ',
      message: toProduction
        ? 'Τα νέα παραστατικά θα διαβιβάζονται στην πραγματική myDATA μέσω SBZ και θα έχουν φορολογική ισχύ. Τα πρόχειρα που ήδη δημιουργήθηκαν στις Δοκιμές παραμένουν στις Δοκιμές.'
        : 'Τα νέα παραστατικά θα εκδίδονται στο δοκιμαστικό περιβάλλον της SBZ, με ξεχωριστή αρίθμηση και χωρίς φορολογική ισχύ. Θυμηθείτε να επιστρέψετε στην Παραγωγή μετά τις δοκιμές.',
      confirmText: toProduction ? 'Ναι, Παραγωγή' : 'Ναι, Δοκιμές',
      cancelText: 'Ακύρωση',
      isDestructive: toProduction,
    });
    if (!confirmed) return;
    try {
      await saveEnvironment.mutateAsync(next);
      setSettingsDraft((current) => ({ ...current, environment: next }));
      showToast(toProduction ? 'Περιβάλλον: Παραγωγή. Τα νέα παραστατικά είναι πραγματικά.' : 'Περιβάλλον: Δοκιμές. Τα νέα παραστατικά είναι δοκιμαστικά.', toProduction ? 'success' : 'warning');
    } catch (error: any) {
      showToast(error?.message || 'Δεν άλλαξε το περιβάλλον.', 'error');
    }
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
    const carrier = await persistCarrier(newCarrier, null);
    if (!carrier) return;
    setNewCarrier(EMPTY_CARRIER_DRAFT);
    showToast('Ο μεταφορέας αποθηκεύτηκε.', 'success');
  };

  const handleUpdateCarrier = async () => {
    if (!editingCarrier) return;
    const existing = carriers.find((carrier) => carrier.id === editingCarrier.id) || null;
    if (!existing) return;
    const carrier = await persistCarrier(editingCarrier.draft, existing);
    if (!carrier) return;
    setEditingCarrier(null);
    showToast(`Ο μεταφορέας «${carrier.name}» ενημερώθηκε.`, 'success');
  };

  /** ACS shortcut: links the ACS partner when it exists in «Προμηθευτές & Συνεργάτες». */
  const prefillAcsCarrier = () => {
    const partner = suppliers.find((supplier) => /\bacs\b/i.test(supplier.name));
    setNewCarrier(partner ? {
      ...EMPTY_CARRIER_DRAFT,
      supplier_id: partner.id,
      name: partner.name,
      vat_number: normalizeVatNumber(partner.vat_number),
      phone: partner.phone || '',
    } : { ...EMPTY_CARRIER_DRAFT, name: 'ACS Courier' });
  };

  /** The default carrier is pre-selected in new delivery notes (courier / third-party transport). */
  const handleMakeDefaultCarrier = async (carrier: LegalCarrier) => {
    try {
      for (const item of carriers) {
        const shouldBeDefault = item.id === carrier.id;
        if (Boolean(item.is_default) !== shouldBeDefault) await saveCarrier.mutateAsync({ ...item, is_default: shouldBeDefault });
      }
      showToast(`Ο «${carrier.name}» είναι πλέον ο προεπιλεγμένος μεταφορέας.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε η προεπιλογή.', 'error');
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

  const addLegalLine = () => updateDraftBundle((current, lines) => recalculateLegalDocument(current, [
    ...lines,
    createManualLegalDocumentLine({
      documentId: current.id,
      lineNumber: lines.length + 1,
      settings: settingsDraft,
      vatRate: current.vat_rate ?? 0.24,
      aadeDocumentType: current.aade_document_type,
    }),
  ], settingsDraft));

  const addProformaLine = () => updateProformaBundle((current, lines) => {
    const baseLine = createManualLegalDocumentLine({
      documentId: current.id,
      lineNumber: lines.length + 1,
      settings: settingsDraft,
      vatRate: current.vat_rate ?? 0.24,
    });
    return recalculateProforma(current, [...lines, { ...baseLine, proforma_id: current.id }], settingsDraft);
  });

  const openDraftInArchive = (document: LegalDocument) => {
    setArchiveSearch(getLegalDocumentDisplayNumber(document));
    setDraftBundle(null);
    setActiveTab('archive');
  };

  const scrollToFinalCheck = () => {
    window.document.getElementById('legal-final-check')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderEnvironmentChip = (environment: LegalEnvironment) => (
    <Chip tone={environment === 'dev' ? 'amber' : 'emerald'}>
      <ShieldCheck size={11} /> {environment === 'dev' ? 'Δοκιμές' : 'Παραγωγή'}
    </Chip>
  );
  const environmentChip = renderEnvironmentChip(persistedEnvironment);

  const renderLegalActions = (document: LegalDocument, lines: LegalDocumentLine[]) => {
    const issueBlocked = validationErrors.length > 0;
    const busy = submitDocument.isPending || saveDraft.isPending || !!issuingDocument;
    return (
      <>
        <ActionButton variant="secondary" onClick={handleSaveDraft} disabled={!draftBundle || busy}>
          {saveDraft.isPending && !issuingDocument ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση πρόχειρου
        </ActionButton>
        {canPrintLegalDocument(document, lines) && (
          <ActionButton variant="secondary" onClick={() => void handlePrint(document)} disabled={busy}>
            <Printer size={16} />
            {isOfficialLegalDocumentPrint(document, lines) ? 'Εκτύπωση' : 'Εκτύπωση πρόχειρου'}
          </ActionButton>
        )}
        <ActionButton
          onClick={() => void handleSubmitDraft()}
          disabled={!draftBundle || issueBlocked || busy}
          title={issueBlocked ? `Διορθώστε πρώτα ${validationErrors.length === 1 ? 'το σφάλμα' : `τα ${formatNumber(validationErrors.length)} σφάλματα`} του ελέγχου.` : undefined}
        >
          {submitDocument.isPending || issuingDocument ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {document.status === 'failed' ? 'Νέα αποστολή μέσω SBZ' : 'Έκδοση μέσω SBZ'}
        </ActionButton>
      </>
    );
  };

  /** Opens the tab holding an issue's field and focuses it. */
  const jumpToIssue = (issue: DraftIssue) => {
    if (issue.section === 'issuer') {
      setActiveTab('settings');
      return;
    }
    if (issue.section === 'customer' || issue.section === 'document' || issue.section === 'delivery') setHeaderTab(issue.section);
    const field = issue.lineNumber !== undefined ? `line.${issue.lineNumber}` : issue.field;
    window.setTimeout(() => {
      if (focusLegalField(field)) return;
      const fallback = issue.section === 'lines' ? 'legal-lines' : 'legal-header';
      window.document.getElementById(fallback)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const renderDraftEditor = () => {
    if (!draftBundle) return null;

    const document = draftBundle.document;
    const lines = draftBundle.lines;
    const editable = isLegalDocumentEditable(document);
    const isCreditReview = Boolean(document.credited_document_id);
    const includesDelivery = documentIncludesDeliveryNote(document);
    const isStandaloneDeliveryNote = document.document_kind === 'delivery_note';
    const canToggleDelivery = (document.document_kind === 'invoice' || document.document_kind === 'invoice_delivery')
      && document.aade_document_type !== '2.1';
    const lineDiscounts = lines.map((line) => Number(line.source_metadata?.discount_percent || 0));
    const commonDiscount = lineDiscounts.length && lineDiscounts.every((value) => value === lineDiscounts[0])
      ? lineDiscounts[0]
      : '';
    const originalNet = lines.reduce((sum, line) => sum
      + Number(line.source_metadata?.original_unit_price ?? line.unit_price) * Number(line.quantity || 0), 0);
    const documentDiscountAmount = Math.max(0, originalNet - document.totals.net);
    const needsVatExemption = document.vat_rate === 0
      || lines.some((line) => line.vat_category === 7)
      || (document.vat_exemption_category !== null && document.vat_exemption_category !== undefined);
    const issues = editable ? draftIssues : [];
    const issueCount = issues.length;
    const sectionCounts = countIssuesBySection(issues);
    const problem = (field: string): FieldProblem | null => firstIssueMessage(issues, field);
    const issuerIssues = issues.filter((issue) => issue.section === 'issuer');
    const hasDeliveryTab = isStandaloneDeliveryNote || canToggleDelivery;
    const activeHeaderTab: DocumentHeaderTab = headerTab === 'delivery' && !hasDeliveryTab ? 'customer' : headerTab;
    const linkedSupplier = document.counterpart.supplier_id ? suppliers.find((supplier) => supplier.id === document.counterpart.supplier_id) || null : null;
    const linkedCustomerId = !linkedSupplier && invoiceableCustomers.some((customer) => customer.id === document.counterpart_customer_id)
      ? document.counterpart_customer_id || ''
      : '';
    const updateCounterpart = (updates: Partial<LegalDocument['counterpart']>) => updateDraftDocument((current) => ({
      ...current,
      counterpart: { ...current.counterpart, ...updates },
    }));
    const updateCounterpartAddress = (updates: Partial<LegalPartyAddress>) => updateDraftDocument((current) => ({
      ...current,
      counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), ...updates } },
    }));
    const addressProblem = problem('counterpart.address');
    const flagMissing = (value?: string | null): FieldProblem | null => (addressProblem && !String(value ?? '').trim() ? { severity: addressProblem.severity, message: '' } : null);
    const deliverySummary = includesDelivery
      ? [resolveSbzDispatchMethod(document.delivery), resolveLegalCarrierLabel(document.delivery)]
        .filter((value, index, all) => value && all.indexOf(value) === index).join(' · ')
      : 'Χωρίς δελτίο διακίνησης';
    const dispatchExtras = (
      <>
        <SelectInput
          label="Τρόπος αποστολής"
          value={resolveSbzDispatchMethod(document.delivery)}
          help="Εμφανίζεται στο PDF του παρόχου."
          onChange={(value) => updateDraftDocument((current) => ({
            ...current,
            delivery: withDispatchMethod(current.delivery || buildDefaultDeliveryDetails(settingsDraft), value, carriers, suppliers),
          }))}
        >
          {SBZ_DISPATCH_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
        </SelectInput>
        <SelectInput
          label="Σκοπός διακίνησης"
          value={document.delivery?.move_purpose || resolveLegalMovePurpose(null, settingsDraft, document.aade_document_type)}
          onChange={(value) => updateDraftDocument((current) => ({
            ...current,
            delivery: { ...(current.delivery || {}), move_purpose: Number(value) || 1 },
          }))}
        >
          {Object.entries(SBZ_MOVE_PURPOSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectInput>
      </>
    );

    const toolbar = (
      <WorkspaceToolbar
        icon={legalKindIcon(document)}
        title={isCreditReview ? 'Έλεγχος πιστωτικού' : getLegalDocumentKindLabel(document.document_kind, document.aade_document_type)}
        code={`ΑΑΔΕ ${document.aade_document_type}`}
        badges={(
          <>
            <Chip tone={null} className={statusClass[document.status]}>{statusLabel[document.status]}</Chip>
            {renderEnvironmentChip(document.environment === 'prod' || document.environment === 'dev' ? document.environment : persistedEnvironment)}
            {editable && (
              <button
                type="button"
                onClick={scrollToFinalCheck}
                aria-controls="legal-final-check"
                className={`inline-flex items-center gap-1 border py-0.5 text-[11px] font-black transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 ${validationErrors.length ? chipToneClass.red : issueCount ? chipToneClass.amber : chipToneClass.emerald}`}
              >
                {validationErrors.length
                  ? <><XCircle size={11} /> {formatNumber(validationErrors.length)} {validationErrors.length === 1 ? 'σφάλμα' : 'σφάλματα'}</>
                  : issueCount
                    ? <><AlertTriangle size={11} /> {formatNumber(issueCount)} {issueCount === 1 ? 'προειδοποίηση' : 'προειδοποιήσεις'}</>
                    : <><BadgeCheck size={11} /> Έτοιμο για έκδοση</>}
              </button>
            )}
          </>
        )}
        subtitle={[
          document.counterpart.name || 'Χωρίς πελάτη',
          document.order_id ? `Παραγγελία #${formatOrderId(document.order_id)}` : null,
          `${formatNumber(lines.length)} ${lines.length === 1 ? 'γραμμή' : 'γραμμές'}`,
        ].filter(Boolean).join(' · ')}
        total={money(document.totals.gross)}
        actions={editable ? renderLegalActions(document, lines) : null}
      />
    );

    const statusNotices = (
      <>
        {document.status === 'failed' && editable && !issuingDocument ? (
          <Notice tone="red" icon={XCircle} role="alert" title="Ο πάροχος απέρριψε την προηγούμενη αποστολή">
            {document.last_error || 'Διορθώστε τα στοιχεία και στείλτε ξανά.'} Δεν αποδόθηκε MARK, οπότε η νέα αποστολή δεν δημιουργεί διπλό παραστατικό.
          </Notice>
        ) : null}
        {issuerIssues.length > 0 ? (
          <Notice
            tone="red"
            icon={Building2}
            title="Λείπουν στοιχεία της επιχείρησης"
            action={<ActionButton variant="secondary" onClick={() => setActiveTab('settings')}><Settings size={15} /> Ρυθμίσεις</ActionButton>}
          >
            {[...new Set(issuerIssues.map((issue) => issue.message))].join(' ')}
          </Notice>
        ) : null}
      </>
    );

    if (isCreditReview) {
      return (
        <div className="min-w-0 space-y-4">
          {toolbar}
          {statusNotices}
          <EditorSection
            icon={Undo2}
            tone="emerald"
            title="Γραμμές πίστωσης"
            subtitle={`${document.counterpart.name} · Οι αξίες προέρχονται από το αρχικό τιμολόγιο.`}
            bodyClassName=""
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 sm:px-5">Είδος</th>
                    <th className="w-28 px-3 py-2.5 text-right">Ποσότητα</th>
                    <th className="w-36 px-4 py-2.5 text-right sm:px-5">Αξία</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3 font-semibold text-slate-800 sm:px-5">{line.description}</td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-600">× {formatNumber(line.quantity)}</td>
                      <td className="px-4 py-3 text-right font-black tabular-nums text-slate-900 sm:px-5">{money(line.gross_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-4 border-t border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
              <p className="max-w-md text-sm font-medium leading-relaxed text-slate-500">
                Το αρχικό τιμολόγιο διατηρείται στο αρχείο. Η επιστροφή ειδών στην αποθήκη καταχωρίζεται χωριστά.
              </p>
              <TotalsBox
                rows={[
                  { label: 'Καθαρή αξία', value: money(document.totals.net) },
                  { label: 'ΦΠΑ', value: money(document.totals.vat) },
                ]}
                totalLabel="Σύνολο πίστωσης"
                total={money(document.totals.gross)}
              />
            </div>
          </EditorSection>
          {renderValidation()}
        </div>
      );
    }

    return (
      <div className="min-w-0 space-y-4">
        {toolbar}
        {statusNotices}

        {!editable && (
          <Notice tone="emerald" icon={Lock} title="Το παραστατικό δεν είναι πλέον πρόχειρο.">
            {document.status === 'issued'
              ? `Εκδόθηκε με MARK ${document.aade_mark || '—'}. Δείτε το στο Αρχείο για εκτύπωση ή ακύρωση.`
              : 'Δείτε το στο Αρχείο για τις διαθέσιμες ενέργειες.'}
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={() => openDraftInArchive(document)}>
                <Archive size={16} /> Μετάβαση στο Αρχείο
              </ActionButton>
              <ActionButton variant="quiet" onClick={startNewDocumentWorkspace}>
                <Plus size={16} /> Νέο παραστατικό
              </ActionButton>
            </div>
          </Notice>
        )}

        <div id="legal-header" className="scroll-mt-32">
          <TabbedCard
            active={activeHeaderTab}
            onChange={setHeaderTab}
            tabs={[
              {
                id: 'customer',
                label: document.counterpart.supplier_id ? 'Συνεργάτης' : 'Πελάτης',
                icon: UserRound,
                hint: document.counterpart.name
                  ? `${document.counterpart.name}${document.counterpart.vat_number ? ` · ${document.counterpart.vat_number}` : ''}`
                  : 'Χωρίς στοιχεία',
                errors: sectionCounts.customer.errors,
                warnings: sectionCounts.customer.warnings,
              },
              {
                id: 'document',
                label: 'Παραστατικό & ΦΠΑ',
                icon: FileText,
                hint: `${formatIsoDate(document.issue_date)} · ${PAYMENT_METHOD_LABELS[document.payment_method_code] || 'Πληρωμή'}`,
                errors: sectionCounts.document.errors,
                warnings: sectionCounts.document.warnings,
              },
              ...(hasDeliveryTab ? [{
                id: 'delivery' as const,
                label: 'Διακίνηση',
                icon: Truck,
                hint: deliverySummary,
                errors: sectionCounts.delivery.errors,
                warnings: sectionCounts.delivery.warnings,
              }] : []),
            ]}
          >
            {activeHeaderTab === 'customer' && (
              <fieldset disabled={!editable} className={`min-w-0 space-y-5 ${!editable ? 'opacity-60' : ''}`}>
                <div className="grid min-w-0 gap-3 sm:grid-cols-6 lg:grid-cols-12">
                  <div className="sm:col-span-6 lg:col-span-7">
                    <SelectInput
                      label="Αντισυμβαλλόμενος"
                      value={linkedSupplier ? `s:${linkedSupplier.id}` : linkedCustomerId ? `c:${linkedCustomerId}` : ''}
                      onChange={applyCounterpartToDraft}
                      help="Πελάτης από το πελατολόγιο ή συνεργάτης/προμηθευτής (π.χ. χυτήριο για δελτίο αποστολής). Γεμίζει ΑΦΜ, επωνυμία, ΔΟΥ, επάγγελμα και έδρα."
                    >
                      <option value="">Χειροκίνητα / χωρίς σύνδεση</option>
                      <optgroup label="Πελάτες">
                        {invoiceableCustomers.map((customer) => <option key={customer.id} value={`c:${customer.id}`}>{customer.full_name}{customer.vat_number ? ` | ΑΦΜ ${customer.vat_number}` : ''}</option>)}
                      </optgroup>
                      {activeSuppliers.length > 0 && (
                        <optgroup label="Συνεργάτες & Προμηθευτές">
                          {activeSuppliers.map((supplier) => <option key={supplier.id} value={`s:${supplier.id}`}>{supplier.name}{supplier.vat_number ? ` | ΑΦΜ ${supplier.vat_number}` : ''}</option>)}
                        </optgroup>
                      )}
                    </SelectInput>
                  </div>
                  <div className="sm:col-span-6 lg:col-span-5">
                    <VatLookupField
                      value={document.counterpart.vat_number || ''}
                      onChange={(value) => updateCounterpart({ vat_number: normalizeVatNumber(value) })}
                      onLookup={() => void handleDraftVatLookup('legal')}
                      loading={draftVatLookupTarget === 'legal'}
                      lookupDisabled={draftVatLookupTarget !== null}
                      problem={problem('counterpart.vat_number')}
                    />
                  </div>
                </div>

                {linkedSupplier && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5">
                    <SupplierAvatar name={linkedSupplier.name} logoUrl={linkedSupplier.logo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-slate-900">Συνεργάτης · {linkedSupplier.name}</div>
                      <div className="text-[11px] font-semibold text-slate-500">
                        Κωδικός αντισυμβαλλομένου {document.counterpart.customer_code || supplierCounterpartCode(linkedSupplier)}
                        {linkedSupplier.legal_profile?.verified_at ? ' · στοιχεία επιβεβαιωμένα από Μητρώο ΑΦΜ' : ' · τα φορολογικά στοιχεία αποθηκεύονται στον συνεργάτη'}
                      </div>
                    </div>
                    {editable && (
                      <ActionButton variant="secondary" onClick={() => void persistSupplierProfile(document.counterpart, false)} disabled={savingSupplierProfile || !document.counterpart.tax_office || !document.counterpart.profession}>
                        {savingSupplierProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Αποθήκευση στον συνεργάτη
                      </ActionButton>
                    )}
                  </div>
                )}

                <FieldGroup title="Φορολογικά στοιχεία" hint="Ο «Έλεγχος ΑΦΜ» συμπληρώνει επωνυμία, επάγγελμα, ΔΟΥ και έδρα">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-6 lg:grid-cols-12">
                    <div className="sm:col-span-6 lg:col-span-6">
                      <TextInput label="Επωνυμία" required field="counterpart.name" problem={problem('counterpart.name')} value={document.counterpart.name || ''} onChange={(value) => updateCounterpart({ name: value })} />
                    </div>
                    <div className="sm:col-span-3 lg:col-span-3">
                      <TextInput label="Επάγγελμα" required field="counterpart.profession" problem={problem('counterpart.profession')} value={document.counterpart.profession || ''} onChange={(value) => updateCounterpart({ profession: value })} />
                    </div>
                    <div className="sm:col-span-3 lg:col-span-3">
                      <TextInput label="ΔΟΥ" required field="counterpart.tax_office" problem={problem('counterpart.tax_office')} value={document.counterpart.tax_office || ''} onChange={(value) => updateCounterpart({ tax_office: value })} />
                    </div>
                  </div>
                </FieldGroup>

                <FieldGroup title="Έδρα">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-6 lg:grid-cols-12" data-legal-field="counterpart.address">
                    <div className="sm:col-span-4 lg:col-span-4">
                      <TextInput label="Οδός" required problem={flagMissing(document.counterpart.address?.street)} value={document.counterpart.address?.street || ''} onChange={(value) => updateCounterpartAddress({ street: value })} />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-1">
                      <TextInput label="Αρ." value={document.counterpart.address?.number || ''} onChange={(value) => updateCounterpartAddress({ number: value })} />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <TextInput label="Τ.Κ." required inputMode="numeric" problem={flagMissing(document.counterpart.address?.postal_code)} value={document.counterpart.address?.postal_code || ''} onChange={(value) => updateCounterpartAddress({ postal_code: value })} />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <TextInput label="Πόλη" required problem={flagMissing(document.counterpart.address?.city)} value={document.counterpart.address?.city || ''} onChange={(value) => updateCounterpartAddress({ city: value })} />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <SelectInput label="Χώρα" value={normalizeLegalCountryCode(document.counterpart.country)} onChange={(value) => updateCounterpart({ country: value })}>
                        {listLegalCountryOptions(document.counterpart.country).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </SelectInput>
                    </div>
                  </div>
                  <FieldMessage problem={addressProblem} />
                </FieldGroup>

                <FieldGroup title="Επικοινωνία & ERP">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                    <TextInput label="Κωδικός πελάτη (ERP)" required field="counterpart.customer_code" problem={problem('counterpart.customer_code')} value={document.counterpart.customer_code || ''} onChange={(value) => updateCounterpart({ customer_code: value })} help="Ο πάροχος τον απαιτεί. Συμπληρώνεται αυτόματα όταν επιλέξετε πελάτη από το πελατολόγιο." />
                    <TextInput label="Τηλέφωνο" value={document.counterpart.phone || ''} onChange={(value) => updateCounterpart({ phone: value })} />
                    <TextInput label="Email" type="email" value={document.counterpart.email || ''} onChange={(value) => updateCounterpart({ email: value })} />
                  </div>
                </FieldGroup>
              </fieldset>
            )}

            {activeHeaderTab === 'document' && (
              <fieldset disabled={!editable} className={`min-w-0 space-y-4 ${!editable ? 'opacity-60' : ''}`}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <TextInput label="Ημερομηνία έκδοσης" type="date" required field="issue_date" problem={problem('issue_date')} value={document.issue_date} onChange={(value) => updateDraftDocument((current) => ({ ...current, issue_date: value }))} />
                  {isStandaloneDeliveryNote ? (
                    <div className="sm:col-span-1 lg:col-span-2 flex items-center rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs font-semibold leading-5 text-sky-900">
                      Δελτίο αποστολής 9.3: δεν έχει τρόπο πληρωμής ούτε ΦΠΑ. Στη myDATA οι γραμμές διαβιβάζονται «Χωρίς ΦΠΑ» (κατηγορία 8) με χαρακτηρισμό Διακίνησης (category3).
                    </div>
                  ) : (
                    <>
                  <SelectInput label="Τρόπος πληρωμής" field="payment_method_code" problem={problem('payment_method_code')} value={document.payment_method_code} onChange={(value) => updateDraftDocument((current) => ({ ...current, payment_method_code: Number(value) }))}>
                    {PAYMENT_METHOD_CODES.filter(code => ![7, 8].includes(code)).map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
                  </SelectInput>
                  <SelectInput label="Καθεστώς ΦΠΑ" value={lines[0]?.vat_category ?? vatRateToAadeCategory(document.vat_rate ?? 0.24)} onChange={(value) => applyLegalVatProfile(Number(value))} help="Ο βασικός συντελεστής ΦΠΑ για τις γραμμές. Το «Άνευ ΦΠΑ» απαιτεί σωστή αιτία απαλλαγής. Οι λογιστικές εγγραφές χωρίς ΦΠΑ δεν εκδίδονται ως παραστατικά από αυτή την οθόνη.">
                    {vatRateOptions.map((option) => <option key={option.category} value={option.category}>{option.label}</option>)}
                  </SelectInput>
                    </>
                  )}
                </div>
                {needsVatExemption && !isStandaloneDeliveryNote && (
                  <div className="grid gap-3 border-t border-slate-100 pt-4 lg:grid-cols-2">
                    <VatExemptionCategorySelect
                      value={document.vat_exemption_category}
                      problem={problem('vat_exemption_category')}
                      onChange={(value) => updateDraftDocument((current) => ({ ...current, vat_exemption_category: value }))}
                    />
                    {document.vat_rate === 0 && (
                      <TextInput label="Υποχρεωτική ένδειξη απαλλαγής στο PDF" value={document.vat_exemption_legal_note || ''} onChange={(value) => updateDraftDocument((current) => ({ ...current, vat_exemption_legal_note: value || null }))} />
                    )}
                  </div>
                )}
                {problem('document') ? <FieldMessage problem={problem('document')} /> : null}
                {hasDeliveryTab ? (
                  <p className="flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
                    <Truck size={13} className="shrink-0" /> Τρόπος αποστολής, μεταφορέας και σκοπός διακίνησης ρυθμίζονται στην καρτέλα
                    <button type="button" onClick={() => setHeaderTab('delivery')} className="font-black text-emerald-700 hover:underline">Διακίνηση</button>.
                  </p>
                ) : (
                  <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-black text-slate-600 [&::-webkit-details-marker]:hidden">
                      Στοιχεία αποστολής στο PDF του παρόχου
                      <ChevronDown size={15} className="text-slate-400 transition group-open:rotate-180" />
                    </summary>
                    <div className="grid gap-3 border-t border-slate-200 p-3.5 sm:grid-cols-2">{dispatchExtras}</div>
                  </details>
                )}
              </fieldset>
            )}

            {activeHeaderTab === 'delivery' && (
              <DeliveryPanel
                document={document}
                editable={editable}
                settings={settingsDraft}
                carriers={carriers}
                suppliers={suppliers}
                customer={draftCustomer}
                issues={issues}
                canToggleDelivery={canToggleDelivery}
                recentVehicles={recentVehicles}
                savingCarrier={saveCarrier.isPending}
                onUpdate={updateDraftDocument}
                onToggleDelivery={(include) => updateDraftDocument((current) => {
                  const toggled = applyLegalDocumentDeliveryToggle(current, include, settingsDraft, draftCustomer);
                  return include ? withPreferredDispatch(toggled) : toggled;
                })}
                onCreateCarrier={handleCreateCarrierInline}
              />
            )}
          </TabbedCard>
        </div>

        <EditorSection
          id="legal-lines"
          icon={Package}
          tone={sectionCounts.lines.errors ? 'red' : 'sky'}
          title="Γραμμές"
          subtitle={`${formatNumber(lines.length)} ${lines.length === 1 ? 'γραμμή' : 'γραμμές'} · ${formatNumber(document.totals.quantity)} τεμ. · Enter στο SKU για την επόμενη γραμμή`}
          bodyClassName=""
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 pl-2.5 pr-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <Percent size={13} /> Συνολική έκπτωση %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={commonDiscount}
                  placeholder={commonDiscount === '' ? 'Μικτή' : undefined}
                  disabled={!editable}
                  onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((line) => applyLegalLineDiscount(
                    line,
                    Number(line.source_metadata?.original_unit_price ?? line.unit_price),
                    Number(event.target.value) || 0,
                  )), settingsDraft))}
                  className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-right text-xs font-bold normal-case tracking-normal text-slate-800 outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <ActionButton variant="secondary" disabled={!editable} onClick={addLegalLine}>
                <Plus size={16} /> Γραμμή
              </ActionButton>
            </div>
          )}
        >
          <fieldset disabled={!editable} className={`min-w-0 ${!editable ? 'opacity-60' : ''}`}>
            {(problem('lines') || problem('totals')) ? (
              <div className="border-b border-slate-100 px-4 py-2.5 sm:px-5" data-legal-field="lines">
                <FieldMessage problem={problem('lines') || problem('totals')} />
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed text-xs">
                <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-2 py-2.5 text-center">#</th>
                    <th className="w-[200px] px-1.5 py-2.5">SKU</th>
                    <th className="px-1.5 py-2.5">Περιγραφή / Κωδ. είδους</th>
                    <th className="w-[74px] px-1 py-2.5 text-right">Ποσ.</th>
                    <th className="w-[92px] px-1 py-2.5 text-right">Τιμή</th>
                    <th className="w-[72px] px-1 py-2.5 text-right">Έκπτ.%</th>
                    <th className="w-[104px] px-1 py-2.5 text-right">ΦΠΑ</th>
                    <th className="w-[118px] px-2 py-2.5 text-right" title="Σύνολο · Καθαρή + ΦΠΑ">Αξία</th>
                    <th className="w-10 px-1 py-2.5"><span className="sr-only">Ενέργειες</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm font-medium text-slate-500">
                        Δεν υπάρχουν γραμμές ακόμη. Προσθέστε την πρώτη γραμμή για να ξεκινήσετε.
                      </td>
                    </tr>
                  ) : lines.map((line, index) => {
                    const lineIssues = issuesForField(issues, `line.${line.line_number}`);
                    const lineHasError = lineIssues.some((issue) => issue.severity === 'error');
                    const rowTone = lineHasError ? 'bg-red-50/50' : lineIssues.length ? 'bg-amber-50/40' : '';
                    return (
                      <React.Fragment key={line.id}>
                        <tr data-legal-field={`line.${line.line_number}`} className={`align-top transition hover:bg-slate-50/70 ${rowTone}`}>
                          <td className={`whitespace-nowrap px-2 py-3 text-center font-black ${lineHasError ? 'text-red-600' : 'text-slate-400'}`}>{formatNumber(line.line_number)}</td>
                          <td className="px-1.5 py-2">
                            <div className="flex min-w-0 items-center gap-0.5">
                              <div className="min-w-0 flex-1">
                                <SkuProductPicker
                                  sku={line.sku}
                                  itemCode={line.item_code}
                                  variantSuffix={line.variant_suffix}
                                  products={legalCatalogProducts}
                                  legalDocument
                                  onSelect={(selection) => applyCatalogToLegalLine(line.id, selection)}
                                  onEnterCommit={() => appendLegalLineAfter(line.id)}
                                  autoFocus={legalSkuFocusLineId === line.id}
                                  onInputFocus={() => setLegalSkuFocusLineId(line.id)}
                                  inputClassName="px-1.5 py-1"
                                  compact
                                  catalogOnly
                                />
                              </div>
                              <LineIncomeClassificationGear
                                documentType={document.aade_document_type}
                                category={line.income_classification.classification_category}
                                type={line.income_classification.classification_type || ''}
                                disabled={!editable}
                                onCategoryChange={(value) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? withManualIncomeCategory(item, value, current.aade_document_type) : item), settingsDraft))}
                                onTypeChange={(classificationType) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? withManualIncomeType(item, classificationType) : item), settingsDraft))}
                              />
                            </div>
                          </td>
                          <td className="px-1.5 py-2">
                            <input value={line.description} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item), settingsDraft))} className={`${cellInputClass} ${!line.description?.trim() ? problemClass(lineIssues[0]) : ''}`} aria-label={`Περιγραφή γραμμής ${formatNumber(line.line_number)}`} />
                            <input value={line.item_code || ''} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? applyAutomaticLegalItemClassification(item, event.target.value, settingsDraft, current.aade_document_type) : item), settingsDraft))} className="mt-1 h-6 w-full rounded-sm border border-slate-100 bg-slate-50 px-1.5 font-mono text-[10px] text-slate-500 outline-hidden transition focus:border-emerald-400 focus:bg-white" placeholder="Κωδικός είδους" title="Κωδικός είδους AADE (itemCode)" />
                          </td>
                          <td className="px-1 py-2 text-right">
                            <input type="number" min="0.001" step={getLegalLineUnit(line) === 'g' ? '0.01' : '0.001'} value={getLegalLineDisplayQuantity(line)} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, quantity: toStoredLegalQuantity(item, Number(event.target.value) || 0) } : item), settingsDraft))} className={`${cellInputClass} text-right tabular-nums ${line.quantity <= 0 ? problemClass(lineIssues[0]) : ''}`} aria-label={`Ποσότητα γραμμής ${formatNumber(line.line_number)}`} />
                            <select
                              value={getLegalLineUnit(line)}
                              onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? applyLegalLineUnit(item, event.target.value as LegalLineUnit) : item), settingsDraft))}
                              className={`mt-1 h-6 w-full rounded-md border px-1 text-right text-[10px] font-bold outline-hidden transition focus:border-emerald-400 ${getLegalLineUnit(line) === 'pcs' ? 'border-slate-100 bg-slate-50 text-slate-500' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
                              title={getLegalLineUnit(line) === 'g' ? 'Γραμμάρια: διαβιβάζονται στη myDATA ως Κιλά (κωδ. 2), π.χ. 125 gr = 0,125 kg.' : 'Μονάδα μέτρησης γραμμής'}
                              aria-label={`Μονάδα μέτρησης γραμμής ${formatNumber(line.line_number)}`}
                            >
                              {LEGAL_LINE_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.short}</option>)}
                            </select>
                          </td>
                          <td className="px-1 py-2 text-right">
                            <input type="number" min="0" step={getLegalLineUnit(line) === 'g' ? '0.0001' : '0.01'} value={getLegalLineDisplayUnitPrice(line)} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? applyLegalLineDiscount(item, toStoredLegalUnitPrice(item, Number(event.target.value) || 0), Number(item.source_metadata?.discount_percent || 0)) : item), settingsDraft))} title={getLegalLineUnit(line) === 'pcs' ? undefined : `Τιμή ανά ${getLegalLineUnitMeta(getLegalLineUnit(line)).short}`} className={`${cellInputClass} text-right tabular-nums ${line.quantity > 0 && line.net_value === 0 && document.aade_document_type !== '9.3' ? problemClass(lineIssues[0]) : ''}`} aria-label={`Τιμή γραμμής ${formatNumber(line.line_number)}`} />
                          </td>
                          <td className="px-1 py-2 text-right">
                            <input type="number" min="0" max="100" step="0.01" value={line.source_metadata?.discount_percent ?? 0} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? applyLegalLineDiscount(item, Number(item.source_metadata?.original_unit_price ?? item.unit_price), Number(event.target.value) || 0) : item), settingsDraft))} className={`${cellInputClass} text-right tabular-nums`} aria-label={`Έκπτωση γραμμής ${formatNumber(line.line_number)}`} />
                          </td>
                          <td className="px-1 py-2 text-right">
                            {document.aade_document_type === '9.3' ? (
                              <span className="inline-flex h-8 w-full items-center justify-end rounded-md bg-slate-50 px-1.5 text-[10px] font-bold text-slate-500" title="Το δελτίο αποστολής δεν έχει ΦΠΑ (myDATA vatCategory 8).">Χωρίς ΦΠΑ</span>
                            ) : (
                            <select value={line.vat_category} onChange={(event) => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.map((item) => item.id === line.id ? { ...item, vat_category: Number(event.target.value) } : item), settingsDraft))} className={`${cellInputClass} px-1 text-right text-[10px]`} title="Κωδικός κατηγορίας ΦΠΑ myDATA (vatCategory)">
                              {vatLineOptions.map((option) => <option key={option.category} value={option.category}>{option.label}</option>)}
                            </select>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right leading-tight">
                            <div className="text-[13px] font-black tabular-nums text-slate-900">{money(line.gross_value)}</div>
                            <div className="mt-0.5 text-[10px] font-medium tabular-nums text-slate-500">{money(line.net_value)}</div>
                            <div className="text-[10px] font-medium tabular-nums text-slate-400">+ {money(line.vat_amount)} ΦΠΑ</div>
                          </td>
                          <td className="px-1 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => updateDraftBundle((current, lines) => recalculateLegalDocument(current, lines.filter((_, itemIndex) => itemIndex !== index), settingsDraft))}
                              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                              title="Διαγραφή γραμμής"
                              aria-label={`Διαγραφή γραμμής ${formatNumber(line.line_number)}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {lineIssues.length > 0 ? (
                          <tr className={rowTone}>
                            <td />
                            <td colSpan={8} className="px-1.5 pb-2.5 pt-0">
                              <ul className="space-y-0.5">
                                {lineIssues.map((issue) => (
                                  <li key={issue.id}><FieldMessage problem={issue} /></li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-4 border-t border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
              <button
                type="button"
                onClick={addLegalLine}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-black text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50/60 hover:text-emerald-700"
              >
                <Plus size={16} /> Προσθήκη γραμμής
              </button>
              <TotalsBox
                rows={[
                  ...(documentDiscountAmount > 0 ? [
                    { label: 'Αξία προ έκπτωσης', value: money(originalNet) },
                    { label: 'Έκπτωση', value: `− ${money(documentDiscountAmount)}`, className: 'text-emerald-700' },
                  ] : []),
                  { label: 'Καθαρή αξία', value: money(document.totals.net) },
                  { label: 'ΦΠΑ', value: money(document.totals.vat) },
                ]}
                total={money(document.totals.gross)}
              />
            </div>
          </fieldset>
        </EditorSection>

        {renderValidation()}
      </div>
    );
  };

  const renderValidation = () => {
    if (!draftBundle) return null;
    const editable = isLegalDocumentEditable(draftBundle.document);
    return (
      <IssueReviewCard
        issues={editable ? draftIssues : []}
        editable={editable}
        locked={draftBundle.document.status === 'issued' ? 'Εκδόθηκε — δεν μπορεί να ξανασταλεί' : 'Κλειδωμένο παραστατικό'}
        onJump={jumpToIssue}
        onOpenArchive={() => openDraftInArchive(draftBundle.document)}
        actions={renderLegalActions(draftBundle.document, draftBundle.lines)}
      />
    );
  };

  const renderCreationSetup = () => {
    const selectedCreationType = creationTypeItems.find((item) => item.id === creationDocumentType) || creationTypeItems[0];
    const sourceTitle = creationSource === 'order' ? 'Από παραγγελία' : manualCounterpartKind === 'supplier' ? 'Χειροκίνητα · συνεργάτης' : 'Χειροκίνητα · πελάτης';
    const primaryActionLabel = creationSource === 'order' ? 'Σύνθεση' : 'Έναρξη καταχώρισης';
    const generateDisabled = (creationSource === 'order' && (!selectedOrder || !canUseSelectedOrder)) || loadingOrders;
    const orderItemCount = selectedOrder ? (selectedOrder.items?.length ?? selectedOrder.item_count ?? 0) : 0;
    const summaryRows: Array<[string, React.ReactNode]> = [
      ['Τύπος', <span className="inline-flex items-center gap-1.5">{selectedCreationType.label} <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-black text-slate-500">{selectedCreationType.code}</span></span>],
      ['Προέλευση', sourceTitle],
    ];
    if (creationSource === 'order') {
      summaryRows.push(['Παραγγελία', selectedOrder ? `#${formatOrderId(selectedOrder.id)}` : <span className="text-slate-400">Δεν επιλέχθηκε</span>]);
      if (selectedOrder) {
        summaryRows.push(['Πελάτης', selectedOrder.customer_name || '—']);
        summaryRows.push(['Είδη', selectedLineSource?.label || 'Όλη η παραγγελία']);
      }
    }
    if (creationSource === 'manual') {
      summaryRows.push([manualCounterpartKind === 'supplier' ? 'Συνεργάτης' : 'Πελάτης', manualCounterpartLabel?.name || <span className="text-slate-400">Ορίζεται στο παραστατικό</span>]);
    }
    summaryRows.push(['Περιβάλλον', environmentChip]);

    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:items-start">
        <div className="min-w-0 space-y-4">
          <EditorSection icon={FileText} tone="emerald" title="1 · Τι θέλετε να δημιουργήσετε;" subtitle="Επιλέξτε τύπο παραστατικού. Μπορείτε να τον αλλάξετε πριν από τη σύνθεση.">
            <div className="grid grid-cols-1 gap-2 min-[440px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {creationTypeItems.map((item) => {
                const Icon = item.icon;
                const active = creationDocumentType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setCreationDocumentType(item.id); setDraftBundle(null); setProformaBundle(null); }}
                    aria-pressed={active}
                    className={`group flex h-full flex-col items-start gap-2 rounded-xl border p-3 text-left transition ${active ? 'border-emerald-500 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className={`grid h-9 w-9 place-items-center rounded-lg transition ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-white'}`}><Icon size={17} /></span>
                      <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black ${active ? 'bg-white text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>{item.code}</span>
                    </span>
                    <span className={`text-sm font-black leading-tight ${active ? 'text-emerald-950' : 'text-slate-800'}`}>{item.label}</span>
                    <span className="text-[11px] font-medium leading-snug text-slate-500">{item.short}</span>
                  </button>
                );
              })}
            </div>
            {selectedCreationType.help ? (
              <Notice tone={creationDocumentType === 'proforma' ? 'sky' : 'slate'} className="mt-3">{selectedCreationType.help}</Notice>
            ) : null}
          </EditorSection>

          <EditorSection icon={LayoutList} tone="indigo" title="2 · Από πού θα προέλθουν τα στοιχεία;" subtitle="Από παραγγελία, ή χειροκίνητα προς πελάτη ή συνεργάτη. Οι λίστες ανοίγουν σε παράθυρο αναζήτησης.">
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ['order', FileCheck2, 'Από παραγγελία', 'Πελάτης, είδη και αξίες από την παραγγελία'],
                ['customer', UserRound, 'Χειροκίνητα · πελάτης', 'Ελεύθερη καταχώριση προς πελάτη'],
                ['supplier', Building2, 'Χειροκίνητα · συνεργάτης', 'Π.χ. δελτίο αποστολής στο χυτήριο'],
              ] as const).filter(([id]) => !(id === 'supplier' && creationDocumentType === 'proforma')).map(([id, Icon, title, description]) => {
                const active = creationSourceChoice === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setCreationSource(id === 'order' ? 'order' : 'manual');
                      if (id !== 'order') {
                        setSelectedShipmentId('');
                        setManualCounterpartKind(id);
                        if (manualCounterpart?.kind !== id) setManualCounterpart(null);
                      }
                      setDraftBundle(null);
                      setProformaBundle(null);
                    }}
                    className={`group flex items-start gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-emerald-500 bg-emerald-50 shadow-xs ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-white'}`}><Icon size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-black leading-tight ${active ? 'text-emerald-950' : 'text-slate-800'}`}>{title}</span>
                      <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-500">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {creationSource === 'order' ? (
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className={fieldLabelClass}>
                    Παραγγελία
                    <InfoTip text="Εμφανίζει το πραγματικό ποσό τιμολόγησης από τα τρέχοντα είδη. Παραγγελίες που άδειασαν από μεταφορά υπόλοιπου δείχνουν πού μεταφέρθηκαν τα είδη." />
                  </div>
                  {selectedOrder ? (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 ring-1 ring-emerald-100"><UserRound size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-slate-900">{selectedOrder.customer_name || 'Χωρίς πελάτη'}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500">
                          <span className="font-mono font-bold">#{formatOrderId(selectedOrder.id)}</span>
                          <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {new Date(selectedOrder.created_at).toLocaleDateString('el-GR')}</span>
                          <span className="inline-flex items-center gap-1"><Package size={11} /> {formatNumber(orderItemCount)} είδη</span>
                          {selectedCustomer?.vat_number
                            ? <span className="font-bold text-emerald-700">ΑΦΜ {selectedCustomer.vat_number}</span>
                            : <span className="font-bold text-amber-700">Χωρίς ΑΦΜ στην καρτέλα</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {selectedPickerRow ? <span className="text-sm font-black tabular-nums text-slate-900">{money(selectedPickerRow.billableTotal)}</span> : null}
                        <button type="button" onClick={() => setPickerModal('order')} className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">Αλλαγή</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickerModal('order')}
                      disabled={loadingOrders}
                      className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40 disabled:opacity-60"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Search size={17} /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-800">{loadingOrders ? 'Φόρτωση παραγγελιών…' : 'Επιλογή παραγγελίας'}</span>
                        <span className="block text-[11px] font-medium text-slate-500">Αναζήτηση με πελάτη ή αριθμό παραγγελίας</span>
                      </span>
                    </button>
                  )}
                  {selectedPickerRow?.hint ? (
                    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs font-medium leading-relaxed ${selectedPickerRow.selectable ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
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
                          Μετάβαση στη #{formatOrderId(selectedPickerRow.redirectOrderId)} <ChevronRight size={12} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-2">
                  <SelectInput
                    label="Ποια είδη θα συμπεριληφθούν;"
                    value={selectedShipmentId}
                    disabled={!selectedOrder}
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
                </div>

                {selectedOrder && (documentsByOrder.get(selectedOrder.id) || []).length > 0 ? (
                  <Notice tone="amber" icon={AlertTriangle} className="lg:col-span-2" title="Η παραγγελία έχει ήδη παραστατικό">
                    {(documentsByOrder.get(selectedOrder.id) || []).map((document) => `${getLegalDocumentDisplayNumber(document)} (${statusLabel[document.status]})`).join(', ')}.
                    {' '}Συνεχίστε μόνο αν εκδίδετε για διαφορετικά είδη (π.χ. μερική αποστολή ή υπόλοιπα).
                  </Notice>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className={fieldLabelClass}>{manualCounterpartKind === 'supplier' ? 'Συνεργάτης / προμηθευτής' : 'Πελάτης'}</div>
                {manualCounterpartLabel ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    {manualCounterpart?.kind === 'supplier' && manualSupplier
                      ? <SupplierAvatar name={manualSupplier.name} logoUrl={manualSupplier.logo_url} size="sm" />
                      : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 ring-1 ring-emerald-100"><UserRound size={16} /></span>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-slate-900">{manualCounterpartLabel.name}</div>
                      <div className="truncate text-[11px] font-medium text-slate-500">{manualCounterpartLabel.detail}</div>
                    </div>
                    <button type="button" onClick={() => setPickerModal(manualCounterpartKind)} className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">Αλλαγή</button>
                    <button type="button" onClick={() => setManualCounterpart(null)} className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-slate-700" aria-label="Χωρίς αντισυμβαλλόμενο"><X size={14} /></button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerModal(manualCounterpartKind)}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Search size={17} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-slate-800">{manualCounterpartKind === 'supplier' ? 'Επιλογή συνεργάτη' : 'Επιλογή πελάτη'}</span>
                      <span className="block text-[11px] font-medium text-slate-500">Προαιρετικό · μπορείτε να τον ορίσετε και μέσα στο παραστατικό</span>
                    </span>
                  </button>
                )}
              </div>
            )}
          </EditorSection>
          {pickerModal === 'order' && (
            <PickerModal title="Επιλογή παραγγελίας" subtitle="Αναζητήστε με πελάτη ή αριθμό. Φαίνεται και αν η παραγγελία έχει ήδη παραστατικό." onClose={() => setPickerModal(null)}>
              <OrderPicker
                rows={legalOrderPickerRows}
                selectedId={selectedOrderId}
                loading={loadingOrders}
                documentsByOrder={documentsByOrder}
                onSelect={(value) => { setSelectedOrderId(value); setSelectedShipmentId(''); setDraftBundle(null); setProformaBundle(null); setPickerModal(null); }}
              />
            </PickerModal>
          )}
          {(pickerModal === 'customer' || pickerModal === 'supplier') && (
            <CounterpartPickerModal
              kind={pickerModal}
              customers={invoiceableCustomers}
              suppliers={suppliers}
              selected={manualCounterpart}
              onSelect={(choice) => { setManualCounterpart(choice); setDraftBundle(null); setProformaBundle(null); setPickerModal(null); }}
              onClose={() => setPickerModal(null)}
            />
          )}
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            <div className="relative overflow-hidden border-b border-emerald-100/80 bg-linear-to-br from-emerald-50 via-white to-amber-50/50 px-5 py-4">
              <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-emerald-200/40 blur-2xl" aria-hidden />
              <div className="relative flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-emerald-700 shadow-xs ring-1 ring-emerald-100">
                  <selectedCreationType.icon size={20} />
                </span>
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> Σύνοψη · Βήμα 1
                  </div>
                  <div className="mt-1.5 text-lg font-black leading-tight text-slate-900">{selectedCreationType.label}</div>
                  <div className="mt-0.5 text-xs font-medium text-slate-500">{sourceTitle}</div>
                </div>
              </div>
            </div>
            <dl className="divide-y divide-slate-100 px-5 text-sm">
              {summaryRows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="shrink-0 text-xs font-bold text-slate-500">{label}</dt>
                  <dd className="min-w-0 truncate text-right font-bold text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-4">
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={generateDisabled}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-xs shadow-emerald-900/10 transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {loadingOrders ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {primaryActionLabel} <ArrowRight size={16} />
              </button>
              <p className="text-center text-[11px] font-medium leading-relaxed text-slate-500">
                {creationSource === 'order' && !selectedOrder
                  ? 'Επιλέξτε παραγγελία για να συνεχίσετε.'
                  : 'Δημιουργείται επεξεργάσιμο πρόχειρο. Τίποτα δεν εκδίδεται πριν από τον τελικό έλεγχο.'}
              </p>
            </div>
          </section>

          {resumableDrafts.length > 0 && (
            <EditorSection icon={History} title="Συνέχεια εργασίας" subtitle="Πρόσφατα πρόχειρα και παραστατικά προς διόρθωση" bodyClassName="p-2">
              <ul className="space-y-1">
                {resumableDrafts.map((entry) => {
                  const isLegal = entry.source === 'legal';
                  const legalDocument = isLegal ? entry.document as LegalDocument : null;
                  return (
                    <li key={`${entry.source}-${entry.document.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (legalDocument) void handleOpenLegalDocument(legalDocument);
                          else void handleEditProforma(entry.document as ProformaDocument);
                        }}
                        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50"
                      >
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${legalDocument?.status === 'failed' ? iconToneClass.red : isLegal ? iconToneClass.slate : iconToneClass.sky}`}>
                          {legalDocument?.status === 'failed' ? <AlertTriangle size={14} /> : isLegal ? <ReceiptText size={14} /> : <FileText size={14} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-slate-800">{entry.document.counterpart.name || 'Χωρίς πελάτη'}</span>
                          <span className="block truncate text-[11px] font-medium text-slate-500">
                            {legalDocument ? getLegalDocumentKindLabel(legalDocument.document_kind, legalDocument.aade_document_type) : 'Προτιμολόγιο'}
                            {' · '}{legalDocument ? statusLabel[legalDocument.status] : proformaStatusLabel.draft}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xs font-black tabular-nums text-slate-800">{money(entry.document.totals.gross)}</span>
                          <ChevronRight size={14} className="ml-auto text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => { setArchiveSearch(''); setActiveTab('archive'); }}
                className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
              >
                <Archive size={13} /> Όλα στο Αρχείο
              </button>
            </EditorSection>
          )}
        </aside>
      </div>
    );
  };

  const renderNewTab = () => {
    const showingOutcome = Boolean(outcomeDocument && !draftBundle && !proformaBundle);
    const workspaceStarted = Boolean(draftBundle || proformaBundle) || showingOutcome;
    const legalEditable = draftBundle ? isLegalDocumentEditable(draftBundle.document) : false;
    const legalLocked = Boolean(draftBundle) && !legalEditable;
    const legalReady = Boolean(draftBundle) && legalEditable && validationErrors.length === 0;
    const accepted = showingOutcome && outcomeDocument?.status === 'issued';
    const steps: Array<{ label: string; detail: string; state: StepState }> = proformaBundle ? [
      { label: 'Ρύθμιση', detail: 'Τύπος & προέλευση', state: 'done' },
      { label: 'Στοιχεία', detail: 'Πελάτης & γραμμές', state: 'active' },
      { label: 'Ολοκλήρωση', detail: 'Αποθήκευση & εκτύπωση', state: 'todo' },
    ] : [
      { label: 'Ρύθμιση', detail: 'Τύπος & προέλευση', state: workspaceStarted ? 'done' : 'active' },
      { label: 'Στοιχεία', detail: 'Πελάτης, διακίνηση, γραμμές', state: !workspaceStarted ? 'todo' : legalReady || legalLocked || showingOutcome ? 'done' : 'active' },
      { label: 'Έκδοση', detail: 'Έλεγχος & MARK', state: accepted || legalLocked ? 'done' : legalReady || showingOutcome ? 'active' : 'todo' },
      { label: 'Εκτύπωση', detail: 'Συνοδεύει το εμπόρευμα', state: accepted ? (outcomeDocument?.printed_at ? 'done' : 'active') : 'todo' },
    ];
    const workspaceOrigin = showingOutcome
      ? getLegalDocumentDisplayNumber(outcomeDocument!)
      : draftBundle?.document.credited_document_id
      ? 'Πιστωτικό από τιμολόγιο'
      : (draftBundle?.document.order_id || proformaBundle?.document.order_id)
        ? `Από παραγγελία #${formatOrderId((draftBundle?.document.order_id || proformaBundle?.document.order_id)!)}`
        : 'Χειροκίνητη καταχώριση';

    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><Sparkles size={19} /></span>
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Νέο παραστατικό</div>
                <h2 className="truncate text-lg font-black tracking-tight text-slate-950">Δημιουργία βήμα προς βήμα</h2>
              </div>
            </div>
            <div className="min-w-0 lg:max-w-2xl lg:flex-1">
              <StepIndicator steps={steps} />
            </div>
            {workspaceStarted ? (
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="slate" className="py-1">{workspaceOrigin}</Chip>
                <ActionButton variant="quiet" onClick={() => void requestFreshWorkspace()} title="Κλείνει τον επεξεργαστή και επιστρέφει στη ρύθμιση νέου παραστατικού.">
                  <RotateCcw size={16} /> Νέα αρχή
                </ActionButton>
              </div>
            ) : (
              <Chip tone="slate" className="py-1"><Lock size={11} /> Δεν εκδίδεται ακόμη</Chip>
            )}
          </div>
        </section>
        {showingOutcome && outcomeDocument ? (
          <IssueOutcomePanel
            document={outcomeDocument}
            reconciling={reconcilingOutcome}
            onPrint={() => void handlePrint(outcomeDocument)}
            onReconcile={() => void handleReconcileOutcome()}
            onReopen={() => { setIssueOutcome(null); void handleOpenLegalDocument(outcomeDocument); }}
            onOpenArchive={() => {
              setArchiveSearch(getLegalDocumentDisplayNumber(outcomeDocument));
              setIssueOutcome(null);
              setActiveTab('archive');
            }}
            onNew={() => {
              setSelectedOrderId('');
              setSelectedShipmentId('');
              startNewDocumentWorkspace();
            }}
          />
        ) : !workspaceStarted
          ? renderCreationSetup()
          : proformaBundle ? renderProformaEditor() : renderDraftEditor()}
        {issuingDocument ? <IssuingOverlay document={issuingDocument} /> : null}
      </div>
    );
  };

  const renderProformaEditor = () => {
    if (!proformaBundle) return null;

    const document = proformaBundle.document;
    const lines = proformaBundle.lines;
    const needsVatExemption = document.vat_rate === 0
      || lines.some((line) => line.vat_category === 7)
      || (document.vat_exemption_category !== null && document.vat_exemption_category !== undefined);
    const updateProformaCounterpart = (updates: Partial<ProformaDocument['counterpart']>) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, counterpart: { ...current.counterpart, ...updates } }, lines, settingsDraft));
    const updateProformaAddress = (updates: Partial<LegalPartyAddress>) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, counterpart: { ...current.counterpart, address: { ...(current.counterpart.address || {}), ...updates } } }, lines, settingsDraft));
    const proformaActions = (
      <>
        <ActionButton variant="secondary" onClick={handleSaveProforma} disabled={saveProforma.isPending}>
          {saveProforma.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
        </ActionButton>
        <ActionButton variant="secondary" onClick={() => void openConvertModal(document, proformaBundle.lines)} disabled={document.status !== 'draft' || saveDraft.isPending}>
          <Copy size={16} /> Μετατροπή σε τιμολόγιο
        </ActionButton>
        <ActionButton onClick={() => handlePrintProforma(document, proformaBundle.lines)}>
          <Printer size={16} /> Εκτύπωση
        </ActionButton>
      </>
    );

    return (
      <div className="min-w-0 space-y-4">
        <WorkspaceToolbar
          icon={FileText}
          title="Προτιμολόγιο"
          code="Χωρίς MARK"
          badges={<Chip tone={null} className={proformaStatusClass[document.status]}>{proformaStatusLabel[document.status]}</Chip>}
          subtitle={[
            document.counterpart.name || 'Χωρίς πελάτη',
            document.order_id ? `Παραγγελία #${formatOrderId(document.order_id)}` : null,
            `${formatNumber(lines.length)} ${lines.length === 1 ? 'γραμμή' : 'γραμμές'}`,
          ].filter(Boolean).join(' · ')}
          total={money(document.totals.gross)}
          actions={proformaActions}
        />

        <Notice tone="sky" icon={Info}>
          Προτιμολόγιο: εμπορικό/ενημερωτικό έγγραφο μόνο. Δεν είναι νόμιμο φορολογικό παραστατικό, δεν παίρνει MARK και δεν αποστέλλεται στη myDATA.
        </Notice>

        <TabbedCard
          active={headerTab === 'document' ? 'document' : 'customer'}
          onChange={setHeaderTab}
          tabs={[
            {
              id: 'customer',
              label: 'Πελάτης',
              icon: UserRound,
              hint: document.counterpart.name || 'Χωρίς στοιχεία',
              attention: !document.counterpart.name,
            },
            {
              id: 'document',
              label: 'Προτιμολόγιο & ΦΠΑ',
              icon: FileText,
              hint: document.valid_until ? `Ισχύει έως ${formatIsoDate(document.valid_until)}` : formatIsoDate(document.issue_date),
              attention: needsVatExemption && !document.vat_exemption_category,
            },
          ]}
        >
          {headerTab !== 'document' ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-6 lg:grid-cols-12">
              <div className="sm:col-span-6 lg:col-span-5">
                <SelectInput label="Πελάτης εφαρμογής" value="" onChange={(value) => applyCustomerToDraft(value, 'proforma')} help="Γεμίζει αυτόματα τα στοιχεία πελάτη από το ERP, αλλά όλα μένουν χειροκίνητα επεξεργάσιμα.">
                  <option value="">Χειροκίνητα / χωρίς αλλαγή</option>
                  {invoiceableCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.vat_number ? ` | ΑΦΜ ${customer.vat_number}` : ''}</option>)}
                </SelectInput>
              </div>
              <div className="sm:col-span-4 lg:col-span-4">
                <VatLookupField
                  value={document.counterpart.vat_number || ''}
                  onChange={(value) => updateProformaCounterpart({ vat_number: normalizeVatNumber(value) })}
                  onLookup={() => void handleDraftVatLookup('proforma')}
                  loading={draftVatLookupTarget === 'proforma'}
                  lookupDisabled={draftVatLookupTarget !== null}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <TextInput label="Κωδικός Πελάτη" value={document.counterpart.customer_code || ''} onChange={(value) => updateProformaCounterpart({ customer_code: value })} />
              </div>
              <div className="sm:col-span-6 lg:col-span-5">
                <TextInput label="Επωνυμία Πελάτη" value={document.counterpart.name || ''} onChange={(value) => updateProformaCounterpart({ name: value })} />
              </div>
              <div className="sm:col-span-3 lg:col-span-3">
                <TextInput label="Επάγγελμα Πελάτη" value={document.counterpart.profession || ''} onChange={(value) => updateProformaCounterpart({ profession: value })} />
              </div>
              <div className="sm:col-span-3 lg:col-span-2">
                <TextInput label="ΔΟΥ Πελάτη" value={document.counterpart.tax_office || ''} onChange={(value) => updateProformaCounterpart({ tax_office: value })} />
              </div>
              <div className="sm:col-span-3 lg:col-span-2">
                <TextInput label="Τηλέφωνο" value={document.counterpart.phone || ''} onChange={(value) => updateProformaCounterpart({ phone: value })} />
              </div>
              <div className="sm:col-span-3 lg:col-span-5">
                <TextInput label="Οδός" value={document.counterpart.address?.street || ''} onChange={(value) => updateProformaAddress({ street: value })} />
              </div>
              <div className="sm:col-span-1 lg:col-span-2">
                <TextInput label="Αρ." value={document.counterpart.address?.number || ''} onChange={(value) => updateProformaAddress({ number: value })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <TextInput label="Τ.Κ." value={document.counterpart.address?.postal_code || ''} onChange={(value) => updateProformaAddress({ postal_code: value })} />
              </div>
              <div className="sm:col-span-3 lg:col-span-3">
                <TextInput label="Πόλη" value={document.counterpart.address?.city || ''} onChange={(value) => updateProformaAddress({ city: value })} />
              </div>
            </div>
          ) : (
            <div className="min-w-0 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextInput label="Ημερομηνία" type="date" value={document.issue_date} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, issue_date: value }, lines, settingsDraft))} />
                <TextInput label="Ισχύει έως" type="date" value={document.valid_until || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, valid_until: value || null }, lines, settingsDraft))} />
                <SelectInput label="Πληρωμή" value={document.payment_method_code} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, payment_method_code: Number(value) }, lines, settingsDraft))}>
                  {PAYMENT_METHOD_CODES.filter(code => ![7, 8].includes(code)).map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
                </SelectInput>
                <SelectInput label="Καθεστώς ΦΠΑ" value={lines[0]?.vat_category ?? vatRateToAadeCategory(document.vat_rate ?? 0.24)} onChange={(value) => applyProformaVatProfile(Number(value))} help="Το προφίλ ΦΠΑ του προτιμολογίου. Το «Άνευ ΦΠΑ» απαιτεί σωστή αιτία απαλλαγής. Κάθε γραμμή μπορεί να αλλαχθεί ξεχωριστά.">
                  {vatRateOptions.map((option) => <option key={option.category} value={option.category}>{option.label}</option>)}
                </SelectInput>
                <div className="sm:col-span-2 lg:col-span-4">
                  <TextInput label="Σημειώσεις" value={document.notes || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, notes: value }, lines, settingsDraft))} />
                </div>
              </div>
              {needsVatExemption && (
                <div className="grid gap-3 border-t border-slate-100 pt-4 lg:grid-cols-2">
                  <VatExemptionCategorySelect
                    label="Αιτία απαλλαγής ΦΠΑ"
                    value={document.vat_exemption_category}
                    onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, vat_exemption_category: value }, lines, settingsDraft))}
                  />
                  {document.vat_rate === 0 && (
                    <TextInput label="Υποχρεωτική ένδειξη απαλλαγής στο PDF" value={document.vat_exemption_legal_note || ''} onChange={(value) => updateProformaBundle((current, lines) => recalculateProforma({ ...current, vat_exemption_legal_note: value || null }, lines, settingsDraft))} />
                  )}
                </div>
              )}
            </div>
          )}
        </TabbedCard>

        <EditorSection
          icon={Package}
          tone="sky"
          title="Γραμμές προτιμολογίου"
          subtitle={`${formatNumber(lines.length)} ${lines.length === 1 ? 'γραμμή' : 'γραμμές'} · ${formatNumber(document.totals.quantity)} τεμ. · Enter στο SKU για την επόμενη γραμμή`}
          bodyClassName=""
          action={(
            <ActionButton variant="secondary" onClick={addProformaLine}>
              <Plus size={16} /> Γραμμή
            </ActionButton>
          )}
        >
          {lines.some((line) => line.source_metadata?.invoice_total_weight_source === 'missing') && (
            <div className="border-b border-slate-100 p-4 sm:px-5">
              <Notice tone="amber" icon={AlertTriangle} title="Λείπει συνολικό βάρος σε ορισμένες γραμμές">
                Το προτιμολόγιο μπορεί να αποθηκευτεί και να εκτυπωθεί. Οι επηρεαζόμενες περιγραφές παραμένουν χωρίς βάρος.
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {lines
                    .filter((line) => line.source_metadata?.invoice_total_weight_source === 'missing')
                    .map((line) => (
                      <li key={line.id}>
                        {line.sku || `Γραμμή ${formatNumber(line.line_number)}`}
                        {line.source_metadata?.invoice_total_weight_missing_items?.length
                          ? `: ${line.source_metadata.invoice_total_weight_missing_items.join(', ')}`
                          : ''}
                      </li>
                    ))}
                </ul>
              </Notice>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] table-fixed text-xs">
              <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-2 py-2.5 text-center">#</th>
                  <th className="w-[190px] px-1.5 py-2.5">SKU</th>
                  <th className="w-[104px] px-1.5 py-2.5">Κωδ.</th>
                  <th className="px-1.5 py-2.5">Περιγραφή</th>
                  <th className="w-[76px] px-1 py-2.5 text-right">Ποσ.</th>
                  <th className="w-[60px] px-1 py-2.5 text-right">Μον.</th>
                  <th className="w-[88px] px-1 py-2.5 text-right">Τιμή</th>
                  <th className="w-[112px] px-1 py-2.5 text-right">ΦΠΑ %</th>
                  <th className="w-[176px] px-1.5 py-2.5">Χαρακτ.</th>
                  <th className="w-[100px] px-2 py-2.5 text-right">Σύνολο</th>
                  <th className="w-10 px-1 py-2.5"><span className="sr-only">Ενέργειες</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm font-medium text-slate-500">
                      Δεν υπάρχουν γραμμές ακόμη. Προσθέστε την πρώτη γραμμή για να ξεκινήσετε.
                    </td>
                  </tr>
                ) : lines.map((line, index) => (
                  <tr key={line.id} className="align-top transition hover:bg-slate-50/70">
                    <td className="px-2 py-3 text-center font-black text-slate-400">{formatNumber(line.line_number)}</td>
                    <td className="px-1.5 py-2">
                      <SkuProductPicker
                        sku={line.sku}
                        itemCode={line.item_code}
                        variantSuffix={line.variant_suffix}
                        products={legalCatalogProducts}
                              legalDocument
                        onSelect={(selection) => applyCatalogToProformaLine(line.id, selection)}
                        onEnterCommit={() => appendProformaLineAfter(line.id)}
                        autoFocus={proformaSkuFocusLineId === line.id}
                        onInputFocus={() => setProformaSkuFocusLineId(line.id)}
                        inputClassName="px-1.5 py-1"
                        compact
                        catalogOnly
                      />
                    </td>
                    <td className="px-1.5 py-2"><input value={line.item_code || ''} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...applyAutomaticLegalItemClassification(item, event.target.value, settingsDraft, '1.1'), proforma_id: item.proforma_id } : item), settingsDraft))} className={`${cellInputClass} font-mono`} aria-label={`Κωδικός είδους γραμμής ${formatNumber(line.line_number)}`} /></td>
                    <td className="px-1.5 py-2"><input value={line.description} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item), settingsDraft))} className={cellInputClass} aria-label={`Περιγραφή γραμμής ${formatNumber(line.line_number)}`} /></td>
                    <td className="px-1 py-2 text-right"><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, quantity: Number(event.target.value) || 0 } : item), settingsDraft))} className={`${cellInputClass} text-right tabular-nums`} aria-label={`Ποσότητα γραμμής ${formatNumber(line.line_number)}`} /></td>
                    <td className="px-1 py-2 text-right"><input type="number" min="1" step="1" value={line.measurement_unit} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, measurement_unit: Number(event.target.value) || 1 } : item), settingsDraft))} className={`${cellInputClass} text-right tabular-nums`} title="Μονάδα μέτρησης. Συνήθως 1 για τεμάχιο." /></td>
                    <td className="px-1 py-2 text-right"><input type="number" step="0.01" value={line.unit_price} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, unit_price: Number(event.target.value) || 0 } : item), settingsDraft))} className={`${cellInputClass} text-right tabular-nums`} aria-label={`Τιμή γραμμής ${formatNumber(line.line_number)}`} /></td>
                    <td className="px-1 py-2 text-right">
                      <select value={line.vat_category} onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...item, vat_category: Number(event.target.value) } : item), settingsDraft))} className={`${cellInputClass} px-1 text-right text-[10px]`}>
                        {vatLineOptions.map((option) => <option key={option.category} value={option.category}>{option.label}</option>)}
                      </select>
                    </td>
                    <td className="px-1.5 py-2">
                      <select
                        value={line.income_classification.classification_category}
                        onChange={(event) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...withManualIncomeCategory(item, event.target.value, '1.1'), proforma_id: item.proforma_id } : item), settingsDraft))}
                        className={`${cellInputClass} mb-1 px-1 text-[10px]`}
                        aria-label={`Κατηγορία εσόδου γραμμής προτιμολογίου ${formatNumber(line.line_number)}`}
                      >
                        {proformaIncomeCategoryOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <IncomeClassificationTypeSelect
                        documentType="1.1"
                        category={line.income_classification.classification_category}
                        value={line.income_classification.classification_type || ''}
                        onChange={(classification_type) => updateProformaBundle((current, lines) => recalculateProforma(current, lines.map((item) => item.id === line.id ? { ...withManualIncomeType(item, classification_type), proforma_id: item.proforma_id } : item), settingsDraft))}
                        selectClassName="rounded-md bg-white text-[10px]"
                        showCategoryHint={false}
                      />
                    </td>
                    <td className="px-2 py-3 text-right text-[13px] font-black tabular-nums text-slate-900">{money(line.gross_value)}</td>
                    <td className="px-1 py-2 text-right">
                      <button type="button" onClick={() => updateProformaBundle((current, lines) => recalculateProforma(current, lines.filter((_, itemIndex) => itemIndex !== index), settingsDraft))} className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600" title="Διαγραφή γραμμής" aria-label={`Διαγραφή γραμμής ${formatNumber(line.line_number)}`}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-4 border-t border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <button
              type="button"
              onClick={addProformaLine}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-black text-slate-500 transition hover:border-sky-400 hover:bg-sky-50/60 hover:text-sky-700"
            >
              <Plus size={16} /> Προσθήκη γραμμής
            </button>
            <TotalsBox
              rows={[
                { label: 'Καθαρή αξία', value: money(document.totals.net) },
                { label: 'ΦΠΑ', value: money(document.totals.vat) },
              ]}
              total={money(document.totals.gross)}
            />
          </div>
        </EditorSection>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-2.5 text-xs font-medium leading-relaxed text-slate-500">
              <Archive size={16} className="mt-0.5 shrink-0 text-sky-600" />
              <div><span className="font-black text-slate-700">Αποθήκευση για αργότερα.</span> Μετά την αποθήκευση θα το βρείτε στο <span className="font-black text-slate-700">Αρχείο → Προτιμολόγια</span>.</div>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">{proformaActions}</div>
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
            activity: primaryActivity?.description || settingsDraft.issuer.activity,
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
      sequencesRestart.markSaved((previous: Record<string, LegalNumberingSequence>) => ({ ...previous, [sequence.id]: sequence }));
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

  const handleArchiveDeliveryNoteLink = async (
    record: LegalArchiveRecord,
    deliveryDocumentId: string | null,
  ) => {
    if (record.source !== 'legal') return;
    const deliveryLink = deliveryDocumentId
      ? record.deliveryNoteCandidate || record.linkedDeliveryNote
      : record.linkedDeliveryNote;
    if (deliveryDocumentId && deliveryLink?.document.id !== deliveryDocumentId) {
      showToast('Το προτεινόμενο Δελτίο Αποστολής δεν είναι πλέον διαθέσιμο.', 'error');
      return;
    }

    const accepted = await confirm({
      title: deliveryDocumentId
        ? 'Σύνδεση Δελτίου Αποστολής'
        : 'Αφαίρεση σύνδεσης Δελτίου Αποστολής',
      message: deliveryDocumentId && deliveryLink
        ? [
            `Τιμολόγιο: ${getLegalDocumentDisplayNumber(record.document)}`,
            `Δελτίο Αποστολής: ${getLegalDocumentDisplayNumber(deliveryLink.document)}`,
            `Προϊόντα: ${formatNumber(deliveryLink.uniqueItemCount)} κωδικοί · ${formatNumber(deliveryLink.totalQuantity)} τεμάχια`,
            '',
            'Θα εμφανίζονται χωριστά οι κωδικοί και οι ποσότητες του Δελτίου Αποστολής. Το επίσημο τιμολόγιο, οι αξίες και το XML της ΑΑΔΕ δεν θα μεταβληθούν.',
          ].join('\n')
        : 'Θα αφαιρεθεί μόνο η σύνδεση. Κανένα επίσημο παραστατικό ή XML της ΑΑΔΕ δεν θα αλλάξει.',
      confirmText: deliveryDocumentId ? 'Σύνδεση' : 'Αφαίρεση',
      cancelText: 'Άκυρο',
      isDestructive: !deliveryDocumentId,
    });
    if (!accepted) return;

    try {
      await linkLegalArchiveDeliveryNote.mutateAsync({
        documentId: record.id,
        deliveryDocumentId,
        userName,
      });
      showToast(
        deliveryDocumentId
          ? 'Το Δελτίο Αποστολής συνδέθηκε. Τα προϊόντα εμφανίζονται χωριστά από τις επίσημες γραμμές του τιμολογίου.'
          : 'Η σύνδεση με το Δελτίο Αποστολής αφαιρέθηκε.',
        'success',
      );
    } catch (error: any) {
      showToast(error?.message || 'Δεν αποθηκεύτηκε η σύνδεση με το Δελτίο Αποστολής.', 'error');
    }
  };

  const handleArchiveVatLookup = async (
    vatNumber: string,
  ): Promise<AadeVatRegistryResult> => {
    const normalizedVat = normalizeVatNumber(vatNumber);
    const cached = archivePublicVatLookupCacheRef.current.get(normalizedVat);
    if (cached) return cached;

    const lookup = legalRepository.lookupPublicVat(normalizedVat)
      .then((result) => {
        if (!result) throw new Error('Δεν βρέθηκαν δημόσια στοιχεία για αυτό το ΑΦΜ.');
        return buildPublicVatLookupResult(normalizedVat, result);
      })
      .catch((error) => {
        archivePublicVatLookupCacheRef.current.delete(normalizedVat);
        throw error;
      });
    archivePublicVatLookupCacheRef.current.set(normalizedVat, lookup);
    return lookup;
  };

  const handleArchiveOfficialVatLookup = async (
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
    const isOfficialResult = result.source === 'aade_registry';
    const resultSourceLabel = isOfficialResult ? 'Μητρώο ΑΑΔΕ' : 'VIES';

    const ok = await confirm({
      title: customer ? 'Ενημέρωση και σύνδεση πελάτη' : 'Δημιουργία και σύνδεση πελάτη',
      message: [
        `Πηγή: ${resultSourceLabel}`,
        `Επωνυμία: ${result.businessName || '—'}`,
        `ΑΦΜ: ${result.vatNumber}`,
        `Έδρα: ${[result.address.street, result.address.number, result.address.postalCode, result.address.city].filter(Boolean).join(', ') || '—'}`,
        '',
        customer
          ? `Θα ενημερωθεί και θα συνδεθεί ο πελάτης «${customer.full_name}».`
          : 'Θα δημιουργηθεί νέος πελάτης στο πελατολόγιο και θα συνδεθεί αμέσως με αυτό το παραστατικό.',
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
    const primaryActivity = result.activities.find((activity) =>
      String(activity.kindDescription || '').toLocaleUpperCase('el-GR').includes('ΚΥΡΙΑ')
    ) || result.activities[0];
    const profession = primaryActivity?.description || null;
    const taxOffice = result.taxOfficeDescription || result.taxOfficeCode || null;
    const counterpart = {
      ...record.document.counterpart,
      vat_number: result.vatNumber || record.document.counterpart.vat_number,
      name: result.businessName || record.document.counterpart.name,
      profession: profession || record.document.counterpart.profession,
      tax_office: taxOffice || record.document.counterpart.tax_office,
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
          phone: result.phone || customer.phone,
          email: result.email || customer.email,
          profession: profession || customer.profession,
          tax_office: taxOffice || customer.tax_office,
        });
      } else {
        const newCustomer: Customer = {
          id: crypto.randomUUID(),
          full_name: result.businessName || record.document.counterpart.name || `ΑΦΜ ${result.vatNumber}`,
          vat_number: result.vatNumber,
          address: address || undefined,
          phone: result.phone || undefined,
          email: result.email || undefined,
          profession: profession || undefined,
          tax_office: taxOffice || undefined,
          vat_rate: record.document.vat_rate ?? 0.24,
          notes: `Δημιουργήθηκε από εύρεση ΑΦΜ μέσω ${resultSourceLabel}.`,
          created_at: new Date().toISOString(),
        };
        const savedCustomer = await ordersRepository.saveCustomer(newCustomer);
        if (!savedCustomer) {
          throw new Error('Ο πελάτης δεν αποθηκεύτηκε. Δεν έγινε σύνδεση με το παραστατικό.');
        }
        await legalRepository.linkArchiveCustomer(
          record.source,
          record.id,
          savedCustomer.id,
          userName,
        );
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
      showToast(
        customer
          ? 'Τα στοιχεία του πελάτη ενημερώθηκαν και η σύνδεση διατηρήθηκε.'
          : 'Ο πελάτης δημιουργήθηκε και συνδέθηκε με το παραστατικό.',
        'success',
      );
    } catch (error: any) {
      showToast(error?.message || 'Δεν εφαρμόστηκαν τα στοιχεία ΑΦΜ.', 'error');
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
            <div className="text-sm font-medium text-slate-500">{formatNumber(filteredProformas.length)} από {formatNumber(proformas.length)} εγγραφές</div>
          </div>
          <label className="relative w-full md:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={proformaSearch}
              onChange={(event) => setProformaSearch(event.target.value)}
              placeholder="Αναζήτηση προτιμολογίων ή τιμολογίου"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium outline-hidden focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
              <div className="text-xl font-black">{formatNumber(count)}</div>
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
        <div className="text-xs font-medium text-slate-500">{getLegalDocumentKindLabel(document.document_kind, document.aade_document_type)} | Τύπος ΑΑΔΕ {document.aade_document_type}</div>
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
              {submitDocument.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Έκδοση μέσω SBZ
            </ActionButton>
          )}
          {document.status === 'failed' && (
            <ActionButton variant="quiet" onClick={() => void handleSubmitLegalDocument(document)} disabled={submitDocument.isPending}>
              {submitDocument.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Επανάληψη
            </ActionButton>
          )}
          {document.status === 'issued' && document.document_kind === 'delivery_note' && document.provider === 'sbz' && (
            <ActionButton variant="danger" onClick={() => handleCancel(document)} disabled={cancelDocument.isPending}>
              <Ban size={16} /> Ακύρωση δελτίου διακίνησης
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
        {' '}Εδώ βλέπετε MARK, QR και ενέργειες (εκτύπωση, πίστωση ή ακύρωση διακίνησης, διαγραφή από Ilios).
      </div>
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-black text-slate-900">Αρχείο παραστατικών</h2>
          <div className="text-sm font-medium text-slate-500">{formatNumber(filteredArchive.length)} εγγραφές</div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
          <ActionButton onClick={() => { setDraftBundle(null); setProformaBundle(null); setActiveTab('new'); }}>
            <Plus size={16} /> Νέο παραστατικό
          </ActionButton>
        <label className="relative w-full sm:min-w-56 md:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={archiveSearch}
            onChange={(event) => setArchiveSearch(event.target.value)}
            placeholder="Αναζήτηση με πελάτη, MARK, αριθμό"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
      readOnlyMaintenance={isInspectionPresentation}
      initialRecordId={initialDocumentId}
      records={archiveRecords}
      customers={invoiceableCustomers}
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
        || linkLegalArchiveDeliveryNote.isPending
      }
      onCreate={() => void requestFreshWorkspace()}
      onOpenLegal={(document) => void handleOpenLegalDocument(document)}
      onPrintLegal={(document) => void handlePrint(document)}
      onSubmitLegal={(document) => void handleSubmitLegalDocument(document)}
      onCancelLegal={(document) => void handleCancel(document)}
      onCreditLegal={(document) => void openCredit(document)}
      onReconcileLegal={(document) => void reconcileSbz(document)}
      onAttachLegal={(document, file) => void attachSbz(document, file)}
      onDeleteLegal={(document) => void handleDeleteLegalDocument(document)}
      onEditProforma={(document) => void handleEditProforma(document)}
      onPrintProforma={(document) => void handlePrintProforma(document)}
      onConvertProforma={(document) => void openConvertModal(document)}
      onVoidProforma={(document) => void handleVoidProforma(document)}
      onDeleteProforma={(document) => void handleDeleteProforma(document)}
      onLinkCustomer={(record, customerId) => void handleArchiveCustomerLink(record, customerId)}
      onLinkOrder={(record, link) => void handleArchiveOrderLink(record, link)}
      onLinkSeller={(record, sellerId) => void handleArchiveSellerLink(record, sellerId)}
      onLinkDeliveryNote={(record, deliveryDocumentId) => void handleArchiveDeliveryNoteLink(record, deliveryDocumentId)}
      onLookupVat={handleArchiveVatLookup}
      onLookupOfficialVat={handleArchiveOfficialVatLookup}
      onApplyVat={(record, result) => void handleApplyArchiveVatResult(record, result)}
      onSaveAlias={(record, match, productSku, variantSuffix) =>
        void handleArchiveAliasSave(record, match, productSku, variantSuffix)}
      onDeleteAlias={(alias) => void handleArchiveAliasDelete(alias)}
    />
  );

  const applySyncDatePreset = (preset: 'today' | 'week' | 'month' | 'thirty') => {
    const pad = (value: number) => String(value).padStart(2, '0');
    const localIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const end = new Date();
    const start = new Date(end);
    if (preset === 'week') start.setDate(start.getDate() - 6);
    if (preset === 'thirty') start.setDate(start.getDate() - 29);
    if (preset === 'month') start.setDate(1);
    setSyncDraft((current) => ({ ...current, dateFrom: localIsoDate(start), dateTo: localIsoDate(end) }));
  };

  const renderSyncTab = () => {
    const activeSyncFilters = [syncDraft.receiverVatNumber, syncDraft.invType, syncDraft.maxMark].filter(Boolean).length;
    return (
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,440px)_minmax(0,1fr)] xl:items-start">
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs xl:sticky xl:top-4">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><RefreshCw size={18} /></div>
          <div><h2 className="font-black text-slate-900">Συγχρονισμός παλιών παραστατικών</h2><p className="text-xs font-medium text-slate-500">Ανάκτηση και ενημέρωση του αρχείου από τον πάροχο.</p></div>
        </div>
        <div className="space-y-5 p-5">
          <p className="text-xs font-medium leading-relaxed text-slate-500">
            Συγχρονίζει τιμολόγια χονδρικής, πιστωτικά και παραστατικά διακίνησης που έχουν ήδη εκδοθεί ή ακυρωθεί, με μία ενιαία ασφαλή ροή προς την SBZ. Παραστατικά λιανικής και λοιπές μη εμπορικές εγγραφές απορρίπτονται πριν από την αποθήκευση και δεν συμμετέχουν ποτέ στο Αρχείο ή στα ποσά.
          </p>

          <div className="space-y-3">
            <FieldGroupLabel icon={CalendarDays}>Διάστημα</FieldGroupLabel>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['today', 'Σήμερα'],
                ['week', '7 ημέρες'],
                ['month', 'Τρέχων μήνας'],
                ['thirty', '30 ημέρες'],
              ] as const).map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applySyncDatePreset(preset)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <TextInput label="Από ημερομηνία" type="date" value={syncDraft.dateFrom} onChange={(value) => setSyncDraft((current) => ({ ...current, dateFrom: value }))} help="Επιλέξτε την αρχή του διαστήματος αναζήτησης." />
              <TextInput label="Έως ημερομηνία" type="date" value={syncDraft.dateTo} onChange={(value) => setSyncDraft((current) => ({ ...current, dateTo: value }))} help="Αν δεν υπάρχουν παραστατικά στο διάστημα, ο συγχρονισμός ολοκληρώνεται κανονικά με 0 εισαγωγές." />
            </div>
            <TextInput label="Από MARK" value={syncDraft.markFrom} onChange={(value) => setSyncDraft((current) => ({ ...current, markFrom: value }))} help="Προαιρετικό σημείο εκκίνησης της ΑΑΔΕ. Αφήστε 0 για συγχρονισμό με βάση ημερομηνίες." />
          </div>

          <details className="group rounded-xl border border-slate-200 bg-slate-50/70">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-black text-slate-800 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Filter size={15} className="text-slate-500" /> Περιορισμός αναζήτησης
                <InfoTip text="Χρησιμοποιήστε τα μόνο όταν θέλετε να περιορίσετε τον συγχρονισμό σε συγκεκριμένο ΑΦΜ, τύπο παραστατικού ή μέχρι συγκεκριμένο MARK." />
                {activeSyncFilters > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">{formatNumber(activeSyncFilters)}</span>}
              </span>
              <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 border-t border-slate-200 p-3.5 sm:grid-cols-2">
              <TextInput label="ΑΦΜ αντισυμβαλλόμενου" value={syncDraft.receiverVatNumber} onChange={(value) => setSyncDraft((current) => ({ ...current, receiverVatNumber: normalizeVatNumber(value) }))} help="Φέρνει μόνο παραστατικά για συγκεκριμένο πελάτη/λήπτη." />
              <TextInput label="Έως MARK" value={syncDraft.maxMark} onChange={(value) => setSyncDraft((current) => ({ ...current, maxMark: value.replace(/\D/g, '') }))} help="Ανώτερο MARK που θα ζητηθεί από τον πάροχο. Κενό σημαίνει χωρίς άνω όριο." />
              <div className="sm:col-span-2">
                <SelectInput label="Τύπος παραστατικού" value={syncDraft.invType} onChange={(value) => setSyncDraft((current) => ({ ...current, invType: value }))} help="Επιλέξτε ένα είδος ή αναζητήστε όλο το αρχείο χονδρικής.">
                  <option value="">Όλοι οι τύποι χονδρικής</option>
                  <option value="1.1">Τιμολόγιο Πώλησης</option>
                  <option value="2.1">Τιμολόγιο Παροχής Υπηρεσιών</option>
                  <option value="5.1">Πιστωτικό Συσχετιζόμενο</option>
                  <option value="5.2">Πιστωτικό Μη Συσχετιζόμενο</option>
                  <option value="9.3">Δελτίο Αποστολής</option>
                </SelectInput>
              </div>
            </div>
          </details>

          <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${persistedEnvironment === 'dev' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            <span className="text-xs font-black">Περιβάλλον: {persistedEnvironment === 'dev' ? 'SBZ Δοκιμών' : 'SBZ Παραγωγής'}</span>
            <button type="button" onClick={() => setActiveTab('settings')} className="rounded-lg bg-white px-2 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Αλλαγή στις Ρυθμίσεις</button>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 p-4">
          <button
            type="button"
            onClick={handleSyncTransmitted}
            disabled={syncTransmittedDocuments.isPending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-xs shadow-emerald-900/10 transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {syncTransmittedDocuments.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Συγχρονισμός
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><History size={18} /></div>
            <div>
              <h2 className="font-black text-slate-900">Ιστορικό συγχρονισμών</h2>
              <div className="text-xs font-medium text-slate-500">{formatNumber(syncRuns.length)} εκτελέσεις</div>
            </div>
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
            disabled={isInspectionPresentation || !syncRuns.length || clearSyncRuns.isPending}
          >
            {clearSyncRuns.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Διαγραφή ιστορικού
          </ActionButton>
        </div>
        <ul className="divide-y divide-slate-100">
          {syncRuns.length === 0 ? (
            <li className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><RefreshCw size={22} /></span>
              <div className="text-sm font-black text-slate-700">Δεν έχει γίνει ακόμη συγχρονισμός.</div>
              <div className="max-w-sm text-xs font-medium text-slate-500">Επιλέξτε διάστημα αριστερά και πατήστε «Συγχρονισμός» για να φέρετε τα ήδη εκδοθέντα παραστατικά στο Αρχείο.</div>
            </li>
          ) : syncRuns.map((run) => {
            const runTone: Tone = run.status === 'success' ? 'emerald' : run.status === 'failed' ? 'red' : 'amber';
            return (
              <li key={run.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconToneClass[runTone]}`}>
                    {run.status === 'success' ? <CheckCircle2 size={16} /> : run.status === 'failed' ? <XCircle size={16} /> : <AlertTriangle size={16} />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={runTone}>{run.status === 'success' ? 'Ολοκληρώθηκε' : run.status === 'failed' ? 'Απέτυχε' : 'Μερικό αποτέλεσμα'}</Chip>
                      <span className="text-sm font-black text-slate-900">{run.environment === 'dev' ? 'Δοκιμαστικό περιβάλλον' : 'Παραγωγή'}</span>
                      <span className="text-xs font-medium text-slate-500">{new Date(run.started_at).toLocaleString('el-GR')}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">
                      {run.date_from || '-'} έως {run.date_to || '-'} <span className="font-medium text-slate-400">· MARK από {run.mark_from || '0'}</span>
                    </div>
                    {run.error_message && <div className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{run.error_message}</div>}
                    {(run.next_partition_key || run.next_row_key) && (
                      <div className="mt-2 text-xs font-bold text-slate-500">
                        Υπάρχουν επιπλέον σελίδες από τον πάροχο. Τα κλειδιά συνέχειας εμφανίζονται στις τεχνικές λεπτομέρειες.
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 pl-12 md:pl-0">
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">{formatNumber(run.imported_count)} νέα</span>
                  <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">{formatNumber(run.updated_count)} ενημερώσεις</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
    );
  };

  const renderDeliveryTab = () => (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><Truck size={18} /></div>
          <div>
            <h2 className="font-black text-slate-900">Διακίνηση</h2>
            <div className="text-sm font-medium text-slate-500">{formatNumber(deliveryDocuments.length)} δελτία ή συνδυασμένα παραστατικά</div>
            <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">
              Προαιρετική ροή μετά την έκδοση: καταγραφή έναρξης/παράδοσης για παραστατικά με δελτίο διακίνησης.
              Τα απλά τιμολόγια 1.1 δεν χρειάζονται αυτή τη διαδικασία.
            </p>
          </div>
        </div>
        <Chip tone="slate" className="py-1"><Info size={11} /> Η ενημέρωση παράδοσης αναμένει υποστήριξη από την SBZ.</Chip>
      </div>
      <ul className="divide-y divide-slate-100">
        {deliveryDocuments.length === 0 ? (
          <li className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Truck size={22} /></span>
            <div className="text-sm font-black text-slate-700">Δεν υπάρχουν παραστατικά διακίνησης.</div>
          </li>
        ) : deliveryDocuments.map((document) => (
          <li key={document.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Truck size={16} /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-slate-900">{getLegalDocumentDisplayNumber(document)}</span>
                  <Chip tone={null} className={statusClass[document.status]}>{statusLabel[document.status]}</Chip>
                  <span className="text-xs font-medium text-slate-500">{getLegalDocumentKindLabel(document.document_kind, document.aade_document_type)}</span>
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-700">{document.counterpart.name || '-'} <span className="font-mono text-xs font-medium text-slate-400">· MARK {document.aade_mark || '-'}</span></div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 pl-12 text-xs font-bold text-slate-600 md:pl-0">
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200"><CalendarDays size={12} /> {document.delivery?.dispatch_date || '-'} {document.delivery?.dispatch_time || ''}</span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200"><Truck size={12} /> {resolveLegalCarrierLabel(document.delivery) || resolveSbzDispatchMethod(document.delivery)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  const renderSettingsTab = () => {
    const environmentLabel = settingsDraft.environment === 'dev' ? 'Δοκιμές' : 'Παραγωγή';
    const environmentSequences = sequences.filter((sequence) => (sequence.environment || 'prod') === settingsDraft.environment);
    const registryStatusTone = registryConnectionStatus.verified
      ? 'emerald'
      : credentialStatus?.registry?.ready
        ? 'sky'
        : 'amber';
    const registryStatusLabel = registryConnectionStatus.verified
      ? 'Επαληθευμένο'
      : credentialStatus?.registry?.ready
        ? 'Αναμένει έλεγχο'
        : 'Δεν έχει ρυθμιστεί';

    return (
      <div className="space-y-5">
        {!isInspectionPresentation && <EvidenceSourcesEditor value={settingsDraft.inspection_evidence_sources || []}
          onChange={(inspection_evidence_sources) => setSettingsDraft((current) => ({ ...current, inspection_evidence_sources }))} />}
        <EnvironmentSwitch
          current={persistedEnvironment}
          status={sbzStatus as any}
          busy={saveEnvironment.isPending}
          readOnly={isInspectionPresentation}
          onSwitch={(next) => void switchEnvironment(next)}
        />
        <SbzSettings currentEnvironment={persistedEnvironment} />

        <SettingsCard
          icon={Search}
          tone="indigo"
          title="Επίσημος έλεγχος Μητρώου ΑΦΜ"
          subtitle="Ξεχωριστή υπηρεσία από το myDATA. Ελέγχει ΑΦΜ, επωνυμία, ΔΟΥ και έδρα μόνο όταν το ζητήσετε."
          action={<SettingsStatusBadge tone={registryStatusTone}>{registryStatusLabel}</SettingsStatusBadge>}
        >
          {missingRegistryCredentials.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {missingRegistryCredentials.map((name) => (
                <span key={name} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
                  {credentialSecretLabel(name)}
                </span>
              ))}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
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
            <div className={`mt-4 rounded-xl border px-3 py-2 text-xs font-bold ${
              registryConnectionStatus.verified
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {registryConnectionStatus.message}
              {registryConnectionStatus.verifiedAt
                ? ` · Τελευταία επαλήθευση ${new Date(registryConnectionStatus.verifiedAt).toLocaleString('el-GR')}`
                : ''}
            </div>
          )}
        </SettingsCard>

        <SettingsCard
          icon={Building2}
          tone="emerald"
          title="Εκδότης / ΑΑΔΕ"
          subtitle="Στοιχεία επιχείρησης που εκτυπώνονται και διαβιβάζονται στα παραστατικά."
          action={<SettingsStatusBadge tone={settingsDraft.environment === 'prod' ? 'emerald' : 'amber'}>{environmentLabel}</SettingsStatusBadge>}
        >
          <div className="space-y-6">
            <SettingsGroup title="Ταυτότητα επιχείρησης">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <TextInput label="ΑΦΜ Εκδότη" value={settingsDraft.issuer.vat_number || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, vat_number: normalizeVatNumber(value) } }))} help="Πρέπει να είναι ο πραγματικός ΑΦΜ της εγγραφής API myDATA (ίδιος με το αναγνωριστικό χρήστη ΑΑΔΕ). Το περιβάλλον Δοκιμών δεν δέχεται πλασματικούς αριθμούς." />
                <TextInput label="Επωνυμία" value={settingsDraft.issuer.business_name || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, business_name: value, name: value } }))} />
                <TextInput label="Διακριτικός τίτλος" value={settingsDraft.issuer.trade_name || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, trade_name: value } }))} />
                <TextInput label="Υποκατάστημα" type="number" value={settingsDraft.issuer.branch ?? 0} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, branch: Number(value) || 0 } }))} help="0 για έδρα. Άλλος αριθμός μόνο αν έχει δηλωθεί υποκατάστημα στην ΑΑΔΕ." />
              </div>
            </SettingsGroup>

            <div className="border-t border-slate-100 pt-6">
              <SettingsGroup title="Έδρα">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.25fr)_5.5rem_5.5rem_minmax(0,1fr)_minmax(8.5rem,0.95fr)]">
                  <TextInput label="Οδός" value={settingsDraft.issuer.address?.street || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, address: { ...(current.issuer.address || {}), street: value } } }))} />
                  <TextInput label="Αριθμός" value={settingsDraft.issuer.address?.number || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, address: { ...(current.issuer.address || {}), number: value } } }))} />
                  <TextInput label="Τ.Κ." value={settingsDraft.issuer.address?.postal_code || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, address: { ...(current.issuer.address || {}), postal_code: value } } }))} />
                  <TextInput label="Πόλη" value={settingsDraft.issuer.address?.city || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, address: { ...(current.issuer.address || {}), city: value } } }))} />
                  <SelectInput label="Χώρα" value={normalizeLegalCountryCode(settingsDraft.issuer.country)} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, country: value } }))} help="Εμφανίζεται ως όνομα χώρας στα παραστατικά. Στη διαβίβαση ΑΑΔΕ/SBZ παραμένει ο κωδικός ISO.">
                    {listLegalCountryOptions(settingsDraft.issuer.country).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </SelectInput>
                </div>
              </SettingsGroup>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <SettingsGroup title="Μητρώο" description="Η ΔΟΥ, η νομική μορφή και η δραστηριότητα μπορούν να συμπληρωθούν από τον έλεγχο Μητρώου.">
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextInput label="ΔΟΥ" value={settingsDraft.issuer.doy || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, doy: value } }))} help="Μπορεί να συμπληρωθεί από τον επίσημο έλεγχο Μητρώου." />
                  <TextInput label="Νομική μορφή" value={settingsDraft.issuer.legal_form || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, legal_form: value } }))} />
                  <TextInput label="Αριθμός ΓΕΜΗ" value={settingsDraft.issuer.gemi || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, gemi: value } }))} help="Συμπληρώνεται χειροκίνητα· δεν επιστρέφεται από το Μητρώο ΑΑΔΕ." />
                </div>
                <TextInput label="Κύρια δραστηριότητα" value={settingsDraft.issuer.activity || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, activity: value } }))} help="Κείμενο εκτύπωσης και PDF παρόχου. Αποθηκεύστε τις ρυθμίσεις· εφαρμόζεται στα πρόχειρα και στην επόμενη έκδοση, όχι σε ήδη εκδοθέντα." />
              </SettingsGroup>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <SettingsGroup title="Επικοινωνία">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput label="Τηλέφωνο" value={settingsDraft.issuer.phone || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, phone: value } }))} />
                  <TextInput label="Email" value={settingsDraft.issuer.email || ''} onChange={(value) => setSettingsDraft((current) => ({ ...current, issuer: { ...current.issuer, email: value } }))} />
                </div>
              </SettingsGroup>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <SettingsGroup title="Προεπιλογές νέων παραστατικών" description="Εφαρμόζονται αυτόματα στη δημιουργία. Μπορούν να αλλάξουν ανά παραστατικό πριν τη διαβίβαση.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectInput label="Προεπιλογή πληρωμής" value={settingsDraft.default_payment_method} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_payment_method: Number(value) }))}>
                    {PAYMENT_METHOD_CODES.filter(code => ![7, 8].includes(code)).map((code) => <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code]}</option>)}
                  </SelectInput>
                  <SelectInput label="Σκοπός διακίνησης" value={settingsDraft.default_move_purpose} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_move_purpose: Number(value) || 1 }))}>{Object.entries(SBZ_MOVE_PURPOSES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SelectInput>
                  <SelectInput label="Κατηγορία κανονικών ειδών" value={settingsDraft.default_income_classification_category} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_income_classification_category: value, inhouse_income_classification_category: value, imported_income_classification_category: value }))} help="Εφαρμόζεται σε όλες τις κανονικές γραμμές. Για τη συνήθη μεταπώληση επιλέξτε «Πώληση εμπορευμάτων». Ο ακριβής κωδικός 000 παραμένει πάντα παροχή υπηρεσίας.">
                    {incomeCategoryOptions.filter((option) => ['category1_1', 'category1_2'].includes(option.value)).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </SelectInput>
                  <SelectInput label="Προεπιλογή πώλησης" value={settingsDraft.default_income_classification_type} onChange={(value) => setSettingsDraft((current) => ({ ...current, default_income_classification_type: value, inhouse_income_classification_type: value, imported_income_classification_type: value }))} help="Ο χαρακτηρισμός εσόδου που θα μπαίνει αυτόματα στις γραμμές.">
                    {!incomeTypeOptions.some((option) => option.value === settingsDraft.default_income_classification_type) && (
                      <option value={settingsDraft.default_income_classification_type}>{settingsDraft.default_income_classification_type}</option>
                    )}
                    {incomeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </SelectInput>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-950">
                  <strong>Αυτόματος κανόνας:</strong> μόνο ο ακριβής κωδικός <span className="font-mono">000</span> χαρακτηρίζεται ως υπηρεσία. Κάθε γραμμή μπορεί να αλλάξει ρητά πριν από τη διαβίβαση.
                </div>
                <VatExemptionCategorySelect
                  label="Προεπιλογή αιτίας απαλλαγής ΦΠΑ"
                  value={settingsDraft.default_vat_exemption_category}
                  onChange={(value) => setSettingsDraft((current) => ({ ...current, default_vat_exemption_category: value }))}
                />
              </SettingsGroup>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-500">Οι αλλαγές εφαρμόζονται στα νέα και στα πρόχειρα παραστατικά μετά την αποθήκευση. Τα ήδη εκδοθέντα παραμένουν ως εκδόθηκαν.</p>
            <ActionButton onClick={handleSaveSettings} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση ρυθμίσεων
            </ActionButton>
          </div>
        </SettingsCard>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,1fr)] xl:items-start">
          <SettingsCard
            icon={Hash}
            tone="sky"
            title="Σειρές και αρίθμηση"
            subtitle="Ο επόμενος αριθμός ελέγχεται αυτόματα κατά την έκδοση. Η παραγωγική αρίθμηση δεν μηδενίζεται."
            action={<SettingsStatusBadge tone={settingsDraft.environment === 'prod' ? 'emerald' : 'amber'}>{environmentLabel}</SettingsStatusBadge>}
          >
            {environmentSequences.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
                Δεν υπάρχουν σειρές για το περιβάλλον {environmentLabel}.
              </div>
            ) : (
              <div className="space-y-3">
                {environmentSequences.map((sequence) => {
                  const draft = sequenceDrafts[sequence.id] || sequence;
                  const hasHistory = sequence.next_aa > 1 || visibleLegalDocuments.some((document) =>
                    document.document_kind === sequence.document_kind
                    && document.aade_document_type === sequence.aade_document_type
                    && normalizeLegalSeriesKey(document.series) === normalizeLegalSeriesKey(sequence.series)
                    && !!document.aa,
                  );
                  const changed = JSON.stringify(draft) !== JSON.stringify(sequence);
                  return (
                    <div key={sequence.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-black text-slate-900">{getLegalDocumentKindLabel(sequence.document_kind, sequence.aade_document_type)}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                              ΑΑΔΕ {sequence.aade_document_type}
                              <InfoTip text="Ο επίσημος τύπος παραστατικού myDATA για αυτή τη σειρά." />
                            </span>
                            {hasHistory && (
                              <span className="text-[11px] font-bold text-amber-700">Η ονομασία έχει κλειδωθεί</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateSequenceDraft(sequence.id, { is_active: !draft.is_active })}
                          className={`rounded-full border px-3 py-1 text-[11px] font-black transition ${
                            draft.is_active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-500'
                          }`}
                        >
                          {draft.is_active ? 'Ενεργή' : 'Ανενεργή'}
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_auto] sm:items-end">
                        <TextInput
                          label="Σειρά"
                          value={draft.series}
                          disabled={hasHistory}
                          onChange={(value) => updateSequenceDraft(sequence.id, { series: value })}
                          help={hasHistory ? 'Για νέο namespace δημιουργείται νέα σειρά.' : 'Το πρόθεμα που θα φαίνεται στο παραστατικό.'}
                        />
                        <TextInput
                          label="Επόμενος αριθμός"
                          type="number"
                          min={sequence.next_aa}
                          value={draft.next_aa}
                          onChange={(value) => updateSequenceDraft(sequence.id, {
                            next_aa: Math.max(sequence.next_aa, Math.trunc(Number(value) || sequence.next_aa)),
                          })}
                          help={`Δεν μπορεί να γίνει μικρότερο από ${sequence.next_aa}.`}
                        />
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
                    </div>
                  );
                })}
              </div>
            )}
          </SettingsCard>

          <SettingsCard
            icon={Hash}
            tone="amber"
            title="Συστημικοί κωδικοί"
            subtitle="Δικοί σας κωδικοί ειδών για παραστατικά (π.χ. ΑΦΟΣ, ΜΠΟΚ για το χυτήριο), με δική τους μονάδα μέτρησης. Εμφανίζονται στην επιλογή ειδών κάθε γραμμής."
            action={<SettingsStatusBadge tone="slate">{formatNumber((settingsDraft.system_items || []).length)}</SettingsStatusBadge>}
          >
            <SystemItemsSettings
              items={settingsDraft.system_items || []}
              productSkus={productSkuList}
              saving={saveSystemItems.isPending}
              readOnly={isInspectionPresentation}
              onSave={async (next) => {
                const saved = await saveSystemItems.mutateAsync(next);
                setSettingsDraft((current) => ({ ...current, system_items: saved }));
                showToast('Οι συστημικοί κωδικοί αποθηκεύτηκαν.', 'success');
              }}
            />
          </SettingsCard>

          <SettingsCard
            icon={Truck}
            tone="slate"
            title="Μεταφορείς"
            subtitle="Για δελτία διακίνησης: καταχωρήστε κάθε μεταφορική ή courier με τον ΑΦΜ της. Για «Ίδια μέσα» δεν χρειάζεται εγγραφή."
            action={<SettingsStatusBadge tone="slate">{formatNumber(carriers.length)}</SettingsStatusBadge>}
          >
            {carriers.length === 0 && !newCarrier.name ? (
              <button
                type="button"
                onClick={prefillAcsCarrier}
                className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800 transition hover:bg-emerald-100"
              >
                <Plus size={13} /> Συμπλήρωση για ACS Courier
              </button>
            ) : null}
            <CarrierForm
              value={newCarrier}
              onChange={setNewCarrier}
              suppliers={suppliers}
              busy={saveCarrier.isPending}
              submitLabel="Προσθήκη μεταφορέα"
              onSubmit={() => void handleAddCarrier()}
              onCancel={newCarrier.name || newCarrier.supplier_id ? () => setNewCarrier(EMPTY_CARRIER_DRAFT) : undefined}
            />
            <div className="mt-5 space-y-2">
              {carriers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-medium text-slate-500">
                  Δεν έχουν καταχωρηθεί μεταφορείς.
                </div>
              ) : carriers.map((carrier) => {
                const partner = linkedSupplier(suppliers, carrier);
                if (editingCarrier?.id === carrier.id) {
                  return (
                    <div key={carrier.id} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <CarrierForm
                        value={editingCarrier.draft}
                        onChange={(draft) => setEditingCarrier({ id: carrier.id, draft })}
                        suppliers={suppliers}
                        busy={saveCarrier.isPending}
                        submitLabel="Αποθήκευση αλλαγών"
                        onSubmit={() => void handleUpdateCarrier()}
                        onCancel={() => setEditingCarrier(null)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={carrier.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                    <SupplierAvatar name={partner?.name || carrier.name} logoUrl={partner?.logo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-slate-900">{carrier.name}</span>
                        {carrier.is_default ? (
                          <Chip tone="emerald">Προεπιλογή</Chip>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleMakeDefaultCarrier(carrier)}
                            disabled={saveCarrier.isPending}
                            className="rounded-md px-1.5 py-0.5 text-[11px] font-black text-slate-400 transition hover:bg-white hover:text-emerald-700 disabled:opacity-50"
                          >
                            Ορισμός ως προεπιλογή
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500">ΑΦΜ {carrier.vat_number || '—'}</span>
                        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500">Όχημα {carrier.vehicle_number || '—'}</span>
                        {carrier.phone && (
                          <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500">{carrier.phone}</span>
                        )}
                        {partner ? (
                          <span className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700">Συνεργάτης: {partner.name}</span>
                        ) : carrier.supplier_id ? (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">Ο συνδεδεμένος συνεργάτης δεν βρέθηκε</span>
                        ) : null}
                      </div>
                    </div>
                    <ActionButton variant="quiet" onClick={() => setEditingCarrier({ id: carrier.id, draft: carrierToDraft(carrier) })} disabled={saveCarrier.isPending || !!editingCarrier}>
                      <Edit3 size={15} /> Επεξεργασία
                    </ActionButton>
                  </div>
                );
              })}
            </div>
          </SettingsCard>
        </div>

        {showInspectionPinSection && !isInspectionModeActive() && (
          <SettingsCard
            icon={KeyRound}
            tone="amber"
            title="Κωδικός εξόδου λειτουργίας ελέγχου"
            subtitle="Χρησιμοποιείται για επιστροφή στην πλήρη λειτουργία ERP μετά από κλείδωμα σε λειτουργία παραστατικών μόνο."
            action={<SettingsStatusBadge tone={inspectionPinConfigured ? 'emerald' : 'amber'}>{inspectionPinConfigured ? 'Ορισμένος' : 'Μη ορισμένος'}</SettingsStatusBadge>}
          >
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
          </SettingsCard>
        )}

        {legalSettingsRestart.dirty && !isInspectionPresentation && (
          <div className="z-20 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 shadow-lg shadow-amber-900/5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between md:sticky md:bottom-4">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
              <AlertTriangle size={16} className="shrink-0" /> Υπάρχουν μη αποθηκευμένες αλλαγές στις ρυθμίσεις παραστατικών.
            </div>
            <ActionButton onClick={handleSaveSettings} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση ρυθμίσεων
            </ActionButton>
          </div>
        )}
      </div>
    );
  };

  const statsEnvironmentLabel = (isInspectionPresentation && activeTab === 'archive' ? inspectionSnapshot?.filters.environment : settingsDraft.environment) === 'dev' ? 'Δοκιμές' : 'Παραγωγή';
  const kpis: Array<{ label: string; value: string; icon: LucideIcon; tone: Tone }> = [
    { label: 'Αποδεκτά', value: formatNumber(stats.issued), icon: BadgeCheck, tone: 'emerald' },
    { label: 'Σφάλματα', value: formatNumber(stats.failed), icon: AlertTriangle, tone: stats.failed ? 'red' : 'slate' },
    { label: 'Εκτυπώσιμα', value: formatNumber(stats.printable), icon: Printer, tone: 'slate' },
    { label: 'Προτιμολόγια', value: formatNumber(stats.proformas), icon: FileText, tone: 'sky' },
    { label: 'Περιβάλλον', value: statsEnvironmentLabel, icon: ShieldCheck, tone: statsEnvironmentLabel === 'Δοκιμές' ? 'amber' : 'emerald' },
  ];
  const renderStats = (layout: 'chip' | 'tile') => (
    <div className={layout === 'chip' ? 'flex min-w-0 max-w-full items-center divide-x divide-slate-200/80 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/80 shadow-xs backdrop-blur-sm' : 'grid grid-cols-2 gap-2 md:grid-cols-5'}>
      {kpis.map((kpi) => <KpiTile key={kpi.label} layout={layout} {...kpi} />)}
    </div>
  );

  const workspaceInProgress = Boolean(draftBundle || proformaBundle);
  const countBadge = (count: number, tone: 'red' | 'slate') => count > 0 ? (
    <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black leading-none ${tone === 'red' ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{formatNumber(count)}</span>
  ) : null;
  const pageTabs: Array<{ id: LegalTab; label: string; icon: LucideIcon; onClick: () => void; badge?: React.ReactNode; title?: string }> = [
    {
      id: 'new',
      label: 'Δημιουργία',
      icon: FileCheck2,
      onClick: () => setActiveTab('new'),
      badge: workspaceInProgress ? <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" aria-label="Πρόχειρο σε επεξεργασία" /> : null,
    },
    { id: 'archive', label: 'Αρχείο', icon: Archive, onClick: () => { setArchiveSearch(''); setActiveTab('archive'); }, badge: countBadge(stats.failed, 'red'), title: stats.failed ? `${formatNumber(stats.failed)} παραστατικά χρειάζονται διόρθωση` : undefined },
    ...secondaryTabItems.map((tab) => ({
      id: tab.id,
      label: tab.label,
      icon: tab.icon,
      onClick: () => (tab.id === 'settings' ? handleSettingsTabClick() : setActiveTab(tab.id)),
      badge: tab.id === 'delivery' ? countBadge(deliveryDocuments.length, 'slate') : null,
    })),
  ];

  return (
    <div className="space-y-5">
      {(documentsError || linesError) && <Notice role="alert" tone="amber" icon={AlertTriangle}>Δεν έχουν ανακτηθεί όλα τα στοιχεία υποστήριξης έκδοσης. Η πληρότητα του αρχείου και των διαθέσιμων πιστώσεων χρειάζεται επιβεβαίωση.</Notice>}
      {isInspectionPresentation && !!inspectionSnapshot?.tables.legal_documents.some((row) => !row.environment) && <Notice tone="amber" icon={AlertTriangle}>Υπάρχουν παραστατικά άγνωστου περιβάλλοντος. Παραμένουν ορατά για διερεύνηση και δεν τεκμηριώνουν παραγωγική έκδοση μέχρι την επιβεβαίωσή τους.</Notice>}
      {isInspectionPresentation && activeTab === 'archive' && visibleLegalDocuments.some(row => !row.environment) && <details className="rounded-xl border border-amber-200 bg-white p-3 text-sm"><summary className="cursor-pointer font-bold">Εκκρεμότητα περιβάλλοντος · {visibleLegalDocuments.filter(row => !row.environment).length} παραστατικά εκτός των μετρήσεων του περιβάλλοντος</summary><ul className="mt-2 space-y-1">{visibleLegalDocuments.filter(row => !row.environment).map(row => <li key={row.id}>{row.issue_date} · {getLegalDocumentDisplayNumber(row)} · MARK {row.aade_mark || 'Μη διαθέσιμο'}</li>)}</ul></details>}
      {isInspectionPresentation ? (
        renderStats('tile')
      ) : (
        <DesktopPageHeader
          icon={FileCheck2}
          title="Παραστατικά"
          subtitle="Τιμολόγηση χονδρικής μέσω SBZ, πιστωτικά και αρχείο"
          roundedClassName="rounded-2xl"
          tailClassName="flex w-full min-w-0 flex-wrap items-center gap-3 lg:ml-auto lg:flex-1 lg:flex-nowrap lg:justify-end"
          tail={(
            <>
              {renderStats('chip')}
              <HeaderPrimaryButton icon={Plus} onClick={() => void requestFreshWorkspace()}>Νέο παραστατικό</HeaderPrimaryButton>
            </>
          )}
          below={(
            <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50 p-1.5 shadow-xs">
              {pageTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={tab.onClick}
                    title={tab.title}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 sm:px-5 ${active ? 'bg-white text-[#060b00] shadow-xs ring-1 ring-slate-200/90' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}
                  >
                    <Icon size={16} /> {tab.label} {tab.badge}
                  </button>
                );
              })}
            </div>
          )}
        />
      )}
      {activeTab === 'new' && !catalogReady && !issuingDocument && !outcomeDocument && (
        <Notice
          role="status"
          tone={catalogQuery.isFetching && canRefreshCatalog ? 'slate' : 'amber'}
          icon={catalogQuery.isFetching && canRefreshCatalog ? RefreshCw : AlertTriangle}
          action={canRefreshCatalog ? (
            <ActionButton variant="secondary" disabled={catalogQuery.isFetching} onClick={() => void catalogQuery.refetch({ cancelRefetch: false })}>
              {catalogQuery.isFetching ? <><Loader2 size={16} className="animate-spin" /> Ενημέρωση…</> : 'Ανανέωση καταλόγου'}
            </ActionButton>
          ) : undefined}
        >
          {!canRefreshCatalog
            ? 'Η δημιουργία παραστατικού θα είναι διαθέσιμη μόλις επανέλθει η σύνδεση και ενημερωθεί ο κατάλογος.'
            : catalogQuery.isFetching
              ? 'Ενημερώνεται ο κατάλογος έκδοσης…'
              : catalogQuery.data?.saved
                ? 'Χρησιμοποιείται αποθηκευμένος κατάλογος. Η ενημέρωση θα επαναληφθεί αυτόματα.'
                : 'Δεν ανακτήθηκε ο κατάλογος έκδοσης. Θα γίνει αυτόματα νέα προσπάθεια.'}
        </Notice>
      )}
      {persistedEnvironment === 'dev' && !isInspectionPresentation && (
        <Notice
          tone="amber"
          icon={FlaskConical}
          title="Δοκιμαστικό περιβάλλον"
          action={activeTab !== 'settings' ? <button type="button" className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100" onClick={() => setActiveTab('settings')}>Αλλαγή περιβάλλοντος</button> : undefined}
        >
          Τα νέα παραστατικά εκδίδονται στις Δοκιμές της SBZ, με ξεχωριστή αρίθμηση και χωρίς φορολογική ισχύ. Επιστρέψτε στην Παραγωγή μετά τις δοκιμές.
        </Notice>
      )}

      <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === 'new' && (catalogReady || issuingDocument || outcomeDocument) && renderNewTab()}
        {activeTab === 'archive' && (isInspectionPresentation && !inspectionSnapshot
          ? <p className="rounded-xl border bg-white p-5">{inspectionSnapshotPending ? 'Ανάκτηση στιγμιότυπου αρχείου…' : 'Δεν ανακτήθηκε το αρχείο. Χρησιμοποιήστε την Ανανέωση στοιχείων.'}</p>
          : renderArchiveTab())}
        {activeTab === 'sync' && renderSyncTab()}
        {activeTab === 'delivery' && renderDeliveryTab()}
        {activeTab === 'settings' && <fieldset disabled={isInspectionPresentation} className="min-w-0">{isInspectionPresentation && <p className="mb-3 text-sm font-bold text-slate-500">Στοιχεία εκδότη και σύνδεσης · μόνο ανάγνωση. Οι αλλαγές γίνονται μετά από έξοδο με PIN.</p>}{renderSettingsTab()}</fieldset>}
      </div>

      {creditSource && <CreditDocumentModal original={creditSource.document} lines={creditSource.lines} available={creditSource.available} reservedLines={creditSource.reservedLines} onClose={() => setCreditSource(null)} onCreate={async bundle => { await saveDraft.mutateAsync(bundle); setCreditSource(null); setDraftBundle(bundle); setActiveTab('new'); showToast('Το πιστωτικό αποθηκεύτηκε ως προσχέδιο. Ελέγξτε το πριν την έκδοση.', 'success'); }} />}
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
      <NumberingAlignmentModal
        isOpen={numberingAlignmentModal.isOpen}
        status={numberingAlignmentModal.status}
        preview={numberingAlignmentModal.preview}
        error={numberingAlignmentModal.error}
        onClose={closeLegalNumberingAlignment}
        onRetry={() => void promptLegalNumberingAlignment()}
        onApply={() => void applyLegalNumberingAlignment()}
      />
    </div>
  );
}
