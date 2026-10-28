// Tests de base : npm test
const test = require("node:test");
const assert = require("node:assert");
const ds = require("../lib/dataset");
const sc = require("../scoring");
const seo = require("../lib/seo");
const { buildDigest } = require("../lib/digest");
const st = require("../lib/stats");

const fakeReq = { protocol: "https", get: () => "exemple.fr" };

test("tailles du test : express = 1 question par thème, tailles croissantes", () => {
  const n = k => sc.themesForTier(k).reduce((s, t) => s + t.questions.length, 0);
  assert.strictEqual(n("express"), ds.getThemes().length);
  assert.ok(n("express") < n("quick") && n("quick") < n("medium") && n("medium") <= n("full"));
});

test("score : tout approuver dans le sens +1 donne +100 sur chaque thème", () => {
  const answers = {};
  for (const q of ds.getQuestions()) answers[q.id] = q.dir > 0 ? 5 : 1;
  for (const r of Object.values(sc.score(answers))) assert.strictEqual(r.score, 100);
});

test("un candidat est à 100 % de lui-même", () => {
  const [slug, themes] = Object.entries(sc.candidateThemeScores()).find(([, t]) => Object.keys(t).length >= 4);
  const m = sc.matchesFromScores(themes).find(x => x.slug === slug);
  assert.strictEqual(m.pct, 100);
});

test("positions.csv : aucune note à l'envers du sens des questions", () => {
  const qd = Object.fromEntries(ds.getQuestions().map(q => [q.id, q]));
  let bad = 0;
  for (const map of Object.values(ds.getPositions().byCand)) {
    for (const th of ds.getThemes()) {
      let up = 0, down = 0;
      for (const [id, v] of Object.entries(map)) { const q = qd[id]; if (q && q.theme === th.code && v !== 3) ((v - 3) * q.dir > 0 ? up++ : down++); }
      if (Math.min(up, down) && Math.min(up, down) <= Math.max(up, down) / 2) bad++;
    }
  }
  assert.strictEqual(bad, 0);
});

test("pages serveur : fiche candidat, duel, liste, plan du site", () => {
  const polls = ds.getPolls();
  const slug = polls.activeSlugs.find(s => !polls.candidates[s].generic);
  assert.ok(seo.candidatePage(fakeReq, slug).includes(polls.candidates[slug].name));
  assert.strictEqual(seo.candidatePage(fakeReq, "n-existe-pas"), null);
  if (polls.matchups.length) assert.ok(seo.duelPage(fakeReq, polls.matchups[0].key).includes("Second tour"));
  assert.ok(seo.candidatesPage(fakeReq).includes("/candidat/"));
  assert.ok(seo.sitemap(fakeReq).includes("https://exemple.fr/candidats"));
});

test("moyennes : les deux premiers sont bien classés par ordre décroissant", () => {
  const a = st.averages(ds.getPolls(), 60, true);
  assert.ok(a.rows.length >= 2);
  for (let i = 1; i < a.rows.length; i++) assert.ok(a.rows[i - 1].avg >= a.rows[i].avg);
  assert.strictEqual(st.qualified(ds.getPolls()).length, 2);
});

test("alerte mensuelle : objet, texte et lien de désinscription", () => {
  const d = buildDigest("https://exemple.fr");
  assert.ok(d.subject.startsWith("Présidentielle 2027"));
  assert.ok(d.text("https://exemple.fr/desabonnement?t=x").includes("désinscrire"));
  assert.ok(d.html("https://exemple.fr/desabonnement?t=x").includes("desabonnement?t=x"));
});

test("qualifiés : égalité à la 2e place → les deux sont retenus", () => {
  const st = require("../lib/stats");
  const mk = (a, b, c) => ({
    activeSlugs: ["x", "y", "z"],
    candidates: { x: { slug: "x" }, y: { slug: "y" }, z: { slug: "z" } },
    firstRound: [{ date: "2026-10-01", scenarios: [{ values: { x: a, y: b, z: c } }] }]
  });
  assert.deepStrictEqual(st.qualified(mk(30, 15, 15)), ["x", "y", "z"]);
  assert.deepStrictEqual(st.qualified(mk(30, 15, 12)), ["x", "y"]);
});

test("actualité du mois : questions chargées, chaque position a une source", () => {
  const a = ds.getActualite();
  assert.ok(a.questions.length >= 5);
  assert.deepStrictEqual(a.issues, []);
  for (const byC of Object.values(a.positions)) for (const p of Object.values(byC)) assert.ok(/^https?:\/\//.test(p.url));
});
