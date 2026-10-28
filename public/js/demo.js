// Exemple fictif de résultat sur l'accueil : tirage aléatoire parmi les vrais candidats,
// avec plus de chances pour les 10 premiers des sondages. Les chiffres sont inventés à chaque tirage.
import { $, S, esc, initials } from "./util.js";
import { averages } from "./stats.js";

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function pick3() {
  const ranked = averages(60, true).rows.map(r => r.slug).filter(s => S.polls.candidates[s] && !S.polls.candidates[s].generic);
  const pool = ranked.map((slug, i) => ({ slug, w: i < 10 ? 6 : 1 }));
  const out = [];
  while (out.length < 3 && pool.length) {
    const tot = pool.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    out.push(pool.splice(k, 1)[0].slug);
  }
  return out.map(s => S.polls.candidates[s]);
}

function radarSvg(themes, user, series) {
  const n = themes.length, cx = 140, cy = 130, R = 95;
  const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const poly = f => themes.map((_, i) => pt(i, R * f(i)).map(v => v.toFixed(1)).join(",")).join(" ");
  const rings = [.25, .5, .75, 1].map(f => `<polygon points="${poly(() => f)}" fill="none" stroke="${f === .5 ? "#9aa5bd" : "#dfe5f0"}"${f === .5 ? ' stroke-dasharray="3 3"' : ""}/>`).join("");
  const over = series.map(s => `<polygon points="${poly(i => (s.v[i] + 100) / 200)}" fill="${s.color}" fill-opacity=".08" stroke="${s.color}" stroke-width="2" stroke-dasharray="5 4"/>`).join("");
  const me = `<polygon points="${poly(i => (user[i] + 100) / 200)}" fill="rgba(0,85,164,.2)" stroke="#0055a4" stroke-width="3" stroke-linejoin="round"/>`;
  const labels = themes.map((t, i) => {
    const [x, y] = pt(i, R + 12), c = Math.cos(ang(i));
    const anchor = Math.abs(c) < .2 ? "middle" : c > 0 ? "start" : "end";
    return `<text x="${x.toFixed(0)}" y="${(y + (Math.sin(ang(i)) > .5 ? 12 : Math.sin(ang(i)) < -.5 ? -2 : 4)).toFixed(0)}" text-anchor="${anchor}" font-size="10.5" font-weight="700" fill="#0b1b3a">${esc(t.nom)}</text>`;
  }).join("");
  return `<svg viewBox="-70 0 420 260" role="img" aria-label="Exemple fictif de radar : votre profil et deux candidats">${rings}${over}${me}${labels}</svg>`;
}

function build() {
  const box = $("#teaser-demo");
  const themes = S.config.themes, cands = pick3();
  if (cands.length < 3 || !themes.length) { box.closest(".teaser-demo")?.setAttribute("hidden", ""); return; }
  const user = themes.map(() => Math.round(rnd(-75, 75)));
  const noise = [34, 52, 80];
  const rows = cands.map((c, k) => {
    const v = user.map(u => Math.round(clamp(u + rnd(-noise[k], noise[k]), -100, 100)));
    const agr = v.map((x, i) => Math.round(100 * (1 - Math.abs(user[i] - x) / 200)));
    return { c, v, agr, pct: Math.round(agr.reduce((a, b) => a + b, 0) / agr.length) };
  }).sort((a, b) => b.pct - a.pct);
  const best = rows[0];
  const chips = best.agr.map((a, i) => ({ a, t: themes[i] })).sort((x, y) => y.a - x.a).slice(0, 4)
    .map(x => `<span class="tchip" style="--h:${clamp(Math.round((x.a - 40) * 2.2), 0, 120)}"><i>${esc(x.t.icone)}</i> ${x.a}</span>`).join("");
  box.innerHTML = `
    <span class="demo-tag">Exemple fictif</span>
    <button class="demo-again" type="button" id="demo-again" aria-label="Générer un autre exemple fictif">↻ Autre exemple</button>
    <div class="demo-best" style="--c:${esc(best.c.color)}"><span class="demo-av">${esc(initials(best.c.name))}</span><div><small>Le plus proche de toi</small><strong>${esc(best.c.name)}</strong>
      <div class="tchips">${chips}</div></div><b class="demo-pct">${best.pct}<small>%</small></b></div>
    <div class="demo-bars">${rows.map(r => `<div><span>${esc(r.c.shortName)}</span><i style="--w:${r.pct}%;--c:${esc(r.c.color)}"></i><b>${r.pct} %</b></div>`).join("")}</div>
    <div class="demo-radar">${radarSvg(themes, user, [rows[0], rows[2]].map(r => ({ v: r.v, color: r.c.color })))}
      <div class="radar-legend"><span><i style="background:#0055a4"></i>Toi</span><span><i style="background:${esc(rows[0].c.color)}"></i>${esc(rows[0].c.shortName)}</span><span><i style="background:${esc(rows[2].c.color)}"></i>${esc(rows[2].c.shortName)}</span></div></div>
    <p class="demo-note">Chiffres tirés au hasard, pour l'illustration : ils ne décrivent aucun visiteur.</p>`;
  $("#demo-again").addEventListener("click", build);
}

export function initDemo() { build(); }
