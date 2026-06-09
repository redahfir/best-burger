/* ============================================================
   BEST BURGER — JS global
   Nav, scroll reveal, parallax, compteurs, menu, galerie
   ============================================================ */
(function () {
  "use strict";

  const onReady = (fn) =>
    document.readyState !== "loading"
      ? fn()
      : document.addEventListener("DOMContentLoaded", fn);

  onReady(function () {
    /* ---------- Header au scroll ---------- */
    const header = document.querySelector(".header");
    const onScrollHeader = () => {
      if (!header) return;
      header.classList.toggle("scrolled", window.scrollY > 30);
    };
    onScrollHeader();
    window.addEventListener("scroll", onScrollHeader, { passive: true });

    /* ---------- Menu mobile ---------- */
    const toggle = document.querySelector(".nav-toggle");
    const links = document.querySelector(".nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", () => {
        const open = links.classList.toggle("open");
        toggle.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", String(open));
        document.body.style.overflow = open ? "hidden" : "";
      });
      links.querySelectorAll("a").forEach((a) =>
        a.addEventListener("click", () => {
          links.classList.remove("open");
          toggle.classList.remove("open");
          document.body.style.overflow = "";
        })
      );
    }

    /* ---------- Reveal au scroll ---------- */
    const reveals = document.querySelectorAll("[data-reveal]");
    if ("IntersectionObserver" in window && reveals.length) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
      );
      reveals.forEach((el) => io.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add("in"));
    }

    /* ---------- Parallaxe hero ---------- */
    const parallaxEls = document.querySelectorAll("[data-parallax]");
    if (parallaxEls.length) {
      let ticking = false;
      const run = () => {
        const y = window.scrollY;
        parallaxEls.forEach((el) => {
          const speed = parseFloat(el.dataset.parallax) || 0.3;
          el.style.transform = `translate3d(0, ${y * speed}px, 0)`;
        });
        ticking = false;
      };
      window.addEventListener(
        "scroll",
        () => {
          if (!ticking) {
            window.requestAnimationFrame(run);
            ticking = true;
          }
        },
        { passive: true }
      );
    }

    /* ---------- Compteurs animés ---------- */
    const counters = document.querySelectorAll("[data-count]");
    if (counters.length && "IntersectionObserver" in window) {
      const animate = (el) => {
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || "";
        const dur = 1600;
        const start = performance.now();
        const step = (now) => {
          const p = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          const val = target * eased;
          el.textContent =
            (Number.isInteger(target) ? Math.round(val) : val.toFixed(1)) +
            suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      const cio = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              animate(e.target);
              cio.unobserve(e.target);
            }
          });
        },
        { threshold: 0.5 }
      );
      counters.forEach((c) => cio.observe(c));
    }

    /* ---------- Filtres du menu ---------- */
    const tabs = document.querySelectorAll(".menu-tab");
    const cards = document.querySelectorAll(".menu-card");
    if (tabs.length && cards.length) {
      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          tabs.forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          const cat = tab.dataset.cat;
          cards.forEach((card) => {
            const show = cat === "all" || card.dataset.cat === cat;
            card.style.display = show ? "" : "none";
          });
        });
      });
    }

    /* ---------- Lightbox galerie ---------- */
    const galleryItems = document.querySelectorAll(".gallery-item img");
    const lightbox = document.querySelector(".lightbox");
    if (galleryItems.length && lightbox) {
      const lbImg = lightbox.querySelector("img");
      const close = lightbox.querySelector(".lightbox__close");
      const openLb = (src, alt) => {
        lbImg.src = src;
        lbImg.alt = alt || "";
        lightbox.classList.add("open");
        document.body.style.overflow = "hidden";
      };
      const closeLb = () => {
        lightbox.classList.remove("open");
        document.body.style.overflow = "";
      };
      galleryItems.forEach((img) =>
        img.addEventListener("click", () =>
          openLb(img.dataset.full || img.src, img.alt)
        )
      );
      close.addEventListener("click", closeLb);
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) closeLb();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeLb();
      });
    }

    /* ---------- Année footer ---------- */
    const yearEl = document.querySelector("[data-year]");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* ---------- Surligne le jour courant (horaires) ---------- */
    const todayRow = document.querySelector(`[data-day="${new Date().getDay()}"]`);
    if (todayRow) todayRow.classList.add("today");
  });
})();
