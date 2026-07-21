import { describe, expect, it } from 'vitest';
import { SCANNER_COPY, SCANNER_STATUS_COPY } from '../../features/scanning/scannerCopy';
import { describeCameraError } from '../../features/scanning/scannerEngine';

const flattenStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(flattenStrings);
};

describe('scanner Greek product copy', () => {
  it('keeps every scanner state and end-user message localized in Greek', () => {
    const messages = [...Object.values(SCANNER_STATUS_COPY), ...flattenStrings(SCANNER_COPY)];
    expect(messages.length).toBeGreaterThan(30);
    for (const message of messages) {
      expect(message).toMatch(/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώϊϋΐΰ]/u);
    }
  });

  it('returns Greek guidance for camera permission, busy, unavailable, and generic errors', () => {
    for (const name of ['NotAllowedError', 'NotReadableError', 'NotFoundError', 'UnknownError']) {
      const result = describeCameraError({ name });
      expect(result.title).toMatch(/[Α-Ωα-ω]/u);
      expect(result.detail).toMatch(/[Α-Ωα-ω]/u);
    }
  });
});
