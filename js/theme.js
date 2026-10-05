/* Appliqué avant la feuille de style pour éviter un flash du mauvais thème. */
(function () {
  "use strict";
  const key = "best-burger-theme";
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let choice = null;
  let button = null;
  const valid = value => value === "light" || value === "dark";
  try {
    const saved = window.localStorage.getItem(key);
    if (valid(saved)) choice = saved;
  } catch (_) { /* Le thème fonctionne aussi lorsque le stockage est bloqué. */ }

  const apply = () => {
    const theme = choice || (system.matches ? "dark" : "light");
    root.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0d0d0d" : "#faf7f0");
    if (button) {
      const label = theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    }
  };
  apply();
  if (system.addEventListener) system.addEventListener("change", apply);
  else if (system.addListener) system.addListener(apply);
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) {
      choice = valid(event.newValue) ? event.newValue : null;
      apply();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    button = document.querySelector(".theme-toggle");
    if (!button) return;
    apply();
    button.addEventListener("click", () => {
      choice = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { window.localStorage.setItem(key, choice); } catch (_) { /* Choix conservé pour cette page. */ }
      apply();
    });
    button.hidden = false;
  });
})();
