// API de la carte fidélité : inscription, cartes Wallet, comptoir et service web Apple.
import crypto from "node:crypto";
import { visuel } from "./visuel.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 .-]{6,20}$/;

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Limiteur en mémoire : suffisant pour un seul serveur.
function limiter(max, windowMs) {
  const hits = new Map();
  const live = key => {
    const entry = hits.get(key);
    if (entry && Date.now() > entry.reset) { hits.delete(key); return null; }
    return entry;
  };
  const hit = key => {
    const t = Date.now();
    // Oublie les fenêtres expirées pour que la mémoire ne grossisse pas sans fin.
    if (hits.size > 10_000) hits.forEach((e, k) => { if (t > e.reset) hits.delete(k); });
    const entry = live(key);
    if (!entry) { hits.set(key, { count: 1, reset: t + windowMs }); return true; }
    entry.count += 1;
    return entry.count <= max;
  };
  hit.blocked = key => (live(key)?.count || 0) >= max;
  return hit;
}

// En-têtes de sécurité : l'API ne renvoie que du JSON ou des fichiers, jamais de page à afficher.
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

// Réponse avec un statut ou un contenu particulier ; sinon le gestionnaire renvoie du JSON simple.
const REPLY = Symbol("reply");
const reply = (status, extra = {}) => ({ [REPLY]: true, status, ...extra });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000) throw new HttpError(413, "Requête trop volumineuse.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "JSON invalide."); }
}

