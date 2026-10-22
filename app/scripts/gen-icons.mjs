// Generates the PWA icons (SVG + PNG) from a geometric "A" monogram.
// Pure JS rasteriser (polygon fill with supersampling) + PNG encoder (node:zlib).
// Usage: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(out, { recursive: true });

const BG = [11, 11, 12];
const FG = [243, 243, 244];
const ACCENT = [60, 207, 126];

// Glyph in a 64×64 design grid (same geometry as the in-app monogram).
const OUTER = [
  [17, 46],
  [29.5, 17],
  [34.5, 17],
  [47, 46],
  [40.8, 46],
  [38, 39],
  [26, 39],
  [23.2, 46],
];
const HOLE = [
  [28, 33.4],
  [36, 33.4],
  [32, 23.2],
];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * opts.scale: glyph scale relative to the 64 grid (1 = as designed)
 * opts.rounded: corner radius as fraction of size, or 0 for full bleed
 * opts.glyphOnly: transparent background, white glyph (notification badge)
 */
function render(size, { scale = 1, rounded = 14 / 64, glyphOnly = false, underline = true } = {}) {
  const SS = 4;
  const px = new Uint8Array(size * size * 4);
  const k = 64 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgCov = 0;
      let fgCov = 0;
      let acCov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS) * k;
          const fy = (y + (sy + 0.5) / SS) * k;
          const inBg = rounded ? inRoundRect(fx, fy, 64, rounded * 64) : true;
          if (!inBg) continue;
          bgCov++;
          // map into glyph space around centre
          const gx = 32 + (fx - 32) / scale;
          const gy = 32 + (fy - 32) / scale;
          if (inPoly(gx, gy, OUTER) && !inPoly(gx, gy, HOLE)) fgCov++;
          else if (underline && gy >= 49.5 && gy <= 51.5 && gx >= 17 && gx <= 47) acCov++;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (glyphOnly) {
        px[i] = px[i + 1] = px[i + 2] = 255;
        px[i + 3] = Math.round(((fgCov + acCov) / n) * 255);
        continue;
      }
      const a = bgCov / n;
      const f = fgCov / Math.max(bgCov, 1);
      const g = acCov / Math.max(bgCov, 1);
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - f - g) + FG[c] * f + ACCENT[c] * g);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const write = (name, size, opts) => {
  writeFileSync(resolve(out, name), png(size, render(size, opts)));
  console.log('wrote', name);
};

write('icon-192.png', 192);
write('icon-512.png', 512);
// Maskable: full bleed, glyph inside the 80 % safe zone.
write('icon-maskable-512.png', 512, { rounded: 0, scale: 0.78 });
write('apple-touch-icon.png', 180, { rounded: 0, scale: 0.86 });
write('badge-72.png', 72, { glyphOnly: true, rounded: 0, scale: 1.25, underline: false });

const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="rgb(${BG})"/>
  <path fill-rule="evenodd" fill="rgb(${FG})" d="M${pts(OUTER)}Z M${pts(HOLE)}Z"/>
  <rect x="17" y="49.5" width="30" height="2" fill="rgb(${ACCENT})"/>
</svg>
`;
writeFileSync(resolve(out, 'icon.svg'), svg);
console.log('wrote icon.svg');
