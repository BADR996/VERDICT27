// Emplacements publicitaires (data/ads.json). Rien n'est chargé tant que l'utilisateur n'a pas accepté
// (mode « builtin »), ou que votre CMP externe ne l'a pas géré (mode « external »).
import { $, $$ } from "./util.js";

const KEY = "politest.consent.ads", SIX_MONTHS = 183 * 864e5;
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && Date.now() - v.ts < SIX_MONTHS ? v : null; } catch { return null; } };
const write = ok => { try { localStorage.setItem(KEY, JSON.stringify({ ok, ts: Date.now() })); } catch { /* choix non mémorisé */ } };

// remet les <script> en état d'être exécutés quand on injecte du HTML
function inject(el, html) {
  el.innerHTML = html;
  $$("script", el).forEach(old => {
    const s = document.createElement("script");
    [...old.attributes].forEach(a => s.setAttribute(a.name, a.value));
    s.textContent = old.textContent;
    old.replaceWith(s);
  });
}

let started = false;
function start(cfg) {
  if (started) return; started = true;
  if (cfg.headScript) { const box = document.createElement("div"); document.body.append(box); inject(box, cfg.headScript); }
  for (const [name, slot] of Object.entries(cfg.slots)) {
    const el = $(`[data-ad="${name}"]`); if (!el) continue;
    el.hidden = false; el.style.minHeight = slot.minHeight ? slot.minHeight + "px" : "";
    el.dataset.label = slot.label;
    const inner = document.createElement("div"); inner.className = "ad-in"; el.append(inner);
    inject(inner, slot.html);
  }
}

export function initAds(site) {
  const cfg = site && site.ads;
  if (!cfg) return;
  if (cfg.consent === "external") { start(cfg); return; }
  const bar = $("#consent-bar"), manage = $("#ads-manage-wrap");
  manage.hidden = false;
  const decide = ok => { write(ok); bar.hidden = true; if (ok) start(cfg); else if (started) location.reload(); };
  $("#consent-yes").addEventListener("click", () => decide(true));
  $("#consent-no").addEventListener("click", () => decide(false));
  $("#ads-manage").addEventListener("click", () => { bar.hidden = false; $("#consent-no").focus(); });
  const c = read();
  if (!c) bar.hidden = false; else if (c.ok) start(cfg);
}
