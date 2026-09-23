// Generates the PWA PNG icons without any dependency (pure Node + zlib).
// Same drawing as public/favicon.svg, in a 64-unit coordinate space, with 4x4 supersampling.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const TEAL = [15, 118, 110];
const WHITE = [255, 255, 255];
const GOLD = [251, 191, 36];

const inRoundRect = (x, y, rx, ry, w, h, r) => {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inTriangle = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

// Returns [r,g,b,a] for a point in 64-unit space. `maskable` = full-bleed square + smaller art.
function sample(x, y, maskable) {
  if (maskable) {
    // shrink art to the 80% safe zone
    x = (x - 32) / 0.72 + 32;
    y = (y - 32) / 0.72 + 32;
  } else if (!inRoundRect(x, y, 0, 0, 64, 64, 14)) return null;
  if (inRoundRect(x, y, 36, 29, 16, 10, 4)) {
    return (x - 42) ** 2 + (y - 34) ** 2 <= 2.5 ** 2 ? GOLD : TEAL;
  }
  if (inRoundRect(x, y, 12, 20, 40, 28, 6)) return WHITE;
  if (inTriangle(x, y, [16, 20], [40, 12], [44, 20])) return GOLD;
  return TEAL;
}

function render(size, maskable) {
  const ss = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = sample(((px + (sx + 0.5) / ss) / size) * 64, ((py + (sy + 0.5) / ss) / size) * 64, maskable);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const n = ss * ss;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, size, raw);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, false));
writeFileSync('public/icons/icon-512.png', render(512, false));
writeFileSync('public/icons/icon-maskable-512.png', render(512, true));
console.log('icons written');
