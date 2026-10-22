import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fakeAppleCertificates, startServer, testConfig, unzip } from "./helpers.js";
import { decodePng, visuel } from "../src/visuel.js";

const certs = fakeAppleCertificates();
const config = testConfig({ apple: { passTypeIdentifier: "pass.test.bestburger", teamIdentifier: "ABCDE12345",
  wwdr: certs.wwdr, signerCert: certs.signerCert, signerKey: certs.signerKey } });
const staff = { authorization: "Bearer secret-comptoir-123" };
let srv;
before(async () => { srv = await startServer(config); });
after(() => srv.close());

const signup = (email, extra = {}) => srv.api("POST", "/api/inscription",
  { body: { prenom: "Inès", email, telephone: "06 12 34 56 78", consentement: true, ...extra } });

test("inscription : crée une carte et refuse un doublon", async () => {
  const res = await signup("ines@example.fr");
  assert.equal(res.status, 201);
  assert.match(res.data.carte.code, /^BB-[2-9A-HJ-NP-Z]{6}$/);
  assert.equal(res.data.carte.tampons, 0);
  assert.deepEqual(res.data.carte.wallets, { apple: true, google: true });
  const again = await signup("INES@example.fr");
  assert.equal(again.status, 409);
});

test("inscription : valide les champs et le consentement", async () => {
  assert.equal((await signup("pas-un-email")).status, 400);
  assert.equal((await signup("a@b.fr", { consentement: false })).status, 400);
  assert.equal((await signup("a@b.fr", { prenom: "" })).status, 400);
  assert.equal((await signup("a@b.fr", { telephone: "abc" })).status, 400);
});

test("inscription : limitée par adresse IP", async () => {
  const s = await startServer({ ...config, inscriptionsParHeure: 2 });
  const body = n => ({ body: { prenom: "Léa", email: `lea${n}@example.fr`, consentement: true } });
  assert.equal((await s.api("POST", "/api/inscription", body(1))).status, 201);
  assert.equal((await s.api("POST", "/api/inscription", body(2))).status, 201);
  assert.equal((await s.api("POST", "/api/inscription", body(3))).status, 429);
  await s.close();
});

