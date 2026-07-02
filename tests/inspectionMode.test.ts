import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../lib/offlineDb', () => ({
  offlineDb: {
    clearSyncQueue: vi.fn().mockResolvedValue(undefined),
    purgeTablesExcept: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  INSPECTION_SESSION_KEY,
  assertInspectionTableAllowed,
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

  it('allows only aade worker routes', () => {
    expect(isInspectionWorkerRouteAllowed('/aade/send-invoices')).toBe(true);
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
    await exitInspectionMode();
    expect(sessionStorage.getItem(INSPECTION_SESSION_KEY)).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it('sets flag and reloads on enterInspectionMode', async () => {
    const { reload } = stubInspectionBrowserGlobals();
    await enterInspectionMode();
    expect(sessionStorage.getItem(INSPECTION_SESSION_KEY)).toBe('1');
    expect(reload).toHaveBeenCalled();
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
