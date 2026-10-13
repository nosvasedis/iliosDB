import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../lib/offlineDb', () => ({
  offlineDb: {
    clearSyncQueue: vi.fn().mockResolvedValue(undefined),
    purgeTablesExcept: vi.fn().mockResolvedValue(undefined),
    getInspectionVault: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../lib/supabase', () => ({ api: {
  hasInspectionExitPin: vi.fn().mockResolvedValue(true),
  enterInspectionSession: vi.fn().mockResolvedValue(undefined),
  exitInspectionSession: vi.fn().mockResolvedValue({ unlocked: true }),
} }));
vi.mock('../lib/inspectionLocalVault', () => ({ sealInspectionLocalData: vi.fn().mockResolvedValue(undefined) }));
import { api } from '../lib/supabase';
import { offlineDb } from '../lib/offlineDb';

import {
  INSPECTION_SESSION_KEY,
  assertInspectionTableAllowed,
  assertInspectionWorkerRouteAllowed,
  enterInspectionMode,
  exitInspectionMode,
  isEditableTarget,
  isInspectionModeActive,
  matchesInspectionEnterCombo,
  matchesInspectionExitCombo,
  purgeInspectionSensitiveState,
} from '../lib/inspectionMode';
import {
  INSPECTION_ALLOWED_TABLES,
  isInspectionQueryKeyAllowed,
  isInspectionTableAllowed,
  isInspectionWorkerRouteAllowed,
} from '../lib/inspectionAllowedTables';

