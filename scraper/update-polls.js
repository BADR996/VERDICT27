// Agrégateur de sondages : lit la page Wikipédia « Liste de sondages sur l'élection
// présidentielle française de 2027 » et écrit data/polls.json.
//
// Usage :
//   node scraper/update-polls.js                 -> télécharge la page en ligne (API Wikipédia)
//   node scraper/update-polls.js --file page.html -> lit une page enregistrée (test hors ligne)
//
// Particularités de la page, gérées ici :
//  - en-têtes sur 2 lignes : les noms des candidats sont dans des liens (titre de l'article) et
//    les photos dans des images de la 1re ligne d'en-tête ;
//  - cellules fusionnées (rowspan) : un sondage = plusieurs lignes (« scénarios ») ;
//  - dates sans année dans les tableaux du 1er tour : l'année vient des titres « Année 2026 » ;
//  - valeurs du type « <1 », « 17,5 », « — » (candidat non testé).

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const PAGE = "Liste_de_sondages_sur_l'élection_présidentielle_française_de_2027";
const API = "https://fr.wikipedia.org/w/api.php";
const SOURCE_URL = "https://fr.wikipedia.org/wiki/" + encodeURIComponent(PAGE).replace(/%27/g, "'");
const OUT = path.join(__dirname, "..", "data", "polls.json");
const UA = "politest/0.2 (agrégateur de sondages ; contact : votre-email@exemple.fr)";

