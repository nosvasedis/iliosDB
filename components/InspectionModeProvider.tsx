import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  enterInspectionMode,
  isEditableTarget,
  isInspectionModeActive,
  matchesInspectionEnterCombo,
  matchesInspectionExitCombo,
} from '../lib/inspectionMode';
import InspectionExitModal from './InspectionExitModal';

interface InspectionModeContextValue {
  isInspectionMode: boolean;
  openExitModal: () => void;
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
  const [isInspectionMode, setIsInspectionMode] = useState(() => isInspectionModeActive());
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  const openExitModal = useCallback(() => {
    setExitModalOpen(true);
  }, []);

  useEffect(() => {
    setIsInspectionMode(isInspectionModeActive());
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (matchesInspectionExitCombo(event)) {
        if (!isInspectionModeActive()) return;
        event.preventDefault();
        setExitModalOpen(true);
        return;
      }

      if (matchesInspectionEnterCombo(event)) {
        if (isInspectionModeActive() || profile?.role !== 'admin' || isEntering) return;
        event.preventDefault();
        setIsEntering(true);
        void enterInspectionMode().finally(() => setIsEntering(false));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profile?.role, isEntering]);

  const value = useMemo(
    () => ({ isInspectionMode, openExitModal }),
    [isInspectionMode, openExitModal],
  );

  return (
    <InspectionModeContext.Provider value={value}>
      {children}
      <InspectionExitModal isOpen={exitModalOpen} onClose={() => setExitModalOpen(false)} />
    </InspectionModeContext.Provider>
  );
};
