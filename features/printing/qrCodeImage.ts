import QRCode from 'qrcode';

/**
 * Generates a vector QR while retaining the label system's existing H correction,
 * zero-margin geometry and exact encoded value.
 */
export async function buildLabelQrSvgDataUrl(value: string): Promise<string> {
  const svg = await QRCode.toString(value, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 0,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  const crispSvg = svg.includes('shape-rendering=')
    ? svg
    : svg.replace('<svg ', '<svg shape-rendering="crispEdges" ');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(crispSvg)}`;
}
