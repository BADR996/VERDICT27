// Vérifie tous vos fichiers de données et dit clairement ce qui ne va pas.
// Usage : npm run check-data

const fs = require("fs");
const path = require("path");
const ds = require("../lib/dataset");

const polls = ds.getPolls();
const questions = ds.getQuestions();
const themes = ds.getThemes();
const pos = ds.getPositions();
let problems = 0;
const bad = msg => { problems++; console.log("  ✗ " + msg); };
const ok = msg => console.log("  ✓ " + msg);

console.log("\nCANDIDATS");
const active = polls.activeSlugs.map(s => polls.candidates[s]);
ok(`${Object.keys(polls.candidates).length} candidats au total, ${active.length} actifs`);
const noPhoto = active.filter(c => !c.photo);
if (noPhoto.length) console.log("  ! " + `sans photo (initiales affichées) : ${noPhoto.map(c => c.slug).join(", ")}  -> déposez public/photos/<slug>.jpg`);
else ok("tous les candidats actifs ont une photo");
const photoDir = path.join(__dirname, "..", "public", "photos");
try {
  for (const f of fs.readdirSync(photoDir)) {
    const m = f.match(/^(.+)\.(jpg|jpeg|png|webp)$/i);
    if (m && !polls.candidates[m[1]]) bad(`photo « ${f} » : aucun candidat « ${m[1]} » (le nom doit être le slug de candidates.csv)`);
  }
} catch { /* dossier absent */ }

console.log("\nSONDAGES");
ok(`${polls.firstRound.length} sondages du 1er tour, ${polls.matchups.length} duels de 2nd tour`);
ok(`${polls.firstRound.filter(p => p.manual).length} sondages du 1er tour saisis à la main`);
polls.issues.forEach(bad);

console.log("\nTHÈMES ET QUESTIONS");
ok(`${themes.length} thèmes, ${questions.length} questions`);
(questions.issues || []).forEach(bad);
for (const t of themes) {
  const q = questions.filter(x => x.theme === t.code);
  const l = [1, 2, 3].map(n => q.filter(x => x.level <= n).length);
  const pos_ = q.filter(x => x.dir > 0).length;
  console.log(`    ${t.icone} ${t.nom.padEnd(20)} ${String(q.length).padStart(3)} questions (rapide ${l[0]}, moyen ${l[1]}, précis ${l[2]}) · sens +1 : ${pos_}, sens -1 : ${q.length - pos_}`);
  if (q.length && (pos_ === 0 || pos_ === q.length)) bad(`thème « ${t.nom} » : toutes les questions ont le même sens (le test sera biaisé). Mélangez des questions de sens +1 et -1.`);
  if (q.filter(x => x.level === 1).length === 0) bad(`thème « ${t.nom} » : aucune question de niveau 1 (absent du test rapide)`);
}
const totals = [1, 2, 3].map(n => questions.filter(x => x.level <= n).length);
console.log(`    Test rapide : ${totals[0]} questions, moyen : ${totals[1]}, précis : ${totals[2]}`);

console.log("\nPOSITIONS DES CANDIDATS (pour « votre candidat le plus proche »)");
pos.issues.forEach(bad);
let any = false;
for (const [slug, map] of Object.entries(pos.byCand)) {
  const n = Object.keys(map).length;
  if (!polls.candidates[slug]) { bad(`colonne « ${slug} » de positions.csv : candidat inconnu`); continue; }
  if (n > 0) any = true;
  const pct = Math.round((n / questions.length) * 100);
  console.log(`    ${slug.padEnd(26)} ${String(n).padStart(3)}/${questions.length} questions notées (${pct} %)`);
}
// Cohérence avec le sens des phrases : pour un candidat et un thème, si la plupart des réponses vont dans un sens
// et quelques-unes dans l'autre, ces dernières sont probablement à l'envers.
{
  const qd = Object.fromEntries(questions.map(q => [q.id, q]));
  const rep = [];
  for (const [slug, map] of Object.entries(pos.byCand)) {
    for (const th of themes) {
      const up = [], down = [];
      for (const [id, v] of Object.entries(map)) {
        const q = qd[id];
        if (!q || q.theme !== th.code || v === 3) continue;
        ((v - 3) * q.dir > 0 ? up : down).push(Number(id));
      }
      const [maj, min] = up.length >= down.length ? [up, down] : [down, up];
      if (min.length && min.length <= maj.length / 2) rep.push(`${slug} / ${th.nom} : questions ${min.sort((a, b) => a - b).join(", ")}`);
    }
  }
  if (rep.length) {
    console.log(`  ! ${rep.length} cas où des notes vont à l'envers du sens de la phrase (à corriger dans positions.csv) :`);
    rep.slice(0, 12).forEach(r => console.log("      " + r));
    if (rep.length > 12) console.log(`      … et ${rep.length - 12} autres`);
  } else ok("les notes de positions.csv sont cohérentes avec le sens des questions");
}
// Sources des positions + candidats dont les positions semblent « par défaut »
{
  const { candidateThemeScores } = require("../scoring");
  const sc = candidateThemeScores(), srcs = ds.getPositionSources();
  srcs.issues.forEach(bad);
  ds.getActualite().issues.forEach(bad);
  let withPos = 0, sourced = 0;
  const flat = [];
  for (const [slug, t] of Object.entries(sc)) {
    for (const code of Object.keys(t)) { withPos++; if ((srcs.byCand[slug] || {})[code]) sourced++; }
    if (Object.keys(t).length >= 4 && Object.values(t).every(v => Math.abs(v) <= 15)) flat.push(slug);
    if (!polls.candidates[slug]) bad(`sources/positions : candidat « ${slug} » inconnu`);
  }
  for (const slug of Object.keys(srcs.byCand)) if (!polls.candidates[slug]) bad(`sources_positions.csv : candidat « ${slug} » inconnu`);
  console.log(`  ${sourced}/${withPos} positions ont au moins une source (sources_positions.csv)`);
  if (withPos && sourced < withPos) console.log("  ! les positions sans source s'affichent « source à compléter » ; renseignez source_titre et source_url dans data/sources_positions.csv");
  if (flat.length) console.log(`  ! ${flat.length} candidat(s) ont des positions toutes proches du centre (valeurs par défaut ?) : ${flat.slice(0, 8).join(", ")}${flat.length > 8 ? "…" : ""}. Ils risquent d'apparaître « proches de tout le monde » dans les résultats.`);
}
const tp = ds.getThemePositions();
tp.issues.forEach(bad);
for (const [slug, map] of Object.entries(tp.byCand)) {
  if (!polls.candidates[slug]) { bad(`colonne « ${slug} » de positions_themes.csv : candidat inconnu`); continue; }
  const n = Object.keys(map).length;
  if (n > 0) any = true;
  console.log(`    ${slug.padEnd(26)} ${String(n).padStart(3)}/${themes.length} thèmes notés (positions_themes.csv)`);
}
if (!any) console.log("    (aucune position saisie : la section « candidat le plus proche » reste masquée sur le site)");
else ok("section « candidat le plus proche » activée pour les candidats ayant au moins 4 thèmes notés (positions_themes.csv) ou 8 questions notées (positions.csv)");

console.log(problems ? `\n${problems} problème(s) à corriger.\n` : "\nTout est bon.\n");
process.exit(problems ? 1 : 0);
