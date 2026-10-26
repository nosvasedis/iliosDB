import React, { lazy, useState, type ComponentType } from 'react';
import { appUpdates } from './appUpdates';

const CHUNK_RELOAD_QUERY_PARAM = '__chunk_reload';

export const isChunkLoadError = (value: unknown) => {
  const name = value instanceof Error ? value.name : '';
  const message =
    value instanceof Error
      ? value.message
      : typeof value === 'string'
        ? value
        : '';

  return (
    name === 'ChunkLoadError' ||
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError')
  );
};

export const recoverFromChunkLoadError = async (_buildId?: string) => {
  appUpdates.reportDownloadFailure();
  return false;
};

export const finalizeChunkRecoveryNavigation = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(CHUNK_RELOAD_QUERY_PARAM) && !url.searchParams.has('__app_restart')) return;

  url.searchParams.delete(CHUNK_RELOAD_QUERY_PARAM);
  url.searchParams.delete('__app_restart');
  window.history.replaceState(window.history.state, document.title, url.toString());
};

class DownloadBoundary extends React.Component<{ children?: React.ReactNode; retry: () => void }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown) { if (isChunkLoadError(error)) appUpdates.reportDownloadFailure(); else console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return React.createElement('div', { role: 'alert', className: 'm-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-slate-800 print:hidden' },
      React.createElement('p', { className: 'font-bold' }, 'Δεν ήταν δυνατό το άνοιγμα αυτής της προβολής.'),
      React.createElement('p', { className: 'mt-2 text-sm' }, 'Ελέγξτε τη σύνδεση και δοκιμάστε ξανά. Η εφαρμογή δεν θα επανεκκινηθεί αυτόματα.'),
      React.createElement('button', { type: 'button', onClick: this.props.retry, className: 'mt-4 min-h-[44px] rounded-xl bg-slate-900 px-4 text-sm font-bold text-white' }, 'Δοκιμή ξανά'),
      React.createElement('button', { type: 'button', onClick: () => { void appUpdates.check(true); appUpdates.expand(); }, className: 'ml-2 mt-4 min-h-[44px] rounded-xl px-4 text-sm font-bold' }, 'Έλεγχος ενημέρωσης'),
      React.createElement('button', { type: 'button', onClick: () => appUpdates.requestRestart('Αν η προβολή δεν ανοίγει, επανεκκινήστε αφού αποθηκεύσετε την εργασία σας.'), className: 'ml-2 mt-4 min-h-[44px] rounded-xl px-4 text-sm font-bold' }, 'Επανεκκίνηση εφαρμογής'),
    );
  }
}

export const lazyWithChunkRecovery = <T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  _buildId?: string,
): ComponentType<React.ComponentProps<T>> => {
  const create = () => lazy(factory);
  // React discards hook state when an initial render suspends. The first lazy
  // identity must survive those retries or the screen can suspend forever.
  const initialComponent = create();
  function RecoverableLazy(props: React.ComponentProps<T>) {
    const [attempt, setAttempt] = useState(() => ({ Component: initialComponent, key: 0 }));
    return React.createElement(DownloadBoundary, {
      key: attempt.key,
      retry: () => setAttempt(previous => ({ Component: create(), key: previous.key + 1 })),
    }, React.createElement(attempt.Component, props));
  }
  return RecoverableLazy;
};
