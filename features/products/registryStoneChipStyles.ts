// Per stone-code colour chips (variant suffix stone codes from STONE_CODES_WOMEN/MEN)
export const STONE_CHIP_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  LE: { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-300' },
  MP: { bg: 'bg-blue-50', text: 'text-blue-800', dot: 'bg-blue-400' },
  PR: { bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-500' },
  KO: { bg: 'bg-red-50', text: 'text-red-800', dot: 'bg-red-400' },
  MV: { bg: 'bg-purple-50', text: 'text-purple-800', dot: 'bg-purple-400' },
  RZ: { bg: 'bg-pink-50', text: 'text-pink-800', dot: 'bg-pink-300' },
  AK: { bg: 'bg-cyan-50', text: 'text-cyan-800', dot: 'bg-cyan-400' },
  PAX: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400' },
  MAX: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  KAX: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
  CO: { bg: 'bg-teal-50', text: 'text-teal-800', dot: 'bg-teal-400' },
  PCO: { bg: 'bg-emerald-50', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  MCO: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  TPR: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  TKO: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
  TMP: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-400' },
  AI: { bg: 'bg-zinc-100', text: 'text-zinc-700', dot: 'bg-zinc-500' },
  AP: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-300' },
  AM: { bg: 'bg-teal-50', text: 'text-teal-800', dot: 'bg-teal-400' },
  LR: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-300' },
  LA: { bg: 'bg-blue-100', text: 'text-blue-900', dot: 'bg-blue-600' },
  FI: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-200' },
  BST: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-400' },
  XAL: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-200' },
  KR: { bg: 'bg-orange-50', text: 'text-orange-800', dot: 'bg-orange-400' },
  AX: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400' },
  TG: { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-500' },
  QN: { bg: 'bg-zinc-100', text: 'text-zinc-800', dot: 'bg-zinc-700' },
  TY: { bg: 'bg-teal-50', text: 'text-teal-800', dot: 'bg-teal-400' },
  IA: { bg: 'bg-rose-50', text: 'text-rose-800', dot: 'bg-rose-400' },
  BSU: { bg: 'bg-zinc-100', text: 'text-zinc-800', dot: 'bg-zinc-600' },
  GSU: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  RSU: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
  MA: { bg: 'bg-emerald-50', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  OP: { bg: 'bg-stone-50', text: 'text-stone-600', dot: 'bg-stone-300' },
  NF: { bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-600' },
  SD: { bg: 'bg-indigo-50', text: 'text-indigo-900', dot: 'bg-indigo-600' },
};

const DEFAULT_STONE_STYLE = { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-300' };

export function getStoneChipStyle(code: string) {
  return STONE_CHIP_STYLES[code] ?? DEFAULT_STONE_STYLE;
}
