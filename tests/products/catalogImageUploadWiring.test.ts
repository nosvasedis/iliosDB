import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('catalog photo upload wiring', () => {
  it('sends the prepare header only on catalog image uploads', () => {
    const supabase = source('lib/supabase.ts');
    expect(supabase).toContain('CATALOG_IMAGE_PREPARE_HEADER');
    expect(supabase).toContain("headers: { 'Content-Type': 'image/jpeg', 'Authorization': AUTH_KEY_SECRET, [CATALOG_IMAGE_PREPARE_HEADER]: '1' }");

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
  });

  it('keeps the SKU photo contained and the mobile hero from cropping the square', () => {
    const sidebar = source('components/ProductDetails/DetailsSidebar.tsx');
    const mobile = source('components/mobile/MobileProductDetails.tsx');
    expect(sidebar).toContain('p-1');
    expect(sidebar).toContain('object-contain');
    expect(mobile).toMatch(/relative h-72 bg-white[\s\S]*object-contain/);
  });
});
