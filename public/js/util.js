// Utilitaires partagés + état commun de la page.

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const nextFrame = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

// Stockage local : simple confort (reprise du test, consentement de vote). Le site marche sans.
export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignoré */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignoré */ } }
};

// Données chargées une fois, lues par tous les modules.
export const S = { polls: null, votes: { tallies: {}, mine: {} }, config: null, stats: null, voter: null };

export function voterToken() {
  if (S.voter) return S.voter;
  let t = store.get("politest.v3.voter");
  if (!t) {
    t = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""));
    store.set("politest.v3.voter", t);
  }
  return (S.voter = t);
}

// "<1" est stocké 0,5 par le scraper
export const fmtNum = v => v == null ? "–" : v === 0.5 ? "<1" : Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
export const fmtPct = (v, d = 0) => (Number(v).toFixed(d)).replace(".", ",") + " %";
export const fmtDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
export const fmtDay = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
export const dateLabel = p => /\d{4}/.test(p.dateLabel) ? p.dateLabel : `${p.dateLabel} ${(p.date || "").slice(0, 4)}`;
export const isoMinus = (iso, days) => new Date(new Date(iso + "T00:00:00Z").getTime() - days * 864e5).toISOString().slice(0, 10);
export const toMs = iso => new Date(iso + "T12:00:00Z").getTime();
export const toIso = ms => new Date(ms).toISOString().slice(0, 10);

export function initials(name) {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}
// Avatar rond : photo si disponible (sinon initiales), anneau de la couleur du candidat.
export function avatar(c, cls = "") {
  const photo = c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  return `<span class="av ${cls}" style="--c:${esc(c.color)}" title="${esc(c.name)}">${esc(initials(c.name))}${photo}</span>`;
}

// Texte lisible (blanc ou bleu nuit) sur une couleur de fond
export function readableOn(hex) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return (.2126 * r + .7152 * g + .0722 * b) > .42 ? "#0b1b3a" : "#ffffff";
}

export const cand = slug => S.polls.candidates[slug];
export const pairKey = (a, b) => [a, b].sort().join("--");

export function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0b1b3a;color:#fff;padding:12px 18px;border-radius:999px;font-weight:600;z-index:99;box-shadow:0 14px 30px -12px rgba(0,0,0,.5);transition:opacity .3s";
    document.body.appendChild(el);
  }
  el.textContent = msg; el.style.opacity = "1";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.style.opacity = "0"; }, 2600);
}

export async function api(path, opts) {
  const res = await fetch(path, opts);
  let body = null;
  try { body = await res.json(); } catch { /* corps vide */ }
  if (!res.ok) throw new Error((body && body.error) || "Une erreur est survenue.");
  return body;
}
