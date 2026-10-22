// Visuel de la carte : bandeau Apple Wallet (strip.png) et bannière Google Wallet (heroImage).
// Le fond et les tampons sont dessinés à l'avance (assets/visuel, voir outils/visuel) ;
// ici on place les tampons du client sur le fond, sans bibliothèque d'image.
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// Lit un PNG 8 bits RVB ou RVBA non entrelacé (le format des fichiers de assets/visuel).
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("PNG invalide");
  let width, height, colorType;
  const idat = [];
  for (let at = 8; at < buffer.length;) {
    const len = buffer.readUInt32BE(at), type = buffer.toString("ascii", at + 4, at + 8);
    const data = buffer.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9];
      if (data[8] !== 8 || ![2, 6].includes(colorType) || data[12] !== 0) throw new Error("PNG non pris en charge");
    } else if (type === "IDAT") idat.push(data);
    at += len + 12;
  }
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[prev + x] : 0, c = y && x >= bpp ? px[prev + x - bpp] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      px[row + x] = (raw[src + x] + pred) & 255;
    }
  }
  // Toujours en RVBA prémultiplié (flottants) pour les mélanges et réductions.
  const rgba = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const alpha = bpp === 4 ? px[i * 4 + 3] / 255 : 1;
    for (let k = 0; k < 3; k++) rgba[i * 4 + k] = px[i * bpp + k] * alpha;
    rgba[i * 4 + 3] = alpha;
  }
  return { width, height, rgba };
}

// Écrit un PNG RVB opaque ; le filtre de chaque ligne est choisi pour mieux compresser les photos.
export function encodePng({ width, height, rgba }) {
  const stride = width * 3;
  const px = Buffer.alloc(stride * height);
  for (let i = 0; i < width * height; i++) {
    const alpha = rgba[i * 4 + 3] || 1;
    for (let k = 0; k < 3; k++) px[i * 3 + k] = Math.max(0, Math.min(255, Math.round(rgba[i * 4 + k] / alpha)));
  }
  const raw = Buffer.alloc((stride + 1) * height);
  const line = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride, prev = row - stride;
    let best = null, bestScore = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 3 ? px[row + x - 3] : 0, b = y ? px[prev + x] : 0, c = y && x >= 3 ? px[prev + x - 3] : 0;
        const v = (px[row + x] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]) & 255;
        line[x] = v; score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = [filter, Buffer.from(line)]; }
    }
    raw[y * (stride + 1)] = best[0];
    best[1].copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([SIGNATURE, chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Réduction par moyenne des surfaces couvertes : nette, sans crénelage, pour tout facteur.
export function resize(image, width, height) {
  const pass = (src, sw, sh, dw, horizontal) => {
    const dh = horizontal ? sh : sw, out = new Float32Array(dw * dh * 4), scale = (horizontal ? sw : sh) / dw;
    for (let o = 0; o < dw; o++) {
      const start = o * scale, end = start + scale;
      for (let i = Math.floor(start); i < Math.min(Math.ceil(end), horizontal ? sw : sh); i++) {
        const w = (Math.min(end, i + 1) - Math.max(start, i)) / scale;
        for (let l = 0; l < dh; l++) {
          const s = horizontal ? (l * sw + i) * 4 : (i * sw + l) * 4;
          const d = horizontal ? (l * dw + o) * 4 : (o * sw + l) * 4;
          for (let k = 0; k < 4; k++) out[d + k] += src[s + k] * w;
        }
      }
    }
    return out;
  };
  const wide = pass(image.rgba, image.width, image.height, width, true);
  return { width, height, rgba: pass(wide, width, image.height, height, false) };
}

function paste(target, sprite, left, top) {
  for (let y = 0; y < sprite.height; y++) {
    const ty = top + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < sprite.width; x++) {
      const tx = left + x;
      if (tx < 0 || tx >= target.width) continue;
      const s = (y * sprite.width + x) * 4, t = (ty * target.width + tx) * 4, keep = 1 - sprite.rgba[s + 3];
      for (let k = 0; k < 4; k++) target.rgba[t + k] = sprite.rgba[s + k] + target.rgba[t + k] * keep;
    }
  }
}

// 1 rangée jusqu'à 5 tampons, sinon 2 ; la grille part du bord gauche de la zone, sous le titre.
export function layout(zone, total) {
  const rows = total <= 5 ? 1 : 2, cols = Math.ceil(total / rows);
  const cell = Math.min(zone.w / cols, zone.h / rows);
  const ox = zone.x, oy = zone.y + (zone.h - cell * rows) / 2;
  return Array.from({ length: total }, (_, i) => ({
    x: ox + cell * (i % cols + 0.5), y: oy + cell * (Math.floor(i / cols) + 0.5), size: cell * 0.86,
  }));
}

// Taille de chaque format à l'échelle 1 ; le fond est dessiné à la plus grande échelle.
export const FORMATS = {
  google: { width: 1032, height: 336, scales: [1] },
  apple: { width: 375, height: 144, scales: [1, 2, 3] },
};

export function createVisuel(dir = fileURLToPath(new URL("../assets/visuel/", import.meta.url))) {
  const files = ["fond-google.png", "fond-apple.png", "plein.png", "vide.png", "cadeau.png", "zones.json"];
  const raw = Object.fromEntries(files.map(f => [f, fs.readFileSync(dir + f)]));
  const read = name => decodePng(raw[name]);
  const zones = JSON.parse(raw["zones.json"]);
  const fonds = { google: read("fond-google.png"), apple: read("fond-apple.png") };
  const tampons = { plein: read("plein.png"), vide: read("vide.png"), cadeau: read("cadeau.png") };
  const cache = new Map();

  function render({ format, scale = 1, total, filled }) {
    const key = `${format}:${scale}:${total}:${filled}`;
    if (cache.has(key)) return cache.get(key);
    const { width, height } = FORMATS[format];
    const fond = fonds[format], ratio = (width * scale) / fond.width;
    const image = fond.width === width * scale ? { ...fond, rgba: Float32Array.from(fond.rgba) } : resize(fond, width * scale, height * scale);
    const zone = Object.fromEntries(Object.entries(zones[format]).map(([k, v]) => [k, v * ratio]));
    for (const [i, slot] of layout(zone, total).entries()) {
      const sprite = tampons[i < filled ? "plein" : i === total - 1 ? "cadeau" : "vide"];
      const size = Math.max(1, Math.round(slot.size));
      paste(image, resize(sprite, size, size), Math.round(slot.x - size / 2), Math.round(slot.y - size / 2));
    }
    const png = encodePng(image);
    if (cache.size > 64) cache.clear();
    cache.set(key, png);
    return png;
  }
  // Change dès que le dessin change : Google retélécharge alors les bannières.
  const version = crypto.createHash("sha256").update(Buffer.concat(Object.values(raw))).digest("hex").slice(0, 10);
  return { render, version };
}

let defaut;
export const visuel = () => (defaut ||= createVisuel());
