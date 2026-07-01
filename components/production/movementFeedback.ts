export const MOVEMENT_FEEDBACK_LABEL = 'Μετακινείται...';

export const MOVEMENT_SURFACE_CLASS =
    'ring-2 ring-emerald-400/70 ring-offset-1 shadow-lg overflow-hidden';

export const MOVEMENT_CARD_SHIMMER_CLASS =
    "after:content-[''] after:absolute after:inset-x-0 after:top-0 after:h-1 after:bg-gradient-to-r after:from-transparent after:via-emerald-400 after:to-transparent after:animate-pulse";

export const MOVEMENT_STAGE_SURFACE_CLASS =
    'ring-2 ring-emerald-300/60 ring-offset-1 shadow-xl';

export const MOVEMENT_PROGRESS_BAR_CLASS =
    'absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 animate-pulse';

export const MOVEMENT_OVERLAY_CLASS =
    'absolute inset-0 rounded-[inherit] bg-white/55 backdrop-blur-[1.5px] z-20 flex items-start justify-center pointer-events-auto cursor-wait';

export const MOVEMENT_BADGE_CLASS =
    'flex items-center gap-1.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg ring-2 ring-white';

export function getMovementSurfaceClass(isMoving: boolean): string {
    return isMoving ? `${MOVEMENT_SURFACE_CLASS} ${MOVEMENT_CARD_SHIMMER_CLASS}` : '';
}

export function getMovementStageSurfaceClass(isMoving: boolean): string {
    return isMoving ? MOVEMENT_STAGE_SURFACE_CLASS : '';
}

export function getMovementProgressPercent(completedCount: number, totalCount: number): number {
    if (totalCount <= 0) return 0;
    const percent = Math.round((completedCount / totalCount) * 100);
    return Math.max(0, Math.min(100, percent));
}
