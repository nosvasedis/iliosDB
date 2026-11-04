// Deterministic exports from the user-approved ImageGen artwork. No logo redesign.
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'assets/branding/ilios-erp-icon-master.png');
const output = path.join(root, 'public/icons/ilios-sun-v2');
await mkdir(output, { recursive: true });
const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== info.height) throw new Error('The approved icon master must be square.');
const width = info.width;
const background = { r: data[0], g: data[1], b: data[2] };
const mask = new Uint8Array(width * width);
let radius = 0;
for (let y = 0; y < width; y++) {
  for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * info.channels;
    const [r, g, b] = data.subarray(offset, offset + 3);
    if (r > 100 && g > 70 && r > g * 1.1 && b < g * 0.7) {
      mask[y * width + x] = 1;
      radius = Math.max(radius, Math.hypot(x + 0.5 - width / 2, y + 0.5 - width / 2) / width);
    }
  }
}
// Leave a little extra room inside the standardized 40%-radius safe circle.
const maskableScale = Math.min(1, 0.375 / radius);
async function squircleMask(size) {
  // A true quartic superellipse, supersampled for smooth transparent edges even
  // at 16px. Only the green tile's corners are clipped; the sun stays untouched.
  const points = Array.from({ length: 256 }, (_, index) => {
    const angle = index / 256 * Math.PI * 2;
    const coordinate = value => (0.5 + Math.sign(value) * Math.sqrt(Math.abs(value)) * 0.5).toFixed(7);
    return `${index ? 'L' : 'M'}${coordinate(Math.cos(angle))} ${coordinate(Math.sin(angle))}`;
  }).join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size * 4}" height="${size * 4}" viewBox="0 0 1 1"><path fill="white" d="${points}Z"/></svg>`);
  return sharp(svg).resize(size, size).png().toBuffer();
}
async function raster(size, maskable = false, squircle = false) {
  const innerSize = maskable ? Math.floor(size * maskableScale) : size;
  let image = sharp(source).resize(innerSize, innerSize, { kernel: 'lanczos3' }).removeAlpha();
  if (size <= 48) image = image.sharpen({ sigma: 0.4, m1: 0.5, m2: 1 });
  if (maskable) {
    const leading = Math.floor((size - innerSize) / 2);
    const trailing = size - innerSize - leading;
    image = image.extend({ top: leading, left: leading, bottom: trailing, right: trailing, background });
  }
  if (squircle) {
    // Materialize the opaque resize first: sharp applies removeAlpha/ensureAlpha
    // late in a pipeline, which would otherwise flatten the composited mask.
    image = sharp(await image.png().toBuffer()).ensureAlpha()
      .composite([{ input: await squircleMask(size), blend: 'dest-in' }]);
  }
  return image;
}
async function png(size, filename, maskable = false, squircle = false) {
  const image = await raster(size, maskable, squircle);
  await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(path.join(output, filename));
}
for (const size of [16, 32, 48]) await png(size, `favicon-${size}x${size}.png`, false, true);
// Apple and maskable assets must remain full bleed: the OS applies its own mask.
for (const size of [152, 167, 180]) await png(size, `apple-touch-icon-${size}x${size}.png`);
for (const size of [192, 512]) {
  await png(size, `android-chrome-${size}x${size}.png`, false, true);
  await png(size, `maskable-${size}x${size}.png`, true);
}
await png(150, 'mstile-150x150.png');

// ICO: native 32-bit bitmap frames for older readers, PNG for the 256px frame.
const frames = [];
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  if (size === 256) {
    frames.push({ size, bytes: await (await raster(size, false, true)).png().toBuffer() });
    continue;
  }
  const image = await raster(size, false, true);
  const rgba = await image.raw().toBuffer();
  const xorBytes = size * size * 4;
  const andStride = Math.ceil(size / 32) * 4;
  const andBytes = andStride * size;
  const dib = Buffer.alloc(40 + xorBytes + andBytes);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(xorBytes + andBytes, 20);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = 40 + ((size - y - 1) * size + x) * 4;
      dib[to] = rgba[from + 2]; dib[to + 1] = rgba[from + 1];
      dib[to + 2] = rgba[from]; dib[to + 3] = rgba[from + 3];
      // Legacy ICO readers use the 1-bit AND mask rather than the alpha channel.
      if (rgba[from + 3] < 128) {
        dib[40 + xorBytes + (size - y - 1) * andStride + (x >> 3)] |= 1 << (7 - (x % 8));
      }
    }
  }
  frames.push({ size, bytes: dib });
}
const directory = Buffer.alloc(6 + frames.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
frames.forEach(({ size, bytes }, index) => {
  const entry = 6 + index * 16;
  directory[entry] = size === 256 ? 0 : size;
  directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(bytes.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});
await writeFile(path.join(output, 'favicon.ico'), Buffer.concat([directory, ...frames.map(frame => frame.bytes)]));

// Trace the approved silhouette for Safari's required single-layer black SVG.
// Boundary tracing avoids embedding a raster image in a pinned-tab mask.
const edges = new Map();
const key = (x, y) => y * (width + 1) + x;
const point = value => [value % (width + 1), Math.floor(value / (width + 1))];
const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < width && mask[y * width + x];
function edge(x1, y1, x2, y2) {
  const start = key(x1, y1);
  if (!edges.has(start)) edges.set(start, []);
  edges.get(start).push(key(x2, y2));
}
for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
  if (!solid(x, y)) continue;
  if (!solid(x, y - 1)) edge(x, y, x + 1, y);
  if (!solid(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
  if (!solid(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
  if (!solid(x - 1, y)) edge(x, y + 1, x, y);
}
function simplify(points, tolerance = 0.7) {
  if (points.length <= 2) return points;
  const [ax, ay] = points[0], [bx, by] = points.at(-1);
  const dx = bx - ax, dy = by - ay;
  let farthest = 0, split = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const distance = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (distance > farthest) { farthest = distance; split = i; }
  }
  return farthest <= tolerance ? [points[0], points.at(-1)]
    : [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)];
}
const contours = [];
while (edges.size) {
  const start = edges.keys().next().value;
  let current = start;
  const points = [];
  do {
    points.push(point(current));
    const next = edges.get(current);
    if (!next?.length) throw new Error('Open silhouette contour.');
    const destination = next.pop();
    if (!next.length) edges.delete(current);
    current = destination;
  } while (current !== start);
  if (points.length < 12) continue;
  const middle = Math.floor(points.length / 2);
  contours.push([...simplify(points.slice(0, middle + 1)).slice(0, -1), ...simplify([...points.slice(middle), points[0]]).slice(0, -1)]);
}
const coordinate = value => Number((value / width * 16).toFixed(4));
const d = contours.map(points => points.map(([x, y], i) => `${i ? 'L' : 'M'}${coordinate(x)} ${coordinate(y)}`).join('') + 'Z').join('');
await writeFile(path.join(output, 'safari-pinned-tab.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>\n`);

// Conventional discovery URLs for clients that do not consult the HTML links.
await copyFile(path.join(output, 'favicon.ico'), path.join(root, 'public/favicon.ico'));
await copyFile(path.join(output, 'apple-touch-icon-180x180.png'), path.join(root, 'public/apple-touch-icon.png'));
console.log(`Exported icons; approved artwork radius=${radius.toFixed(4)}, maskable scale=${maskableScale.toFixed(4)}, background=rgb(${background.r},${background.g},${background.b}).`);
