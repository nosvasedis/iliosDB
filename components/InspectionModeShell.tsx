import React, { Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { APP_LOGO } from '../constants';
import { useProducts } from '../hooks/api/useProducts';
import { useRealtimeInvalidation } from '../hooks/api/useRealtimeInvalidation';
import { usePrint } from './PrintContext';
import { lazyWithChunkRecovery } from '../lib/chunkLoadRecovery';
import {
  applyInspectionDocumentMetadata,
  INSPECTION_DOCUMENT_TITLE,
  silenceInspectionConsole,
} from '../lib/inspectionMode';
import LegalOnlyPrintManager from './LegalOnlyPrintManager';

const LegalDocumentsPage = lazyWithChunkRecovery(
  () => import('./LegalDocumentsPage'),
  import.meta.url,
);

const ContentLoader = () => (
  <div className="min-h-[320px] w-full flex flex-col items-center justify-center text-slate-500">
    <Loader2 size={36} className="animate-spin mb-3 text-amber-500" />
    <p className="font-medium">Φόρτωση παραστατικών...</p>
  </div>
);

const InspectionModeShell: React.FC = () => {
  const { data: products, isLoading } = useProducts();
  const { setLegalDocumentToPrint, setProformaToPrint } = usePrint();
  useRealtimeInvalidation();

  useEffect(() => {
    applyInspectionDocumentMetadata();
    silenceInspectionConsole();
  }, []);

  if (isLoading || !products) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 size={48} className="animate-spin mb-4 text-amber-500" />
        <p className="font-medium text-lg">{INSPECTION_DOCUMENT_TITLE}</p>
      </div>
    );
  }

  return (
    <>
      <LegalOnlyPrintManager />
      <div id="app-container" className="flex h-screen flex-col overflow-hidden bg-slate-50 text-[#060b00] font-sans">
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-4 px-4 md:px-8">
            <div className="flex items-center gap-4">
              <img src={APP_LOGO} alt="Ilios" className="h-12 w-auto object-contain" />
              <div>
                <h1 className="text-lg font-black tracking-tight text-slate-900 md:text-xl">
                  Σύστημα Παραστατικών
                </h1>
                <p className="text-xs font-medium text-slate-500">Ilios ERP</p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-[1600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Suspense fallback={<ContentLoader />}>
              <LegalDocumentsPage
                products={products}
                onPrintLegalDocument={setLegalDocumentToPrint}
                onPrintProforma={setProformaToPrint}
              />
            </Suspense>
          </div>
        </main>
      </div>
    </>
  );
};

export default InspectionModeShell;
