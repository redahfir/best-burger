// Point d'entrée : node src/server.js (variables d'environnement, voir .env.example).
import http from "node:http";
import { loadConfig } from "./config.js";
import { openStore } from "./store.js";
import { createApp } from "./app.js";
import { buildApplePass, pushApple } from "./apple.js";
import { createGoogleClient, saveUrl } from "./google.js";

const config = loadConfig();
const store = openStore(config.databasePath);
const wallet = {
  buildApplePass,
  pushApple,
  saveUrl,
  google: config.google ? createGoogleClient(config) : null,
};

// Conservation : trois ans après le dernier passage (voir les mentions légales du site).
const THREE_YEARS = 3 * 365 * 24 * 3600_000;
const purge = () => {
  const removed = store.purgeInactive(THREE_YEARS);
  if (removed) console.log(`${removed} carte(s) inactive(s) depuis 3 ans supprimée(s).`);
};
purge();
setInterval(purge, 24 * 3600_000).unref();

http.createServer(createApp({ config, store, wallet })).listen(config.port, () => {
  console.log(`Fidélité BEST BURGER sur le port ${config.port}`);
  console.log(`Apple Wallet : ${config.apple ? "activé" : "non configuré"} · Google Wallet : ${config.google ? "activé" : "non configuré"}`);
  if (!config.staffSecret) console.log("Comptoir désactivé : définir STAFF_SECRET.");
});
