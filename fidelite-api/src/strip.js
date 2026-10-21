// Bandeau de tampons du pass Apple (strip.png), dessiné sans bibliothèque d'image.
import zlib from "node:zlib";

const BG = [22, 22, 22];
const YELLOW = [255, 206, 0];
const INK = [13, 13, 13];
const RING = [110, 110, 110];

const clamp = x => Math.max(0, Math.min(1, x));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function png(width, height, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; // 8 bits, RVB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export function renderStrip({ width, height, total, filled }) {
  const rows = total <= 6 ? 1 : 2;
  const cols = Math.ceil(total / rows);
  const cell = Math.min((width * 0.9) / cols, (height * 0.86) / rows);
  const r = cell * 0.38;
  const ox = (width - cell * cols) / 2, oy = (height - cell * rows) / 2;
  const circles = Array.from({ length: total }, (_, i) => ({
    x: ox + cell * (i % cols + 0.5), y: oy + cell * (Math.floor(i / cols) + 0.5), on: i < filled,
  }));

  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = mix(BG, [30, 30, 30], y / height);
      const px = x + 0.5, py = y + 0.5;
      const c = circles.find(c => Math.abs(px - c.x) <= r + 1 && Math.abs(py - c.y) <= r + 1);
      if (c) {
        const d = Math.hypot(px - c.x, py - c.y) - r;
        if (c.on) {
          color = mix(color, YELLOW, clamp(0.5 - d));
          const check = Math.min(
            segmentDistance(px, py, c.x - 0.38 * r, c.y + 0.02 * r, c.x - 0.1 * r, c.y + 0.3 * r),
            segmentDistance(px, py, c.x - 0.1 * r, c.y + 0.3 * r, c.x + 0.4 * r, c.y - 0.28 * r));
          color = mix(color, INK, clamp(0.5 - (check - 0.09 * r)));
        } else {
          const stroke = Math.max(2, r * 0.07);
          color = mix(color, RING, clamp(0.5 - (Math.abs(d + stroke / 2) - stroke / 2)));
        }
      }
      rgb[(y * width + x) * 3] = color[0];
      rgb[(y * width + x) * 3 + 1] = color[1];
      rgb[(y * width + x) * 3 + 2] = color[2];
    }
  }
  return png(width, height, rgb);
}
