// Chargement et fusion de TOUTES les données du site.
//   data/polls.json       : sondages récupérés automatiquement (Wikipédia)
//   data/sondages.csv     : sondages ajoutés à la main (prioritaires sur le scraper)
//   data/candidates.csv   : liste, couleurs, photos, candidats actifs
//   data/themes.csv       : les thèmes du test
//   data/questions.csv    : les questions
//   data/positions.csv    : position de chaque candidat sur chaque question (1 à 5)
// Les fichiers sont relus automatiquement dès qu'on les modifie (pas besoin de redémarrer).

const fs = require("fs");
const path = require("path");
const { readCsv } = require("./csv");

const DATA = path.join(__dirname, "..", "data");
const PHOTO_DIR = path.join(__dirname, "..", "public", "photos");
const F = {
  polls: path.join(DATA, "polls.json"),
  manual: path.join(DATA, "sondages.csv"),
  candidates: path.join(DATA, "candidates.csv"),
  themes: path.join(DATA, "themes.csv"),
  questions: path.join(DATA, "questions.csv"),
  positions: path.join(DATA, "positions.csv"),
  positionsThemes: path.join(DATA, "positions_themes.csv"),
  positionSources: path.join(DATA, "sources_positions.csv"),
  actualite: path.join(DATA, "actualite.csv"),
  actualiteMeta: path.join(DATA, "actualite_meta.json"),
  actualitePositions: path.join(DATA, "actualite_positions.csv")
};

// ---------- cache par date de modification ----------
const cache = new Map();
const mtime = f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
function cached(key, files, build) {
  const stamp = files.map(mtime).join("|");
  const hit = cache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;
  const value = build();
  cache.set(key, { stamp, value });
  return value;
}

// ---------- utilitaires ----------
const strip = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = s => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
const yes = v => /^(oui|o|yes|y|true|vrai|1|x)$/i.test(String(v || "").trim());
const no = v => /^(non|n|no|false|faux|0)$/i.test(String(v || "").trim());
const num = v => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };

function parseDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
const dateLabel = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const DEFAULT_COLORS = {
  "marine-le-pen": "#1B2F7A", "jordan-bardella": "#3D52B0", "eric-zemmour": "#4A4F5C",
  "bruno-retailleau": "#2F8FDD", "laurent-wauquiez": "#2F8FDD", "edouard-philippe": "#14B8C4",
  "gabriel-attal": "#F5A524", "raphael-glucksmann": "#A455D6", "francois-hollande": "#E5487F",
  "olivier-faure": "#E5487F", "jean-luc-melenchon": "#D7263D", "fabien-roussel": "#8F1D2C",
  "nathalie-arthaud": "#C2410C", "marine-tondelier": "#2EAD5A", "david-lisnard": "#7C93A8",
  "nicolas-dupont-aignan": "#6B7A3A", "dominique-de-villepin": "#B08968", "francois-ruffin": "#E4572E",
  "philippe-poutou": "#C0392B", "jean-lassalle": "#8D6E63"
};
const FALLBACK = ["#0E9F6E", "#F59E0B", "#6366F1", "#EC4899", "#14B8A6", "#EF4444", "#84CC16", "#06B6D4"];

// ---------- thèmes, questions, positions ----------
function getThemes() {
  return cached("themes", [F.themes], () => {
    const { rows } = readCsv(F.themes);
    return rows.filter(r => r.code).map(r => ({
      code: r.code, nom: r.nom || r.code, icone: r.icone || "•", couleur: r.couleur || "#0055A4",
      poleNeg: r.pole_negatif || "", polePos: r.pole_positif || "", description: r.description || ""
    }));
  });
}

function getQuestions() {
  return cached("questions", [F.questions, F.themes], () => {
    const themes = new Set(getThemes().map(t => t.code));
    const { rows } = readCsv(F.questions);
    const out = [], issues = [], seen = new Set();
    for (const r of rows) {
      const id = Number(r.id), level = Number(r.niveau), dir = Number(String(r.sens).replace("+", ""));
      if (!Number.isInteger(id) || id <= 0) { issues.push(`questions.csv ligne ${r._line} : identifiant invalide « ${r.id} »`); continue; }
      if (seen.has(id)) { issues.push(`questions.csv ligne ${r._line} : identifiant ${id} en double`); continue; }
      if (!themes.has(r.theme)) { issues.push(`questions.csv ligne ${r._line} : thème inconnu « ${r.theme} » (voir themes.csv)`); continue; }
      if (![1, 2, 3].includes(level)) { issues.push(`questions.csv ligne ${r._line} : niveau doit valoir 1, 2 ou 3`); continue; }
      if (![1, -1].includes(dir)) { issues.push(`questions.csv ligne ${r._line} : sens doit valoir 1 ou -1`); continue; }
      if (!r.texte) { issues.push(`questions.csv ligne ${r._line} : texte vide`); continue; }
      seen.add(id);
      out.push({ id, theme: r.theme, level, dir, text: r.texte });
    }
    out.issues = issues;
    return out;
  });
}