class TestStorage {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

class TestHTMLElement {
  readonly tagName: string;
  isContentEditable = false;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  closest(): TestHTMLElement | null {
    return null;
  }
}

function stubInspectionBrowserGlobals(reload = vi.fn()) {
  const document = {
    createElement: (tagName: string) => new TestHTMLElement(tagName),
    querySelector: vi.fn().mockReturnValue(null),
    title: '',
  };
  vi.stubGlobal('sessionStorage', new TestStorage());
  vi.stubGlobal('localStorage', new TestStorage());
  vi.stubGlobal('HTMLElement', TestHTMLElement);
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', { location: { reload } });
  return { reload };
}

describe('inspection allowlist', () => {
  it('allows legal and supporting tables', () => {
    expect(isInspectionTableAllowed('legal_documents')).toBe(true);
    expect(isInspectionTableAllowed('orders')).toBe(true);
    expect(isInspectionTableAllowed('production_batches')).toBe(false);
  });

  it('allows only provider and supporting AADE worker routes', () => {
    expect(isInspectionWorkerRouteAllowed('/aade/send-invoices')).toBe(false);
    expect(isInspectionWorkerRouteAllowed('/sbz/submit')).toBe(true);
    expect(isInspectionWorkerRouteAllowed('/sbz/reconcile')).toBe(true);
    expect(isInspectionWorkerRouteAllowed('/admin/create-seller')).toBe(false);
  });

  it('allows only inspection query roots', () => {
    expect(isInspectionQueryKeyAllowed(['legal_documents'])).toBe(true);
    expect(isInspectionQueryKeyAllowed(['materials'])).toBe(false);
  });

  it('covers required legal tables', () => {
    expect(INSPECTION_ALLOWED_TABLES.has('proforma_documents')).toBe(true);
    expect(INSPECTION_ALLOWED_TABLES.has('order_shipment_items')).toBe(true);
    expect(INSPECTION_ALLOWED_TABLES.has('product_variants')).toBe(true);
  });
});

describe('inspection mode session flag', () => {
  beforeEach(() => {
    stubInspectionBrowserGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('tracks active state in sessionStorage', () => {
    expect(isInspectionModeActive()).toBe(false);
    sessionStorage.setItem(INSPECTION_SESSION_KEY, '1');
    expect(isInspectionModeActive()).toBe(true);
  });

  it('blocks disallowed tables when active', () => {
    sessionStorage.setItem(INSPECTION_SESSION_KEY, '1');
    expect(() => assertInspectionTableAllowed('materials')).toThrow(/blocked/i);
    expect(() => assertInspectionTableAllowed('legal_documents')).not.toThrow();
  });

  it('clears flag on exitInspectionMode reload path', async () => {
    sessionStorage.setItem(INSPECTION_SESSION_KEY, '1');
    const { reload } = stubInspectionBrowserGlobals();
    sessionStorage.setItem(INSPECTION_SESSION_KEY, '1');
    await exitInspectionMode('1234');
    expect(sessionStorage.getItem(INSPECTION_SESSION_KEY)).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it('allows SBZ issuance and reconciliation routes while blocking unrelated worker actions', () => {
    sessionStorage.setItem(INSPECTION_SESSION_KEY, '1');
    expect(() => assertInspectionWorkerRouteAllowed('/sbz/submit')).not.toThrow();
    expect(() => assertInspectionWorkerRouteAllowed('/sbz/reconcile')).not.toThrow();
    expect(() => assertInspectionWorkerRouteAllowed('/admin/create-seller')).toThrow(/blocked/i);
  });

  it('sets flag and reloads on enterInspectionMode', async () => {
    const { reload } = stubInspectionBrowserGlobals();
    await enterInspectionMode();
    expect(localStorage.getItem(INSPECTION_SESSION_KEY)).toBe('1');
    expect(reload).toHaveBeenCalled();
  });

  it('keeps the mode after reload or a new tab with empty sessionStorage', async () => {
    await enterInspectionMode();
    sessionStorage.clear();
    expect(isInspectionModeActive()).toBe(true);
  });

  it('never deletes pending writes or business mirrors during a transition', async () => {
    await enterInspectionMode();
    await exitInspectionMode('1234');
    expect(offlineDb.clearSyncQueue).not.toHaveBeenCalled();
    expect(offlineDb.purgeTablesExcept).not.toHaveBeenCalled();
    expect(localStorage.getItem(INSPECTION_SESSION_KEY)).toBeNull();
  });

  it('keeps the lock and avoids reload when the PIN is wrong or missing', async () => {
    localStorage.setItem(INSPECTION_SESSION_KEY, '1');
    vi.mocked(api.exitInspectionSession).mockResolvedValueOnce({ unlocked: false });
    await expect(exitInspectionMode('wrong')).rejects.toThrow('κωδικός');
    await expect(exitInspectionMode('')).rejects.toThrow('κωδικός');
    expect(isInspectionModeActive()).toBe(true);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('rejects entry until an exit PIN is configured', async () => {
    vi.mocked(api.hasInspectionExitPin).mockResolvedValueOnce(false);
    await expect(enterInspectionMode()).rejects.toThrow('PIN');
    expect(isInspectionModeActive()).toBe(false);
  });
});

describe('inspection keyboard helpers', () => {
  beforeEach(() => {
    stubInspectionBrowserGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matches enter and exit combos', () => {
    const enter = {
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      code: 'KeyL',
    } as KeyboardEvent;
    const exit = {
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      code: 'KeyU',
    } as KeyboardEvent;

    expect(matchesInspectionEnterCombo(enter)).toBe(true);
    expect(matchesInspectionExitCombo(exit)).toBe(true);
    expect(matchesInspectionEnterCombo({ ...enter, code: 'KeyU' } as KeyboardEvent)).toBe(false);
  });

  it('detects editable targets', () => {
    const input = document.createElement('input');
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
  });
});

describe('purgeInspectionSensitiveState', () => {
  beforeEach(() => {
    stubInspectionBrowserGlobals();
    localStorage.setItem('ilios-react-query-cache', '{"clientState":{}}');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('removes persisted react query cache', async () => {
    await purgeInspectionSensitiveState();
    expect(localStorage.getItem('ilios-react-query-cache')).toBeNull();
  });
});
