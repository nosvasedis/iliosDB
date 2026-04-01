export const SKU_FINISH_TEXT_COLORS: Record<string, string> = {
    X: 'text-amber-500',
    P: 'text-slate-500',
    D: 'text-orange-500',
    H: 'text-cyan-400',
    '': 'text-slate-400'
};

// Superset mapping to keep visual behavior stable across desktop/mobile/seller surfaces.
export const SKU_STONE_TEXT_COLORS: Record<string, string> = {
    KR: 'text-rose-600', QN: 'text-slate-900', LA: 'text-blue-600', TY: 'text-teal-500',
    TG: 'text-orange-700', IA: 'text-red-700', BSU: 'text-slate-800', GSU: 'text-emerald-800',
    RSU: 'text-rose-800', MA: 'text-emerald-600', FI: 'text-slate-400', OP: 'text-indigo-500',
    NF: 'text-green-700', CO: 'text-teal-600', TPR: 'text-emerald-500', TKO: 'text-rose-600',
    TMP: 'text-blue-600', PCO: 'text-emerald-400', MCO: 'text-purple-500', PAX: 'text-green-600',
    MAX: 'text-blue-700', KAX: 'text-red-700', AI: 'text-slate-600', AP: 'text-cyan-600',
    AM: 'text-teal-700', LR: 'text-indigo-700', BST: 'text-sky-500', MP: 'text-blue-500',
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

export const getSkuStoneTextColor = (stoneCode: string): string =>
    SKU_STONE_TEXT_COLORS[stoneCode] || 'text-emerald-500';
