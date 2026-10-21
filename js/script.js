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
    // Safari iOS n'applique :active (retour à l'appui) que si la page écoute le toucher.
    document.addEventListener("touchstart", () => {}, { passive: true });
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
        // Sur mobile, la catégorie choisie reste entièrement visible dans la barre.
        if (tab.scrollIntoView) tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion.matches ? "auto" : "smooth" });
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
        // Un vrai bouton posé sur la photo : lu correctement par les lecteurs d'écran.
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gallery-item__open";
        button.setAttribute("aria-label", "Agrandir la photo : " + img.alt);
        button.setAttribute("aria-haspopup", "dialog");
        item.appendChild(button);
        const open = () => {
          opener = button;
          // La photo s'agrandit depuis la vignette touchée (et y retourne à la fermeture).
          const r = item.getBoundingClientRect();
          if (r.width && window.innerWidth) {
            lbImg.style.transformOrigin =
              `${Math.round(r.left + r.width / 2 - window.innerWidth / 2)}px ${Math.round(r.top + r.height / 2 - window.innerHeight / 2)}px`;
          }
          lbImg.style.transform = "";
          lightbox.style.opacity = "";
          lbImg.src = img.dataset.full || img.src;
          lbImg.alt = img.alt;
          lightbox.classList.add("open");
          root.classList.add("lightbox-open");
          close.focus();
        };
        button.addEventListener("click", open);
      });
      close.addEventListener("click", closeLb);

      // Glisser la photo vers le bas pour fermer : elle suit le doigt 1:1, résiste
      // vers le haut, et un geste rapide suffit (projection de l'élan au relâchement).
      let drag = null;
      lbImg.draggable = false; // sinon le glisser-déposer natif de l'image interrompt le geste
      const rubberband = (d, size) => (d * size * 0.55) / (size + 0.55 * Math.abs(d));
      const settle = () => {
        lbImg.classList.remove("is-dragging");
        lbImg.style.transform = "";
        lightbox.style.opacity = "";
      };
      lbImg.addEventListener("pointerdown", (e) => {
        if (!lightbox.classList.contains("open") || e.button > 0) return;
        drag = { id: e.pointerId, y0: e.clientY, dy: 0, active: false, history: [{ y: e.clientY, t: e.timeStamp }] };
      });
      lbImg.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = e.clientY - drag.y0;
        if (!drag.active) {
          if (Math.abs(dy) < 10) return; // seuil avant de considérer un glissement
          drag.active = true;
          drag.y0 = e.clientY - Math.sign(dy) * 10;
          lbImg.setPointerCapture(e.pointerId);
          lbImg.classList.add("is-dragging");
        }
        const h = window.innerHeight || 800;
        drag.dy = e.clientY - drag.y0;
        const y = drag.dy > 0 ? drag.dy : rubberband(drag.dy, h);
        lbImg.style.transform = `translateY(${y}px) scale(${1 - Math.min(Math.max(y, 0) / h, 1) * 0.15})`;
        lightbox.style.opacity = String(1 - Math.min(Math.max(y, 0) / h, 1) * 0.6);
        drag.history.push({ y: e.clientY, t: e.timeStamp });
        if (drag.history.length > 5) drag.history.shift();
      });
      const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag;
        drag = null;
        if (!d.active) return;
        const first = d.history[0], last = d.history[d.history.length - 1];
        const velocity = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0; // px/s
        const projected = d.dy + (velocity / 1000) * 0.99 / (1 - 0.99);
        if (e.type === "pointerup" && d.dy > 0 && velocity >= 0 && projected > (window.innerHeight || 800) * 0.3) {
          // La photo sort dans la direction du geste pendant que le fond s'efface.
          lbImg.classList.remove("is-dragging");
          lbImg.style.transform = `translateY(${window.innerHeight || 800}px) scale(0.85)`;
          lightbox.style.opacity = "";
          closeLb();
        } else {
          settle();
        }
      };
      lbImg.addEventListener("pointerup", endDrag);
      lbImg.addEventListener("pointercancel", endDrag);
      // Un glissement ne doit pas être pris pour un clic sur le fond.
      lbImg.addEventListener("click", (e) => e.stopPropagation());
      lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLb(); });
      document.addEventListener("keydown", (e) => {
        if (!lightbox.classList.contains("open")) return;
        if (e.key === "Escape") closeLb();
        else trapFocus(e, [close]);
      });
    }

    // Carte Google chargée uniquement à la demande (consentement RGPD).
    const map = document.querySelector("[data-map-src]");
    const mapButton = map && map.querySelector("[data-map-load]");
    if (map && mapButton) {
      mapButton.hidden = false;
      mapButton.addEventListener("click", () => {
        const frame = document.createElement("iframe");
        frame.src = map.dataset.mapSrc;
        frame.title = map.dataset.mapTitle || "Plan d'accès";
        frame.loading = "lazy";
        frame.referrerPolicy = "no-referrer-when-downgrade";
        frame.allowFullscreen = true;
        map.querySelector(".map-consent").hidden = true;
        map.appendChild(frame);
        frame.focus();
      });
    }

    const year = document.querySelector("[data-year]");
    if (year) year.textContent = new Date().getFullYear();
    const today = document.querySelector(`[data-day="${new Date().getDay()}"]`);
    if (today) today.classList.add("today");
  });
})();