test("carte : accessible uniquement avec son jeton", async () => {
  const { data } = await signup("jeton@example.fr");
  const ok = await srv.api("GET", `/api/cartes/${data.serial}`, { headers: { authorization: `Bearer ${data.token}` } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.prenom, "Inès");
  assert.equal(ok.data.serial, undefined, "le numéro interne n'est pas renvoyé");
  const ko = await srv.api("GET", `/api/cartes/${data.serial}`, { headers: { authorization: "Bearer faux" } });
  assert.equal(ko.status, 404);
  const pass = await srv.api("GET", `/api/cartes/${data.serial}/apple?t=faux`);
  assert.equal(pass.status, 404);
});

test("comptoir : code obligatoire, tampons, récompense au 10e", async () => {
  const { data } = await signup("tampons@example.fr");
  assert.equal((await srv.api("GET", `/api/comptoir/membres?code=${data.carte.code}`)).status, 401);
  const found = await srv.api("GET", `/api/comptoir/membres?code=${data.carte.code.slice(3).toLowerCase()}`, { headers: staff });
  assert.equal(found.data.membres[0].serial, data.serial);

  let res;
  for (let i = 0; i < 9; i++) res = await srv.api("POST", `/api/comptoir/membres/${data.serial}/tampons`, { headers: staff, body: {} });
  assert.equal(res.data.membre.tampons, 9);
  assert.equal(res.data.membre.recompenses, 0);
  res = await srv.api("POST", `/api/comptoir/membres/${data.serial}/tampons`, { headers: staff, body: { nombre: 2 } });
  assert.equal(res.data.membre.tampons, 1);
  assert.equal(res.data.membre.recompenses, 1);
  assert.ok(srv.calls.google.length >= 10, "Google Wallet est mis à jour à chaque passage");

  res = await srv.api("POST", `/api/comptoir/membres/${data.serial}/recompense`, { headers: staff });
  assert.equal(res.data.membre.recompenses, 0);
  res = await srv.api("POST", `/api/comptoir/membres/${data.serial}/recompense`, { headers: staff });
  assert.equal(res.status, 409);

  const search = await srv.api("GET", "/api/comptoir/membres?q=tampons@", { headers: staff });
  assert.equal(search.data.membres.length, 1);
});

test("comptoir : trop d'essais avec un mauvais code sont bloqués", async () => {
  const s = await startServer(config);
  const bad = { authorization: "Bearer mauvais-code-000" };
  for (let i = 0; i < 10; i++) assert.equal((await s.api("GET", "/api/comptoir/membres?q=abc", { headers: bad })).status, 401);
  assert.equal((await s.api("GET", "/api/comptoir/membres?q=abc", { headers: bad })).status, 429);
  // Même le bon code est refusé pendant le blocage : impossible de continuer à deviner.
  assert.equal((await s.api("GET", "/api/comptoir/membres?q=abc", { headers: staff })).status, 429);
  await s.close();
});

test("comptoir : une fausse adresse IP envoyée par le client ne contourne pas le blocage", async () => {
  const s = await startServer({ ...config, trustProxy: true });
  const bad = n => ({ authorization: "Bearer mauvais-code-000", "x-forwarded-for": `10.0.0.${n}, 203.0.113.7` });
  for (let i = 0; i < 10; i++) assert.equal((await s.api("GET", "/api/comptoir/membres?q=abc", { headers: bad(i) })).status, 401);
  assert.equal((await s.api("GET", "/api/comptoir/membres?q=abc", { headers: bad(99) })).status, 429);
  await s.close();
});

test("en-têtes de sécurité sur toutes les réponses", async () => {
  for (const url of ["/sante", "/introuvable"]) {
    const { headers } = await srv.api("GET", url);
    assert.equal(headers.get("x-frame-options"), "DENY");
    assert.equal(headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'");
    assert.equal(headers.get("referrer-policy"), "no-referrer");
    assert.match(headers.get("strict-transport-security"), /max-age=/);
    assert.equal(headers.get("cache-control"), "no-store");
  }
});

test("Apple Wallet : .pkpass complet et signature valide", async () => {
  const { data } = await signup("apple@example.fr");
  await srv.api("POST", `/api/comptoir/membres/${data.serial}/tampons`, { headers: staff, body: { nombre: 3 } });
  const res = await srv.api("GET", `/api/cartes/${data.serial}/apple?t=${data.token}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/vnd.apple.pkpass");

  const files = unzip(res.data);
  for (const f of ["pass.json", "manifest.json", "signature", "icon.png", "logo.png", "strip@2x.png"]) assert.ok(files[f], f);
  const pass = JSON.parse(files["pass.json"]);
  assert.equal(pass.serialNumber, data.serial);
  assert.equal(pass.authenticationToken, data.token);
  assert.equal(pass.webServiceURL, "https://fidelite.example/apple");
  assert.equal(pass.storeCard.headerFields[0].value, "3/10");
  assert.equal(pass.suppressStripShine, true);
  for (const [f, w, h] of [["strip.png", 375, 144], ["strip@2x.png", 750, 288], ["strip@3x.png", 1125, 432]]) {
    const png = decodePng(files[f]);
    assert.deepEqual([png.width, png.height], [w, h], f);
  }
  assert.equal(pass.barcodes[0].message, data.carte.code);

  const manifest = JSON.parse(files["manifest.json"]);
  for (const [name, sha1] of Object.entries(manifest)) {
    assert.equal(crypto.createHash("sha1").update(files[name]).digest("hex"), sha1, name);
  }
  fs.writeFileSync(path.join(certs.dir, "manifest.json"), files["manifest.json"]);
  fs.writeFileSync(path.join(certs.dir, "signature"), files.signature);
  execFileSync("openssl", ["cms", "-verify", "-binary", "-inform", "DER", "-in", "signature", "-content", "manifest.json",
    "-CAfile", "wwdr.pem", "-purpose", "any", "-out", "/dev/null"], { cwd: certs.dir, stdio: "pipe" });
});

test("Apple Wallet : service web (inscription d'appareil, mises à jour, retrait)", async () => {
  const { data } = await signup("iphone@example.fr");
  const auth = { authorization: `ApplePass ${data.token}` };
  const reg = `/apple/v1/devices/appareil1/registrations/pass.test.bestburger/${data.serial}`;
  assert.equal((await srv.api("POST", reg, { body: { pushToken: "abc" } })).status, 401);
  assert.equal((await srv.api("POST", reg, { headers: auth, body: { pushToken: "abc" } })).status, 201);
  assert.equal((await srv.api("POST", reg, { headers: auth, body: { pushToken: "abc" } })).status, 200);

  const list = await srv.api("GET", "/apple/v1/devices/appareil1/registrations/pass.test.bestburger");
  assert.deepEqual(list.data.serialNumbers, [data.serial]);
  const none = await srv.api("GET", `/apple/v1/devices/appareil1/registrations/pass.test.bestburger?passesUpdatedSince=${list.data.lastUpdated}`);
  assert.equal(none.status, 204);

  srv.calls.push.length = 0;
  await new Promise(r => setTimeout(r, 5));
  await srv.api("POST", `/api/comptoir/membres/${data.serial}/tampons`, { headers: staff, body: {} });
  assert.deepEqual(srv.calls.push, [["abc"]], "l'iPhone inscrit est notifié");
  const changed = await srv.api("GET", `/apple/v1/devices/appareil1/registrations/pass.test.bestburger?passesUpdatedSince=${list.data.lastUpdated}`);
  assert.deepEqual(changed.data.serialNumbers, [data.serial]);

  const latest = await srv.api("GET", `/apple/v1/passes/pass.test.bestburger/${data.serial}`, { headers: auth });
  assert.equal(JSON.parse(unzip(latest.data)["pass.json"]).storeCard.headerFields[0].value, "1/10");

  assert.equal((await srv.api("DELETE", reg, { headers: auth })).status, 200);
  assert.deepEqual(srv.store.pushTokens(data.serial), []);
  assert.equal((await srv.api("POST", "/apple/v1/log", { body: { logs: ["test"] } })).status, 200);
});

test("Google Wallet : lien d'ajout signé avec la carte du client", async () => {
  const { data } = await signup("android@example.fr");
  const res = await srv.api("GET", `/api/cartes/${data.serial}/google?t=${data.token}`);
  assert.equal(res.status, 302);
  const jwt = res.headers.get("location").replace("https://pay.google.com/gp/v/save/", "");
  const [h, p, s] = jwt.split(".");
  assert.ok(crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), config.googlePublicKey, Buffer.from(s, "base64url")));
  const payload = JSON.parse(Buffer.from(p, "base64url"));
  assert.equal(payload.typ, "savetowallet");
  assert.deepEqual(payload.origins, ["https://redahfir.github.io"]);
  const object = payload.payload.loyaltyObjects[0];
  assert.equal(object.id, `3388000000012345678.${data.serial}`);
  assert.equal(object.classId, "3388000000012345678.best-burger-fidelite");
  assert.equal(object.barcode.value, data.carte.code);
  assert.equal(object.heroImage.sourceUri.uri, `https://fidelite.example/visuels/google/0-10.png?v=${visuel().version}`);
  assert.equal(object.heroImage.contentDescription.defaultValue.value, "0 tampon sur 10");
});

test("Google Wallet : bannière des tampons publique, mise en cache, limitée à la règle en cours", async () => {
  const res = await srv.api("GET", "/visuels/google/4-10.png");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.match(res.headers.get("cache-control"), /immutable/);
  const png = decodePng(res.data);
  assert.deepEqual([png.width, png.height], [1032, 336]);
  for (const url of ["/visuels/google/4-9.png", "/visuels/google/11-10.png", "/visuels/google/a-10.png"]) {
    assert.equal((await srv.api("GET", url)).status, 404, url);
  }
});

test("RGPD : le client peut supprimer sa carte", async () => {
  const { data } = await signup("supprimer@example.fr");
  const headers = { authorization: `Bearer ${data.token}` };
  assert.equal((await srv.api("DELETE", `/api/cartes/${data.serial}`, { headers })).status, 204);
  assert.equal((await srv.api("GET", `/api/cartes/${data.serial}`, { headers })).status, 404);
  assert.equal((await signup("supprimer@example.fr")).status, 201, "l'adresse peut se réinscrire");
});

test("RGPD : les cartes inactives depuis trop longtemps sont purgées", async () => {
  const { data } = await signup("ancien@example.fr");
  srv.store.db.prepare("UPDATE membres SET cree_le = 0 WHERE serial = ?").run(data.serial);
  assert.ok(srv.store.purgeInactive(1000) >= 1);
  assert.equal(srv.store.getBySerial(data.serial), undefined);
});

test("CORS : seul le site autorisé peut appeler l'API", async () => {
  const ok = await srv.api("OPTIONS", "/api/inscription", { headers: { origin: "https://redahfir.github.io" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://redahfir.github.io");
  const ko = await srv.api("OPTIONS", "/api/inscription", { headers: { origin: "https://pirate.example" } });
  assert.equal(ko.headers.get("access-control-allow-origin"), null);
});

test("sans Apple ni Google configurés, les liens Wallet répondent 503", async () => {
  const s = await startServer({ ...config, apple: null, google: null });
  const { data } = await s.api("POST", "/api/inscription", { body: { prenom: "Léa", email: "lea@example.fr", consentement: true } });
  assert.deepEqual(data.carte.wallets, { apple: false, google: false });
  assert.equal((await s.api("GET", `/api/cartes/${data.serial}/apple?t=${data.token}`)).status, 503);
  assert.equal((await s.api("GET", `/api/cartes/${data.serial}/google?t=${data.token}`)).status, 503);
  await s.close();
});
