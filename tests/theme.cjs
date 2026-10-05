const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../js/theme.js'), 'utf8');
function setup({ saved = null, dark = false, blocked = false, legacy = false } = {}) {
  const node = () => ({ attrs: {}, events: {}, hidden: true, setAttribute(k,v) { this.attrs[k]=v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener(k,fn) { this.events[k]=fn; } });
  const root=node(), button=node(), meta=node(), document=node(), window=node();
  const system={ matches: dark };
  system[legacy ? 'addListener' : 'addEventListener'] = (...args) => { system.change=args.at(-1); };
  window.matchMedia=()=>system;
  window.localStorage={ getItem() { if(blocked) throw Error(); return saved; }, setItem(k,v) { if(blocked) throw Error(); saved=v; } };
  document.documentElement=root;
  document.querySelector=s=>s==='.theme-toggle'?button:meta;
  vm.runInNewContext(source,{window,document});
  document.events.DOMContentLoaded();
  return { root, button, meta, window, system, saved:()=>saved };
}
test('première visite : suit le système et sa modification',()=>{
 const f=setup(); assert.equal(f.root.attrs['data-theme'],'light');
 f.system.matches=true; f.system.change(); assert.equal(f.root.attrs['data-theme'],'dark');
});
test('choix mémorisé prioritaire, bouton puis nouvelle page',()=>{
 const f=setup({saved:'dark'}); assert.equal(f.root.attrs['data-theme'],'dark');
 f.button.events.click(); assert.equal(f.saved(),'light');
 assert.equal(f.button.attrs['aria-label'],'Activer le mode sombre');
 assert.equal(f.meta.attrs.content,'#faf7f0');
 f.system.matches=true; f.system.change(); assert.equal(f.root.attrs['data-theme'],'light');
 assert.equal(setup({saved:f.saved(),dark:true}).root.attrs['data-theme'],'light');
});
test('stockage bloqué et ancien écouteur Safari : bouton fonctionnel',()=>{
 const f=setup({blocked:true,legacy:true,dark:true});
 f.button.events.click(); assert.equal(f.root.attrs['data-theme'],'light'); assert.equal(f.button.hidden,false);
});
test('valeur invalide ignorée et synchronisation entre onglets',()=>{
 const f=setup({saved:'incorrect',dark:true}); assert.equal(f.root.attrs['data-theme'],'dark');
 f.window.events.storage({key:'best-burger-theme',newValue:'light'}); assert.equal(f.root.attrs['data-theme'],'light');
 f.window.events.storage({key:null,newValue:null}); assert.equal(f.root.attrs['data-theme'],'dark');
});
