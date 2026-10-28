// Fil d'actualité : lit les flux RSS / Atom des médias listés dans data/sources.csv, ne garde que la présidentielle,
// dédoublonne et écrit data/news.json. On ne reprend que titre, lien, source, date et l'extrait fourni par le flux :
// jamais le texte complet. Les miniatures (image fournie par le flux) ne sont reprises que pour les sources où
// la colonne « images » de data/sources.csv vaut « oui » : à activer uniquement si les conditions du média l'autorisent.

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { readCsv } = require("./csv");
const ds = require("./dataset");

const FILE = path.join(ds.DATA, "news.json");
const SOURCES = path.join(ds.DATA, "sources.csv");
const MAX_AGE_DAYS = Number(process.env.NEWS_MAX_AGE_DAYS || 14);
const MAX_ITEMS = 200;
const UA = process.env.NEWS_USER_AGENT || "verdict27/0.5 (agrégateur de titres ; lecture de flux RSS publics)";

const norm = s => ds.strip(String(s || "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Un article est retenu s'il parle de la présidentielle ou cite un candidat.
const TOPIC = /\b(presidentielles?|2027|primaires?|parrainages?|candidatures?|candidat(e|es|s)? a l elysee)\b/;
const SKIP_SHORT = new Set(["philippe", "marine"]);   // prénoms trop courants pour identifier un candidat seuls

function candidateMatchers(polls) {
  return Object.values(polls.candidates).filter(c => !c.generic && c.active).map(c => {
    const full = norm(c.name), short = norm(c.shortName);
    const parts = [full];
    if (short.length >= 5 && !SKIP_SHORT.has(short)) parts.push(short);
    return { slug: c.slug, parts: [...new Set(parts)].filter(Boolean) };
  });
}

function textOf($el) { return $el.text().replace(/\s+/g, " ").trim(); }
function stripHtml(s) { return cheerio.load(`<div>${s || ""}</div>`).text().replace(/\s+/g, " ").trim(); }
function cleanUrl(u) {
  try { const x = new URL(u); x.hash = ""; [...x.searchParams.keys()].filter(k => /^(utm_|xtor|at_|ref|fbclid)/i.test(k)).forEach(k => x.searchParams.delete(k)); return x.toString(); }
  catch { return null; }
}

// image proposée par le flux (media:content, media:thumbnail, enclosure, ou première <img> du contenu)
function feedImage($, $e) {
  const ok = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.toString() : null; } catch { return null; } };
  let u = $e.find("media\\:thumbnail, thumbnail").first().attr("url");
  if (!u) { const m = $e.find("media\\:content, content").filter((_, c) => /image/i.test($(c).attr("type") || "") || /\.(jpe?g|png|webp)(\?|$)/i.test($(c).attr("url") || "")).first(); u = m.attr("url"); }
  if (!u) { const en = $e.children("enclosure").filter((_, c) => /image/i.test($(c).attr("type") || "")).first(); u = en.attr("url"); }
  if (!u) { const html = $e.children("description, summary, content\\:encoded").first().text(); const m = html.match(/<img[^>]+src=["']([^"']+)["']/i); u = m && m[1]; }
  return u ? ok(u) : null;
}

// Lit un flux RSS 2.0 ou Atom ; renvoie [{ title, link, date, summary }]
function parseFeed(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  const nodes = $("item").length ? $("item") : $("entry");
  nodes.each((_, el) => {
    const $e = $(el);
    const title = stripHtml(textOf($e.children("title").first()));
    let link = textOf($e.children("link").first());
    if (!link) link = $e.children("link").first().attr("href") || "";
    if (!link) link = textOf($e.children("guid").first());
    const rawDate = textOf($e.children("pubDate, published, updated, dc\\:date").first());
    const t = rawDate ? new Date(rawDate) : null;
    const summary = stripHtml(textOf($e.children("description, summary").first()));
    const url = cleanUrl(link);
    if (!title || !url) return;
    out.push({ title, link: url, date: t && !isNaN(t) ? t.toISOString() : null, summary, image: feedImage($, $e) });
  });
  return out;
}

function pickRelevant(items, source, matchers) {
  const res = [];
  for (const it of items) {
    const hay = norm(`${it.title} ${it.summary}`);
    const cands = matchers.filter(m => m.parts.some(p => hay.includes(p))).map(m => m.slug);
    if (!cands.length && !TOPIC.test(hay)) continue;
    let summary = source.resume ? it.summary : "";
    if (summary.length > 220) summary = summary.slice(0, 217).replace(/\s+\S*$/, "") + "…";
    if (norm(summary) === norm(it.title)) summary = "";
    res.push({ title: it.title, link: it.link, source: source.nom, date: it.date, summary, candidates: cands, image: source.images ? (it.image || null) : null });
  }
  return res;
}

function readSources() {
  const { rows } = readCsv(SOURCES);
  return rows.filter(r => r.url && !/^(non|n|no|0|false)$/i.test(String(r.actif || "oui").trim()))
    .map(r => ({ nom: r.nom || new URL(r.url).hostname, url: r.url.trim(), resume: !/^(non|n|no|0|false)$/i.test(String(r.resume || "oui").trim()), images: /^(oui|o|yes|1|true)$/i.test(String(r.images || "").trim()) }));
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 4e6) throw new Error("flux trop volumineux");
    return text;
  } finally { clearTimeout(timer); }
}

// opts.fetcher : pour les tests (remplace le téléchargement)
async function updateNews(opts = {}) {
  const sources = opts.sources || readSources();
  const polls = ds.getPolls();
  const matchers = candidateMatchers(polls);
  const fetcher = opts.fetcher || fetchText;
  const status = [], all = [];
  await Promise.all(sources.map(async src => {
    try {
      const items = parseFeed(await fetcher(src.url));
      const kept = pickRelevant(items, src, matchers);
      all.push(...kept);
      status.push({ nom: src.nom, ok: true, lus: items.length, retenus: kept.length });
    } catch (e) {
      status.push({ nom: src.nom, ok: false, erreur: String(e.message || e).slice(0, 120) });
    }
  }));

  const limit = Date.now() - MAX_AGE_DAYS * 864e5;
  const seen = new Set(), items = [];
  for (const it of all.sort((a, b) => (b.date || "").localeCompare(a.date || ""))) {
    if (it.date && new Date(it.date).getTime() < limit) continue;
    const k1 = it.link, k2 = norm(it.title);
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1); seen.add(k2);
    items.push(it);
    if (items.length >= MAX_ITEMS) break;
  }
  // si toutes les sources échouent, on garde l'ancien fichier plutôt que de vider le fil
  if (!items.length && status.every(s => !s.ok) && fs.existsSync(FILE) && !opts.fetcher) {
    return { kept: true, status };
  }
  const data = { updatedAt: new Date().toISOString(), sources: status.sort((a, b) => a.nom.localeCompare(b.nom)), items };
  if (!opts.noWrite) {
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(data));
    fs.renameSync(FILE + ".tmp", FILE);
  }
  return data;
}

function getNews() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return { updatedAt: null, sources: [], items: [] }; }
}

module.exports = { updateNews, getNews, parseFeed, pickRelevant, candidateMatchers, readSources, FILE };
