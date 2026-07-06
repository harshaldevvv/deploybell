// Generates the extension's PNG icons from code so there are no binary
// design assets to hand-edit. Run: `npm run icons` (or `node scripts/gen-icons.js`).
//
// Draws a rounded orange tile with a white checkmark, supersampled for
// smooth edges. No external dependencies — a tiny hand-rolled PNG encoder.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "icons");
mkdirSync(OUT_DIR, { recursive: true });

// --- PNG encoding ---------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Geometry -------------------------------------------------------------

function roundedRectSDF(px, py, size, r) {
  const half = size / 2;
  const qx = Math.abs(px - half) - (half - r);
  const qy = Math.abs(py - half) - (half - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside; // <= 0 means inside
}

function distToSegment(px, py, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = px - a[0];
  const wy = py - a[1];
  const c2 = vx * vx + vy * vy;
  const t = c2 ? Math.max(0, Math.min(1, (vx * wx + vy * wy) / c2)) : 0;
  return Math.hypot(a[0] + t * vx - px, a[1] + t * vy - py);
}

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// --- Drawing --------------------------------------------------------------

function samplePixel(fx, fy, size) {
  const sdf = roundedRectSDF(fx, fy, size, size * 0.22);
  if (sdf > 0) return [0, 0, 0, 0]; // transparent outside the tile

  // Orange gradient, lighter top-left to deeper bottom-right.
  const t = (fx + fy) / (2 * size);
  const bg = lerp([0xfb, 0xad, 0x41], [0xf6, 0x82, 0x1f], t);

  // White checkmark.
  const p1 = [0.26 * size, 0.52 * size];
  const p2 = [0.43 * size, 0.68 * size];
  const p3 = [0.75 * size, 0.33 * size];
  const th = size * 0.085;
  const d = Math.min(
    distToSegment(fx, fy, p1, p2),
    distToSegment(fx, fy, p2, p3)
  );
  if (d < th) return [255, 255, 255, 255];

  return [bg[0], bg[1], bg[2], 255];
}

function drawIcon(size) {
  const ss = 3; // supersampling factor per axis
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = x + (sx + 0.5) / ss;
          const fy = y + (sy + 0.5) / ss;
          const [r, g, b, a] = samplePixel(fx, fy, size);
          const af = a / 255;
          sr += r * af;
          sg += g * af;
          sb += b * af;
          sa += af;
        }
      }
      const n = ss * ss;
      const idx = (y * size + x) * 4;
      if (sa > 0) {
        buf[idx] = Math.round(sr / sa);
        buf[idx + 1] = Math.round(sg / sa);
        buf[idx + 2] = Math.round(sb / sa);
      }
      buf[idx + 3] = Math.round((sa / n) * 255);
    }
  }
  return encodePNG(size, size, buf);
}

for (const size of [16, 48, 128]) {
  const png = drawIcon(size);
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
