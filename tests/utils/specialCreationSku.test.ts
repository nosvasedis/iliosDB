import { describe, expect, it } from 'vitest';
import {
  cleanSpecialCreationNote,
  findSpecialCreationItemsMissingNotes,
  getSpecialCreationDisplayNote,
  getSpecialCreationNoteKey,
  MISSING_SPECIAL_CREATION_NOTE,
} from '../../utils/specialCreationSku';

describe('specialCreationSku notes', () => {
  it('cleans edges, normalizes Unicode and compares collapsed whitespace case-insensitively', () => {
    expect(cleanSpecialCreationNote('  Μενταγιόν  ')).toBe('Μενταγιόν');
    expect(getSpecialCreationNoteKey('  ΜΟΝΌΓΡΑΜΜΑ   με Πέτρα '))
      .toBe(getSpecialCreationNoteKey('μονόγραμμα με πέτρα'));
  });

  it('uses the explicit warning only for SP without a note', () => {
    expect(getSpecialCreationDisplayNote('SP', '   ')).toBe(MISSING_SPECIAL_CREATION_NOTE);
    expect(getSpecialCreationDisplayNote('RING', null)).toBeNull();
  });

  it('finds whitespace-only SP notes but ignores non-SP notes', () => {
    expect(findSpecialCreationItemsMissingNotes([
      { sku: 'SP', quantity: 1, price_at_order: 10, notes: '   ' },
      { sku: 'RING', quantity: 1, price_at_order: 10 },
    ])).toHaveLength(1);
  });
});
