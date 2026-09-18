import { describe, expect, it } from 'vitest';
import {
  APP_VERSION_LABEL,
  prefersCollapsedDesktopSidebar,
  resolveSidebarConnection,
} from '../../features/layout/sidebarChrome';

describe('sidebar chrome', () => {
  it('labels the connected cloud state without requiring visible copy', () => {
    expect(resolveSidebarConnection({
      isLocalMode: false,
      isOnline: true,
      isSyncing: false,
      pendingCount: 0,
    })).toEqual({
      kind: 'online',
      label: 'Συνδεδεμένο με το cloud',
    });
  });

  it('explains local, offline, syncing, and pending states in the tooltip', () => {
    expect(resolveSidebarConnection({
      isLocalMode: true,
      isOnline: true,
      isSyncing: false,
      pendingCount: 0,
    }).kind).toBe('local');

    expect(resolveSidebarConnection({
      isLocalMode: false,
      isOnline: false,
      isSyncing: false,
      pendingCount: 0,
    }).kind).toBe('offline');

    expect(resolveSidebarConnection({
      isLocalMode: false,
      isOnline: true,
      isSyncing: true,
      pendingCount: 2,
    }).kind).toBe('syncing');

    expect(resolveSidebarConnection({
      isLocalMode: false,
      isOnline: true,
      isSyncing: false,
      pendingCount: 4,
    })).toEqual({
      kind: 'pending',
      label: '4 εκκρεμείς αλλαγές προς συγχρονισμό',
    });
  });

  it('keeps the overlay rail on laptop widths and docks on large desktops', () => {
    expect(prefersCollapsedDesktopSidebar(1366)).toBe(true);
    expect(prefersCollapsedDesktopSidebar(1920)).toBe(false);
  });

  it('exposes the IliosERP v1.0 mark', () => {
    expect(APP_VERSION_LABEL).toBe('IliosERP v1.0');
  });
});

describe('admin sidebar grouping', () => {
  it('orders destinations into sales, workshop, catalog, and pricing', async () => {
    const { adminNavSections, adminFooterNavItems } = await import('../../surfaces/navConfig');
    expect(adminNavSections.map((section) => section.title)).toEqual([
      'Επισκόπηση',
      'Πωλήσεις',
      'Εργαστήριο',
      'Κατάλογος',
      'Τιμές',
    ]);
    expect(adminNavSections.find((section) => section.title === 'Πωλήσεις')?.items.map((item) => item.id)).toEqual([
      'orders',
      'offers',
      'legal',
      'deliveries',
      'customers',
      'sellers',
    ]);
    expect(adminNavSections.find((section) => section.title === 'Εργαστήριο')?.items.map((item) => item.id)).toEqual([
      'production',
      'consignments',
      'repairs',
    ]);
    expect(adminFooterNavItems.map((item) => item.id)).toEqual(['ai-studio', 'settings']);
  });
});
