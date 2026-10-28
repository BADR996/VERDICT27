const ds = require("./lib/dataset");

// Tailles du test : niveau maximal de question inclus
const TIERS = {
  express: { label: "Express", maxLevel: 1, perTheme: 1, minutes: 2, precision: "Très approximatif" },
  quick:  { label: "Rapide", maxLevel: 1, minutes: 3,  precision: "Indicatif" },
  medium: { label: "Moyen",  maxLevel: 2, minutes: 8,  precision: "Fiable" },
  full:   { label: "Précis", maxLevel: 3, minutes: 25, precision: "Très fin" }
};

// Thèmes avec leurs questions pour une taille donnée (ordre stable : celui de themes.csv, puis les identifiants).
function themesForTier(tier) {
  const t = TIERS[tier];
  if (!t) return null;
  const questions = ds.getQuestions().filter(q => q.level <= t.maxLevel);
  return ds.getThemes().map(th => {
    let qs = questions.filter(q => q.theme === th.code).sort((a, b) => a.id - b.id);
    if (t.perTheme) qs = mostDiscriminating(qs).slice(0, t.perTheme);
    return { ...th, questions: qs };
  }).filter(th => th.questions.length);
}

// Pour le test express : la question qui sépare le mieux les candidats (écart maximal entre leurs positions).
// Sans positions renseignées, on garde l'ordre habituel.
function mostDiscriminating(qs) {
  const byCand = Object.values(ds.getPositions().byCand);
  const spread = q => {
    const v = byCand.map(m => m[q.id]).filter(x => x !== undefined);
    if (v.length < 3) return 0;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  };
  return [...qs].sort((a, b) => spread(b) - spread(a) || a.id - b.id);
}

// answers : { [idQuestion]: 1..5 }  (1 = pas du tout d'accord, 5 = tout à fait d'accord)
// Score par thème de -100 (pôle négatif) à +100 (pôle positif), sur les questions répondues.
function score(answers) {
  const questions = ds.getQuestions();
  const result = {};
  for (const th of ds.getThemes()) {
    let sum = 0, max = 0, n = 0;
    for (const q of questions) {
      if (q.theme !== th.code) continue;
      const a = Number(answers[q.id]);
      if (!Number.isInteger(a) || a < 1 || a > 5) continue;
      sum += (a - 3) * q.dir;
      max += 2;
      n++;
    }
    result[th.code] = {
      code: th.code, nom: th.nom, icone: th.icone, couleur: th.couleur,
      poleNeg: th.poleNeg, polePos: th.polePos,
      answered: n, score: max === 0 ? null : Math.round((sum / max) * 100)
    };
  }
  return result;
}

// Positions des candidats par thème (échelle du score : -100 à +100).
// Source 1 : positions_themes.csv (saisie rapide). Source 2 : positions.csv (question par question), moyennée par thème.
function candidateThemeScores() {
  const out = {};
  const q = ds.getPositions().byCand;
  for (const [slug, pos] of Object.entries(q)) {
    const sc = score(pos), t = {};
    for (const [code, r] of Object.entries(sc)) if (r.score !== null && r.answered >= 3) t[code] = r.score;
    if (Object.keys(t).length) out[slug] = t;
  }
  for (const [slug, t] of Object.entries(ds.getThemePositions().byCand)) {
    if (Object.keys(t).length) out[slug] = { ...(out[slug] || {}), ...t };   // la saisie par thème a priorité
  }
  return out;
}

// Proximité avec chaque candidat : 100 % = mêmes positions, 0 % = opposées, sur les thèmes où les deux sont renseignés.
// Un candidat n'est classé que s'il y a au moins 4 thèmes communs (sinon le résultat ne voudrait rien dire).
const MIN_THEMES = 4;
const MIN_SHARED = MIN_THEMES;
function matches(answers) { return matchesFromScores(score(answers)); }

// scores : { code: { score } } (sortie de score()) ou { code: nombre } (profil partagé par lien)
function matchesFromScores(scores) {
  const polls = ds.getPolls();
  const mine = {};
  for (const [code, v] of Object.entries(scores || {})) mine[code] = { score: typeof v === "number" ? v : (v && v.score) };
  const cands = candidateThemeScores();
  const out = [];
  for (const [slug, t] of Object.entries(cands)) {
    const c = polls.candidates[slug];
    if (!c) continue;
    const themes = {};
    let sum = 0, n = 0;
    for (const [code, v] of Object.entries(t)) {
      const u = mine[code] && mine[code].score;
      if (u === null || u === undefined) continue;
      const agree = 1 - Math.abs(u - v) / 200;
      themes[code] = Math.round(agree * 100);
      sum += agree; n++;
    }
    if (n < MIN_THEMES) continue;
    out.push({ slug, pct: Math.round((sum / n) * 100), shared: n, themes, scores: t });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

module.exports = { TIERS, themesForTier, score, matches, matchesFromScores, candidateThemeScores, MIN_SHARED };
