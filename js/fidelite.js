/* BEST BURGER — carte fidélité : inscription, « Ma carte » et comptoir. */
(function () {
  "use strict";

  // Pages fidélité jamais affichées dans le cadre d'un autre site (piège au clic sur « supprimer » ou « +1 tampon »).
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }

  // Adresse du serveur fidélité (dossier fidelite-api). Vide : la fidélité en ligne reste masquée.
  const API_URL = "https://best-burger.tailf6d117.ts.net";

  const CARD_KEY = "best-burger-carte";
  const STAFF_KEY = "best-burger-comptoir";
  const storage = {
    get(key) { try { return JSON.parse(window.localStorage.getItem(key)); } catch (_) { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* stockage bloqué */ } },
    remove(key) { try { window.localStorage.removeItem(key); } catch (_) { /* stockage bloqué */ } },
  };

  async function api(path, { method = "GET", body, token } = {}) {
    const headers = {};
    if (body) headers["content-type"] = "application/json";
    if (token) headers.authorization = "Bearer " + token;
    let res;
    try {
      res = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (_) {
      throw Object.assign(new Error("Connexion impossible. Vérifiez votre réseau et réessayez."), { status: 0 });
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.erreur || "Une erreur est survenue."), { status: res.status });
    return data;
  }

  const setStatus = (el, text, isError = false) => {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-error", isError);
  };

  // Remplit une carte visuelle (.loyalty-card) avec les tampons du client.
  function fillCard(card, data) {
    const set = (name, value) => card.querySelectorAll(`[data-field="${name}"]`).forEach(el => { el.textContent = value; });
    set("tampons", data.tampons);
    set("requis", data.tamponsRequis);
    set("prenom", data.prenom);
    set("code", data.code);
    const stamps = card.querySelector("[data-stamps]");
    stamps.textContent = "";
    for (let i = 0; i < data.tamponsRequis; i++) {
      const stamp = document.createElement("span");
      stamp.className = "stamp" + (i < data.tampons ? " is-on" : "");
      stamps.appendChild(stamp);
    }
    stamps.setAttribute("aria-label", `${data.tampons} tampons sur ${data.tamponsRequis}`);
    stamps.setAttribute("role", "img");
  }

  const onReady = (fn) => document.readyState !== "loading"
    ? fn() : document.addEventListener("DOMContentLoaded", fn);

  onReady(function () {
    // ----- Inscription (fidelite.html) -----
    const form = document.querySelector("[data-fidelite-inscription]");
    if (form) {
      const status = form.querySelector("[data-status]");
      const saved = storage.get(CARD_KEY);
      if (saved && saved.serial) document.querySelector("[data-saved-card]").hidden = false;
      if (!API_URL) {
        form.hidden = true;
        document.querySelector("[data-unavailable]").hidden = false;
      } else {
        api("/api/config").then(cfg => {
          document.querySelectorAll('[data-field="requis"]').forEach(el => { el.textContent = cfg.tamponsRequis; });
          document.querySelectorAll('[data-field="recompense"]').forEach(el => { el.textContent = cfg.recompense.toLowerCase(); });
        }).catch(() => {});
      }
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fields = form.elements;
        const invalid = [...fields].find(el => el.willValidate && !el.checkValidity());
        if (invalid) {
          setStatus(status, invalid.type === "checkbox"
            ? "Merci d'accepter l'utilisation de vos données pour la carte fidélité."
            : "Vérifiez le champ « " + form.querySelector(`label[for="${invalid.id}"]`).firstChild.textContent.trim() + " ».", true);
          invalid.focus();
          return;
        }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        setStatus(status, "Création de votre carte…");
        try {
          const data = await api("/api/inscription", { method: "POST", body: {
            prenom: fields.prenom.value, email: fields.email.value, telephone: fields.telephone.value,
            consentement: fields.consentement.checked,
          } });
          storage.set(CARD_KEY, { serial: data.serial, token: data.token });
          window.location.href = "carte.html#" + data.serial + "." + data.token;
        } catch (error) {
          setStatus(status, error.message, true);
          button.disabled = false;
        }
      });
    }

    // ----- Ma carte (carte.html) -----
    const cardPage = document.querySelector("[data-fidelite-carte]");
    if (cardPage) {
      const status = cardPage.querySelector("[data-status]");
      const [serial, token] = window.location.hash.slice(1).split(".");
      const access = serial && token ? { serial, token } : storage.get(CARD_KEY);
      const showNoCard = () => {
        setStatus(status, "");
        cardPage.querySelector("[data-card-content]").hidden = true;
        cardPage.querySelector("[data-no-card]").hidden = false;
      };
      if (!API_URL || !access || !access.serial) {
        showNoCard();
      } else {
        api("/api/cartes/" + encodeURIComponent(access.serial), { token: access.token }).then(data => {
          storage.set(CARD_KEY, access);
          if (!window.location.hash) history.replaceState(null, "", "#" + access.serial + "." + access.token);
          setStatus(status, "");
          cardPage.querySelector("[data-card-content]").hidden = false;
          fillCard(cardPage.querySelector("[data-card]"), data);
          const reward = cardPage.querySelector("[data-reward]");
          reward.hidden = data.recompenses < 1;
          reward.textContent = `🎉 ${data.recompenses > 1 ? data.recompenses + " récompenses" : "1 récompense"} à utiliser : ${data.recompense.toLowerCase()}. Montrez votre QR code au comptoir.`;
          const base = API_URL + "/api/cartes/" + encodeURIComponent(access.serial);
          const q = "?t=" + encodeURIComponent(access.token);
          const apple = cardPage.querySelector('[data-wallet="apple"]');
          const google = cardPage.querySelector('[data-wallet="google"]');
          if (data.wallets.apple) { apple.href = base + "/apple" + q; apple.hidden = false; }
          if (data.wallets.google) { google.href = base + "/google" + q; google.hidden = false; }
          cardPage.querySelector("[data-wallet-missing]").hidden = data.wallets.apple || data.wallets.google;
        }).catch(error => {
          if (error.status === 404) { storage.remove(CARD_KEY); showNoCard(); }
          else setStatus(status, error.message, true);
        });
      }

      // Suppression en deux clics pour éviter une erreur, sans boîte de dialogue.
      const del = cardPage.querySelector("[data-delete]");
      del.addEventListener("click", async () => {
        if (!del.dataset.confirm) {
          del.dataset.confirm = "1";
          del.textContent = "Confirmer : supprimer définitivement ma carte";
          return;
        }
        try {
          await api("/api/cartes/" + encodeURIComponent(access.serial), { method: "DELETE", token: access.token });
          storage.remove(CARD_KEY);
          history.replaceState(null, "", window.location.pathname);
          showNoCard();
          setStatus(status, "Votre carte et vos données ont été supprimées.");
        } catch (error) {
          setStatus(status, error.message, true);
        }
      });
    }

    // ----- Comptoir (comptoir.html, réservé à l'équipe) -----
    const desk = document.querySelector("[data-fidelite-comptoir]");
    if (desk) {
      const login = desk.querySelector("[data-login]");
      const panel = desk.querySelector("[data-desk]");
      const search = desk.querySelector("[data-search]");
      const results = desk.querySelector("[data-results]");
      const status = desk.querySelector("[data-status]");
      let secret = storage.get(STAFF_KEY);

      const showDesk = (on) => {
        login.hidden = on;
        panel.hidden = !on;
        if (on) search.elements.code.focus();
      };
      const staffApi = (path, options = {}) => api(path, { ...options, token: secret }).catch(error => {
        if (error.status === 401) { storage.remove(STAFF_KEY); secret = null; showDesk(false); }
        throw error;
      });

      const render = (membres) => {
        results.textContent = "";
        membres.forEach(m => {
          const item = document.createElement("article");
          item.className = "info-card counter-member";
          const title = document.createElement("h2");
          title.textContent = `${m.prenom} · ${m.code}`;
          const meta = document.createElement("p");
          meta.className = "loyalty-note";
          meta.textContent = [m.email, m.telephone].filter(Boolean).join(" · ");
          const count = document.createElement("p");
          count.className = "counter-member__count";
          count.textContent = `${m.tampons}/${m.tamponsRequis} tampons` +
            (m.recompenses ? ` · ${m.recompenses} récompense${m.recompenses > 1 ? "s" : ""} à utiliser` : "");
          const actions = document.createElement("div");
          actions.className = "form__row";
          const action = (label, path, body, ghost) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "btn" + (ghost ? " btn--ghost" : "");
            b.textContent = label;
            b.addEventListener("click", async () => {
              b.disabled = true;
              try {
                const data = await staffApi(`/api/comptoir/membres/${encodeURIComponent(m.serial)}/${path}`, { method: "POST", body: body || {} });
                setStatus(status, path === "tampons"
                  ? `Tampon ajouté pour ${m.prenom}.` + (data.membre.recompenses > m.recompenses ? " 🎉 Carte complète : récompense gagnée !" : "")
                  : `Récompense utilisée pour ${m.prenom}.`);
                render([data.membre]);
              } catch (error) {
                setStatus(status, error.message, true);
                b.disabled = false;
              }
            });
            actions.appendChild(b);
          };
          action("+1 tampon", "tampons", { nombre: 1 });
          action("+2", "tampons", { nombre: 2 }, true);
          if (m.recompenses > 0) action("Utiliser la récompense", "recompense", null, true);
          item.append(title, meta, count, actions);
          results.appendChild(item);
        });
      };

      const lookup = async (text) => {
        const value = text.trim();
        if (!value) return;
        setStatus(status, "Recherche…");
        results.textContent = "";
        const isCode = /^(BB-?)?[2-9A-HJ-NP-Z]{6}$/i.test(value);
        try {
          const data = await staffApi("/api/comptoir/membres?" + (isCode ? "code=" : "q=") + encodeURIComponent(value));
          setStatus(status, data.membres.length ? "" : "Aucune carte trouvée.", !data.membres.length);
          render(data.membres);
        } catch (error) {
          setStatus(status, error.message, true);
        }
      };

      if (!API_URL) {
        login.hidden = true;
        setStatus(status, "Le serveur fidélité n'est pas encore configuré.", true);
      } else {
        showDesk(Boolean(secret));
      }

      login.addEventListener("submit", async (e) => {
        e.preventDefault();
        secret = login.elements.secret.value;
        try {
          // Vérifie le code avec une recherche sans résultat attendu.
          await api("/api/comptoir/membres?code=BB-222222", { token: secret });
          storage.set(STAFF_KEY, secret);
          login.reset();
          setStatus(status, "");
          showDesk(true);
        } catch (error) {
          secret = null;
          setStatus(status, error.message, true);
        }
      });
      search.addEventListener("submit", (e) => { e.preventDefault(); lookup(search.elements.code.value); });
      desk.querySelector("[data-logout]").addEventListener("click", () => {
        storage.remove(STAFF_KEY);
        secret = null;
        results.textContent = "";
        setStatus(status, "");
        showDesk(false);
      });

      // Scanner du QR code avec la caméra (Chrome Android, Edge ; sinon saisir le code).
      const scanButton = desk.querySelector("[data-scan]");
      const video = desk.querySelector("[data-video]");
      if ("BarcodeDetector" in window && navigator.mediaDevices) {
        scanButton.hidden = false;
        let stream = null;
        const stop = () => {
          if (stream) stream.getTracks().forEach(t => t.stop());
          stream = null;
          video.hidden = true;
          scanButton.textContent = "Scanner le QR code";
        };
        scanButton.addEventListener("click", async () => {
          if (stream) { stop(); return; }
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          } catch (_) {
            setStatus(status, "Caméra indisponible : saisissez le code du client.", true);
            return;
          }
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          video.srcObject = stream;
          video.hidden = false;
          scanButton.textContent = "Arrêter le scanner";
          await video.play();
          const tick = async () => {
            if (!stream) return;
            const codes = await detector.detect(video).catch(() => []);
            if (codes.length) {
              search.elements.code.value = codes[0].rawValue;
              stop();
              lookup(codes[0].rawValue);
            } else {
              window.setTimeout(tick, 250);
            }
          };
          tick();
        });
      }
    }
  });
})();
