import React, { Suspense, useEffect, useState } from 'react';
import {
  Archive,
  FileCheck2,
  RefreshCw,
  Settings,
  Truck,
  List,
  ClipboardCheck,
  Package,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { APP_ICON_ONLY, APP_LOGO } from '../constants';
import { useLegalSettings } from '../hooks/api/useLegalDocuments';
import { useRealtimeInvalidation } from '../hooks/api/useRealtimeInvalidation';
import { usePrint } from './PrintContext';
import { lazyWithChunkRecovery } from '../lib/chunkLoadRecovery';
import {
  applyInspectionDocumentMetadata,
  INSPECTION_DOCUMENT_TITLE,
} from '../lib/inspectionMode';
import type { LegalTab } from './LegalDocumentsPage';
import LegalOnlyPrintManager from './LegalOnlyPrintManager';
import IliosLoader from './ui/IliosLoader';
import {
  SidebarCollapseButton,
  SidebarConnectionBadge,
  SidebarNavButton,
  SidebarOverlayScrim,
  SidebarVersionMark,
  SIDEBAR_HIDDEN_SCROLL_CLASS,
  sidebarAsideClass,
  sidebarMainClass,
} from './layout/SidebarChrome';
import { prefersCollapsedDesktopSidebar } from '../features/layout/sidebarChrome';
import { useInspectionSnapshot, useLegalCatalog } from '../hooks/api/useInspection';
import { legalCatalogProducts } from '../features/inspection/catalog';
import { useOfflineSync } from '../hooks/useOfflineSync';
import InspectionWorkspace, { InspectionStatusPanel, type InspectionExtraTab } from './inspection/InspectionWorkspace';
import type { InspectionFilters } from '../features/inspection/types';

const LegalDocumentsPage = lazyWithChunkRecovery(
  () => import('./LegalDocumentsPage'),
  import.meta.url,
);

type InspectionTab = LegalTab | InspectionExtraTab;
const inspectionNavItems: Array<{ id: InspectionTab; label: string; icon: LucideIcon }> = [
  { id: 'new', label: 'Δημιουργία', icon: FileCheck2 },
  { id: 'archive', label: 'Αρχείο', icon: Archive },
  { id: 'registry', label: 'Μητρώο κωδικών', icon: List },
  { id: 'readiness', label: 'Πληρότητα & πηγές', icon: ClipboardCheck },
  { id: 'inventory', label: 'Εσωτερικά υπόλοιπα', icon: Package },
  { id: 'third_parties', label: 'Αγαθά τρίτων', icon: Users },
  { id: 'sync', label: 'Συγχρονισμός', icon: RefreshCw },
  { id: 'delivery', label: 'Διακίνηση', icon: Truck },
  { id: 'settings', label: 'Ρυθμίσεις', icon: Settings },
];

const tabTitles: Record<InspectionTab, string> = {
  registry: 'Μητρώο κωδικών', readiness: 'Πληρότητα και πηγές', inventory: 'Εσωτερικά υπόλοιπα αποθήκης', third_parties: 'Αγαθά σε και από τρίτους',
  new: 'Δημιουργία παραστατικού',
  archive: 'Αρχείο παραστατικών',
  sync: 'Συγχρονισμός παραστατικών μέσω SBZ',
  delivery: 'Διακίνηση',
  settings: 'Ρυθμίσεις παραστατικών',
};

const InspectionModeShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InspectionTab>('archive');
  const [filters, setFilters] = useState<InspectionFilters>({ environment: 'prod', dateFrom: '', dateTo: '' });
  const [documentToOpen, setDocumentToOpen] = useState<string | null>(null);
  const snapshotQuery = useInspectionSnapshot(filters);
  const { pendingCount } = useOfflineSync();
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' ? prefersCollapsedDesktopSidebar(window.innerWidth) : false
  );
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  // Keep inspection mode inside its legal-data allowlist. Product recipes are
  // already stripped by the inspection catalogue loader, so loading the full
  // materials table here would expose unrelated ERP cost and stock data.
  const catalogQuery = useLegalCatalog();
  const products = React.useMemo(() => legalCatalogProducts(catalogQuery.data?.items || []), [catalogQuery.data]);
  const { isLoading: loadingProducts, isError: productsError, refetch: refreshProducts } = catalogQuery;
  const { data: queriedLegalSettings } = useLegalSettings();
  const legalSettings = queriedLegalSettings || snapshotQuery.data?.tables.legal_settings?.[0]?.settings;
  const { setLegalDocumentToPrint, setProformaToPrint } = usePrint();
  useRealtimeInvalidation();

  useEffect(() => {
    applyInspectionDocumentMetadata();
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const issuerName = legalSettings?.issuer?.business_name || legalSettings?.issuer?.name;
  const isProduction = ['new','sync','settings'].includes(activeTab) ? legalSettings?.environment === 'prod' : filters.environment === 'prod';
  const environment = isProduction ? 'ΠΑΡΑΓΩΓΗ' : 'ΔΟΚΙΜΕΣ';

  if (loadingProducts && !snapshotQuery.data) {
    return <IliosLoader variant="screen" detail="Προετοιμασία παραστατικών" />;
  }

  if (productsError && !snapshotQuery.data) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-600 p-6 text-center">
        <p className="text-lg font-bold text-slate-900 mb-2">Δεν ήταν δυνατή η φόρτωση του συστήματος</p>
        <p className="text-sm text-slate-500 max-w-md">Ελέγξτε τη σύνδεσή σας και ανανεώστε τη σελίδα.</p>
        <button
          type="button"
          onClick={() => void snapshotQuery.refetch()}
          className="mt-6 rounded-xl bg-[#060b00] px-5 py-2.5 text-sm font-bold text-white hover:bg-black transition-colors"
        >
          Ανανέωση
        </button>
      </div>
    );
  }

  return (
    <>
      <LegalOnlyPrintManager />
      <div id="app-container" className="flex h-screen overflow-hidden text-[#060b00] bg-slate-50 font-sans">
        <SidebarOverlayScrim visible={!isCollapsed} onDismiss={() => setIsCollapsed(true)} />
        <aside className={sidebarAsideClass(isCollapsed)}>
          <div className={`relative flex shrink-0 flex-col items-center justify-center border-b border-white/[0.06] ${isCollapsed ? 'h-14 px-1.5' : 'px-3 py-3'}`}>
            {!isCollapsed ? (
              <>
                <img src={APP_LOGO} alt="Ilios" className="h-11 w-auto object-contain drop-shadow-lg" />
                <p className="mt-1.5 text-center text-[10px] font-black uppercase tracking-[0.18em] text-amber-400/90">
                  Σύστημα Παραστατικών
                </p>
                {issuerName && (
                  <p className="mt-0.5 max-w-full truncate px-2 text-center text-[11px] font-medium text-slate-400">
                    {issuerName}
                  </p>
                )}
              </>
            ) : (
              <img src={APP_ICON_ONLY} alt="Ilios" className="h-8 w-8 object-contain" />
            )}
            <div className={isCollapsed ? 'mt-0.5' : 'absolute right-2 top-2'}>
              <SidebarConnectionBadge isLocalMode={false} isOnline={isOnline} isSyncing={false} pendingCount={pendingCount} />
            </div>
          </div>

          <nav className={`flex flex-1 flex-col px-1.5 py-2 ${SIDEBAR_HIDDEN_SCROLL_CLASS}`}>
            {inspectionNavItems.map((item) => (
              <SidebarNavButton
                key={item.id}
                icon={<item.icon size={18} strokeWidth={2} />}
                label={item.label}
                isActive={activeTab === item.id}
                isCollapsed={isCollapsed}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </nav>

          <div className="shrink-0 border-t border-white/[0.06] px-1.5 py-2">
            <SidebarCollapseButton isCollapsed={isCollapsed} onToggle={() => setIsCollapsed((current) => !current)} />
            <p
              className="mb-1.5 mt-1 text-center text-[9px] font-black uppercase tracking-[0.16em] text-amber-400/80"
            >
              {isCollapsed ? (isProduction ? 'PROD' : 'TEST') : `SBZ ${environment}`}
            </p>
            <SidebarVersionMark compact={isCollapsed} />
          </div>
        </aside>

        <main className={sidebarMainClass(isCollapsed)}>
          <header className="shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 py-4 md:px-8">
            <div className="max-w-[1600px] mx-auto flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
                  {tabTitles[activeTab]}
                </h1>
                <p className="text-sm text-slate-500 font-medium">
                  Τιμολόγηση χονδρικής μέσω SBZ, πιστωτικά και αρχείο
                </p>
              </div>
              <div className="text-xs font-bold text-slate-400 md:text-right">
                {new Date().toLocaleDateString('el-GR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
            <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {productsError && <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ο κατάλογος έκδοσης δεν ανακτήθηκε. Τα στοιχεία του στιγμιοτύπου παραμένουν διαθέσιμα.<button type="button" className="ml-2 font-bold underline" onClick={() => void refreshProducts()}>Ανανέωση καταλόγου</button></p>}
              {catalogQuery.data?.saved && <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ο κατάλογος είναι αποθηκευμένο αντίγραφο της {new Date(catalogQuery.data.fetchedAt).toLocaleString('el-GR')}. Η νέα δημιουργία απαιτεί επιτυχή ενημέρωση.<button type="button" className="ml-2 font-bold underline" onClick={() => void refreshProducts()}>Ανανέωση καταλόγου</button></p>}
              <InspectionStatusPanel snapshot={snapshotQuery.data} loading={snapshotQuery.isFetching} error={snapshotQuery.error} pendingCount={pendingCount}
                filters={filters} onFilters={setFilters} onRefresh={() => void snapshotQuery.refetch()} />
              {['registry', 'readiness', 'inventory', 'third_parties'].includes(activeTab) ? (
                snapshotQuery.data ? <InspectionWorkspace tab={activeTab as InspectionExtraTab} snapshot={snapshotQuery.data} onOpenDocument={(id) => { setDocumentToOpen(id); setActiveTab('archive'); }} />
                  : <p className="rounded-xl border bg-white p-5">{snapshotQuery.isFetching ? 'Ανάκτηση…' : 'Τα στοιχεία δεν είναι διαθέσιμα. Χρησιμοποιήστε την Ανανέωση στοιχείων.'}</p>
              ) : (
              <Suspense fallback={<IliosLoader variant="section" detail={tabTitles[activeTab]} />}>
                <LegalDocumentsPage
                  products={products}
                  presentation="inspection"
                  activeTab={activeTab as LegalTab}
                  inspectionSnapshot={snapshotQuery.data}
                  inspectionSnapshotPending={snapshotQuery.isFetching}
                  inspectionCatalogReady={!!catalogQuery.data && !catalogQuery.data.saved && isOnline}
                  initialDocumentId={documentToOpen}
                  onActiveTabChange={setActiveTab}
                  onPrintLegalDocument={setLegalDocumentToPrint}
                  onPrintProforma={setProformaToPrint}
                />
              </Suspense>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default InspectionModeShell;