// positions.csv : id;theme;texte;<slug candidat>;<slug candidat>...   (valeurs 1 à 5)
function getPositions() {
  return cached("positions", [F.positions], () => {
    const { rows, columns } = readCsv(F.positions);
    const fixed = new Set(["id", "theme", "texte", "question"]);
    const slugs = columns.filter(c => c && !fixed.has(c.toLowerCase()));
    const byCand = {}, issues = [];
    slugs.forEach(s => { byCand[s] = {}; });
    for (const r of rows) {
      const id = Number(r.id);
      if (!Number.isInteger(id)) continue;
      for (const s of slugs) {
        if (r[s] === "" || r[s] === undefined) continue;
        const v = num(r[s]);
        if (v === null || v < 1 || v > 5) { issues.push(`positions.csv ligne ${r._line}, colonne ${s} : la valeur doit être entre 1 et 5 (reçu « ${r[s]} »)`); continue; }
        byCand[s][id] = v;
      }
    }
    return { byCand, issues };
  });
}

// positions_themes.csv : theme;<slug candidat>;...   valeurs de -100 (1er pôle du thème) à +100 (2e pôle), comme le score du test.
// Version rapide de positions.csv : 8 thèmes au lieu de 208 questions. Sert quand les positions par question ne sont pas saisies.
function getThemePositions() {
  return cached("positionsThemes", [F.positionsThemes], () => {
    const { rows, columns } = readCsv(F.positionsThemes);
    const slugs = columns.filter(c => c && !["theme", "nom"].includes(c.toLowerCase()));
    const byCand = {}, issues = [];
    slugs.forEach(s => { byCand[s] = {}; });
    for (const r of rows) {
      const code = String(r.theme || "").trim();
      if (!code) continue;
      for (const s of slugs) {
        if (r[s] === "" || r[s] === undefined) continue;
        const v = num(r[s]);
        if (v === null || v < -100 || v > 100) { issues.push(`positions_themes.csv ligne ${r._line}, colonne ${s} : valeur entre -100 et 100 attendue (reçu « ${r[s]} »)`); continue; }
        byCand[s][code] = v;
      }
    }
    return { byCand, issues };
  });
}

// sources_positions.csv : candidat;theme;source_titre;source_url;date;extrait   (une ligne par source ; plusieurs lignes possibles par candidat et thème)
// Sert à justifier chaque position affichée : « d'où ça vient ? ». Les colonnes en plus (position_calculee…) sont ignorées.
function getPositionSources() {
  return cached("positionSources", [F.positionSources], () => {
    const { rows } = readCsv(F.positionSources);
    const byCand = {}, issues = [];
    for (const r of rows) {
      const slug = String(r.candidat || r.slug || "").trim(), theme = String(r.theme || "").trim();
      const titre = String(r.source_titre || r.titre || "").trim(), url = String(r.source_url || r.url || "").trim();
      if (!slug && !theme && !titre && !url) continue;
      if (!titre && !url) continue;                                 // ligne du modèle pas encore remplie
      if (!slug || !theme) { issues.push(`sources_positions.csv ligne ${r._line} : candidat et thème obligatoires`); continue; }
      if (url && !/^https?:\/\//i.test(url)) { issues.push(`sources_positions.csv ligne ${r._line} : l'adresse doit commencer par http:// ou https:// (reçu « ${url} »)`); continue; }
      ((byCand[slug] ||= {})[theme] ||= []).push({ titre: titre || url, url, date: String(r.date || "").trim(), extrait: String(r.extrait || "").trim() });
    }
    return { byCand, issues };
  });
}

// ---------- module « Actualité du mois » ----------
// actualite.csv : id;sujet;texte ; actualite_positions.csv : question;candidat;note(1-5);source_titre;source_url;date;extrait ; actualite_meta.json : titre, intro, contexte
function getActualite() {
  return cached("actualite", [F.actualite, F.actualiteMeta, F.actualitePositions], () => {
    const issues = [];
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(F.actualiteMeta, "utf8")); } catch { /* pas de module */ }
    const questions = [];
    try {
      for (const r of readCsv(F.actualite).rows) {
        const id = String(r.id || "").trim(), texte = String(r.texte || "").trim();
        if (id && texte) questions.push({ id, sujet: String(r.sujet || "").trim(), texte });
      }
    } catch { /* fichier absent */ }
    const ids = new Set(questions.map(q => q.id)), positions = {};
    try {
      for (const r of readCsv(F.actualitePositions).rows) {
        const q = String(r.question || "").trim(), c = String(r.candidat || "").trim(), n = Number(String(r.note || "").replace(",", "."));
        if (!q && !c) continue;
        if (!ids.has(q)) { issues.push(`actualite_positions.csv ligne ${r._line} : question « ${q} » inconnue`); continue; }
        if (!Number.isInteger(n) || n < 1 || n > 5) { issues.push(`actualite_positions.csv ligne ${r._line} : la note doit être un entier de 1 à 5`); continue; }
        const url = String(r.source_url || "").trim();
        if (!url || !/^https?:\/\//i.test(url)) { issues.push(`actualite_positions.csv ligne ${r._line} : adresse de source obligatoire (http/https)`); continue; }
        ((positions[q] ||= {})[c] = { note: n, titre: String(r.source_titre || "").trim(), url, date: String(r.date || "").trim(), extrait: String(r.extrait || "").trim() });
      }
    } catch { /* fichier absent */ }
    return { meta, questions, positions, issues };
  });
}

