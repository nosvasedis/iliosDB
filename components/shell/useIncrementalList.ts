import { useEffect, useRef, useState } from 'react';

/**
 * Renders long lists in pages: the first `pageSize` rows immediately, more as the sentinel
 * nears the viewport. Keeps first paint cheap on weak phones without virtualising rows of
 * uneven height.
 */
export function useIncrementalList<T>(items: readonly T[], resetKey: unknown, pageSize = 60) {
    const [limit, setLimit] = useState(pageSize);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => setLimit(pageSize), [resetKey, pageSize]);

    const hasMore = limit < items.length;
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hasMore) return;
        const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) setLimit((prev) => prev + pageSize);
        }, { rootMargin: '600px 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, [hasMore, items, pageSize]);

    return { visible: hasMore ? items.slice(0, limit) : items, hasMore, sentinelRef };
}
