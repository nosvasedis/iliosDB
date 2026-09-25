import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('catalog photo upload wiring', () => {
  it('sends the prepare header only on catalog image uploads', () => {
    const supabase = source('lib/supabase.ts');
    expect(supabase).toContain('CATALOG_IMAGE_PREPARE_HEADER');
    expect(supabase).toContain("if (prepare) headers[CATALOG_IMAGE_PREPARE_HEADER] = '1'");

    const settings = source('components/SettingsPage.tsx');
    expect(settings).toContain('compressImage');
    expect(settings).not.toContain('prepareUploadSource');
    expect(settings).not.toContain('CATALOG_IMAGE_PREPARE_HEADER');
  });

  it('uploads HD catalog sources from product details and the new-product wizard', () => {
    const details = source('components/ProductDetails.tsx');
    const mobile = source('components/mobile/MobileProductDetails.tsx');
    const wizard = source('hooks/useNewProductState.ts');
    const helpers = source('utils/imageHelpers.ts');

    expect(helpers).toContain('prepareUploadSource');
    expect(helpers).toContain('2048');
    expect(details).toContain('prepareUploadSource');
    expect(mobile).toContain('prepareUploadSource');
    expect(wizard).toContain('prepareUploadSource');
    expect(details).toContain('uploadCatalogPhotoWithChoice');
    expect(mobile).toContain('uploadCatalogPhotoWithChoice');
    expect(wizard).toContain('uploadCatalogPhotoWithChoice');
  });

  it('asks before saving the original when catalog prepare fails', () => {
    const helper = source('utils/catalogPhotoUpload.ts');
    const worker = source('worker/worker.js');
    expect(helper).toContain('Κρατήστε την αρχική');
    expect(helper).toContain('Δοκιμή ξανά');
    expect(helper).toContain("cancelText: 'Όχι'");
    expect(helper).toContain("choice === 'keep-original'");
    expect(worker).toContain('nothing stored');
    expect(worker).toContain('CATALOG_PREPARE_FAILED_STATUS');
  });

  it('keeps the SKU photo contained and the mobile hero from cropping the square', () => {
    const sidebar = source('components/ProductDetails/DetailsSidebar.tsx');
    const mobile = source('components/mobile/MobileProductDetails.tsx');
    expect(sidebar).toContain('p-1');
    expect(sidebar).toContain('object-contain');
    expect(mobile).toMatch(/relative h-72 bg-white[\s\S]*object-contain/);
  });
});
