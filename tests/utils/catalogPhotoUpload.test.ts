import { describe, expect, it, vi } from 'vitest';
import { CatalogPrepareFailedError } from '../../utils/imageHelpers';
import {
  CATALOG_PREPARE_FAILURE_CONFIRM,
  catalogPrepareChoiceFromConfirm,
  runCatalogPhotoUpload,
} from '../../utils/catalogPhotoUpload';

describe('catalog prepare failure choice', () => {
  it('maps confirm results to keep, retry, or discard', () => {
    expect(catalogPrepareChoiceFromConfirm(true)).toBe('keep-original');
    expect(catalogPrepareChoiceFromConfirm(false)).toBe('retry');
    expect(catalogPrepareChoiceFromConfirm(null)).toBe('discard');
  });

  it('does not save until the user keeps the original', async () => {
    const upload = vi.fn()
      .mockRejectedValueOnce(new CatalogPrepareFailedError(422))
      .mockResolvedValueOnce('https://cdn.example/original.jpg');
    const confirm = vi.fn().mockResolvedValue(true);

    const url = await runCatalogPhotoUpload(upload, confirm);

    expect(url).toBe('https://cdn.example/original.jpg');
    expect(confirm).toHaveBeenCalledWith(CATALOG_PREPARE_FAILURE_CONFIRM);
    expect(upload).toHaveBeenNthCalledWith(1, true);
    expect(upload).toHaveBeenNthCalledWith(2, false);
  });

  it('retries prepare without storing the original', async () => {
    const upload = vi.fn()
      .mockRejectedValueOnce(new CatalogPrepareFailedError(1102))
      .mockResolvedValueOnce('https://cdn.example/prepared.jpg');
    const confirm = vi.fn().mockResolvedValue(false);

    const url = await runCatalogPhotoUpload(upload, confirm);

    expect(url).toBe('https://cdn.example/prepared.jpg');
    expect(upload).toHaveBeenNthCalledWith(1, true);
    expect(upload).toHaveBeenNthCalledWith(2, true);
  });

  it('discards without any original save', async () => {
    const upload = vi.fn().mockRejectedValue(new CatalogPrepareFailedError(422));
    const confirm = vi.fn().mockResolvedValue(null);

    const url = await runCatalogPhotoUpload(upload, confirm);

    expect(url).toBeNull();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(true);
  });
});
