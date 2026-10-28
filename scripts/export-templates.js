// Prépare (ou met à jour) les fichiers CSV à remplir dans data/ :
//   candidates.csv  : un candidat par ligne (nom, couleur, photo, actif...)
//   positions.csv   : une question par ligne, un candidat par colonne (valeurs 1 à 5)
//   sources_positions.csv : d'où vient chaque position de candidat (source_titre, source_url, date, extrait)
//   sondages.csv    : vos sondages saisis à la main (créé avec des exemples si absent)
//
// Ne supprime jamais ce que vous avez déjà saisi : il ajoute seulement les nouveaux candidats / questions.
// Usage : npm run templates

const fs = require("fs");
const path = require("path");
const { readCsv, writeCsv } = require("../lib/csv");
const ds = require("../lib/dataset");

const polls = ds.getPolls();
const questions = ds.getQuestions();

// ---------- candidates.csv ----------
const existing = readCsv(ds.F.candidates);
const byslug = new Map(existing.rows.map(r => [r.slug, r]));

// moyenne rapide pour ordonner les candidats actifs
const latest = polls.firstRound.find(p => p.date)?.date;
const since = latest ? new Date(new Date(latest + "T00:00:00Z").getTime() - 90 * 864e5).toISOString().slice(0, 10) : "";
const avg = {};
polls.firstRound.filter(p => p.date >= since).forEach(p => {
  const per = {};
  p.scenarios.forEach(s => Object.entries(s.values).forEach(([k, v]) => (per[k] ||= []).push(v)));
  Object.entries(per).forEach(([k, a]) => { (avg[k] ||= []).push(a.reduce((x, y) => x + y, 0) / a.length); });
});
const mean = k => avg[k] ? avg[k].reduce((x, y) => x + y, 0) / avg[k].length : -1;

const candCols = ["slug", "nom", "nom_court", "parti", "couleur", "actif", "photo", "ordre", "orientation"];
const list = Object.values(polls.candidates).filter(c => !c.generic).sort((a, b) => (b.active - a.active) || (mean(b.slug) - mean(a.slug)));
const candRows = list.map((c, i) => {
  const old = byslug.get(c.slug);
  return old ? { ...old } : {
    slug: c.slug, nom: c.name, nom_court: c.shortName, parti: c.party, couleur: c.color,
    actif: c.generic ? "non" : "oui", photo: "", ordre: i + 1, orientation: ""
  };
});
// garde aussi les lignes saisies à la main pour des candidats absents des sondages
for (const r of existing.rows) if (!candRows.find(x => x.slug === r.slug)) candRows.push(r);
writeCsv(ds.F.candidates, candCols, candRows);
console.log(`candidates.csv : ${candRows.length} candidats (${candRows.filter(r => r.actif === "oui").length} actifs)`);

// ---------- positions.csv ----------
const oldPos = readCsv(ds.F.positions);
const fixed = ["id", "theme", "texte"];
const oldCols = oldPos.columns.filter(c => c && !fixed.includes(c));
const activeSlugs = candRows.filter(r => r.actif === "oui").map(r => r.slug);
const posCols = [...new Set([...oldCols, ...activeSlugs])];
const oldById = new Map(oldPos.rows.map(r => [Number(r.id), r]));
const posRows = questions.map(q => {
  const row = { id: q.id, theme: q.theme, texte: q.text };
  const old = oldById.get(q.id);
  posCols.forEach(c => { row[c] = old && old[c] !== undefined ? old[c] : ""; });
  return row;
});
writeCsv(ds.F.positions, [...fixed, ...posCols], posRows);
console.log(`positions.csv : ${posRows.length} questions x ${posCols.length} candidats`);

// ---------- positions_themes.csv (saisie rapide : un score -100..+100 par thème et par candidat) ----------
const oldTp = readCsv(ds.F.positionsThemes);
const tpCols = [...new Set([...oldTp.columns.filter(c => c && !["theme", "nom"].includes(c)), ...activeSlugs])];
const tpByTheme = new Map(oldTp.rows.map(r => [r.theme, r]));
const tpRows = ds.getThemes().map(t => {
  const row = { theme: t.code, nom: `${t.nom} : -100 = ${t.poleNeg} ; +100 = ${t.polePos}` };
  const old = tpByTheme.get(t.code);
  tpCols.forEach(c => { row[c] = old && old[c] !== undefined ? old[c] : ""; });
  return row;
});
writeCsv(ds.F.positionsThemes, ["theme", "nom", ...tpCols], tpRows);
console.log(`positions_themes.csv : ${tpRows.length} thèmes x ${tpCols.length} candidats`);

// ---------- sources_positions.csv (d'où vient chaque position : une ligne par source) ----------
{
  const { candidateThemeScores } = require("../scoring");
  const scores = candidateThemeScores();
  const old = readCsv(ds.F.positionSources);
  const cols = ["candidat", "nom", "theme", "position_calculee", "source_titre", "source_url", "date", "extrait"];
  const have = new Set(old.rows.filter(r => r.candidat && r.theme).map(r => r.candidat + "|" + r.theme));
  const rows = old.rows.filter(r => r.candidat && r.theme).map(r => ({
    ...r, nom: (polls.candidates[r.candidat] || {}).name || r.nom || "",
    position_calculee: scores[r.candidat] && scores[r.candidat][r.theme] !== undefined ? scores[r.candidat][r.theme] : (r.position_calculee || "")
  }));
  let added = 0;
  for (const slug of candRows.filter(r => r.actif === "oui").map(r => r.slug)) {
    if (!scores[slug]) continue;
    for (const t of ds.getThemes()) {
      if (scores[slug][t.code] === undefined || have.has(slug + "|" + t.code)) continue;
      rows.push({ candidat: slug, nom: (polls.candidates[slug] || {}).name || "", theme: t.code, position_calculee: scores[slug][t.code], source_titre: "", source_url: "", date: "", extrait: "" });
      added++;
    }
  }
  const order = new Map(candRows.map((r, i) => [r.slug, i])), tOrder = new Map(ds.getThemes().map((t, i) => [t.code, i]));
  rows.sort((a, b) => (order.get(a.candidat) ?? 999) - (order.get(b.candidat) ?? 999) || (tOrder.get(a.theme) ?? 99) - (tOrder.get(b.theme) ?? 99));
  writeCsv(ds.F.positionSources, cols, rows);
  console.log(`sources_positions.csv : ${rows.length} lignes (${added} ajoutées), à remplir : source_titre + source_url (+ date, extrait)`);
}

// ---------- sondages.csv ----------
if (!fs.existsSync(ds.F.manual)) {
  const cols = ["type", "date", "institut", "echantillon", "scenario", "candidat", "score"];
  writeCsv(ds.F.manual, cols, [
    { type: "#EXEMPLE 1er tour", date: "2026-10-30", institut: "Ifop", echantillon: 1500, scenario: 1, candidat: "marine-le-pen", score: 35 },
    { type: "#EXEMPLE 1er tour", date: "2026-10-30", institut: "Ifop", echantillon: 1500, scenario: 1, candidat: "edouard-philippe", score: 16 },
    { type: "#EXEMPLE 2nd tour", date: "2026-10-30", institut: "Ifop", echantillon: 1500, scenario: 1, candidat: "marine-le-pen", score: 56 },
    { type: "#EXEMPLE 2nd tour", date: "2026-10-30", institut: "Ifop", echantillon: 1500, scenario: 1, candidat: "edouard-philippe", score: 44 }
  ]);
  console.log("sondages.csv : créé avec des exemples (lignes commençant par #, ignorées)");
}
