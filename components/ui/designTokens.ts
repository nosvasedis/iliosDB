/**
 * IliosDB Design Tokens
 *
 * Centralised Tailwind class-combination constants that define the
 * app-wide design language.  Every page imports from here instead
 * of hard-coding the same strings — this keeps the UI coherent and
 * makes sweeping style changes trivial.
 *
 * Conventions
 * ───────────
 * • Classes are **additive**: combine tokens freely.
 * • Prefer long, readable class strings – Tailwind's JIT will tree-shake.
 * • Tokens never include layout (grid, flex) unless it's part of the
 *   pattern itself (e.g. stat box sizing).
 */

// ──────────────────────────────────────────────
//  Tab bars
// ──────────────────────────────────────────────

/** Wrapper for tabs placed in {@code DesktopPageHeaderProps.tail} (compact) */
export const TAIL_TAB_CONTAINER =
  'inline-flex items-center rounded-xl bg-slate-100 p-0.5 border border-slate-200/50 shadow-sm';

/** Wrapper for tabs placed in {@code DesktopPageHeaderProps.below} (spacious) */
export const BELOW_TAB_CONTAINER =
  'inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-50 p-1.5 border border-slate-200/60 shadow-sm';

/**
 * Active tab that sits inside one of the tab containers above.
 * Uses the brand dark colour by default.
 */
export const TAB_ACTIVE =
  'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90';

/** Inactive tab button (any container) */
export const TAB_INACTIVE =
  'text-slate-500 hover:bg-white/70 hover:text-slate-700';

/** Pill shape for filter / sub-stage chips (smaller, rounded-full) */
export const CHIP_ACTIVE = 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-100';
export const CHIP_INACTIVE = 'text-slate-500 hover:bg-white hover:text-slate-700';

/** Shared transition so all tabs animate uniformly */
export const TAB_TRANSITION = 'transition-all duration-200';

/** Convenience: full button classes for {@code below} tabs */
export const belowTabButton = (isActive: boolean) =>
  `flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold ${TAB_TRANSITION} ${
    isActive ? TAB_ACTIVE : TAB_INACTIVE
  }`;

/** Convenience: full button classes for {@code tail} tabs (compact) */
export const tailTabButton = (isActive: boolean) =>
  `flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${TAB_TRANSITION} ${
    isActive ? TAB_ACTIVE : TAB_INACTIVE
  }`;

