import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_QUERY_PARAM = '__chunk_reload';

const getChunkReloadFlagKey = (buildId: string) => `ilios-chunk-reload-attempted:${buildId}`;

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

export const recoverFromChunkLoadError = async (buildId: string) => {
  if (typeof window === 'undefined') return false;

  const flagKey = getChunkReloadFlagKey(buildId);
  if (sessionStorage.getItem(flagKey)) return false;
  sessionStorage.setItem(flagKey, '1');

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    console.warn('Failed to unregister service workers during chunk recovery.', error);
  }

  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  } catch (error) {
    console.warn('Failed to clear caches during chunk recovery.', error);
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(CHUNK_RELOAD_QUERY_PARAM, Date.now().toString());
  window.location.replace(nextUrl.toString());
  return true;
};

export const finalizeChunkRecoveryNavigation = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(CHUNK_RELOAD_QUERY_PARAM)) return;

  url.searchParams.delete(CHUNK_RELOAD_QUERY_PARAM);
  window.history.replaceState(window.history.state, document.title, url.toString());
};

export const lazyWithChunkRecovery = <T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  buildId: string,
): LazyExoticComponent<T> =>
  lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error)) {
        await recoverFromChunkLoadError(buildId);
        return new Promise<never>(() => {});
      }

      throw error;
    }
  });
