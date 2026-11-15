// Generates build/icon.png (256px) and build/icon.ico (256/48/32/16) with no
// external tools: a simple vector drawing rasterised with supersampling and
// encoded as PNG via zlib.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

// Shapes in a 256x256 design space.
const STROKE = 22;
const SEGMENTS = [
  // "M"
  [[62, 178], [62, 84]],
  [[62, 84], [100, 134]],
  [[100, 134], [138, 84]],
  [[138, 84], [138, 178]],
  // down arrow
  [[188, 84], [188, 172]],
  [[162, 146], [188, 174]],
  [[214, 146], [188, 174]]
];

function distToSegment(px, py, [[ax, ay], [bx, by]]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inRoundedRect(x, y, inset, r) {
  const min = inset;
  const max = 256 - inset;
  const cx = Math.max(min + r, Math.min(x, max - r));
  const cy = Math.max(min + r, Math.min(y, max - r));
  return Math.hypot(x - cx, y - cy) <= r && x >= min && x <= max && y >= min && y <= max;
}

function render(size) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  const scale = 256 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const X = (x + (sx + 0.5) / ss) * scale;
          const Y = (y + (sy + 0.5) / ss) * scale;
          if (inRoundedRect(X, Y, 8, 54)) {
            bg++;
            if (SEGMENTS.some((s) => distToSegment(X, Y, s) <= STROKE / 2)) fg++;
          }
        }
      }
      const n = ss * ss;
      const a = bg / n;
      const f = bg ? fg / bg : 0;
      // diagonal gradient #3b82f6 -> #1d4ed8
      const t = (x + y) / (2 * size);
      const br = 0x3b + (0x1d - 0x3b) * t;
      const bgc = 0x82 + (0x4e - 0x82) * t;
      const bb = 0xf6 + (0xd8 - 0xf6) * t;
      const i = (y * size + x) * 4;
      px[i] = Math.round(br + (255 - br) * f);
      px[i + 1] = Math.round(bgc + (255 - bgc) * f);
      px[i + 2] = Math.round(bb + (255 - bb) * f);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const rgba = render(size);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const sizes = [256, 48, 32, 16];
const pngs = sizes.map(png);
fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[0]);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s;
  e[1] = s >= 256 ? 0 : s;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([header, ...entries, ...pngs]));
console.log(`Wrote ${path.join(outDir, 'icon.png')} and icon.ico`);
