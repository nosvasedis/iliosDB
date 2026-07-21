import { describe, expect, it } from 'vitest';
import { buildLabelQrSvgDataUrl } from '../../features/printing/qrCodeImage';

describe('label QR image generation', () => {
  it('emits a zero-margin, crisp SVG with solid modules instead of fragile strokes', async () => {
    const dataUrl = await buildLabelQrSvgDataUrl('RN150P');
    const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));

    expect(dataUrl).toMatch(/^data:image\/svg\+xml/);
    expect(svg).toContain('<svg');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).not.toContain('stroke=');
    expect(dataUrl).not.toContain('image/png');
  });
});
