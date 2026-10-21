// Outils de test : faux certificats, serveur éphémère, lecture d'archive .pkpass.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createApp } from "../src/app.js";
import { openStore } from "../src/store.js";
import { buildApplePass } from "../src/apple.js";
import { saveUrl } from "../src/google.js";

// Certificats auto-signés qui remplacent ceux d'Apple (la signature est vérifiée, pas la chaîne).
export function fakeAppleCertificates() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pkpass-"));
  const run = args => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  run(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "wwdr.pem", "-days", "2", "-subj", "/CN=Faux WWDR"]);
  run(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "pass.key", "-out", "pass.csr", "-subj", "/CN=Pass Type ID: pass.test.bestburger"]);
  run(["x509", "-req", "-in", "pass.csr", "-CA", "wwdr.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "pass.pem", "-days", "2"]);
  const read = f => fs.readFileSync(path.join(dir, f), "utf8");
  return { dir, wwdr: read("wwdr.pem"), signerCert: read("pass.pem"), signerKey: read("pass.key") };
}

export function testConfig(overrides = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    port: 0,
    publicUrl: "https://fidelite.example",
    siteUrl: "https://redahfir.github.io/best-burger",
    allowedOrigins: ["https://redahfir.github.io"],
    databasePath: ":memory:",
    staffSecret: "secret-comptoir-123",
    trustProxy: false,
    inscriptionsParHeure: 1000,
    tamponsRequis: 10,
    recompense: "Un menu offert",
    apple: null,
    google: { issuerId: "3388000000012345678", clientEmail: "wallet@test.iam.gserviceaccount.com",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }), classSuffix: "best-burger-fidelite" },
    googlePublicKey: publicKey,
    ...overrides,
  };
}

export async function startServer(config) {
  const store = openStore(":memory:");
  const calls = { push: [], google: [] };
  const wallet = {
    buildApplePass,
    saveUrl,
    pushApple: async tokens => { calls.push.push(tokens); return []; },
    google: { updateMember: async m => { calls.google.push(m); return true; }, expireMember: async () => true },
  };
  const silent = { error() {}, warn() {} };
  const server = http.createServer(createApp({ config, store, wallet, log: silent }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, url, { body, headers = {} } = {}) => {
    const res = await fetch(base + url, { method, redirect: "manual",
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, data };
  };
  return { api, store, calls, close: () => new Promise(r => server.close(r)) };
}

// Lecteur ZIP minimal (répertoire central) pour inspecter un .pkpass.
export function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let p = buffer.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(p + 10), size = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28), extraLen = buffer.readUInt16LE(p + 30), commentLen = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
