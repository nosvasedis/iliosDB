import React, { Suspense, useEffect, useState } from 'react';
import {
  Archive,
  FileCheck2,
  RefreshCw,
  Settings,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { APP_ICON_ONLY, APP_LOGO } from '../constants';
import { useProducts } from '../hooks/api/useProducts';
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
  sidebarAsideClass,
  sidebarMainClass,
} from './layout/SidebarChrome';
import { prefersCollapsedDesktopSidebar } from '../features/layout/sidebarChrome';

const LegalDocumentsPage = lazyWithChunkRecovery(
  () => import('./LegalDocumentsPage'),
  import.meta.url,
);

const inspectionNavItems: Array<{ id: LegalTab; label: string; icon: LucideIcon }> = [
  { id: 'new', label: 'Δημιουργία παραστατικού', icon: FileCheck2 },
  { id: 'archive', label: 'Αρχείο', icon: Archive },
  { id: 'sync', label: 'Συγχρονισμός ΑΑΔΕ', icon: RefreshCw },
  { id: 'delivery', label: 'Διακίνηση', icon: Truck },
  { id: 'settings', label: 'Τεχνικές ρυθμίσεις', icon: Settings },
];

const tabTitles: Record<LegalTab, string> = {
  new: 'Δημιουργία παραστατικού',
  archive: 'Αρχείο παραστατικών',
  sync: 'Συγχρονισμός με myDATA',
  delivery: 'Διακίνηση',
  settings: 'Τεχνικές ρυθμίσεις',
};

const InspectionModeShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LegalTab>('new');
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' ? prefersCollapsedDesktopSidebar(window.innerWidth) : false
  );
  const { data: products, isLoading: loadingProducts, isError: productsError } = useProducts();
  const { data: legalSettings } = useLegalSettings();
  const { setLegalDocumentToPrint, setProformaToPrint } = usePrint();
  useRealtimeInvalidation();

  useEffect(() => {
    applyInspectionDocumentMetadata();
  }, []);

  const issuerName = legalSettings?.issuer?.business_name || legalSettings?.issuer?.name;
  const environment = legalSettings?.environment?.toUpperCase() || 'DEV';

  if (loadingProducts) {
    return <IliosLoader variant="screen" detail="Προετοιμασία παραστατικών" />;
  }

  if (productsError || !products) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-600 p-6 text-center">
        <p className="text-lg font-bold text-slate-900 mb-2">Δεν ήταν δυνατή η φόρτωση του συστήματος</p>
        <p className="text-sm text-slate-500 max-w-md">Ελέγξτε τη σύνδεσή σας και ανανεώστε τη σελίδα.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
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
          <div className={`relative flex flex-col items-center justify-center border-b border-white/[0.06] ${isCollapsed ? 'h-[3.75rem] px-2' : 'min-h-16 px-4 py-3'}`}>
            {!isCollapsed ? (
              <>
                <img src={APP_LOGO} alt="Ilios" className="h-10 w-auto object-contain drop-shadow-lg" />
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
            <div className={`absolute ${isCollapsed ? 'bottom-1.5 right-1.5' : 'right-3 top-3'}`}>
              <SidebarConnectionBadge isLocalMode={false} isOnline isSyncing={false} pendingCount={0} />
            </div>
          </div>
          <SidebarCollapseButton isCollapsed={isCollapsed} onToggle={() => setIsCollapsed((current) => !current)} />

          <nav className="flex flex-1 flex-col space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-hide">
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

          <div className={`border-t border-white/[0.06] ${isCollapsed ? 'px-1 py-2.5' : 'px-3 py-2.5'}`}>
            <p
              title={`Περιβάλλον ΑΑΔΕ: ${environment}`}
              className="mb-1.5 text-center text-[9px] font-black uppercase tracking-[0.16em] text-amber-400/80"
            >
              {isCollapsed ? environment : `ΑΑΔΕ ${environment}`}
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
                  Διαχείριση τιμολογίων, προτιμολογίων και διαβίβασης στην ΑΑΔΕ
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
              <Suspense fallback={<IliosLoader variant="section" detail={tabTitles[activeTab]} />}>
                <LegalDocumentsPage
                  products={products}
                  presentation="inspection"
                  activeTab={activeTab}
                  onActiveTabChange={setActiveTab}
                  onPrintLegalDocument={setLegalDocumentToPrint}
                  onPrintProforma={setProformaToPrint}
                />
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default InspectionModeShell;
