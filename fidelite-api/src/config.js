// Lecture de la configuration (variables d'environnement, voir .env.example).
import fs from "node:fs";

// Une valeur peut contenir directement le PEM/JSON ou le chemin d'un fichier.
function readSecret(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("-----BEGIN") || trimmed.startsWith("{")) return trimmed.replace(/\\n/g, "\n");
  return fs.readFileSync(trimmed, "utf8");
}

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function loadConfig(env = process.env) {
  const siteUrl = (env.SITE_URL || "https://redahfir.github.io/best-burger").replace(/\/$/, "");
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${env.PORT || 8787}`).replace(/\/$/, "");
  const config = {
    port: int(env.PORT, 8787),
    publicUrl,
    siteUrl,
    allowedOrigins: (env.ALLOWED_ORIGINS || new URL(siteUrl).origin).split(",").map(s => s.trim()).filter(Boolean),
    databasePath: env.DATABASE_PATH || "./data/fidelite.sqlite",
    staffSecret: env.STAFF_SECRET || "",
    trustProxy: env.TRUST_PROXY === "1",
    // Limite par adresse IP ; le wifi du restaurant partage une seule adresse.
    inscriptionsParHeure: int(env.INSCRIPTIONS_PAR_HEURE, 30),
    tamponsRequis: Math.min(int(env.TAMPONS_REQUIS, 10), 12),
    recompense: env.RECOMPENSE || "Un menu offert",
    apple: null,
    google: null,
  };

  if (env.APPLE_PASS_TYPE_ID && env.APPLE_TEAM_ID && env.APPLE_PASS_CERT && env.APPLE_PASS_KEY && env.APPLE_WWDR_CERT) {
    config.apple = {
      passTypeIdentifier: env.APPLE_PASS_TYPE_ID,
      teamIdentifier: env.APPLE_TEAM_ID,
      signerCert: readSecret(env.APPLE_PASS_CERT),
      signerKey: readSecret(env.APPLE_PASS_KEY),
      signerKeyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE || undefined,
      wwdr: readSecret(env.APPLE_WWDR_CERT),
      apnsHost: env.APPLE_APNS_HOST || "https://api.push.apple.com",
    };
  }

  if (env.GOOGLE_ISSUER_ID && env.GOOGLE_SERVICE_ACCOUNT) {
    const account = JSON.parse(readSecret(env.GOOGLE_SERVICE_ACCOUNT));
    config.google = {
      issuerId: env.GOOGLE_ISSUER_ID,
      clientEmail: account.client_email,
      privateKey: account.private_key,
      classSuffix: env.GOOGLE_CLASS_SUFFIX || "best-burger-fidelite",
    };
  }

  if (config.staffSecret && config.staffSecret.length < 12) {
    throw new Error("STAFF_SECRET doit contenir au moins 12 caractères.");
  }
  return config;
}
