// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../../components/SettingsPage';
import MobileSettings from '../../components/mobile/MobileSettings';
import SilverMarketPanel from '../../components/silverMarket/SilverMarketPanel';
import { UIProvider } from '../../components/UIProvider';
import { INITIAL_SETTINGS } from '../../constants';
import type { GlobalSettings } from '../../types';

const mocks = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>();
  return {
    ...actual, api: { ...actual.api, ...mocks }, isLocalMode: false,
    workerAuthHeaders: async () => ({ Authorization: 'Bearer test-session' }),
  };
});
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ profile: { full_name: 'Διαχειριστής' } }) }));
vi.mock('../../lib/offlineDb', () => ({ offlineDb: { getQueueCount: async () => 0 } }));
vi.mock('../../components/silverMarket/SilverHistoryChart', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../components/silverMarket/SilverHistoryChart')>(),
  default: () => null,
}));

let saved: GlobalSettings;
let marketPrice: number;
let lastQuoteAt: string;
let unavailable: boolean;
let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;

function mount(content: React.ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><UIProvider>{content}</UIProvider></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  saved = { ...INITIAL_SETTINGS, silver_price_gram: 1.1, loss_percentage: 12 };
  marketPrice = 1.3;
  lastQuoteAt = new Date().toISOString();
  unavailable = false;
  mocks.getSettings.mockImplementation(async () => saved);
  mocks.updateSettings.mockImplementation(async (next: GlobalSettings) => { saved = next; });
  fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (unavailable) return new Response(null, { status: 502 });
    if (url.pathname === '/market/silver/quote') {
      return Response.json({ priceEurPerGram: marketPrice, quotedAt: lastQuoteAt, stale: false });
    }
    if (url.pathname === '/market/silver/history') {
      return Response.json({ range: url.searchParams.get('range'), interval: '1h', stale: false, points: [
        { priceEurPerGram: 1.2, quotedAt: new Date(Date.now() - 3_600_000).toISOString() },
        { priceEurPerGram: 1.3, quotedAt: lastQuoteAt },
      ] });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  client?.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('silver market settings and overview', () => {
  it.each([
    ['desktop', SettingsPage, 'Αποθήκευση'], ['mobile', MobileSettings, 'Αποθήκευση Αλλαγών'],
  ] as const)('keeps the %s pricing draft and saved value independent of market refreshes', async (_formFactor, Settings, saveLabel) => {
    mount(<Settings />);
    await screen.findByText('1,300', {}, { timeout: 5000 });
    const input = screen.getByRole('spinbutton', { name: /Επεξεργασία τιμής προγράμματος/ }) as HTMLInputElement;
    const refresh = screen.getByRole('button', { name: 'Ανανέωση αγοράς' }) as HTMLButtonElement;
    expect(input.value).toBe('1.1');
    expect(mocks.updateSettings).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '1.444' } });
    marketPrice = 1.5;
    await waitFor(() => expect(refresh.disabled).toBe(false));
    fireEvent.click(refresh);
    await screen.findByText('1,500');
    expect(screen.getByText('1,100')).toBeTruthy();
    expect(input.value).toBe('1.444');
    expect(mocks.updateSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    await screen.findByText('1,444');
    expect(mocks.updateSettings).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ silver_price_gram: 1.444, loss_percentage: 12 }));
  }, 15_000);

  it('expands the overview, loads the selected ranges, and retains the previous quote during errors', async () => {
    mount(<SilverMarketPanel savedPrice={1.1} />);
    await screen.findByText('1,300');
    expect(screen.queryByText('Ιστορικό αγοράς')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Πλήρες γράφημα' }));
    for (const [label, range] of [['24 ώρες', '24h'], ['7 ημέρες', '7d'], ['30 ημέρες', '30d'], ['90 ημέρες', '90d']]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`history?range=${range}`), expect.anything()));
      expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true');
    }
    expect(screen.getByText('Μεταβολή')).toBeTruthy();
    const refresh = screen.getByRole('button', { name: 'Ανανέωση αγοράς' }) as HTMLButtonElement;
    await waitFor(() => expect(refresh.disabled).toBe(false));
    unavailable = true;
    fireEvent.click(refresh);
    await screen.findByText('Τελευταία διαθέσιμη');
    expect(screen.getByText('1,300')).toBeTruthy();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('refreshes the quote at 60 seconds and labels a five-minute-old quote even before the next poll', async () => {
    vi.useFakeTimers();
    lastQuoteAt = new Date(Date.now() - 4.5 * 60_000).toISOString();
    mount(<SilverMarketPanel savedPrice={1.1} />);
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.queryByText('Τελευταία διαθέσιμη')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText('Τελευταία διαθέσιμη')).toBeTruthy();
    marketPrice = 1.6;
    lastQuoteAt = new Date().toISOString();
    await act(() => vi.advanceTimersByTimeAsync(30_100));
    expect(screen.getByText('1,600')).toBeTruthy();
    expect(screen.queryByText('Τελευταία διαθέσιμη')).toBeNull();
  });
});
