import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  new URL('../../components/LegalDocumentsPage.tsx', import.meta.url),
  'utf8',
);

const hookSource = readFileSync(
  new URL('../../hooks/api/useLegalDocuments.ts', import.meta.url),
  'utf8',
);

describe('AADE environment selection contract', () => {
  it('allows production selection without requiring a dev invoice first', () => {
    expect(pageSource).not.toContain('hasDevValidation');
    expect(pageSource).not.toContain('Η παραγωγή ανοίγει μετά από επιτυχή έκδοση στο dev περιβάλλον.');
    expect(pageSource).toContain(
      "setSettingsDraft((current) => ({ ...current, environment: value === 'prod' ? 'prod' : 'dev' }));",
    );
    expect(pageSource).toContain(
      'Για πραγματική έκδοση αρκεί το myDATA Παραγωγής να εμφανίζεται ως «Έτοιμο»',
    );
  });

  it('keeps the selected environment credential check before AADE submission', () => {
    expect(pageSource).toContain('status?.[settingsDraft.environment]?.ready');
    expect(pageSource).toContain('if (!(await ensureAadeCredentialsReady())) return;');
  });

  it('uses the confirmed credential-save response immediately', () => {
    expect(hookSource).toContain(
      'onSuccess: (status) => queryClient.setQueryData(legalKeys.credentials(), status)',
    );
  });
});
