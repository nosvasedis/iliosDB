import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../../types';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(),
  getInspectionSessionState: vi.fn(), getInspectionProfile: vi.fn(),
  getInspectionVault: vi.fn(), getValue: vi.fn(), saveValue: vi.fn(),
  sealInspectionLocalData: vi.fn(), setInspectionQueryOwner: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({
  isLocalMode: false,
  supabase: {
    auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange, signOut: mocks.signOut },
    from: mocks.from,
  },
  api: { getInspectionSessionState: mocks.getInspectionSessionState, getInspectionProfile: mocks.getInspectionProfile },
}));
vi.mock('../../lib/offlineDb', () => ({ offlineDb: {
  getInspectionVault: mocks.getInspectionVault, getValue: mocks.getValue, saveValue: mocks.saveValue,
} }));
vi.mock('../../lib/inspectionLocalVault', () => ({ sealInspectionLocalData: mocks.sealInspectionLocalData }));
vi.mock('../../features/inspection/queryScope', () => ({ setInspectionQueryOwner: mocks.setInspectionQueryOwner }));
import { AuthProvider, useAuth } from '../../components/AuthContext';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const session = (id = 'owner', token = 'token-1', sessionId = `login-${id}`) => ({
  user: { id }, access_token: `header.${btoa(JSON.stringify({ session_id: sessionId, token }))}.signature`,
} as Session);
const profile = (id = 'owner'): UserProfile => ({ id, role: 'admin', is_approved: true, email: `${id}@example.test`, full_name: id });
type Auth = ReturnType<typeof useAuth>;

