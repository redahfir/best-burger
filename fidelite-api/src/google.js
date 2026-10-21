// Google Wallet : lien « Ajouter à Google Wallet » (JWT signé) et mise à jour des cartes.
import crypto from "node:crypto";

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
const b64url = input => Buffer.from(typeof input === "string" ? input : JSON.stringify(input)).toString("base64url");

export function signJwt(payload, privateKey) {
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(payload)}`;
  return `${unsigned}.${crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
}

const classId = google => `${google.issuerId}.${google.classSuffix}`;
const objectId = (google, member) => `${google.issuerId}.${member.serial}`;

export function loyaltyClass(config) {
  return {
    id: classId(config.google),
    issuerName: "BEST BURGER",
    programName: "Carte fidélité",
    programLogo: { sourceUri: { uri: `${config.siteUrl}/img/apple-touch-icon.png` },
      contentDescription: { defaultValue: { language: "fr-FR", value: "Logo BEST BURGER" } } },
    hexBackgroundColor: "#0d0d0d",
    countryCode: "FR",
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
  };
}

export function loyaltyObject(member, config) {
  return {
    id: objectId(config.google, member),
    classId: classId(config.google),
    state: "ACTIVE",
    accountId: member.code,
    accountName: member.prenom,
    loyaltyPoints: { label: "Tampons", balance: { string: `${member.tampons}/${config.tamponsRequis}` } },
    secondaryLoyaltyPoints: { label: "Récompenses", balance: { int: member.recompenses } },
    barcode: { type: "QR_CODE", value: member.code, alternateText: member.code },
    textModulesData: [{ id: "regle", header: "Comment ça marche",
      body: `Un tampon par passage en caisse. Au bout de ${config.tamponsRequis} tampons : ${config.recompense.toLowerCase()}.` }],
    linksModuleData: { uris: [{ id: "carte", uri: `${config.siteUrl}/carte.html`, description: "Voir ou supprimer ma carte" }] },
  };
}

// Le JWT contient la classe et l'objet : Google les crée au premier enregistrement.
export function saveUrl(member, config) {
  const token = signJwt({
    iss: config.google.clientEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: [new URL(config.siteUrl).origin],
    payload: { loyaltyClasses: [loyaltyClass(config)], loyaltyObjects: [loyaltyObject(member, config)] },
  }, config.google.privateKey);
  return `https://pay.google.com/gp/v/save/${token}`;
}

export function createGoogleClient(config, fetchImpl = fetch) {
  let cached = { token: null, expires: 0 };
  async function accessToken() {
    if (cached.token && Date.now() < cached.expires - 60_000) return cached.token;
    const iat = Math.floor(Date.now() / 1000);
    const assertion = signJwt({ iss: config.google.clientEmail, scope: "https://www.googleapis.com/auth/wallet_object.issuer",
      aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }, config.google.privateKey);
    const res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) throw new Error(`Google OAuth ${res.status}`);
    const data = await res.json();
    cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return cached.token;
  }

  return {
    // Met à jour la carte si le client l'a ajoutée ; 404 = jamais ajoutée, rien à faire.
    async updateMember(member) {
      const body = loyaltyObject(member, config);
      const res = await fetchImpl(`${API}/loyaltyObject/${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
        body: JSON.stringify({ loyaltyPoints: body.loyaltyPoints, secondaryLoyaltyPoints: body.secondaryLoyaltyPoints, accountName: body.accountName }),
      });
      if (!res.ok && res.status !== 404) throw new Error(`Google Wallet ${res.status}`);
      return res.ok;
    },
    async expireMember(member) {
      const id = objectId(config.google, member);
      const res = await fetchImpl(`${API}/loyaltyObject/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
        body: JSON.stringify({ state: "INACTIVE" }),
      });
      return res.ok;
    },
  };
}
