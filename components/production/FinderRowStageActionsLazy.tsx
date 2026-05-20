import React, { memo, useEffect, useRef, useState } from 'react';
import { ProductionBatch, ProductionStage } from '../../types';
import DesktopFinderBatchStageSelector from './DesktopFinderBatchStageSelector';

type Props = {
    scrollListRef: React.RefObject<HTMLDivElement | null>;
    batch: ProductionBatch & {
        customer_name?: string;
        requires_setting?: boolean;
        requires_assembly?: boolean;
    };
    onMoveToStage: (
        batch: ProductionBatch,
        targetStage: ProductionStage,
        options?: { pendingDispatch?: boolean },
    ) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onEditNote?: (batch: ProductionBatch) => void;
    isMoving?: boolean;
};

/** Reserved height so the virtual list estimate stays stable when actions are deferred. */
export const FINDER_ROW_ACTIONS_MIN_HEIGHT_PX = 52;

function FinderRowStageActionsLazy({
    scrollListRef,
    batch,
    onMoveToStage,
    onToggleHold,
    onEditNote,
    isMoving = false,
}: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [showActions, setShowActions] = useState(false);

    useEffect(() => {
        const root = scrollListRef.current;
        const el = hostRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setShowActions(entry.isIntersecting);
            },
            { root, rootMargin: '48px 0px', threshold: 0 },
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [scrollListRef]);

    return (
        <div
            ref={hostRef}
            className="mt-2 pt-2 border-t border-slate-200/50"
            style={{
                minHeight: FINDER_ROW_ACTIONS_MIN_HEIGHT_PX,
                contentVisibility: 'auto',
                containIntrinsicSize: `auto ${FINDER_ROW_ACTIONS_MIN_HEIGHT_PX}px`,
            }}
        >
            {showActions ? (
                <DesktopFinderBatchStageSelector
                    batch={batch}
                    onMoveToStage={onMoveToStage}
                    onToggleHold={onToggleHold}
                    onEditNote={onEditNote}
                    isMoving={isMoving}
                />
            ) : null}
        </div>
    );
}

export default memo(FinderRowStageActionsLazy);
