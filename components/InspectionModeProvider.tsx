import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  enterInspectionMode,
  isEditableTarget,
  isInspectionModeActive,
  matchesInspectionEnterCombo,
  matchesInspectionExitCombo,
} from '../lib/inspectionMode';
import InspectionExitModal from './InspectionExitModal';
import { useUI } from './UIProvider';

interface InspectionModeContextValue {
  isInspectionMode: boolean;
}

const InspectionModeContext = createContext<InspectionModeContextValue | undefined>(undefined);

export function useInspectionMode(): InspectionModeContextValue {
  const context = useContext(InspectionModeContext);
  if (!context) {
    throw new Error('useInspectionMode must be used within InspectionModeProvider');
  }
  return context;
}

export const InspectionModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const { showToast } = useUI();
  const [isInspectionMode, setIsInspectionMode] = useState(() => isInspectionModeActive());
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  useEffect(() => {
    setIsInspectionMode(isInspectionModeActive());
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== '_ilm') return;
      sessionStorage.removeItem('_ilm');
      window.location.reload();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [profile?.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesInspectionExitCombo(event)) {
        if (!isInspectionModeActive()) return;
        event.preventDefault();
        setExitModalOpen(true);
        return;
      }
      if (isEditableTarget(event.target)) return;

      if (matchesInspectionEnterCombo(event)) {
        if (isInspectionModeActive() || profile?.role !== 'admin' || isEntering) return;
        event.preventDefault();
        setIsEntering(true);
        void enterInspectionMode()
          .catch((error) => showToast(error instanceof Error ? error.message : 'Δεν άλλαξε η προβολή.', 'error'))
          .finally(() => setIsEntering(false));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profile?.role, isEntering, showToast]);

  const value = useMemo(
    () => ({ isInspectionMode }),
    [isInspectionMode],
  );

  return (
    <InspectionModeContext.Provider value={value}>
      {children}
      <InspectionExitModal isOpen={exitModalOpen} onClose={() => setExitModalOpen(false)} />
    </InspectionModeContext.Provider>
  );
};
