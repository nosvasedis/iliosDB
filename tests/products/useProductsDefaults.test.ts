import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useProducts egress defaults', () => {
  const source = readFileSync(
    resolve(__dirname, '../../hooks/api/useProducts.ts'),
    'utf8',
  );

  it('does not force staleTime 0 or refetchOnMount always', () => {
    expect(source).not.toMatch(/staleTime:\s*options\.staleTime\s*\?\?\s*0/);
    expect(source).not.toMatch(/refetchOnMount:\s*options\.refetchOnMount\s*\?\?\s*'always'/);
    expect(source).toMatch(/refetchOnMount:\s*options\.refetchOnMount\s*\?\?\s*true/);
  });
});
