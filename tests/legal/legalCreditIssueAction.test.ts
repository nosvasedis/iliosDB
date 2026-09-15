import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  new URL('../../components/LegalDocumentsPage.tsx', import.meta.url),
  'utf8',
);

describe('credit draft issue action', () => {
  it('uses only the common lower SBZ issue action in the credit draft flow', () => {
    expect(pageSource).not.toContain('Έκδοση πιστωτικού μέσω SBZ');
    expect(pageSource).toContain('Έκδοση μέσω SBZ');
  });
});
