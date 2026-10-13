import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../../components/AuthContext', () => ({
  AuthProvider: ({ children }: any) => children,
  useAuth: () => ({ profile: { id: 'owner', role: state.role, is_approved: true }, session: { user: { id: 'owner' } }, loading: false }),
}));
vi.mock('../../lib/supabase', () => ({ isLocalMode: false, isConfigured: true, api: {}, supabase: {} }));
vi.mock('../../components/InspectionModeShell', () => ({ default: () => <div>inspection-shell</div> }));
vi.mock('../../components/InspectionModeProvider', () => ({ InspectionModeProvider: ({ children }: any) => children }));
vi.mock('../../lib/inspectionMode', () => ({ isInspectionModeActive: () => true }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true, default: () => true }));
import App from '../../App';
describe('locked inspection routing', () => {
  beforeEach(() => { state.role = 'admin'; });
  it('keeps the inspection shell when the viewport is mobile', () => {
    expect(renderToStaticMarkup(<App />)).toContain('inspection-shell');
  });
  it('never falls through into the normal ERP for another account role on the same locked browser', () => {
    state.role = 'employee';
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Η προβολή ελέγχου παραμένει ενεργή');
    expect(html).not.toContain('inspection-shell');
  });
});
