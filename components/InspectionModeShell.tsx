import React, { Suspense, useEffect, useState } from 'react';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Cloud,
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

const InspectionNavItem = ({
  icon: Icon,
  label,
  isActive,
  isCollapsed,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={isCollapsed ? label : ''}
    className={`
      w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-4 py-3.5 my-0.5 rounded-xl transition-all duration-200 group relative
      ${isActive
        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-900/20'
        : 'text-slate-400 hover:bg-white/10 hover:text-white'}
    `}
  >
    <Icon size={20} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'} />
    {!isCollapsed && <span className="font-medium truncate tracking-wide text-sm text-left">{label}</span>}
    {isCollapsed && (
      <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#060b00] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10 transition-opacity duration-200">
        {label}
      </div>
    )}
  </button>
);

const InspectionModeShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LegalTab>('new');
  const [isCollapsed, setIsCollapsed] = useState(false);
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
    return <IliosLoader variant="screen" />;
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
        <aside
          className={`fixed inset-y-0 left-0 z-40 bg-[#060b00] text-white transition-all duration-500 shadow-2xl flex flex-col border-r border-white/5 ${isCollapsed ? 'w-20' : 'w-72'}`}
        >
          <div className="p-6 flex flex-col items-center justify-center min-h-[7.5rem] relative bg-black/20 border-b border-white/5">
            {!isCollapsed ? (
              <>
                <img src={APP_LOGO} alt="Ilios" className="h-14 w-auto object-contain drop-shadow-lg" />
                <p className="mt-3 text-center text-[11px] font-black uppercase tracking-[0.2em] text-amber-400/90">
                  Σύστημα Παραστατικών
                </p>
                {issuerName && (
                  <p className="mt-1 text-center text-xs font-medium text-slate-400 truncate max-w-full px-2">
                    {issuerName}
                  </p>
                )}
              </>
            ) : (
              <img src={APP_ICON_ONLY} alt="Ilios" className="w-10 h-10 object-contain" />
            )}
          </div>

          <div className={`px-4 py-3 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              <Cloud size={12} className="animate-pulse" />
              {!isCollapsed && 'ΣΥΝΔΕΔΕΜΕΝΟ'}
            </div>
          </div>

          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-hide">
            {!isCollapsed && (
              <p className="px-4 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Λειτουργίες
              </p>
            )}
            {inspectionNavItems.map((item) => (
              <InspectionNavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                isActive={activeTab === item.id}
                isCollapsed={isCollapsed}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </nav>

          <div className="p-4 bg-black/20 border-t border-white/5">
            <button
              type="button"
              onClick={() => setIsCollapsed((current) => !current)}
              className="hidden md:flex w-full items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight size={20} />
              ) : (
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
                  <ChevronLeft size={16} />
                  <span>Σύμπτυξη</span>
                </div>
              )}
            </button>
            {!isCollapsed && (
              <div className="mt-4 text-center text-[10px] text-slate-500 font-medium space-y-1">
                <p>
                  Περιβάλλον ΑΑΔΕ:{' '}
                  <span className="text-amber-400 font-black">{environment}</span>
                </p>
                <p className="opacity-50">Ilios ERP · myDATA</p>
              </div>
            )}
          </div>
        </aside>

        <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${isCollapsed ? 'ml-20' : 'ml-72'}`}>
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
              <Suspense fallback={<IliosLoader variant="section" />}>
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
