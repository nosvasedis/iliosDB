import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { appUpdates, startUpdateRuntime } from '../lib/appUpdates';

const NotificationCornerContext = createContext<HTMLElement | null>(null);
export const useNotificationCorner = () => useContext(NotificationCornerContext);

export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(appUpdates.subscribe, appUpdates.getSnapshot);
  const [activityHost, setActivityHost] = useState<HTMLDivElement | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  useEffect(() => startUpdateRuntime(Boolean((import.meta as any).env?.PROD)), []);
  useEffect(() => {
    const id = {};
    const update = () => appUpdates.setBlocker(id, { label: 'Αποθήκευση σε εξέλιξη', busy: queryClient.isMutating() > 0 });
    update();
    const unsubscribe = queryClient.getMutationCache().subscribe(update);
    return () => { unsubscribe(); appUpdates.setBlocker(id); };
  }, [queryClient]);
  useEffect(() => {
    if (!state.restarting) return;
    workspace.current?.setAttribute('inert', '');
    // Editors rendered through a portal are siblings of #root, so the workspace
    // wrapper's inert attribute alone cannot protect their keyboard inputs.
    const portals = Array.from(document.body.children).filter((element) =>
      element instanceof HTMLElement && !element.contains(workspace.current) && !element.hasAttribute('inert'),
    );
    portals.forEach(element => element.setAttribute('inert', ''));
    return () => {
      workspace.current?.removeAttribute('inert');
      portals.forEach(element => element.removeAttribute('inert'));
    };
  }, [state.restarting]);
  const visible = state.availableBuildId || state.reason;
  const labels = [...new Set(state.blockers.map(item => item.label))];
  const dirtyLabels = [...new Set(state.blockers.filter(item => item.dirty).map(item => item.label))];
  const busyLabels = [...new Set(state.blockers.filter(item => item.busy).map(item => item.label))];
  return (
    <NotificationCornerContext.Provider value={activityHost}>
      <div ref={workspace} style={{ display: 'contents' }} aria-busy={state.restarting || undefined}>{children}</div>
      <div className="ilios-notification-corner fixed left-4 bottom-4 z-[250] flex flex-col gap-2 pointer-events-none print:hidden">
        {visible && <section aria-label="Ενημέρωση εφαρμογής" className="pointer-events-auto shrink-0 max-h-full overflow-y-auto text-white rounded-2xl border border-white/10 shadow-xl" style={{ background: 'rgba(5,9,0,0.96)', borderLeft: '3px solid #f59e0b', width: 'min(340px, calc(100vw - 32px))' }}>
          {!state.expanded ? (
            <button type="button" onClick={() => appUpdates.expand()} className="w-full min-h-[44px] flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-2xl"><RefreshCw size={15} className="text-amber-400" />{state.availableBuildId ? 'Διαθέσιμη ενημέρωση' : 'Επανεκκίνηση εφαρμογής'}</button>
          ) : <div className="p-4">
            <div className="flex items-center gap-2 text-sm font-bold"><RefreshCw size={17} className="text-amber-400 shrink-0" /><span role="status">{state.availableBuildId ? 'Διαθέσιμη ενημέρωση' : 'Επανεκκίνηση εφαρμογής'}</span></div>
            <p className="text-xs text-white/70 leading-relaxed mt-2">{state.reason || 'Συνεχίστε την εργασία σας. Επανεκκινήστε όταν είστε έτοιμοι.'}</p>
            {labels.length > 0 && <div id="restart-blockers" className="text-xs text-amber-200 mt-3 leading-relaxed">
              {dirtyLabels.length > 0 && <p>Αποθηκεύστε ή κλείστε τις εκκρεμείς εργασίες: {dirtyLabels.join(', ')}.</p>}
              {busyLabels.length > 0 && <p>Περιμένετε να ολοκληρωθούν οι ενεργές εργασίες: {busyLabels.join(', ')}.</p>}
            </div>}
            {state.error && <p role="status" className="mt-2 text-xs text-amber-200">{state.error}</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => void appUpdates.restart()} disabled={state.restarting || labels.length > 0} aria-describedby={labels.length ? 'restart-blockers' : undefined} className="flex-1 min-h-[44px] rounded-xl bg-amber-400 text-[#060b00] px-3 text-xs font-bold hover:bg-amber-300 disabled:opacity-45 disabled:cursor-not-allowed">{state.restarting ? 'Έλεγχος σύνδεσης…' : 'Επανεκκίνηση'}</button>
              <button type="button" disabled={state.restarting} onClick={() => appUpdates.defer()} className="min-h-[44px] rounded-xl px-3 text-xs text-white/75 hover:bg-white/10 flex items-center gap-1">Αργότερα<ChevronDown size={13} /></button>
            </div>
          </div>}
        </section>}
        <div ref={setActivityHost} className="flex flex-col min-h-0 overflow-hidden pointer-events-none" />
      </div>
      {state.restarting && <div role="status" className="fixed inset-0 z-[2000] bg-black/20 cursor-wait print:hidden" aria-label="Προετοιμασία επανεκκίνησης" />}
    </NotificationCornerContext.Provider>
  );
}
