// Calculs sur les sondages : moyennes et séries temporelles.
import { S, isoMinus, toMs } from "./util.js";

// Candidats retenus pour les classements : « actifs » (candidates.csv), hors candidats génériques.
export const activeCands = () => S.polls.activeSlugs.map(s => S.polls.candidates[s]).filter(c => c && !c.generic);

export const latestDate = () => (S.polls.firstRound.find(p => p.date) || {}).date || null;

// Moyenne sur une fenêtre de `days` jours se terminant au sondage le plus récent.
//  zeroMode = true  : un candidat absent d'un scénario compte pour 0 % dans ce scénario
//                     (et 0 % dans un sondage où il n'est testé dans aucun scénario).
//  zeroMode = false : on ne moyenne que les sondages où le candidat est testé.
export function averages(days, zeroMode) {
  const to = latestDate();
  if (!to) return { rows: [], from: null, to: null, count: 0 };
  const from = isoMinus(to, days);
  const win = S.polls.firstRound.filter(p => p.date && p.date >= from);
  const rows = activeCands().map(c => {
    let sum = 0, tested = 0;
    for (const p of win) {
      const vals = p.scenarios.map(s => s.values[c.slug]);
      const present = vals.filter(v => v !== undefined);
      if (present.length) tested++;
      if (zeroMode) sum += vals.reduce((a, v) => a + (v ?? 0), 0) / vals.length;
      else if (present.length) sum += present.reduce((a, v) => a + v, 0) / present.length;
    }
    const n = zeroMode ? win.length : tested;
    return { slug: c.slug, avg: n ? sum / n : 0, tested, total: win.length };
  }).filter(r => r.tested > 0).sort((a, b) => b.avg - a.avg);
  return { rows, from, to, count: win.length };
}

// Les deux candidats en tête de la moyenne : ceux qui seraient qualifiés pour le second tour.
// Si le 2e et le 3e sont à égalité (à 0,1 point près, précision affichée), les deux sont retenus.
export function qualified(days = 60, zero = true) {
  const rows = averages(days, zero).rows;
  if (rows.length < 3) return new Set(rows.map(r => r.slug));
  const r1 = x => Math.round(x * 10);
  const second = r1(rows[1].avg);
  return new Set(rows.filter((r, i) => i < 2 || r1(r.avg) === second).map(r => r.slug));
}

// Série d'un candidat au 1er tour : un point par sondage où il est testé (moyenne de ses scénarios).
export function seriesFirstRound(slug) {
  const pts = [];
  for (const p of S.polls.firstRound) {
    if (!p.date) continue;
    const present = p.scenarios.map(s => s.values[slug]).filter(v => v !== undefined);
    if (!present.length) continue;
    pts.push({ t: toMs(p.date), v: present.reduce((a, v) => a + v, 0) / present.length, label: p.pollster, date: p.date });
  }
  return pts.sort((a, b) => a.t - b.t);
}

// Série d'un candidat dans un duel de second tour.
export function seriesDuel(matchup, slug) {
  return matchup.polls.filter(p => p.date && p.values[slug] !== undefined)
    .map(p => ({ t: toMs(p.date), v: p.values[slug], label: p.pollster, date: p.date }))
    .sort((a, b) => a.t - b.t);
}

// Tendance : moyenne mobile pondérée (noyau triangulaire) évaluée sur une grille régulière.
export function trend(points, from, to, steps = 80) {
  if (!points.length) return [];
  const span = Math.max(to - from, 864e5);
  const half = Math.max(12 * 864e5, span / 10);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + (span * i) / steps;
    let w = 0, s = 0;
    for (const p of points) {
      const d = Math.abs(p.t - t);
      if (d < half) { const k = 1 - d / half; w += k; s += k * p.v; }
    }
    out.push({ t, v: w > 0.15 ? s / w : null });
  }
  return out;
}

// ---------- orientations politiques (colonne « orientation » de candidates.csv) ----------
export const ORIENTS = [
  { key: "extreme-gauche", label: "Extrême gauche", color: "#8f1d3a" },
  { key: "gauche", label: "Gauche", color: "#e5484d" },
  { key: "centre", label: "Centre", color: "#f5a524" },
  { key: "droite", label: "Droite", color: "#2f6fdb" },
  { key: "extreme-droite", label: "Extrême droite", color: "#16245b" },
  { key: "divers", label: "Divers", color: "#8a94a8" },
];

// Total d'un sondage pour une orientation : somme des scores de ses candidats, moyennée sur les scénarios.
function orientTotal(p, key) {
  const c = S.polls.candidates;
  const tot = p.scenarios.map(s => Object.entries(s.values).reduce((a, [k, v]) => a + (c[k] && c[k].orientation === key ? v : 0), 0));
  return tot.reduce((a, v) => a + v, 0) / (tot.length || 1);
}
export const hasOrientations = () => Object.values(S.polls.candidates).some(c => c.orientation);

export function seriesOrientation(key) {
  return S.polls.firstRound.filter(p => p.date).map(p => ({ t: toMs(p.date), v: orientTotal(p, key), label: p.pollster, date: p.date }))
    .filter(p => p.v > 0).sort((a, b) => a.t - b.t);
}

export function orientationAverages(days) {
  const to = latestDate();
  if (!to) return [];
  const from = isoMinus(to, days);
  const win = S.polls.firstRound.filter(p => p.date && p.date >= from);
  return ORIENTS.map(o => ({ ...o, avg: win.length ? win.reduce((a, p) => a + orientTotal(p, o.key), 0) / win.length : 0 })).filter(o => o.avg > 0);
}