export function createApp({ config, store, wallet, log = console }) {
  const signupLimit = limiter(config.inscriptionsParHeure, 60 * 60_000);
  const staffFailures = limiter(10, 15 * 60_000);

  const publicView = m => ({
    code: m.code, prenom: m.prenom, tampons: m.tampons, recompenses: m.recompenses, passages: m.passages,
    tamponsRequis: config.tamponsRequis, recompense: config.recompense,
    wallets: { apple: Boolean(config.apple), google: Boolean(config.google) },
  });
  const staffView = m => ({ ...publicView(m), serial: m.serial, email: m.email, telephone: m.telephone,
    dernierPassage: m.dernier_passage, creeLe: m.cree_le });

  // Les mises à jour Wallet partent en arrière-plan : le comptoir n'attend pas Apple ni Google.
  const notify = member => {
    const jobs = [];
    if (config.apple) {
      jobs.push(wallet.pushApple(store.pushTokens(member.serial), config.apple)
        .then(invalid => invalid.forEach(t => store.forgetPushToken(t))));
    }
    if (config.google) jobs.push(wallet.google.updateMember(member));
    return Promise.allSettled(jobs).then(results => results
      .filter(r => r.status === "rejected").forEach(r => log.error("Mise à jour Wallet :", r.reason?.message)));
  };

  // Derrière un proxy, seule la dernière adresse est ajoutée par lui ; les précédentes viennent du client.
  const clientIp = req => (config.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",").at(-1).trim())
    || req.socket.remoteAddress;

  function memberFromToken(serial, token) {
    const m = store.getBySerial(serial);
    if (!m || !token || !safeEqual(m.token, token)) throw new HttpError(404, "Carte introuvable.");
    return m;
  }

  function requireStaff(req) {
    const ip = clientIp(req);
    if (!config.staffSecret) throw new HttpError(503, "Le comptoir n'est pas configuré (STAFF_SECRET).");
    // Le blocage passe avant la vérification : sinon on pourrait continuer à deviner le code.
    if (staffFailures.blocked(ip)) throw new HttpError(429, "Trop d'essais. Réessayez dans 15 minutes.");
    const auth = String(req.headers.authorization || "");
    if (auth.startsWith("Bearer ") && safeEqual(auth.slice(7), config.staffSecret)) return;
    staffFailures(ip);
    throw new HttpError(401, "Code comptoir incorrect.");
  }

  const routes = [
    ["GET", /^\/sante$/, () => ({ ok: true })],

    ["GET", /^\/api\/config$/, () => ({
      tamponsRequis: config.tamponsRequis, recompense: config.recompense,
      wallets: { apple: Boolean(config.apple), google: Boolean(config.google) },
    })],

    ["POST", /^\/api\/inscription$/, async ({ req }) => {
      const body = await readJson(req);
      const prenom = String(body.prenom || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const telephone = String(body.telephone || "").trim();
      if (!prenom || prenom.length > 40) throw new HttpError(400, "Indiquez votre prénom (40 caractères maximum).");
      if (!EMAIL.test(email)) throw new HttpError(400, "Adresse e-mail invalide.");
      if (telephone && !PHONE.test(telephone)) throw new HttpError(400, "Numéro de téléphone invalide.");
      if (body.consentement !== true) throw new HttpError(400, "Merci d'accepter l'utilisation de vos données pour la carte fidélité.");
      if (!signupLimit(clientIp(req))) throw new HttpError(429, "Trop d'inscriptions depuis cette connexion. Réessayez plus tard.");
      if (store.getByEmail(email)) {
        throw new HttpError(409, "Cette adresse a déjà une carte. Retrouvez-la dans votre Wallet ou demandez-la au comptoir.");
      }
      const m = store.createMember({ prenom, email, telephone });
      return reply(201, { body: { serial: m.serial, token: m.token, carte: publicView(m) } });
    }],

    ["GET", /^\/api\/cartes\/([\w-]+)$/, ({ req, params }) =>
      publicView(memberFromToken(params[0], String(req.headers.authorization || "").replace(/^Bearer /, "")))],

    ["DELETE", /^\/api\/cartes\/([\w-]+)$/, async ({ req, params }) => {
      const m = memberFromToken(params[0], String(req.headers.authorization || "").replace(/^Bearer /, ""));
      store.remove(m.serial);
      if (config.google) wallet.google.expireMember(m).catch(e => log.error("Google Wallet :", e.message));
      return reply(204);
    }],

    ["GET", /^\/api\/cartes\/([\w-]+)\/apple$/, ({ params, url }) => {
      if (!config.apple) throw new HttpError(503, "Apple Wallet n'est pas encore configuré.");
      const m = memberFromToken(params[0], url.searchParams.get("t"));
      return reply(200, { raw: wallet.buildApplePass(m, config), headers: {
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": 'attachment; filename="best-burger-fidelite.pkpass"',
        "cache-control": "no-store",
      } });
    }],

    ["GET", /^\/api\/cartes\/([\w-]+)\/google$/, ({ params, url }) => {
      if (!config.google) throw new HttpError(503, "Google Wallet n'est pas encore configuré.");
      const m = memberFromToken(params[0], url.searchParams.get("t"));
      return reply(302, { headers: { location: wallet.saveUrl(m, config), "cache-control": "no-store" } });
    }],

    // Bannière Google Wallet : la même pour tous les clients au même nombre de tampons, rien de personnel.
    ["GET", /^\/visuels\/google\/(\d{1,2})-(\d{1,2})\.png$/, ({ params }) => {
      const [filled, total] = params.map(Number);
      if (total !== config.tamponsRequis || filled > total) throw new HttpError(404, "Introuvable.");
      return reply(200, { raw: visuel().render({ format: "google", total, filled }), headers: {
        "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable",
      } });
    }],

    ["GET", /^\/api\/comptoir\/membres$/, ({ req, url }) => {
      requireStaff(req);
      const code = (url.searchParams.get("code") || "").trim().toUpperCase().replace(/^BB-?/, "");
      if (code) {
        const m = store.getByCode(`BB-${code}`);
        return { membres: m ? [staffView(m)] : [] };
      }
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 3) throw new HttpError(400, "Saisissez au moins 3 caractères.");
      return { membres: store.search(q).map(staffView) };
    }],

    ["POST", /^\/api\/comptoir\/membres\/([\w-]+)\/tampons$/, async ({ req, params }) => {
      requireStaff(req);
      const body = await readJson(req);
      const nombre = body.nombre === undefined ? 1 : Number(body.nombre);
      if (!Number.isInteger(nombre) || nombre < 1 || nombre > 10) throw new HttpError(400, "Nombre de tampons invalide (1 à 10).");
      const m = store.addStamps(params[0], nombre, config.tamponsRequis);
      if (!m) throw new HttpError(404, "Carte introuvable.");
      notify(m);
      return { membre: staffView(m) };
    }],

    ["POST", /^\/api\/comptoir\/membres\/([\w-]+)\/recompense$/, ({ req, params }) => {
      requireStaff(req);
      if (!store.getBySerial(params[0])) throw new HttpError(404, "Carte introuvable.");
      const m = store.useReward(params[0]);
      if (!m) throw new HttpError(409, "Aucune récompense disponible sur cette carte.");
      notify(m);
      return { membre: staffView(m) };
    }],

    // --- Service web Apple Wallet (https://developer.apple.com/documentation/walletpasses) ---
    ["POST", /^\/apple\/v1\/devices\/([\w.-]+)\/registrations\/([\w.-]+)\/([\w-]+)$/, async ({ req, params }) => {
      const [device, passType, serial] = params;
      const m = appleAuth(req, passType, serial);
      const body = await readJson(req);
      if (!body.pushToken) throw new HttpError(400, "pushToken manquant.");
      return reply(store.registerDevice(device, m.serial, String(body.pushToken)) ? 201 : 200);
    }],
    ["DELETE", /^\/apple\/v1\/devices\/([\w.-]+)\/registrations\/([\w.-]+)\/([\w-]+)$/, ({ req, params }) => {
      const [device, passType, serial] = params;
      appleAuth(req, passType, serial);
      store.unregisterDevice(device, serial);
      return reply(200);
    }],
    ["GET", /^\/apple\/v1\/devices\/([\w.-]+)\/registrations\/([\w.-]+)$/, ({ params, url }) => {
      const [device, passType] = params;
      if (!config.apple || passType !== config.apple.passTypeIdentifier) return reply(204);
      const since = Number(url.searchParams.get("passesUpdatedSince")) || 0;
      const rows = store.updatedSince(device, since);
      if (!rows.length) return reply(204);
      return { serialNumbers: rows.map(r => r.serial), lastUpdated: String(Math.max(...rows.map(r => r.modifie_le))) };
    }],
    ["GET", /^\/apple\/v1\/passes\/([\w.-]+)\/([\w-]+)$/, ({ req, params }) => {
      const m = appleAuth(req, params[0], params[1]);
      return reply(200, { raw: wallet.buildApplePass(m, config), headers: {
        "content-type": "application/vnd.apple.pkpass",
        "last-modified": new Date(m.modifie_le).toUTCString(),
      } });
    }],
    ["POST", /^\/apple\/v1\/log$/, async ({ req }) => {
      const body = await readJson(req);
      (body.logs || []).slice(0, 20).forEach(line => log.warn("Apple Wallet :", String(line).slice(0, 500)));
      return reply(200);
    }],
  ];

  function appleAuth(req, passType, serial) {
    if (!config.apple || passType !== config.apple.passTypeIdentifier) throw new HttpError(401, "Non autorisé.");
    const m = store.getBySerial(serial);
    const auth = String(req.headers.authorization || "");
    if (!m || !auth.startsWith("ApplePass ") || !safeEqual(auth.slice(10), m.token)) throw new HttpError(401, "Non autorisé.");
    return m;
  }

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-headers", "authorization, content-type");
      res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("access-control-max-age", "600");
    }
  }

  return async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    try {
      for (const [method, pattern, handler] of routes) {
        const match = url.pathname.match(pattern);
        if (!match || method !== req.method) continue;
        const result = await handler({ req, url, params: match.slice(1) });
        if (result[REPLY]) {
          const { status, body, raw, headers = {} } = result;
          if (raw) { res.writeHead(status, headers).end(raw); return; }
          if (body !== undefined) {
            res.writeHead(status, { ...headers, "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
            return;
          }
          res.writeHead(status, headers).end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
          .end(JSON.stringify(result));
        return;
      }
      throw new HttpError(404, "Introuvable.");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) log.error(error);
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
        .end(JSON.stringify({ erreur: status === 500 ? "Erreur interne, réessayez." : error.message }));
    }
  };
}
