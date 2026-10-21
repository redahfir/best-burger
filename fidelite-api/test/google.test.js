import { test } from "node:test";
import assert from "node:assert/strict";
import { createGoogleClient } from "../src/google.js";
import { testConfig } from "./helpers.js";

test("Google Wallet : jeton OAuth mis en cache et carte mise à jour", async () => {
  const config = testConfig();
  const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("oauth2")) return { ok: true, json: async () => ({ access_token: "jeton", expires_in: 3600 }) };
    return { ok: !url.includes("inconnu"), status: url.includes("inconnu") ? 404 : 200 };
  };
  const client = createGoogleClient(config, fakeFetch);
  const member = { serial: "abc", code: "BB-AAAAAA", prenom: "Inès", tampons: 4, recompenses: 1 };
  assert.equal(await client.updateMember(member), true);
  assert.equal(await client.updateMember({ ...member, serial: "inconnu" }), false, "carte jamais ajoutée : ignorée");
  assert.equal(requests.filter(r => r.url.includes("oauth2")).length, 1);
  const patch = requests.find(r => r.options.method === "PATCH");
  assert.match(patch.url, /loyaltyObject\/3388000000012345678\.abc$/);
  assert.equal(patch.options.headers.authorization, "Bearer jeton");
  assert.deepEqual(JSON.parse(patch.options.body).loyaltyPoints.balance, { string: "4/10" });
});
