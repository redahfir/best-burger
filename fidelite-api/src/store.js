// Stockage SQLite (module node:sqlite intégré à Node 22, aucune dépendance).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Code lisible au comptoir : sans 0/O ni 1/I pour éviter les confusions.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const newCode = () => "BB-" + [...crypto.randomBytes(6)].map(b => ALPHABET[b % ALPHABET.length]).join("");

const now = () => Date.now();

export function openStore(databasePath) {
  if (databasePath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS membres (
      serial TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL,
      prenom TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      telephone TEXT,
      tampons INTEGER NOT NULL DEFAULT 0,
      recompenses INTEGER NOT NULL DEFAULT 0,
      passages INTEGER NOT NULL DEFAULT 0,
      cree_le INTEGER NOT NULL,
      modifie_le INTEGER NOT NULL,
      dernier_passage INTEGER
    );
    CREATE TABLE IF NOT EXISTS appareils_apple (
      appareil TEXT NOT NULL,
      serial TEXT NOT NULL REFERENCES membres(serial) ON DELETE CASCADE,
      push_token TEXT NOT NULL,
      PRIMARY KEY (appareil, serial)
    );
  `);

  const q = {
    insert: db.prepare(`INSERT INTO membres (serial, code, token, prenom, email, telephone, cree_le, modifie_le)
      VALUES (:serial, :code, :token, :prenom, :email, :telephone, :t, :t)`),
    bySerial: db.prepare("SELECT * FROM membres WHERE serial = ?"),
    byCode: db.prepare("SELECT * FROM membres WHERE code = ?"),
    byEmail: db.prepare("SELECT * FROM membres WHERE email = ?"),
    search: db.prepare(`SELECT * FROM membres WHERE email LIKE :q OR telephone LIKE :q OR prenom LIKE :q
      ORDER BY modifie_le DESC LIMIT 10`),
    update: db.prepare(`UPDATE membres SET tampons = :tampons, recompenses = :recompenses, passages = :passages,
      dernier_passage = :dernier_passage, modifie_le = :t WHERE serial = :serial`),
    remove: db.prepare("DELETE FROM membres WHERE serial = ?"),
    purge: db.prepare("DELETE FROM membres WHERE COALESCE(dernier_passage, cree_le) < ?"),
    register: db.prepare(`INSERT INTO appareils_apple (appareil, serial, push_token) VALUES (?, ?, ?)
      ON CONFLICT (appareil, serial) DO UPDATE SET push_token = excluded.push_token`),
    isRegistered: db.prepare("SELECT 1 FROM appareils_apple WHERE appareil = ? AND serial = ?"),
    unregister: db.prepare("DELETE FROM appareils_apple WHERE appareil = ? AND serial = ?"),
    unregisterToken: db.prepare("DELETE FROM appareils_apple WHERE push_token = ?"),
    pushTokens: db.prepare("SELECT DISTINCT push_token FROM appareils_apple WHERE serial = ?"),
    updatedFor: db.prepare(`SELECT m.serial, m.modifie_le FROM appareils_apple a JOIN membres m ON m.serial = a.serial
      WHERE a.appareil = ? AND m.modifie_le > ?`),
  };

  return {
    db,
    createMember({ prenom, email, telephone }) {
      const member = { serial: crypto.randomUUID(), code: newCode(), token: crypto.randomBytes(24).toString("hex") };
      for (let attempt = 0; ; attempt++) {
        try {
          q.insert.run({ ...member, prenom, email, telephone: telephone || null, t: now() });
          return q.bySerial.get(member.serial);
        } catch (error) {
          // Collision de code (très improbable) : on en tire un autre.
          if (attempt < 3 && String(error.message).includes("membres.code")) { member.code = newCode(); continue; }
          throw error;
        }
      }
    },
    getBySerial: serial => q.bySerial.get(serial),
    getByCode: code => q.byCode.get(code),
    getByEmail: email => q.byEmail.get(email),
    search: text => q.search.all({ q: `%${text}%` }),
    // Ajoute des tampons ; chaque carte complète devient une récompense.
    addStamps(serial, count, required) {
      const m = q.bySerial.get(serial);
      if (!m) return null;
      const total = m.tampons + count;
      const t = now();
      q.update.run({ serial, tampons: total % required, recompenses: m.recompenses + Math.floor(total / required),
        passages: m.passages + 1, dernier_passage: t, t });
      return q.bySerial.get(serial);
    },
    useReward(serial) {
      const m = q.bySerial.get(serial);
      if (!m || m.recompenses < 1) return null;
      q.update.run({ serial, tampons: m.tampons, recompenses: m.recompenses - 1, passages: m.passages,
        dernier_passage: m.dernier_passage, t: now() });
      return q.bySerial.get(serial);
    },
    remove: serial => q.remove.run(serial).changes > 0,
    // RGPD : supprime les cartes sans passage depuis `maxAgeMs`.
    purgeInactive: maxAgeMs => q.purge.run(Date.now() - maxAgeMs).changes,
    registerDevice: (device, serial, pushToken) => {
      const existed = Boolean(q.isRegistered.get(device, serial));
      q.register.run(device, serial, pushToken);
      return !existed;
    },
    unregisterDevice: (device, serial) => q.unregister.run(device, serial).changes > 0,
    forgetPushToken: token => q.unregisterToken.run(token),
    pushTokens: serial => q.pushTokens.all(serial).map(r => r.push_token),
    updatedSince: (device, since) => q.updatedFor.all(device, since),
    close: () => db.close(),
  };
}