describe('profile startup coordination', () => {
  let renderer: ReactTestRenderer | undefined;
  let current: Auth;
  let screens: string[];
  let notify: (event: string, session: Session | null) => void;
  let initial: ReturnType<typeof deferred<any>>;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let workspaceMounts: number;
  let workspaceUnmounts: number;

  function Workspace() {
    React.useEffect(() => { workspaceMounts += 1; return () => { workspaceUnmounts += 1; }; }, []);
    return <div>workspace</div>;
  }

  function Probe() {
    current = useAuth();
    const screen = current.loading ? 'loading' : !current.session ? 'login' : !current.profile ? 'Σφάλμα Προφίλ' : `ready:${current.profile.id}`;
    screens.push(screen);
    return <div>{screen}{screen.startsWith('ready:') && <Workspace />}</div>;
  }
  async function mount() {
    await act(async () => { renderer = create(<AuthProvider><Probe /></AuthProvider>); });
  }
  async function emit(event: string, value: Session | null) {
    await act(async () => { notify(event, value); await vi.advanceTimersByTimeAsync(0); });
  }
  async function start(value = session()) {
    await mount();
    await act(async () => { initial.resolve({ data: { session: value }, error: null }); });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    const local = new Map<string, string>();
    const legacy = new Map<string, string>();
    const storage = (items: Map<string, string>) => ({
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    });
    vi.stubGlobal('localStorage', storage(local));
    vi.stubGlobal('sessionStorage', storage(legacy));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    screens = [];
    workspaceMounts = 0;
    workspaceUnmounts = 0;
    initial = deferred();
    unsubscribe = vi.fn();
    mocks.getSession.mockReturnValue(initial.promise);
    mocks.onAuthStateChange.mockImplementation((callback) => { notify = callback; return { data: { subscription: { unsubscribe } } }; });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.getInspectionVault.mockResolvedValue(null);
    mocks.getInspectionSessionState.mockResolvedValue(false);
    mocks.getInspectionProfile.mockResolvedValue(profile());
    mocks.sealInspectionLocalData.mockResolvedValue(undefined);
    mocks.saveValue.mockResolvedValue(undefined);
    mocks.getValue.mockResolvedValue(null);
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: profile(), error: null });
  });
  afterEach(async () => {
    if (renderer) await act(async () => { renderer!.unmount(); });
    renderer = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps loading when an older request finishes before the current token check', async () => {
    const oldCheck = deferred<boolean>();
    const newCheck = deferred<boolean>();
    mocks.getInspectionSessionState.mockReturnValueOnce(oldCheck.promise).mockReturnValueOnce(newCheck.promise);
    await start();
    await emit('TOKEN_REFRESHED', session('owner', 'token-2'));
    await act(async () => { oldCheck.resolve(false); });
    expect(current.loading).toBe(true);
    expect(screens).not.toContain('Σφάλμα Προφίλ');
    await act(async () => { newCheck.resolve(false); });
    expect(current.loading).toBe(false);
    expect(current.profile?.id).toBe('owner');
    expect(screens).not.toContain('Σφάλμα Προφίλ');
  });

  it('coalesces duplicate bootstrap events for the same session', async () => {
    const check = deferred<boolean>();
    mocks.getInspectionSessionState.mockReturnValue(check.promise);
    await start();
    await emit('INITIAL_SESSION', session());
    await emit('SIGNED_IN', session());
    expect(mocks.getInspectionSessionState).toHaveBeenCalledTimes(1);
    await act(async () => { check.resolve(false); });
    expect(mocks.single).toHaveBeenCalledTimes(1);
    expect(screens).not.toContain('Σφάλμα Προφίλ');
  });

  it('does not reload or unmount the workspace for repeated same-session sign-in notifications', async () => {
    await start();
    screens = [];
    await emit('SIGNED_IN', session());
    await emit('SIGNED_IN', session());
    await emit('INITIAL_SESSION', session());
    expect(screens).not.toContain('loading');
    expect(mocks.getInspectionSessionState).toHaveBeenCalledTimes(1);
    expect(workspaceMounts).toBe(1);
    expect(workspaceUnmounts).toBe(0);
  });

  it('keeps verified access visible while a token refresh rechecks the profile in the background', async () => {
    await start();
    const check = deferred<boolean>();
    mocks.getInspectionSessionState.mockReturnValueOnce(check.promise);
    screens = [];
    await emit('TOKEN_REFRESHED', session('owner', 'token-2'));
    expect(current.loading).toBe(false);
    expect(current.profile?.id).toBe('owner');
    expect(screens).not.toContain('loading');
    expect(workspaceUnmounts).toBe(0);
    await act(async () => { check.resolve(false); });
    expect(current.session?.access_token).toBe(session('owner', 'token-2').access_token);
    expect(mocks.single).toHaveBeenCalledTimes(2);
    expect(workspaceMounts).toBe(1);
    expect(workspaceUnmounts).toBe(0);
    expect(screens).not.toContain('loading');
  });

  it('blocks for a new login by the same account instead of reusing previous approval', async () => {
    await start();
    const check = deferred<boolean>();
    mocks.getInspectionSessionState.mockReturnValueOnce(check.promise);
    await emit('SIGNED_IN', session('owner', 'token-2', 'different-login'));
    expect(current.loading).toBe(true);
    expect(current.profile).toBeNull();
    await act(async () => { check.resolve(false); });
    expect(current.profile?.id).toBe('owner');
  });

  it('still applies revoked approval discovered by a background token refresh', async () => {
    await start();
    mocks.single.mockResolvedValueOnce({ data: { ...profile(), is_approved: false }, error: null });
    screens = [];
    await emit('TOKEN_REFRESHED', session('owner', 'token-2'));
    expect(current.loading).toBe(false);
    expect(current.profile?.is_approved).toBe(false);
    expect(screens).not.toContain('loading');
  });

  it('checks USER_UPDATED even with an unchanged token without unmounting verified content', async () => {
    await start();
    mocks.single.mockResolvedValueOnce({ data: { ...profile(), full_name: 'Updated owner' }, error: null });
    screens = [];
    await emit('USER_UPDATED', session());
    expect(current.profile?.full_name).toBe('Updated owner');
    expect(mocks.single).toHaveBeenCalledTimes(2);
    expect(screens).not.toContain('loading');
    expect(workspaceUnmounts).toBe(0);
  });

  it('keeps inspection content mounted during a routine refresh and rechecks sealing', async () => {
    mocks.getInspectionSessionState.mockResolvedValue(true);
    await start();
    const seal = deferred<void>();
    mocks.sealInspectionLocalData.mockReturnValueOnce(seal.promise);
    screens = [];
    await emit('TOKEN_REFRESHED', session('owner', 'token-2'));
    expect(current.loading).toBe(false);
    expect(screens).not.toContain('loading');
    expect(mocks.sealInspectionLocalData).toHaveBeenCalledTimes(2);
    expect(mocks.from).not.toHaveBeenCalled();
    await act(async () => { seal.resolve(); });
    expect(workspaceMounts).toBe(1);
    expect(workspaceUnmounts).toBe(0);
    expect(localStorage.getItem('_ilm')).toBe('1');
  });

  it('fails closed if a background access check genuinely fails', async () => {
    await start();
    mocks.getInspectionSessionState.mockRejectedValueOnce(new Error('access unavailable'));
    screens = [];
    await emit('TOKEN_REFRESHED', session('owner', 'token-2'));
    expect(current.loading).toBe(false);
    expect(current.profile).toBeNull();
    expect(screens.at(-1)).toBe('Σφάλμα Προφίλ');
    expect(mocks.single).toHaveBeenCalledTimes(1);
  });

  it('blocks normal content if a background check discovers a new inspection lock', async () => {
    await start();
    const seal = deferred<void>();
    mocks.getInspectionSessionState.mockResolvedValueOnce(true);
    mocks.sealInspectionLocalData.mockReturnValueOnce(seal.promise);
    await emit('TOKEN_REFRESHED', session('owner', 'token-2'));
    expect(localStorage.getItem('_ilm')).toBe('1');
    expect(current.loading).toBe(true);
    expect(current.profile).toBeNull();
    expect(mocks.single).toHaveBeenCalledTimes(1);
    await act(async () => { seal.resolve(); });
    expect(current.loading).toBe(false);
    expect(current.profile?.id).toBe('owner');
    expect(mocks.getInspectionProfile).toHaveBeenCalledTimes(1);
  });

  it('does not let an older failure replace a newer successful profile', async () => {
    const oldCheck = deferred<boolean>();
    mocks.getInspectionSessionState.mockReturnValueOnce(oldCheck.promise);
    await start();
    await emit('TOKEN_REFRESHED', session('owner', 'token-2'));
    expect(current.profile?.id).toBe('owner');
    await act(async () => { oldCheck.reject(new Error('stale request failed')); });
    expect(current.profile?.id).toBe('owner');
    expect(current.loading).toBe(false);
    expect(screens).not.toContain('Σφάλμα Προφίλ');
  });

  it('does not let a late getSession result undo sign-out', async () => {
    await mount();
    await emit('SIGNED_OUT', null);
    await act(async () => { initial.resolve({ data: { session: session() }, error: null }); });
    expect(current.session).toBeNull();
    expect(current.profile).toBeNull();
    expect(mocks.getInspectionSessionState).not.toHaveBeenCalled();
  });

  it('invalidates a deferred auth callback before it can load a signed-out profile', async () => {
    await mount();
    await act(async () => {
      notify('SIGNED_IN', session());
      notify('SIGNED_OUT', null);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(current.session).toBeNull();
    expect(current.profile).toBeNull();
    expect(mocks.getInspectionSessionState).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('discards a profile response arriving after explicit sign-out', async () => {
    const response = deferred<any>();
    mocks.single.mockReturnValue(response.promise);
    await start();
    await act(async () => { await current.signOut(); });
    await act(async () => { response.resolve({ data: profile(), error: null }); });
    expect(current.session).toBeNull();
    expect(current.profile).toBeNull();
    expect(current.loading).toBe(false);
    expect(screens.at(-1)).toBe('login');
  });

  it('discards an in-flight profile when the account changes', async () => {
    const oldProfile = deferred<any>();
    const newProfile = deferred<any>();
    mocks.single.mockReturnValueOnce(oldProfile.promise).mockReturnValueOnce(newProfile.promise);
    await start();
    await emit('SIGNED_IN', session('other', 'other-token'));
    await act(async () => { oldProfile.resolve({ data: profile(), error: null }); });
    expect(current.loading).toBe(true);
    expect(current.profile?.id).not.toBe('owner');
    await act(async () => { newProfile.resolve({ data: profile('other'), error: null }); });
    expect(current.session?.user.id).toBe('other');
    expect(current.profile?.id).toBe('other');
    expect(screens).not.toContain('Σφάλμα Προφίλ');
  });

  it('waits for inspection sealing and only requests the minimal profile', async () => {
    const seal = deferred<void>();
    mocks.getInspectionSessionState.mockResolvedValue(true);
    mocks.sealInspectionLocalData.mockReturnValue(seal.promise);
    await start();
    expect(localStorage.getItem('_ilm')).toBe('1');
    expect(current.loading).toBe(true);
    expect(mocks.from).not.toHaveBeenCalled();
    await act(async () => { seal.resolve(); });
    expect(current.profile?.id).toBe('owner');
    expect(current.loading).toBe(false);
    expect(mocks.saveValue).toHaveBeenCalledWith('inspection:v1:owner:profile', profile());
    expect(screens).not.toContain('Σφάλμα Προφίλ');
  });

  it('retains the same-user inspection cache fallback while offline', async () => {
    mocks.getInspectionVault.mockResolvedValue({ id: 'vault' });
    mocks.getInspectionSessionState.mockRejectedValue(new Error('offline'));
    mocks.getValue.mockResolvedValue(profile());
    await start();
    expect(localStorage.getItem('_ilm')).toBe('1');
    expect(current.profile?.id).toBe('owner');
    expect(current.loading).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not use another user\'s inspection cache', async () => {
    localStorage.setItem('_ilm', '1');
    mocks.getInspectionSessionState.mockRejectedValue(new Error('offline'));
    mocks.getValue.mockResolvedValue(profile('other'));
    await start();
    expect(current.profile).toBeNull();
    expect(current.loading).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('still reports genuine access failures and allows an explicit retry', async () => {
    mocks.getInspectionSessionState.mockRejectedValueOnce(new Error('access check failed'));
    await start();
    expect(current.profile).toBeNull();
    expect(current.loading).toBe(false);
    expect(screens.at(-1)).toBe('Σφάλμα Προφίλ');
    expect(mocks.from).not.toHaveBeenCalled();
    await act(async () => { await current.refreshProfile(); });
    expect(current.profile?.id).toBe('owner');
    expect(current.loading).toBe(false);
  });

  it('fails closed on an inspection sealing error instead of using cached approval', async () => {
    localStorage.setItem('_ilm', '1');
    mocks.sealInspectionLocalData.mockRejectedValue(Object.assign(new Error('seal failed'), { name: 'InspectionSealError' }));
    mocks.getValue.mockResolvedValue(profile());
    await start();
    expect(current.profile).toBeNull();
    expect(current.loading).toBe(false);
    expect(mocks.getValue).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('settles with a real error if the offline cache also fails to load', async () => {
    localStorage.setItem('_ilm', '1');
    mocks.getInspectionSessionState.mockRejectedValue(new Error('offline'));
    mocks.getValue.mockRejectedValue(new Error('IndexedDB unavailable'));
    await start();
    expect(current.profile).toBeNull();
    expect(current.loading).toBe(false);
    expect(screens.at(-1)).toBe('Σφάλμα Προφίλ');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('clears previous approval if a refreshed profile query fails', async () => {
    await start();
    expect(current.profile?.is_approved).toBe(true);
    mocks.single.mockResolvedValueOnce({ data: null, error: new Error('profile unavailable') });
    await act(async () => { await current.refreshProfile(); });
    expect(current.profile).toBeNull();
    expect(current.loading).toBe(false);
    expect(screens.at(-1)).toBe('Σφάλμα Προφίλ');
  });

  it('does not start deferred RPCs after unmount', async () => {
    await mount();
    await act(async () => { notify('INITIAL_SESSION', session()); renderer!.unmount(); });
    renderer = undefined;
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.getInspectionSessionState).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
