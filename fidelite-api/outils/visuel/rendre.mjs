// Redessine le visuel de la carte à partir de modele.html, avec Chromium (Playwright).
// Usage, depuis fidelite-api : node outils/visuel/rendre.mjs
// (Playwright doit être installé : npm install -g playwright && npx playwright install chromium)
// Écrit les calques du serveur dans assets/visuel et ceux de la page carte.html dans ../img/fidelite.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, "../../assets/visuel");
const site = path.resolve(here, "../../../img/fidelite");
const modele = pathToFileURL(path.join(here, "modele.html")).href;
const globalModules = execSync("npm root -g").toString().trim();
const { chromium } = createRequire(path.join(globalModules, "/"))("playwright");

const FORMATS = { google: { w: 1032, h: 336 }, apple: { w: 1125, h: 432 } };
const TAMPON = 240;
fs.mkdirSync(assets, { recursive: true });
fs.mkdirSync(site, { recursive: true });

const browser = await chromium.launch();
const open = async (query, w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${modele}?${new URLSearchParams(query)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  if (errors.length) throw new Error(errors.join("\n"));
  return page;
};

const zones = {};
for (const [format, { w, h }] of Object.entries(FORMATS)) {
  const page = await open({ layer: "fond", format, w, h }, w, h);
  zones[format] = await page.evaluate(() => window.zoneTampons);
  const clip = { x: 0, y: 0, width: w, height: h };
  await page.screenshot({ path: path.join(assets, `fond-${format}.png`), clip });
  if (format === "google") await page.screenshot({ path: path.join(site, "fond-carte.jpg"), type: "jpeg", quality: 82, clip });
  await page.close();
}
for (const layer of ["plein", "vide", "cadeau"]) {
  const page = await open({ layer, w: TAMPON, h: TAMPON }, TAMPON, TAMPON);
  const shot = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: TAMPON, height: TAMPON } });
  fs.writeFileSync(path.join(assets, `${layer}.png`), shot);
  fs.writeFileSync(path.join(site, `tampon-${layer}.png`), shot);
  await page.close();
}
await browser.close();

fs.writeFileSync(path.join(assets, "zones.json"), JSON.stringify(zones, null, 2) + "\n");
const g = zones.google, f = n => +(n).toFixed(4);
console.log("Visuel redessiné. Zone des tampons à reporter dans ZONE_TAMPONS de js/fidelite.js :");
console.log(JSON.stringify({ x: f(g.x / 1032), y: f(g.y / 336), w: f(g.w / 1032), h: f(g.h / 336) }));
