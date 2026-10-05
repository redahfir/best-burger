/* BEST BURGER — navigation, animations légères, carte et galerie. */
(function () {
  "use strict";
  const onReady = (fn) => document.readyState !== "loading"
    ? fn() : document.addEventListener("DOMContentLoaded", fn);

  onReady(function () {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactNav = window.matchMedia("(max-width: 980px)");
    const header = document.querySelector(".header");
    let scrollPending = false;
    const updateHeader = () => {
      if (header) header.classList.toggle("scrolled", window.scrollY > 30);
      scrollPending = false;
    };
    updateHeader();
    window.addEventListener("scroll", () => {
      if (!scrollPending) {
        scrollPending = true;
        window.requestAnimationFrame(updateHeader);
      }
    }, { passive: true });

    // Contenir le focus dans un panneau ouvert, y compris avec Maj + Tab.
    const trapFocus = (event, controls) => {
      if (event.key !== "Tab" || !controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!controls.includes(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    const toggle = document.querySelector(".nav-toggle");
    const links = document.querySelector(".nav-links");
    if (toggle && links && header) {
      links.id = "primary-navigation";
      toggle.setAttribute("aria-controls", links.id);
      const setOpen = (open, restoreFocus = false) => {
        links.classList.toggle("open", open);
        toggle.classList.toggle("open", open);
        root.classList.toggle("nav-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
        if (open) links.querySelector("a").focus();
        else if (restoreFocus) toggle.focus();
      };
      toggle.addEventListener("click", () => setOpen(!links.classList.contains("open")));
      links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
      document.addEventListener("click", (e) => {
        if (links.classList.contains("open") && !links.contains(e.target) && !toggle.contains(e.target)) setOpen(false, true);
      });
      document.addEventListener("keydown", (e) => {
        if (!links.classList.contains("open")) return;
        if (e.key === "Escape") setOpen(false, true);
        else trapFocus(e, [...links.querySelectorAll("a")].filter(a => a.getClientRects().length).concat([...document.querySelectorAll(".theme-toggle:not([hidden])")], toggle));
      });
      window.addEventListener("resize", () => {
        if (!compactNav.matches) setOpen(false);
      });
      // La navigation reste visible si le script ne se charge pas.
      header.classList.add("nav-ready");
    }

    const reveals = document.querySelectorAll("[data-reveal]");
    if ("IntersectionObserver" in window && !reducedMotion.matches && reveals.length) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove("reveal-pending");
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0 });
      reveals.forEach((el) => {
        // Le contenu visible au chargement apparaît immédiatement.
        if (el.getBoundingClientRect().top >= window.innerHeight) {
          el.classList.add("reveal-pending");
          io.observe(el);
        }
      });
    }

    // Suspendre le bandeau animé lorsqu'il est hors écran ou l'onglet masqué.
    const marquee = document.querySelector(".marquee");
    if (marquee) {
      let visible = true;
      const updateMarquee = () => marquee.classList.toggle("is-paused", !visible || document.hidden);
      document.addEventListener("visibilitychange", updateMarquee);
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
          visible = entries[0].isIntersecting;
          updateMarquee();
        });
        observer.observe(marquee);
      }
      updateMarquee();
    }

    const tabs = document.querySelectorAll(".menu-tab");
    const cards = document.querySelectorAll(".menu-card");
    tabs.forEach((tab) => {
      tab.setAttribute("aria-pressed", String(tab.classList.contains("active")));
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          t.classList.toggle("active", t === tab);
          t.setAttribute("aria-pressed", String(t === tab));
        });
        cards.forEach((card) => {
          card.style.display = tab.dataset.cat === "all" || card.dataset.cat === tab.dataset.cat ? "" : "none";
        });
      });
    });

    const lightbox = document.querySelector(".lightbox");
    if (lightbox) {
      const lbImg = lightbox.querySelector("img");
      const close = lightbox.querySelector(".lightbox__close");
      let opener = null;
      const closeLb = () => {
        lightbox.classList.remove("open");
        root.classList.remove("lightbox-open");
        if (opener) opener.focus();
      };
      document.querySelectorAll(".gallery-item").forEach((item) => {
        const img = item.querySelector("img");
        if (!img) return;
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.setAttribute("aria-label", "Agrandir : " + img.alt);
        item.setAttribute("aria-haspopup", "dialog");
        const open = () => {
          opener = item;
          lbImg.src = img.dataset.full || img.src;
          lbImg.alt = img.alt;
          lightbox.classList.add("open");
          root.classList.add("lightbox-open");
          close.focus();
        };
        item.addEventListener("click", open);
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
        });
      });
      close.addEventListener("click", closeLb);
      lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLb(); });
      document.addEventListener("keydown", (e) => {
        if (!lightbox.classList.contains("open")) return;
        if (e.key === "Escape") closeLb();
        else trapFocus(e, [close]);
      });
    }

    const year = document.querySelector("[data-year]");
    if (year) year.textContent = new Date().getFullYear();
    const today = document.querySelector(`[data-day="${new Date().getDay()}"]`);
    if (today) today.classList.add("today");
  });
})();
