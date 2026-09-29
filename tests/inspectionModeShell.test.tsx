import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../hooks/api/useProducts', () => ({
  useProducts: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}));

vi.mock('../hooks/api/useMaterials', () => ({
  useMaterials: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}));

vi.mock('../hooks/api/useLegalDocuments', () => ({
  useLegalSettings: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../hooks/api/useRealtimeInvalidation', () => ({
  useRealtimeInvalidation: vi.fn(),
}));

vi.mock('../components/PrintContext', () => ({
  usePrint: vi.fn(() => ({
    setLegalDocumentToPrint: vi.fn(),
    setProformaToPrint: vi.fn(),
  })),
}));

vi.mock('../lib/chunkLoadRecovery', () => ({
  lazyWithChunkRecovery: vi.fn(() => () => <div>legal-documents</div>),
}));

import InspectionModeShell from '../components/InspectionModeShell';
import { useMaterials } from '../hooks/api/useMaterials';

describe('InspectionModeShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts without querying the disallowed materials dataset', () => {
    const html = renderToStaticMarkup(<InspectionModeShell />);

    expect(useMaterials).not.toHaveBeenCalled();
    expect(html).toContain('legal-documents');
    expect(html).toContain('Τιμολόγηση χονδρικής μέσω SBZ, πιστωτικά και αρχείο');
    expect(html).toContain('SBZ ΔΟΚΙΜΕΣ');
    expect(html).toContain('Συγχρονισμός');
    expect(html).not.toContain('Συγχρονισμός ΑΑΔΕ');
    expect(html).not.toContain('διαβίβασης στην ΑΑΔΕ');
    expect(html).not.toContain('Δεν ήταν δυνατή η φόρτωση του συστήματος');
  });
});