// ---------- candidats + sondages ----------
function readScraped() {
  try { return JSON.parse(fs.readFileSync(F.polls, "utf8")); }
  catch { return { updatedAt: null, source: null, firstRound: [], matchups: [], candidates: {} }; }
}

function localPhoto(slug) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) if (fs.existsSync(path.join(PHOTO_DIR, `${slug}.${ext}`))) return `/photos/${slug}.${ext}`;
  return null;
}

const ORIENT = new Set(["extreme-gauche", "gauche", "centre", "droite", "extreme-droite", "divers"]);

function getPolls() {
  let photoStamp = ""; try { photoStamp = fs.readdirSync(PHOTO_DIR).join(","); } catch { /* dossier absent */ }
  return cached("polls:" + photoStamp, [F.polls, F.manual, F.candidates], () => {
    const base = readScraped();
    const issues = [];

    // 1) candidats : scraper + candidates.csv
    const cands = {};
    for (const [slug, c] of Object.entries(base.candidates || {})) cands[slug] = { ...c, slug, scrapedPhoto: c.photo || null };
    const csv = readCsv(F.candidates);
    const csvBySlug = {};
    for (const r of csv.rows) {
      if (!r.slug) continue;
      csvBySlug[r.slug] = r;
      const c = (cands[r.slug] ||= { slug: r.slug, name: r.nom || r.slug, shortName: r.nom_court || r.nom || r.slug, party: r.parti || "", generic: false, scrapedPhoto: null });
      if (r.nom) c.name = r.nom;
      if (r.nom_court) c.shortName = r.nom_court;
      if (r.parti) c.party = r.parti;
      if (r.orientation && !ORIENT.has(r.orientation)) issues.push(`candidates.csv ligne ${r._line} : orientation « ${r.orientation} » inconnue (extreme-gauche, gauche, centre, droite, extreme-droite, divers)`);
    }
    // table de correspondance nom -> slug (pour sondages.csv)
    const lookup = new Map();
    for (const c of Object.values(cands)) [c.slug, c.name, c.shortName].forEach(v => v && lookup.set(norm(v), c.slug));
    const resolve = token => lookup.get(norm(token)) || null;

    // 2) sondages ajoutés à la main
    const manual = readCsv(F.manual);
    const m1 = new Map(), m2 = new Map();
    for (const r of manual.rows) {
      const where = `sondages.csv ligne ${r._line}`;
      const date = parseDate(r.date);
      const type = /^(1|prem|t1)/i.test(r.type) ? 1 : /^(2|seco|deux|t2)/i.test(r.type) ? 2 : 0;
      const slug = resolve(r.candidat), score = num(r.score);
      if (!type) { issues.push(`${where} : type doit être « 1er tour » ou « 2nd tour »`); continue; }
      if (!date) { issues.push(`${where} : date invalide « ${r.date} » (format AAAA-MM-JJ ou JJ/MM/AAAA)`); continue; }
      if (!slug) { issues.push(`${where} : candidat inconnu « ${r.candidat} » (ajoutez-le dans candidates.csv)`); continue; }
      if (score === null || score < 0 || score > 100) { issues.push(`${where} : score invalide « ${r.score} »`); continue; }
      const key = `${r.institut}|${date}|${num(r.echantillon) ?? ""}`;   // même institut, même date, échantillons différents : sondages distincts
      const target = type === 1 ? m1 : m2;
      if (!target.has(key)) target.set(key, { pollster: r.institut || "Inconnu", date, sample: num(r.echantillon), scenarios: new Map() });
      const poll = target.get(key);
      const sc = r.scenario || "1";
      if (!poll.scenarios.has(sc)) poll.scenarios.set(sc, {});
      poll.scenarios.get(sc)[slug] = score;
    }

    // 3) fusion 1er tour
    // un sondage saisi remplace celui importé du même institut et de la même date (et du même échantillon si vous l'indiquez)
    const sameSample = (a, b) => a == null || b == null || a === b;
    const replaced = p => [...m1.values()].some(m => norm(m.pollster) === norm(p.pollster) && m.date === p.date && sameSample(m.sample, p.sample));
    let firstRound = (base.firstRound || []).filter(p => !replaced(p));
    for (const p of m1.values()) {
      firstRound.push({
        pollster: p.pollster, dateLabel: dateLabel(p.date), date: p.date, sample: p.sample, manual: true,
        scenarios: [...p.scenarios.values()].map(values => ({ values, others: null }))
      });
    }
    firstRound.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // 4) fusion 2nd tour (clé canonique = slugs triés)
    const pairKey = (a, b) => [a, b].sort().join("--");
    const duels = new Map();
    const addDuelPoll = (a, b, poll, extra = {}) => {
      const key = pairKey(a, b);
      if (!duels.has(key)) duels.set(key, { key, candidates: [a, b], absentFromFirstRound: !!extra.absent, polls: [] });
      const d = duels.get(key);
      const dup = d.polls.findIndex(x => norm(x.pollster) === norm(poll.pollster) && x.date === poll.date && (x.sample == null || poll.sample == null || x.sample === poll.sample));
      if (dup >= 0) { if (poll.manual) d.polls[dup] = poll; } else d.polls.push(poll);
    };
    for (const m of base.matchups || []) {
      const [a, b] = m.candidates;
      for (const p of m.polls) addDuelPoll(a, b, p, { absent: m.absentFromFirstRound });
    }
    for (const p of m2.values()) {
      for (const values of p.scenarios.values()) {
        const ks = Object.keys(values);
        if (ks.length !== 2) { issues.push(`sondages.csv : sondage de 2nd tour « ${p.pollster} ${p.date} » : il faut exactement 2 candidats par scénario`); continue; }
        addDuelPoll(ks[0], ks[1], { pollster: p.pollster, dateLabel: dateLabel(p.date), date: p.date, sample: p.sample, values, manual: true });
      }
    }
    const matchups = [...duels.values()].map(d => {
      d.polls.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
      d.title = d.candidates.map(s => (cands[s] ? cands[s].shortName : s)).join(" – ");
      return d;
    }).sort((x, y) => (y.polls[0]?.date || "").localeCompare(x.polls[0]?.date || ""));

    // 5) candidats finaux : actifs, couleurs, photos, ordre
    const latest = firstRound.find(p => p.date)?.date || "";
    const since = latest ? new Date(new Date(latest + "T00:00:00Z").getTime() - 150 * 864e5).toISOString().slice(0, 10) : "";
    const recent = new Set();
    firstRound.filter(p => p.date >= since).forEach(p => p.scenarios.forEach(s => Object.keys(s.values).forEach(k => recent.add(k))));
    matchups.filter(m => (m.polls[0]?.date || "") >= since).forEach(m => m.candidates.forEach(k => recent.add(k)));

    let colorIdx = 0, orderIdx = 0;
    const out = {};
    for (const [slug, c] of Object.entries(cands)) {
      const r = csvBySlug[slug];
      let active = !c.generic && recent.has(slug);
      if (r && !c.generic) active = !no(r.actif);          // règle : tout candidat de candidates.csv est actif, sauf « non »
      if (r && yes(r.actif)) active = true;
      let photo = c.scrapedPhoto, isLocal = false;
      const lp = localPhoto(slug);
      if (lp) { photo = lp; isLocal = true; }
      if (r && r.photo) { photo = /^https?:/i.test(r.photo) ? r.photo : `/photos/${r.photo}`; isLocal = !/^https?:/i.test(r.photo); }
      out[slug] = {
        slug, name: c.name, shortName: c.shortName, party: c.party, generic: !!c.generic, active,
        color: (r && /^#[0-9a-f]{3,8}$/i.test(r.couleur)) ? r.couleur : DEFAULT_COLORS[slug] || FALLBACK[colorIdx++ % FALLBACK.length],
        orientation: (r && ORIENT.has(r.orientation)) ? r.orientation : null,
        photo: photo || null, photoIsLocal: isLocal, photoPage: c.photoPage || null,
        order: r && num(r.ordre) !== null ? num(r.ordre) : 1000 + orderIdx++
      };
    }
    const activeSlugs = Object.values(out).filter(c => c.active).sort((a, b) => a.order - b.order).map(c => c.slug);

    // 6) contrôle : candidats inconnus dans les sondages
    return { updatedAt: base.updatedAt, source: base.source, firstRound, matchups, candidates: out, activeSlugs, issues };
  });
}

module.exports = { getThemes, getQuestions, getPositions, getThemePositions, getPositionSources, getActualite, getPolls, DATA, F, norm, strip };
