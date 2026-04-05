export interface TagColorClassSet {
  bg: string;
  text: string;
  border: string;
  activeBg: string;
  activeText: string;
  activeBorder: string;
  ring: string;
}

const TAG_PALETTE: TagColorClassSet[] = [
  // Indigo
  { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', activeBg: 'bg-indigo-500', activeText: 'text-white', activeBorder: 'border-indigo-600', ring: 'ring-indigo-300' },
  // Rose
  { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', activeBg: 'bg-rose-500', activeText: 'text-white', activeBorder: 'border-rose-600', ring: 'ring-rose-300' },
  // Amber
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', activeBg: 'bg-amber-500', activeText: 'text-white', activeBorder: 'border-amber-600', ring: 'ring-amber-300' },
  // Emerald
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', activeBg: 'bg-emerald-500', activeText: 'text-white', activeBorder: 'border-emerald-600', ring: 'ring-emerald-300' },
  // Sky
  { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200', activeBg: 'bg-sky-500', activeText: 'text-white', activeBorder: 'border-sky-600', ring: 'ring-sky-300' },
  // Purple
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', activeBg: 'bg-purple-500', activeText: 'text-white', activeBorder: 'border-purple-600', ring: 'ring-purple-300' },
  // Orange
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', activeBg: 'bg-orange-500', activeText: 'text-white', activeBorder: 'border-orange-600', ring: 'ring-orange-300' },
  // Teal
  { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', activeBg: 'bg-teal-500', activeText: 'text-white', activeBorder: 'border-teal-600', ring: 'ring-teal-300' },
  // Cyan
  { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', activeBg: 'bg-cyan-500', activeText: 'text-white', activeBorder: 'border-cyan-600', ring: 'ring-cyan-300' },
  // Fuchsia
  { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200', activeBg: 'bg-fuchsia-500', activeText: 'text-white', activeBorder: 'border-fuchsia-600', ring: 'ring-fuchsia-300' },
  // Lime
  { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200', activeBg: 'bg-lime-500', activeText: 'text-white', activeBorder: 'border-lime-600', ring: 'ring-lime-300' },
  // Violet
  { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', activeBg: 'bg-violet-500', activeText: 'text-white', activeBorder: 'border-violet-600', ring: 'ring-violet-300' },
  // Pink
  { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200', activeBg: 'bg-pink-500', activeText: 'text-white', activeBorder: 'border-pink-600', ring: 'ring-pink-300' },
  // Red
  { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', activeBg: 'bg-red-500', activeText: 'text-white', activeBorder: 'border-red-600', ring: 'ring-red-300' },
  // Yellow
  { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', activeBg: 'bg-yellow-400', activeText: 'text-yellow-900', activeBorder: 'border-yellow-500', ring: 'ring-yellow-300' },
  // Green
  { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', activeBg: 'bg-green-500', activeText: 'text-white', activeBorder: 'border-green-600', ring: 'ring-green-300' },
  // Blue
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', activeBg: 'bg-blue-500', activeText: 'text-white', activeBorder: 'border-blue-600', ring: 'ring-blue-300' },
  // Slate (dark accent)
  { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', activeBg: 'bg-slate-700', activeText: 'text-white', activeBorder: 'border-slate-800', ring: 'ring-slate-400' },
];

export const TAG_PALETTE_LENGTH = TAG_PALETTE.length;

/** The `activeBg` Tailwind class for each palette entry — used to render color swatches. */
export const TAG_PALETTE_PREVIEW: string[] = TAG_PALETTE.map(e => e.activeBg);

export function getDeterministicTagColor(tag: string): TagColorClassSet {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

/**
 * Returns the color set for a tag, respecting any manual override.
 * `overrides` maps tag → palette index (0-based).
 */
export function getTagColor(tag: string, overrides?: Record<string, number>): TagColorClassSet {
  if (overrides && overrides[tag] !== undefined) {
    return TAG_PALETTE[overrides[tag] % TAG_PALETTE.length];
  }
  return getDeterministicTagColor(tag);
}
