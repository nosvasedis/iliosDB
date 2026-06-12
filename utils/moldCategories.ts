import { Mold } from '../types';

/** Molds whose code starts with LSTX (special category, separate from standard L-prefix molds). */
export function isLstxMold(code: string): boolean {
  return code.trim().toUpperCase().startsWith('LSTX');
}

export type MoldCategoryTab = 'standard' | 'lstx';

export function filterMoldsByCategory(molds: Mold[], category: MoldCategoryTab): Mold[] {
  return molds.filter((m) => (category === 'lstx' ? isLstxMold(m.code) : !isLstxMold(m.code)));
}

/** Hide LSTX in pickers unless the user is explicitly searching for them. */
export function shouldShowLstxInPicker(moldSearch: string): boolean {
  return moldSearch.trim().toUpperCase().startsWith('LSTX');
}
