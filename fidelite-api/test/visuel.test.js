import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePng, encodePng, layout, visuel } from "../src/visuel.js";

test("visuel : un PNG écrit puis relu donne les mêmes pixels", () => {
  const width = 7, height = 5, rgba = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 1], i * 4);
  const back = decodePng(encodePng({ width, height, rgba }));
  assert.deepEqual([back.width, back.height], [width, height]);
  assert.deepEqual(Array.from(back.rgba), Array.from(rgba));
});

test("visuel : tampons sur 1 rangée jusqu'à 5, sinon 2, toujours dans la zone", () => {
  const zone = { x: 10, y: 20, w: 500, h: 200 };
  for (const total of [4, 5, 6, 10, 12]) {
    const slots = layout(zone, total);
    assert.equal(slots.length, total);
    assert.equal(new Set(slots.map(s => s.y)).size, total <= 5 ? 1 : 2, `rangées pour ${total}`);
    for (const s of slots) {
      assert.ok(s.x - s.size / 2 >= zone.x && s.x + s.size / 2 <= zone.x + zone.w, `x dans la zone (${total})`);
      assert.ok(s.y - s.size / 2 >= zone.y && s.y + s.size / 2 <= zone.y + zone.h, `y dans la zone (${total})`);
    }
  }
});

test("visuel : chaque nombre de tampons donne une image différente, aux bonnes dimensions", () => {
  const v = visuel();
  const images = [0, 1, 9].map(filled => v.render({ format: "google", total: 10, filled }));
  assert.equal(new Set(images.map(b => b.toString("base64"))).size, 3);
  assert.equal(v.render({ format: "google", total: 10, filled: 1 }), images[1], "mis en cache");
  const apple = decodePng(v.render({ format: "apple", scale: 2, total: 6, filled: 2 }));
  assert.deepEqual([apple.width, apple.height], [750, 288]);
  assert.match(v.version, /^[0-9a-f]{10}$/);
});
