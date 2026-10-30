import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/** Desktop shell (dark sidebar, DesktopPageHeader, desktop order builder) from this width up. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
/** Side rail instead of the bottom bar: tablets and phones held in landscape. */
export const RAIL_QUERY = '(min-width: 768px), (orientation: landscape) and (min-width: 600px)';

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const onChange = () => setMatches(mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, [query]);
    return matches;
}

interface Viewport {
    /** Wide screens: desktop headers, multi-column layouts, desktop order builder. */
    isDesktop: boolean;
    /** Sidebar navigation (desktop, tablets, landscape phones) instead of the bottom bar. */
    hasRail: boolean;
}

const ViewportContext = createContext<Viewport>({ isDesktop: false, hasRail: false });

/** Shared by the seller and store shells so every screen agrees on phone vs desktop layout. */
export function ViewportProvider({ children }: { children: React.ReactNode }) {
    const isDesktop = useMediaQuery(DESKTOP_QUERY);
    const hasRail = useMediaQuery(RAIL_QUERY) || isDesktop;
    const value = useMemo(() => ({ isDesktop, hasRail }), [isDesktop, hasRail]);
    return <ViewportContext.Provider value={value}>{children}</ViewportContext.Provider>;
}

export const useViewport = () => useContext(ViewportContext);
