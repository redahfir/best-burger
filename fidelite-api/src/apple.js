// Apple Wallet : génération du .pkpass signé et notification des iPhone (APNs).
import fs from "node:fs";
import http2 from "node:http2";
import { fileURLToPath } from "node:url";
import { PKPass } from "passkit-generator";
import { renderStrip } from "./strip.js";

const assetsDir = fileURLToPath(new URL("../assets/apple/", import.meta.url));
const images = Object.fromEntries(fs.readdirSync(assetsDir).filter(f => f.endsWith(".png"))
  .map(f => [f, fs.readFileSync(assetsDir + f)]));

export function buildApplePass(member, config) {
  const { apple, tamponsRequis, recompense } = config;
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: apple.passTypeIdentifier,
    teamIdentifier: apple.teamIdentifier,
    serialNumber: member.serial,
    organizationName: "BEST BURGER",
    description: "Carte fidélité BEST BURGER",
    logoText: "Fidélité",
    backgroundColor: "rgb(13, 13, 13)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(255, 206, 0)",
    webServiceURL: `${config.publicUrl}/apple`,
    authenticationToken: member.token,
    sharingProhibited: true,
    storeCard: {
      headerFields: [{ key: "tampons", label: "TAMPONS", value: `${member.tampons}/${tamponsRequis}`,
        changeMessage: "Nouveau tampon ! Vous en êtes à %@" }],
      secondaryFields: [{ key: "membre", label: "MEMBRE", value: member.prenom }],
      auxiliaryFields: [{ key: "recompenses", label: "RÉCOMPENSES", value: member.recompenses,
        textAlignment: "PKTextAlignmentRight",
        changeMessage: `Récompense disponible : ${recompense} (%@ à utiliser)` }],
      backFields: [
        { key: "regle", label: "Comment ça marche",
          value: `Un tampon par passage en caisse. Au bout de ${tamponsRequis} tampons : ${recompense.toLowerCase()}. Présentez le QR code au comptoir.` },
        { key: "code", label: "Votre code", value: member.code },
        { key: "carte", label: "Votre carte en ligne", value: `${config.siteUrl}/carte.html`,
          attributedValue: `<a href="${config.siteUrl}/carte.html">Voir ou supprimer ma carte</a>` },
        { key: "adresse", label: "BEST BURGER", value: "9 Place du 11 novembre, 59230 Saint-Amand-les-Eaux · 03 27 21 09 12" },
      ],
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: member.code, messageEncoding: "iso-8859-1", altText: member.code }],
  };

  const filled = member.tampons;
  const pass = new PKPass({
    ...images,
    "strip.png": renderStrip({ width: 375, height: 123, total: tamponsRequis, filled }),
    "strip@2x.png": renderStrip({ width: 750, height: 246, total: tamponsRequis, filled }),
    "strip@3x.png": renderStrip({ width: 1125, height: 369, total: tamponsRequis, filled }),
    "pass.json": Buffer.from(JSON.stringify(passJson)),
  }, {
    wwdr: apple.wwdr,
    signerCert: apple.signerCert,
    signerKey: apple.signerKey,
    signerKeyPassphrase: apple.signerKeyPassphrase,
  });
  return pass.getAsBuffer();
}

// Prévient chaque iPhone que la carte a changé ; il vient ensuite chercher la nouvelle version.
// Renvoie les jetons refusés par Apple (appareil désinscrit) pour qu'on les oublie.
export async function pushApple(pushTokens, apple) {
  if (!pushTokens.length) return [];
  const client = http2.connect(apple.apnsHost, { cert: apple.signerCert, key: apple.signerKey, passphrase: apple.signerKeyPassphrase });
  client.on("error", () => {});
  const invalid = [];
  try {
    await Promise.all(pushTokens.map(token => new Promise(resolve => {
      const req = client.request({ ":method": "POST", ":path": `/3/device/${token}`, "apns-topic": apple.passTypeIdentifier });
      req.on("response", headers => { if (headers[":status"] === 410) invalid.push(token); });
      req.on("error", resolve);
      req.on("close", resolve);
      req.end("{}");
      req.resume();
    })));
  } finally {
    client.close();
  }
  return invalid;
}
