import type { ProductionStageColorKey } from './productionStages';

/**
 * Muted stage-tinted surfaces for Εύρεση (finder) result rows — same hue family as
 * production columns/stage badges, kept low-contrast so the badge still reads clearly.
 */
export const FINDER_SEARCH_RESULT_SURFACE: Record<ProductionStageColorKey, string> = {
  indigo:
    'bg-indigo-50/25 border border-indigo-100/80 border-l-4 border-l-indigo-400/45 hover:bg-indigo-50/40',
  slate:
    'bg-slate-50/35 border border-slate-100/85 border-l-4 border-l-slate-400/40 hover:bg-slate-50/50',
  orange:
    'bg-orange-50/25 border border-orange-100/80 border-l-4 border-l-orange-400/45 hover:bg-orange-50/38',
  purple:
    'bg-purple-50/25 border border-purple-100/80 border-l-4 border-l-purple-400/45 hover:bg-purple-50/38',
  blue:
    'bg-blue-50/25 border border-blue-100/80 border-l-4 border-l-blue-400/45 hover:bg-blue-50/38',
  pink:
    'bg-pink-50/25 border border-pink-100/80 border-l-4 border-l-pink-400/45 hover:bg-pink-50/38',
  yellow:
    'bg-yellow-50/20 border border-yellow-100/75 border-l-4 border-l-yellow-500/35 hover:bg-yellow-50/32',
  emerald:
    'bg-emerald-50/25 border border-emerald-100/80 border-l-4 border-l-emerald-500/40 hover:bg-emerald-50/38',
};

export function getFinderSearchResultSurface(colorKey: string | undefined): string {
  const key = (colorKey || 'slate') as ProductionStageColorKey;
  return FINDER_SEARCH_RESULT_SURFACE[key] ?? FINDER_SEARCH_RESULT_SURFACE.slate;
}

/** Text + border for stage pill on tinted finder rows (light chip, no filled stage-bg). */
export const FINDER_SEARCH_BADGE_TONE: Record<ProductionStageColorKey, string> = {
  indigo: 'text-indigo-700 border-indigo-200',
  slate: 'text-slate-700 border-slate-200',
  orange: 'text-orange-700 border-orange-200',
  purple: 'text-purple-700 border-purple-200',
  blue: 'text-blue-700 border-blue-200',
  pink: 'text-pink-700 border-pink-200',
  yellow: 'text-yellow-800 border-yellow-200',
  emerald: 'text-emerald-700 border-emerald-200',
};

export function getFinderSearchBadgeTone(colorKey: string | undefined): string {
  const key = (colorKey || 'slate') as ProductionStageColorKey;
  return FINDER_SEARCH_BADGE_TONE[key] ?? FINDER_SEARCH_BADGE_TONE.slate;
}