// ---------- utilitaires ----------
const clean = s => (s || "").replace(/ | /g, " ").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
const strip = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = s => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function parseValue(raw) {
  const t = clean(raw).replace(/\s/g, "");
  if (!t || /^[—–-]+$/.test(t)) return null;           // non testé
  const lt = t.startsWith("<");                         // « <1 » => 0,5
  const m = t.replace(",", ".").match(/\d+(\.\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return lt ? v / 2 : v;
}

const MONTHS = [
  ["jan", 1], ["fev", 2], ["mar", 3], ["avr", 4], ["mai", 5], ["juin", 6],
  ["juil", 7], ["aou", 8], ["sep", 9], ["oct", 10], ["nov", 11], ["dec", 12]
];
function monthOf(word) {
  const w = strip(word.toLowerCase()).replace(/\./g, "");
  for (const [p, n] of MONTHS) if (w.startsWith(p)) return n;
  return null;
}

// Renvoie la date de FIN du sondage (ISO) à partir de libellés comme « 21-22 octobre »,
// « 28 septembre-1er octobre 2026 », « 17-19 octobre 2026 ».
function parseEndDate(label, defaultYear) {
  const txt = clean(label);
  const ym = txt.match(/\b(20\d\d)\b/);
  const year = ym ? Number(ym[1]) : defaultYear;
  const re = /(\d{1,2})\s*(?:er|re)?\s*([A-Za-zÀ-ÿ.]{3,})/g;
  let last = null, m;
  while ((m = re.exec(txt))) {
    const mon = monthOf(m[2]);
    if (mon) last = { day: Number(m[1]), mon };
  }
  if (!last || !year) return null;
  return `${year}-${String(last.mon).padStart(2, "0")}-${String(last.day).padStart(2, "0")}`;
}

// ---------- tableau -> grille (gère rowspan / colspan) ----------
function buildGrid($, table) {
  const grid = [];
  const pending = [];
  $(table).find("tr").each((_, tr) => {
    const cells = [];
    let col = 0;
    const fill = () => {
      while (pending[col] && pending[col].left > 0) {
        cells.push({ ...pending[col].cell, spanned: true });
        pending[col].left--;
        col++;
      }
    };
    const rowInfo = { tr, cells, isEvent: false };
    $(tr).children("th,td").each((__, el) => {
      fill();
      const $el = $(el);
      const rs = Math.max(1, parseInt($el.attr("rowspan") || "1", 10));
      const cs = Math.max(1, parseInt($el.attr("colspan") || "1", 10));
      if (cs >= 5) rowInfo.isEvent = true;               // ligne d'événement (déclaration de candidature…)
      const cell = { el, $el, tag: el.tagName.toUpperCase(), text: clean($el.text()), spanned: false, col, cs };
      // Colonnes PHYSIQUES : une cellule fusionnée sur 2 colonnes occupe 2 positions. Un candidat est
      // lu à la position de départ de sa colonne d'en-tête (cell.col), ce qui reste juste même si
      // l'en-tête et les données ne fusionnent pas les mêmes colonnes.
      for (let k = 0; k < cs; k++) {
        cells.push(k === 0 ? cell : { ...cell, spanned: true });
        if (rs > 1) pending[col] = { left: rs - 1, cell };
        col++;
      }
    });
    fill();
    grid.push(rowInfo);
  });
  return grid;
}

// Extrait les candidats depuis les 2 lignes d'en-tête.
function parseHeader($, grid) {
  // lignes d'en-tête = lignes contenant au moins un <th> propre (pas hérité d'un rowspan)
  const headRows = grid.filter(r => r.cells.some(c => c.tag === "TH" && !c.spanned));
  if (headRows.length < 2) return null;
  const imgRow = headRows[0], nameRow = headRows[1];
  const nameCells = nameRow.cells.filter(c => c.tag === "TH" && !c.spanned);
  // cellules d'images de la 1re ligne d'en-tête, retrouvées par position de colonne
  const imgAt = col => imgRow.cells.find(x => !x.spanned && x.tag === "TH" && x.col === col);

  const candidates = nameCells.map(c => {
    // 1er lien hors <small> (parti) et <sup> (notes) = le candidat
    const a = c.$el.find("a").filter((_, x) => $(x).closest("small, sup").length === 0).first();
    const name = clean(a.attr("title") || a.text() || c.text).replace(/\s*\([^)]*\)\s*$/, "");
    const shortName = clean(c.$el.clone().children("small, sup").remove().end().text()).replace(/\(.*$/, "").trim() || name;
    const party = (c.text.match(/\(([^)]+)\)/) || [])[1] || "";
    let file = null;
    const imgCell = imgAt(c.col);
    const img = imgCell && imgCell.$el.find("img").first();
    if (img && img.length) {
      const res = img.attr("resource") || imgCell.$el.find("a.mw-file-description").attr("href") || "";
      const fm = res.match(/(?:Fichier|File):([^?#]+)/);
      if (fm) file = decodeURIComponent(fm[1]);
    }
    return { name, shortName: shortName.replace(/\s+/g, " "), party, slug: slug(name), file, col: c.col };
  });
  const lastCell = nameCells[nameCells.length - 1];
  // les données commencent après la dernière ligne d'en-tête (les lignes vides sont ignorées plus loin)
  return { candidates, dataStart: grid.indexOf(nameRow) + 1, othersCol: lastCell.col + lastCell.cs };
}

const photoUrl = file => file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=160` : null;
const photoPage = file => file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}` : null;

const REJECTED = [];   // scénarios écartés par le contrôle de cohérence (affichés dans la console)

const cleanPollster = s => clean(s).replace(/\s*\[archive\]\s*/i, "").trim();
const parseSample = s => { const n = parseInt(clean(s).replace(/\s/g, ""), 10); return Number.isFinite(n) ? n : null; };

// ---------- 1er tour ----------
function parseFirstRound($, table, year, resolveName) {
  const grid = buildGrid($, table);
  const head = parseHeader($, grid);
  if (!head) return { polls: [], candidates: [] };
  const polls = [];
  let current = null;
  for (const row of grid.slice(head.dataStart)) {
    if (row.isEvent) continue;
    const c = row.cells;
    if (/^résultats/i.test(clean(c[0].text))) continue;               // résultat officiel d'une élection passée, pas un sondage
    if (c.length < head.othersCol) continue;
    if (head.candidates.every(cand => c[cand.col].text === "")) continue;   // ligne vide (espaceur)
    if (!c[0].spanned || !current) {
      const label = clean(c[1].text);
      current = {
        pollster: cleanPollster(c[0].text),
        dateLabel: label,
        date: parseEndDate(label, year),
        sample: parseSample(c[2].text),
        scenarios: []
      };
      polls.push(current);
    }
    const values = {};
    let group = 0;
    const addSub = sub => {
      const sv = parseValue(sub[1]), sl = resolveName ? resolveName(sub[2].trim()) : null;
      if (sv === null) return;
      if (sl) values[sl] = sv; else group += sv;
    };                                  // valeurs partagées par plusieurs candidats (ex. « 26 % » pour un bloc)
    const seen = new Set();
    head.candidates.forEach(cand => {
      const cell = c[cand.col];
      const covers = head.candidates.filter(k => k.col >= cell.col && k.col < cell.col + cell.cs).length;
      const sub = cell.text.match(/^(<?\d+(?:[.,]\d+)?)\s*([A-Za-zÀ-ÿ'’ -]{3,})$/);   // « 10Glucksmann » : case d'une colonne générique
      if (covers > 1) {                             // une seule valeur pour plusieurs colonnes : pas attribuable à une colonne
        if (!seen.has(cell.col)) {
          seen.add(cell.col);
          if (sub) addSub(sub);
          else { const g = parseValue(cell.text); if (g !== null) group += g; }
        }
        return;
      }
      if (sub) { addSub(sub); return; }
      const v = parseValue(cell.text);
      if (v !== null) values[cand.slug] = v;
    });
    // colonnes sans en-tête propre (2e colonne d'un en-tête fusionné) : seules les cases « 15 Philippe » sont exploitables
    const named = new Set(head.candidates.map(k => k.col));
    for (let col = head.candidates[0].col; col <= head.candidates[head.candidates.length - 1].col; col++) {
      if (named.has(col) || !c[col] || c[col].spanned) continue;
      const xs = c[col].text.match(/^(<?\d+(?:[.,]\d+)?)\s*([A-Za-zÀ-ÿ'’ -]{3,})$/);
      if (xs) addSub(xs);
    }
    let others = null;
    if (c[head.othersCol]) {
      const osub = c[head.othersCol].text.match(/^(<?\d+(?:[.,]\d+)?)\s*([A-Za-zÀ-ÿ'’ -]{3,})$/);
      if (osub) addSub(osub); else others = parseValue(c[head.othersCol].text);
    }
    // Contrôle de cohérence : un scénario complet fait ~100 % (candidats + groupes + « autres »).
    // Si ce n'est pas le cas, les colonnes sont probablement mal alignées : on l'écarte.
    const total = Object.values(values).reduce((s, v) => s + v, 0) + group + (others || 0);
    if (!Object.keys(values).length) continue;
    if (total < 88 || total > 108) { REJECTED.push(`${current.pollster} ${current.dateLabel} (somme ${total})`); if (process.env.DBG) console.error(JSON.stringify({values, group, others}), c.map(x => x.text).join("|")); continue; }
    current.scenarios.push({ values, others });
  }
  return { polls: polls.filter(p => p.scenarios.length), candidates: head.candidates };
}

// ---------- 2nd tour ----------
function parseSecondRound($, table, year) {
  const grid = buildGrid($, table);
  const head = parseHeader($, grid);
  if (!head || head.candidates.length !== 2) return { polls: [], candidates: [] };
  const polls = [];
  for (const row of grid.slice(head.dataStart)) {
    if (row.isEvent) continue;
    const c = row.cells;
    const [ca, cb] = head.candidates;
    if (c.length <= cb.col || (c[ca.col].text === "" && c[cb.col].text === "")) continue;
    const a = parseValue(c[ca.col].text), b = parseValue(c[cb.col].text);
    if (a === null || b === null) continue;
    const label = clean(c[1].text);
    polls.push({
      pollster: cleanPollster(c[0].text),
      dateLabel: label,
      date: parseEndDate(label, year),
      sample: parseSample(c[2].text),
      values: { [head.candidates[0].slug]: a, [head.candidates[1].slug]: b }
    });
  }
  return { polls, candidates: head.candidates };
}

// ---------- parcours de la page ----------
function parseHtml(html) {
  const first = parseHtmlPass(html, {});
  REJECTED.length = 0;
  return parseHtmlPass(html, first.candidates);   // 2e passe : les noms cités dans les cases (Bardella, Ruffin…) sont connus
}

function parseHtmlPass(html, known) {
  const $ = cheerio.load(html);
  let mode = null, year = null, skip = false, absent = false, matchupTitle = null;
  const candidates = {};
  const firstRound = [];
  const matchups = [];

  const register = list => list.forEach(c => {
    if (!candidates[c.slug]) {
      candidates[c.slug] = {
        slug: c.slug, name: c.name, shortName: c.shortName, party: c.party,
        generic: /^Candidat/i.test(c.shortName) || /^(Parti |Rassemblement |Ensemble|Les Républicains|Europe |Renaissance|La France |Union )/i.test(c.name),   // colonnes de partis (hypothèses anciennes) : pas des personnes            // « Candidat RN », « Candidat PS »… (hypothèses anciennes)
        photo: photoUrl(c.file), photoPage: photoPage(c.file)
      };
    } else if (!candidates[c.slug].photo && c.file) {
      candidates[c.slug].photo = photoUrl(c.file);
      candidates[c.slug].photoPage = photoPage(c.file);
    }
  });

  $("h2, h3, h4, table.wikitable").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "h2" || tag === "h3" || tag === "h4") {
      const t = clean($(el).text());
      if (tag === "h2") {
        mode = /premier tour/i.test(t) ? "first" : /second tour/i.test(t) ? "second" : null;
        year = null; skip = false; absent = false; matchupTitle = null;
      } else if (tag === "h3") {
        const ym = t.match(/Année\s+(20\d\d)/i);
        year = ym ? Number(ym[1]) : year;
        if (/^autres/i.test(t)) year = year || new Date().getFullYear();   // tableaux « Autres » : l'année est dans chaque date
        skip = false;
        if (/absents/i.test(t)) absent = true; else if (/pressentis|déclarés/i.test(t)) absent = false;
        matchupTitle = null;
      } else {
        matchupTitle = /Hypoth[eè]se/i.test(t) ? t.replace(/^Hypoth[eè]se\s*/i, "") : null;
      }
      return;
    }
    if (skip || !mode) return;

    if (mode === "first") {
      if (year === null) return;
      const resolveName = name => {
        const n = strip(name.toLowerCase());
        const hit = Object.values({ ...known, ...candidates }).find(c => !c.generic && (strip(c.shortName.toLowerCase()) === n || strip(c.name.toLowerCase()).endsWith(" " + n)));
        return hit ? hit.slug : null;
      };
      const r = parseFirstRound($, el, year, resolveName);
      if (r.polls.length) { register(r.candidates); firstRound.push(...r.polls); }
    } else if (mode === "second") {
      const r = parseSecondRound($, el, new Date().getFullYear());
      if (r.polls.length) {
        register(r.candidates);
        matchups.push({
          key: slug(r.candidates.map(c => c.name).join("-")),
          title: matchupTitle || r.candidates.map(c => c.shortName).join(" – "),
          candidates: r.candidates.map(c => c.slug),
          absentFromFirstRound: absent,
          polls: r.polls
        });
      }
    }
  });

  // Un même sondage peut figurer dans deux tableaux (principal + « Autres ») : on retire les scénarios strictement identiques.
  // Plusieurs sondages du même institut à la même date restent des sondages distincts (configurations différentes).
  const sig = sc => JSON.stringify(Object.entries(sc.values).sort());
  const seenSc = new Map();                                    // « institut|date » -> signatures déjà vues
  for (const p of firstRound.splice(0).map(p => p)) {
    const k = `${p.pollster}|${p.date || p.dateLabel}|${p.sample || ""}`;
    const seen = seenSc.get(k) || new Set();
    seenSc.set(k, seen);
    p.scenarios = p.scenarios.filter(sc => { const g = sig(sc); if (seen.has(g)) return false; seen.add(g); return true; });
    if (p.scenarios.length) firstRound.push(p);
  }

  const byDate = (a, b) => (b.date || "").localeCompare(a.date || "");
  firstRound.sort(byDate);
  matchups.forEach(m => m.polls.sort(byDate));
  matchups.sort((a, b) => (b.polls[0]?.date || "").localeCompare(a.polls[0]?.date || ""));

  return {
    updatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    firstRound,
    matchups,
    candidates
  };
}

async function fetchHtml() {
  const url = `${API}?action=parse&page=${encodeURIComponent(PAGE)}&prop=text&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikipédia a répondu ${res.status}`);
  const json = await res.json();
  if (!json.parse) throw new Error("Page introuvable : vérifiez la constante PAGE");
  return json.parse.text;
}

const STATUS = path.join(__dirname, "..", "data", "scraper-status.json");
function readStatus() { try { return JSON.parse(fs.readFileSync(STATUS, "utf8")); } catch { return {}; } }
function writeStatus(patch) {
  try { fs.writeFileSync(STATUS, JSON.stringify({ ...readStatus(), ...patch }, null, 1)); } catch { /* disque en lecture seule : sans gravité */ }
}

async function main(opts = {}) {
  const now = new Date().toISOString();
  try {
    const html = opts.file ? fs.readFileSync(opts.file, "utf8") : await fetchHtml();
    const data = parseHtml(html);
    const total = data.firstRound.length + data.matchups.reduce((s, m) => s + m.polls.length, 0);
    // Garde-fous : ne jamais écraser de bonnes données par un résultat quasi vide ou anormalement réduit
    if (data.firstRound.length < 10) {
      throw new Error(`Seulement ${data.firstRound.length} sondages du 1er tour trouvés : fichier conservé (la page a peut-être changé).`);
    }
    let before = 0;
    try { before = JSON.parse(fs.readFileSync(OUT, "utf8")).firstRound.length; } catch { /* premier lancement */ }
    if (before >= 20 && data.firstRound.length < before * 0.8) {
      throw new Error(`Chute anormale : ${before} sondages avant, ${data.firstRound.length} maintenant. Fichier conservé (la structure de la page Wikipédia a peut-être changé).`);
    }
    const tmp = OUT + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, OUT);
    if (REJECTED.length) console.warn(`Attention : ${REJECTED.length} scénario(s) écartés (somme hors de 88-108 %) :\n  - ${REJECTED.slice(0, 10).join("\n  - ")}`);
    console.log(`OK : ${data.firstRound.length} sondages du 1er tour, ${data.matchups.length} duels (${total} sondages au total), ${Object.keys(data.candidates).length} candidats.`);
    writeStatus({ lastRun: now, lastOk: now, lastError: null, consecutiveFailures: 0, firstRound: data.firstRound.length, matchups: data.matchups.length, rejected: REJECTED.length });
    return data;
  } catch (e) {
    const st = readStatus();
    writeStatus({ lastRun: now, lastError: e.message, consecutiveFailures: (st.consecutiveFailures || 0) + 1 });
    throw e;
  }
}

module.exports = { main, STATUS, parseHtml, parseFirstRound, parseSecondRound, buildGrid, parseHeader };
