export type SidebarConnectionKind = 'local' | 'syncing' | 'pending' | 'online' | 'offline';

export interface SidebarConnectionInput {
  isLocalMode: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
}

export interface SidebarConnectionStatus {
  kind: SidebarConnectionKind;
  label: string;
}

/** Full expanded panel; slim enough for laptop overlays, roomy enough on large desktops. */
export const SIDEBAR_PANEL_WIDTH_CLASS = 'w-64';
export const SIDEBAR_RAIL_WIDTH_CLASS = 'w-[4.25rem]';
export const SIDEBAR_PANEL_MARGIN_CLASS = '2xl:ml-64';
export const SIDEBAR_RAIL_MARGIN_CLASS = 'md:ml-[4.25rem]';

/** Below this, the expanded sidebar overlays content instead of pushing it. */
export const SIDEBAR_OVERLAY_MAX_WIDTH_PX = 1536;

export const APP_VERSION_LABEL = 'IliosERP v1.0';

export function prefersCollapsedDesktopSidebar(viewportWidth: number): boolean {
  return viewportWidth < SIDEBAR_OVERLAY_MAX_WIDTH_PX;
}

export function resolveSidebarConnection(input: SidebarConnectionInput): SidebarConnectionStatus {
  if (input.isLocalMode) {
    return { kind: 'local', label: 'Τοπική βάση — εργασία χωρίς σύνδεση cloud' };
  }
  if (!input.isOnline) {
    return { kind: 'offline', label: 'Εκτός σύνδεσης — οι αλλαγές θα συγχρονιστούν όταν επανέλθει το δίκτυο' };
  }
  if (input.isSyncing) {
    return { kind: 'syncing', label: 'Συγχρονισμός με το cloud σε εξέλιξη' };
  }
  if (input.pendingCount > 0) {
    const countLabel = input.pendingCount > 99 ? '99+' : String(input.pendingCount);
    return {
      kind: 'pending',
      label: `${countLabel} εκκρεμείς αλλαγές προς συγχρονισμό`,
    };
  }
  return { kind: 'online', label: 'Συνδεδεμένο με το cloud' };
}
