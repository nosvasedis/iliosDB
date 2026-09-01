import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('registry barcode gallery wiring', () => {
    it('gives the SKU registry barcode tab the same label price and edit controls as bulk print', () => {
    const gallery = readFileSync(
      resolve(__dirname, '../../components/ProductRegistry/BarcodeGallery.tsx'),
      'utf8',
    );
    const details = readFileSync(
      resolve(__dirname, '../../components/ProductDetails.tsx'),
      'utf8',
    );

    expect(gallery).toContain('readLabelPrintSettings');
    expect(gallery).toContain('buildRegistryBarcodePrintItems');
    expect(gallery).toContain('LabelPrintSettingsPanel');
    expect(gallery).toContain('LabelPreviewEditModal');
    expect(gallery).toContain('showPrice');
    expect(gallery).toContain('priceTier');
    expect(details).toContain("from './ProductRegistry/BarcodeGallery'");
  });
});
