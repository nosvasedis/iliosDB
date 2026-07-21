import { describe, expect, it } from 'vitest';
import { buildLabelQrSvgDataUrl } from '../../features/printing/qrCodeImage';

describe('label QR image generation', () => {
  it('emits a zero-margin, crisp SVG instead of a raster PNG', async () => {
    const dataUrl = await buildLabelQrSvgDataUrl('RN150P');
    const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));

    expect(dataUrl).toMatch(/^data:image\/svg\+xml/);
    expect(svg).toContain('<svg');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('stroke="#000000"');
    expect(dataUrl).not.toContain('image/png');
  });
});
