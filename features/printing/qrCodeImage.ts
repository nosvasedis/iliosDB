import QRCode from 'qrcode';

/**
 * Generates a vector QR while retaining the label system's existing H correction,
 * zero-margin geometry and exact encoded value.
 */
export async function buildLabelQrSvgDataUrl(value: string): Promise<string> {
  const qr = QRCode.create(value, {
    errorCorrectionLevel: 'H',
  });
  const size = qr.modules.size;
  const rows: string[] = [];

  // Use filled module runs instead of SVG strokes. Some older print drivers
  // rasterize scaled strokes at one device pixel, producing the washed-out
  // horizontal lines seen in print preview.
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!qr.modules.data[y * size + x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < size && qr.modules.data[y * size + x]) x += 1;
      const width = x - start;
      rows.push(`M${start} ${y}h${width}v1h-${width}z`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h${size}v${size}H0z"/><path fill="#000000" d="${rows.join('')}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