/** Extra-compact tab – for tight toolbars inside header tails */
export const tailTabButtonCompact = (isActive: boolean) =>
  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${TAB_TRANSITION} ${
    isActive ? TAB_ACTIVE : TAB_INACTIVE
  }`;


// ──────────────────────────────────────────────
//  Search / filter inputs
// ──────────────────────────────────────────────

/** Outer wrapper for a text-search input */
export const SEARCH_CONTAINER =
  'bg-white border border-slate-200 p-1 rounded-xl flex items-center shadow-sm';

/** The actual {@code <input>} inside SEARCH_CONTAINER */
export const SEARCH_INPUT =
  'w-full bg-transparent p-1.5 pl-2 text-sm font-bold outline-none text-slate-700 placeholder:text-slate-400';

/** Larger search container – for "below" rows where space permits */
export const SEARCH_CONTAINER_LARGE =
  'bg-white border border-slate-200 rounded-xl flex items-center shadow-sm';

/** Input inside the large variant */
export const SEARCH_INPUT_LARGE =
  'w-full bg-transparent px-4 py-2.5 text-sm font-bold outline-none text-slate-700 placeholder:text-slate-400';


// ──────────────────────────────────────────────
//  Stat / info badge boxes
// ──────────────────────────────────────────────

/** Base sizing & rounded for a stat-badge box */
export const STAT_BOX =
  'h-[100px] min-w-[128px] shrink-0 rounded-2xl border flex flex-col justify-center';

/** Hover lift for interactive stat boxes */
export const STAT_BOX_HOVER = 'hover:bg-opacity-80 transition-all duration-200 hover:scale-[1.02] cursor-pointer';

/** Colour variants — use as: `${STAT_BOX} ${STAT_AMBER}` */
export const STAT_AMBER  = 'bg-amber-50 border-amber-100 text-amber-700';
export const STAT_SLATE  = 'bg-slate-50 border-slate-100 text-slate-800';
export const STAT_RED    = 'bg-red-50 border-red-100 text-red-600';
export const STAT_EMERALD= 'bg-emerald-50 border-emerald-100 text-emerald-700';
export const STAT_INDIGO = 'bg-indigo-50 border-indigo-100 text-indigo-700';
export const STAT_TEAL   = 'bg-teal-50 border-teal-100 text-teal-700';
export const STAT_PURPLE = 'bg-purple-50 border-purple-100 text-purple-700';
export const STAT_BLUE   = 'bg-blue-50 border-blue-100 text-blue-700';
export const STAT_PINK   = 'bg-pink-50 border-pink-100 text-pink-700';


// ──────────────────────────────────────────────
//  Page content layout
// ──────────────────────────────────────────────

/** Standard vertical gap between header and content sections */
export const PAGE_GAP = 'space-y-6';

/** Container inside the scroll area – wraps child sections */
export const PAGE_CONTAINER = 'flex flex-col h-full space-y-6';


// ──────────────────────────────────────────────
//  Action / primary buttons
// ──────────────────────────────────────────────

/** Dark brand button */
export const BTN_PRIMARY =
  'inline-flex items-center gap-2 bg-[#060b00] text-white font-bold rounded-xl px-5 py-2.5 shadow-lg hover:bg-slate-800 transition-all hover:-translate-y-0.5';

/** Secondary outlined button */
export const BTN_SECONDARY =
  'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300';


// ──────────────────────────────────────────────
//  FAB (floating action button)
// ──────────────────────────────────────────────

export const FAB =
  'fixed bottom-8 right-8 z-[100] flex items-center justify-center gap-3 bg-[#060b00] text-white rounded-full font-bold shadow-2xl hover:bg-black transition-all duration-200 ease-in-out transform hover:-translate-y-1 hover:scale-105 h-16 w-16 sm:w-auto sm:h-auto sm:px-6 sm:py-4';


// ──────────────────────────────────────────────
//  Card containers
// ──────────────────────────────────────────────

export const CARD = 'bg-white rounded-2xl border border-slate-100 shadow-sm';
export const CARD_HOVER = 'hover:shadow-md hover:border-slate-300 transition-all duration-200';


// ──────────────────────────────────────────────
//  Animations & transitions
// ──────────────────────────────────────────────

/** Fade + slide for tab content */
export const TAB_CONTENT_ANIMATION = 'animate-in fade-in slide-in-from-bottom-2 duration-300';

/** Slightly stronger entrance for page sections */
export const SECTION_ENTRANCE = 'animate-in fade-in slide-in-from-bottom-4 duration-500';

/** Pulse for alert/warning badges */
export const PULSE_BADGE = 'animate-pulse';

/** Page-level transition (used on the main content wrapper) */
export const PAGE_TRANSITION = 'animate-in fade-in slide-in-from-bottom-3 duration-400';

/** Header card with strong shadow and subtle border accent */
export const HEADER_CARD = 'bg-white border border-slate-100 shadow-md rounded-3xl';

/** Glowing border accent for special sections (smart entry, etc.) */
export const GLOW_BORDER = 'ring-2 ring-amber-500/20 border-amber-200/50';

/** Nice loader container with brand colours */
export const NICE_LOADER = 'flex flex-col items-center justify-center gap-4 min-h-[320px] w-full';

/** Soft gradient text for section titles */
export const GRADIENT_TEXT = 'bg-gradient-to-r from-[#060b00] to-slate-600 bg-clip-text text-transparent';


// ──────────────────────────────────────────────
//  Health / metric bar helpers
// ──────────────────────────────────────────────

/** Label row inside a stat box */
export const STAT_LABEL =
  'text-[11px] font-bold uppercase tracking-wide mb-1 flex items-center gap-1';

/** Big number inside a stat box */
export const STAT_VALUE = 'text-2xl font-black';
