// Tests de comportement sans dépendances ; ne remplacent pas un test visuel navigateur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/script.js'), 'utf8');

function setup({ reduced = false, observer = true } = {}) {
  let document;
  const element = (classes = []) => {
    const names = new Set(classes);
    return {
      classList: { add: x => names.add(x), remove: x => names.delete(x), contains: x => names.has(x),
        toggle(x, force) { const on = force === undefined ? !names.has(x) : force; on ? names.add(x) : names.delete(x); return on; } },
      attrs: {}, dataset: {}, style: {}, events: {}, children: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(k, fn) { (this.events[k] ||= []).push(fn); },
      fire(k, extra = {}) { const e = { target: this, preventDefault() { this.prevented = true; }, ...extra }; (this.events[k] || []).forEach(fn => fn(e)); return e; },
      focus() { document.activeElement = this; },
      contains(el) { return this === el || this.children.includes(el); },
      getClientRects() { return [{}]; },
      getBoundingClientRect() { return { top: 900 }; },
      querySelector(selector) { return (this.selectors || {})[selector] || null; },
      querySelectorAll() { return this.children; }
    };
  };
  const header = element(), toggle = element(), links = element();
  links.children = [element(), element(), element(), element()]; links.selectors = { a: links.children[0] };
  const tabs = [element(['active']), element()]; tabs[0].dataset.cat = 'all'; tabs[1].dataset.cat = 'tacos';
  const cards = [element(), element()]; cards[0].dataset.cat = 'burgers'; cards[1].dataset.cat = 'tacos';
  const reveal = element(), marquee = element(), lightbox = element(), close = element(), img = element(), item = element();
  img.alt = 'Tacos'; img.src = 'tacos.webp'; item.selectors = { img }; lightbox.selectors = { img: element(), '.lightbox__close': close };
  const map = element(), mapButton = element(), consent = element();
  map.dataset.mapSrc = 'https://maps.example/embed'; map.dataset.mapTitle = 'Plan';
  map.selectors = { '[data-map-load]': mapButton, '.map-consent': consent }; mapButton.hidden = true;
  map.appendChild = child => { map.children.push(child); };
  document = { ...element(), readyState: 'complete', documentElement: element(), hidden: false,
    createElement: tag => ({ ...element(), tagName: tag.toUpperCase() }),
    querySelector(s) { return { '.header': header, '.nav-toggle': toggle, '.nav-links': links, '.marquee': marquee, '.lightbox': lightbox, '[data-map-src]': map }[s] || null; },
    querySelectorAll(s) { return { '[data-reveal]': [reveal], '.menu-tab': tabs, '.menu-card': cards, '.gallery-item': [item] }[s] || []; }
  };
  const compact = { matches: true }, observers = [];
  const window = { ...element(), scrollY: 0, innerHeight: 800, requestAnimationFrame: fn => fn(), matchMedia: s => s.includes('980') ? compact : { matches: reduced } };
  class IO { constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; observers.push(this); } observe(el) { this.targets.push(el); } unobserve() {} }
  if (observer) window.IntersectionObserver = IO;
  vm.runInNewContext(source, { window, document, IntersectionObserver: IO });
  return { header, toggle, links, document, window, compact, tabs, cards, reveal, marquee, lightbox, close, item, observers, map, mapButton, consent };
}

test('carte Google : rien n’est chargé avant le clic (RGPD)', () => {
  const f = setup();
  assert.equal(f.mapButton.hidden, false);
  assert.equal(f.map.children.length, 0);
  f.mapButton.fire('click');
  assert.equal(f.map.children.length, 1);
  assert.equal(f.map.children[0].tagName, 'IFRAME');
  assert.equal(f.map.children[0].src, 'https://maps.example/embed');
  assert.equal(f.consent.hidden, true);
});

test('navigation tablette : ouverture, focus, Échap et passage au bureau', () => {
  const f = setup(); f.toggle.fire('click');
  assert.equal(f.toggle.attrs['aria-expanded'], 'true');
  assert.equal(f.document.activeElement, f.links.children[0]);
  f.document.fire('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(f.document.activeElement, f.toggle);
  f.document.fire('keydown', { key: 'Escape' });
  assert.equal(f.toggle.attrs['aria-expanded'], 'false');
  assert.equal(f.document.activeElement, f.toggle);
  f.toggle.fire('click'); f.compact.matches = false; f.window.fire('resize');
  assert.equal(f.document.documentElement.classList.contains('nav-open'), false);
});
test('filtres : tacos puis retour à tous les produits', () => {
  const f = setup(); f.tabs[1].fire('click');
  assert.equal(f.cards[0].style.display, 'none'); assert.equal(f.cards[1].style.display, '');
  assert.equal(f.tabs[1].attrs['aria-pressed'], 'true');
  f.tabs[0].fire('click'); assert.equal(f.cards[0].style.display, '');
});
test('galerie au clavier : ouverture, focus contenu, fermeture et retour', () => {
  const f = setup(); f.item.fire('keydown', { key: 'Enter' });
  assert.equal(f.lightbox.classList.contains('open'), true); assert.equal(f.document.activeElement, f.close);
  const event = f.document.fire('keydown', { key: 'Tab' }); assert.equal(event.prevented, true);
  f.document.fire('keydown', { key: 'Escape' });
  assert.equal(f.document.activeElement, f.item); assert.equal(f.lightbox.classList.contains('open'), false);
});
test('révélations : éléments hauts, absence d’observer et mouvements réduits', () => {
  const f = setup(); const io = f.observers.find(o => o.targets.includes(f.reveal));
  assert.equal(io.options.threshold, 0);
  io.callback([{ target: f.reveal, isIntersecting: true }]);
  assert.equal(f.reveal.classList.contains('reveal-pending'), false);
  for (const options of [{ observer: false }, { reduced: true }]) {
    assert.equal(setup(options).reveal.classList.contains('reveal-pending'), false);
  }
});
test('animation suspendue hors écran et dans un onglet masqué', () => {
  const f = setup(); const io = f.observers.find(o => o.targets.includes(f.marquee));
  io.callback([{ isIntersecting: false }]); assert.equal(f.marquee.classList.contains('is-paused'), true);
  io.callback([{ isIntersecting: true }]); assert.equal(f.marquee.classList.contains('is-paused'), false);
  f.document.hidden = true; f.document.fire('visibilitychange'); assert.equal(f.marquee.classList.contains('is-paused'), true);
});
