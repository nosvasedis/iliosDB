export const SKU_FINISH_TEXT_COLORS: Record<string, string> = {
    X: 'text-amber-500',
    P: 'text-slate-500',
    D: 'text-orange-500',
    H: 'text-cyan-400',
    '': 'text-slate-400'
};

// Subdued badge surfaces keep the suffix readable while retaining the finish's hue.
// Text colors are applied independently to the finish and stone segments below.
export const SKU_FINISH_BADGE_SURFACES: Record<string, string> = {
    X: 'bg-amber-50 border-amber-200',
    P: 'bg-slate-50 border-slate-200',
    D: 'bg-orange-50 border-orange-200',
    H: 'bg-cyan-50 border-cyan-200',
    '': 'bg-slate-50 border-slate-200'
};

export interface SkuFinishCardTheme {
    panel: string;
    label: string;
    control: string;
    accent: string;
}

// Quiet, finish-aware treatment for larger interactive variant surfaces.
// The palette intentionally stays in the 50/100 range so stone colors remain dominant.
export const SKU_FINISH_CARD_THEMES: Record<string, SkuFinishCardTheme> = {
    X: {
        panel: 'bg-amber-50/70 border-amber-100 shadow-amber-100/40',
        label: 'text-amber-700/70',
        control: 'bg-white/80 text-amber-700 border-amber-200 active:bg-amber-100',
        accent: 'bg-amber-400/70'
    },
    P: {
        panel: 'bg-slate-50/90 border-slate-200 shadow-slate-100/60',
        label: 'text-slate-500',
        control: 'bg-white/90 text-slate-600 border-slate-200 active:bg-slate-100',
        accent: 'bg-slate-400/60'
    },
    D: {
        panel: 'bg-orange-50/70 border-orange-100 shadow-orange-100/40',
        label: 'text-orange-700/70',
        control: 'bg-white/80 text-orange-700 border-orange-200 active:bg-orange-100',
        accent: 'bg-orange-400/70'
    },
    H: {
        panel: 'bg-cyan-50/70 border-cyan-100 shadow-cyan-100/40',
        label: 'text-cyan-700/70',
        control: 'bg-white/80 text-cyan-700 border-cyan-200 active:bg-cyan-100',
        accent: 'bg-cyan-400/70'
    },
    '': {
        panel: 'bg-slate-50/80 border-slate-200 shadow-slate-100/50',
        label: 'text-slate-500',
        control: 'bg-white/90 text-slate-600 border-slate-200 active:bg-slate-100',
        accent: 'bg-slate-300/70'
    }
};

// Superset mapping to keep visual behavior stable across desktop/mobile/seller surfaces.
export const SKU_STONE_TEXT_COLORS: Record<string, string> = {
    KR: 'text-rose-600', QN: 'text-slate-900', LA: 'text-blue-600', TY: 'text-teal-500',
    TG: 'text-orange-700', IA: 'text-red-700', BSU: 'text-slate-800', GSU: 'text-emerald-800',
    RSU: 'text-rose-800', MA: 'text-emerald-600', FI: 'text-slate-400', OP: 'text-indigo-500',
    NF: 'text-green-700', CO: 'text-teal-600', COMG: 'text-rose-400', MG: 'text-rose-300',
    TPR: 'text-emerald-500', TKO: 'text-rose-600', TMP: 'text-blue-600', PCO: 'text-emerald-400',
    MCO: 'text-purple-500', PAX: 'text-green-600',
    MAX: 'text-blue-700', KAX: 'text-red-700', AI: 'text-slate-600', AP: 'text-cyan-600',
    AM: 'text-teal-700', AZM: 'text-teal-600', LR: 'text-indigo-700', SB: 'text-sky-500', MP: 'text-blue-500',
    LE: 'text-slate-400', PR: 'text-green-500', KO: 'text-red-500', MV: 'text-purple-500',
    RZ: 'text-pink-500', AK: 'text-cyan-400', XAL: 'text-stone-500', SD: 'text-blue-800',
    AX: 'text-emerald-700',
    S: 'text-emerald-500', R: 'text-red-500', B: 'text-blue-500', W: 'text-slate-400',
    BK: 'text-slate-900', TU: 'text-cyan-500', AQ: 'text-sky-400', PE: 'text-lime-500',
    TO: 'text-orange-400',
    DI: 'text-cyan-300', ZI: 'text-indigo-400', AG: 'text-amber-600', CZ: 'text-violet-500',
    ON: 'text-gray-900', LPA: 'text-blue-400', MO: 'text-blue-300', GA: 'text-red-400',
    AB: 'text-purple-400', ST: 'text-sky-600', SP: 'text-fuchsia-600', XT: 'text-slate-700',
    OT: 'text-yellow-600'
};

export const getSkuFinishTextColor = (finishCode: string): string =>
    SKU_FINISH_TEXT_COLORS[finishCode] || 'text-slate-400';

export const getSkuFinishBadgeSurface = (finishCode: string): string =>
    SKU_FINISH_BADGE_SURFACES[finishCode] || SKU_FINISH_BADGE_SURFACES[''];

export const getSkuFinishCardTheme = (finishCode: string): SkuFinishCardTheme =>
    SKU_FINISH_CARD_THEMES[finishCode] || SKU_FINISH_CARD_THEMES[''];

export const getSkuStoneTextColor = (stoneCode: string): string =>
    SKU_STONE_TEXT_COLORS[stoneCode] || 'text-emerald-500';
