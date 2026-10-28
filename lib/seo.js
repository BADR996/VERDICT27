// Pages rendues côté serveur : fiche candidat, fiche duel, liste des candidats, plan du site, aperçu des liens partagés.
// Objectif : que chaque candidat et chaque duel ait sa propre adresse, lisible par Google et par les réseaux sociaux.

const fs = require("fs");
const path = require("path");
const ds = require("./dataset");
const st = require("./stats");
const { candidateThemeScores } = require("../scoring");

const PUBLIC = path.join(__dirname, "..", "public");
const SITE_NAME = "verdict27";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n)) ? "–" : n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: d });
const fmtDate = iso => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// ---------- gabarit de la page d'accueil (balises de partage injectées) ----------
let tplCache = { stamp: 0, html: "" };
function indexTemplate() {
  const f = path.join(PUBLIC, "index.html");
  const m = fs.statSync(f).mtimeMs;
  if (tplCache.stamp !== m) tplCache = { stamp: m, html: fs.readFileSync(f, "utf8") };
  return tplCache.html;
}

function headMeta(base, { title, description, path: p = "/", image, type = "website", jsonld }) {
  const url = base + p;
  const img = image ? (image.startsWith("http") ? image : base + image) : base + "/cards/default.png";
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="fr_FR">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""
  ].join("\n  ");
}

// Page d'accueil (ou page de profil partagé) : même fichier, balises <head> adaptées.
function renderIndex(req, meta) {
  const base = baseUrl(req);
  const html = indexTemplate();
  const block = headMeta(base, meta);
  return html.replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, block);
}

const HOME_META = {
  title: "verdict27 — sondages de la présidentielle 2027 et test politique",
  description: "Tous les sondages de la présidentielle 2027 mis à jour automatiquement, tous les duels de second tour, et un test de 2 minutes pour savoir quel candidat vous ressemble.",
  path: "/",
  jsonld: {
    "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, inLanguage: "fr",
    description: "Agrégateur de sondages de la présidentielle 2027 et test d'orientation politique."
  }
};

// ---------- coquille commune des pages statiques ----------
function shell(req, meta, body) {
  const base = baseUrl(req);
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${headMeta(base, meta)}
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'%3E%3Crect width='10' height='20' fill='%230055a4'/%3E%3Crect x='10' width='10' height='20' fill='%23fff'/%3E%3Crect x='20' width='10' height='20' fill='%23d7000f'/%3E%3C/svg%3E">
  <link rel="preload" href="/fonts/bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="legal seo">
  <header class="topbar">
    <a class="brand" href="/"><span class="flag" aria-hidden="true"><i></i><i></i><i></i></span>verdict27</a>
    <nav aria-label="Sections">
      <a href="/#sondages">Sondages</a><a href="/#evolution">Évolution</a><a href="/#duels">Second tour</a><a href="/candidats">Candidats</a>
    </nav>
    <a class="btn primary" href="/#test">Faire le test</a>
  </header>
  <main class="wrap prose seo-main">
${body}
  </main>
  <footer class="footer"><div class="wrap">
    <p><a href="/">Accueil</a> · <a href="/candidats">Tous les candidats</a> · <a href="/methode.html">Méthode</a> · <a href="/mentions-legales.html">Mentions légales</a> · <a href="/confidentialite.html">Confidentialité</a></p>
  </div></footer>
</body>
</html>`;
}

const avatarHtml = c => c.photo
  ? `<img class="seo-av" src="${esc(c.photo)}" alt="${esc(c.name)}" width="72" height="72" loading="lazy" referrerpolicy="no-referrer">`
  : `<span class="seo-av ini" style="--c:${esc(c.color)}">${esc(c.name.split(/\s+/).map(w => w[0]).slice(0, 2).join(""))}</span>`;

const orientLabel = { "extreme-gauche": "extrême gauche", gauche: "gauche", centre: "centre", droite: "droite", "extreme-droite": "extrême droite", divers: "divers" };

// ---------- fiche candidat ----------
function candidatePage(req, slug) {
  const polls = ds.getPolls(), c = polls.candidates[slug];
  if (!c) return null;
  const avg = st.averages(polls, 60, true), row = avg.rows.findIndex(r => r.slug === slug);
  const me = row >= 0 ? avg.rows[row] : null;
  const qual = st.qualified(polls).includes(slug);
  const themes = ds.getThemes(), scores = candidateThemeScores()[slug] || {};
  const sources = ds.getPositionSources().byCand[slug] || {};

  const recent = polls.firstRound.map(p => ({ p, v: st.valueIn(p, slug) })).filter(x => x.v !== null).slice(0, 12);
  const pollsTable = recent.length
    ? `<div class="seo-scroll"><table class="seo-table"><thead><tr><th>Institut</th><th>Date</th><th>Échantillon</th><th>Intentions de vote</th></tr></thead><tbody>${
      recent.map(({ p, v }) => `<tr><td>${esc(p.pollster)}</td><td>${esc(fmtDate(p.date))}</td><td>${p.sample ? p.sample.toLocaleString("fr-FR") : ""}</td><td><b>${fmt(v)} %</b></td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">Ce candidat n'est testé dans aucun sondage récent.</p>`;

  const duels = polls.matchups.filter(m => m.candidates.includes(slug) && m.polls.length).map(m => {
    const other = m.candidates.find(x => x !== slug), oc = polls.candidates[other];
    const last = m.polls[0];
    return oc ? { m, oc, mine: last.values[slug], theirs: last.values[other], last } : null;
  }).filter(Boolean);
  const duelsHtml = duels.length
    ? `<ul class="seo-list">${duels.map(d => `<li><a href="/duel/${esc(d.m.key)}">${esc(c.shortName)} contre ${esc(d.oc.shortName)}</a> : <b>${fmt(d.mine, 0)} %</b> – ${fmt(d.theirs, 0)} % <span class="muted">(${esc(d.last.pollster)}, ${esc(fmtDate(d.last.date))})</span></li>`).join("")}</ul>`
    : `<p class="muted">Aucun duel de second tour testé pour ce candidat.</p>`;

  const posRows = themes.filter(t => scores[t.code] !== undefined).map(t => {
    const v = scores[t.code], pole = Math.abs(v) < 15 ? "position équilibrée" : (v > 0 ? t.polePos : t.poleNeg);
    const src = sources[t.code] || [];
    const srcHtml = src.length
      ? src.map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.titre)}</a>${s.date ? ` <span class="muted">(${esc(s.date)})</span>` : ""}` : esc(s.titre)).join("<br>")
      : `<span class="muted">source à compléter</span>`;
    return `<tr><td>${t.icone} ${esc(t.nom)}</td><td>${esc(pole)}</td><td class="num">${v > 0 ? "+" : ""}${v}</td><td>${srcHtml}</td></tr>`;
  });
  const posHtml = posRows.length
    ? `<div class="seo-scroll"><table class="seo-table"><thead><tr><th>Thème</th><th>Position</th><th>Score</th><th>Sources</th></tr></thead><tbody>${posRows.join("")}</tbody></table></div>
       <p class="muted small">Échelle de −100 à +100 entre les deux pôles du thème (voir la <a href="/methode.html">méthode</a>). Positions établies par l'éditeur du site à partir de programmes et de déclarations publiques.</p>`
    : `<p class="muted">Les positions de ce candidat ne sont pas encore renseignées.</p>`;

  const desc = me
    ? `${c.name} (${c.party}) : ${fmt(me.avg)} % d'intentions de vote en moyenne sur ${avg.count} sondages récents, ${row + 1}${row === 0 ? "er" : "e"} du classement. Historique, duels de second tour et positions.`
    : `${c.name} (${c.party}) : sondages de la présidentielle 2027, duels de second tour et positions sur 8 thèmes.`;
  const body = `
    <p class="crumb"><a href="/">Accueil</a> › <a href="/candidats">Candidats</a> › ${esc(c.name)}</p>
    <div class="seo-head" style="--c:${esc(c.color)}">${avatarHtml(c)}<div><h1>${esc(c.name)}</h1>
      <p class="muted">${esc(c.party)}${c.orientation ? " · " + esc(orientLabel[c.orientation] || c.orientation) : ""}${qual ? ' · <span class="qbadge">2nd tour</span>' : ""}</p></div></div>
    ${me ? `<p class="seo-big"><b>${fmt(me.avg)} %</b> <span class="muted">en moyenne (${avg.count} sondages, 60 jours) · ${row + 1}${row === 0 ? "er" : "e"} du classement${qual ? " : qualifié pour le second tour si le vote avait lieu aujourd'hui" : ""}</span></p>` : ""}
    <h2>Derniers sondages</h2>${pollsTable}
    <h2>Duels de second tour</h2>${duelsHtml}
    <h2>Positions sur les grands thèmes</h2>${posHtml}
    <p class="seo-cta"><a class="btn primary" href="/#test">Quel candidat vous ressemble ? Faites le test</a></p>`;
  const jsonld = {
    "@context": "https://schema.org", "@type": "ProfilePage", name: `${c.name} : sondages et positions`, inLanguage: "fr",
    about: { "@type": "Person", name: c.name, ...(c.photo ? { image: c.photo } : {}) }
  };
  return shell(req, { title: `${c.name} : sondages présidentielle 2027, positions et duels — ${SITE_NAME}`, description: desc, path: `/candidat/${slug}`, type: "profile", image: `/cards/${slug}.png`, jsonld }, body);
}

// ---------- fiche duel ----------
function duelPage(req, key) {
  const polls = ds.getPolls(), m = polls.matchups.find(x => x.key === key);
  if (!m) return null;
  const [a, b] = m.candidates.map(s => polls.candidates[s]);
  if (!a || !b) return null;
  const av = st.duelAverage(m);
  const rows = m.polls.slice(0, 20).map(p => `<tr><td>${esc(p.pollster)}</td><td>${esc(fmtDate(p.date))}</td><td>${p.sample ? p.sample.toLocaleString("fr-FR") : ""}</td><td>${fmt(p.values[a.slug], 0)} %</td><td>${fmt(p.values[b.slug], 0)} %</td></tr>`).join("");
  const lead = av && av.values[a.slug] !== null ? (av.values[a.slug] >= av.values[b.slug] ? [a, b] : [b, a]) : null;
  const desc = lead
    ? `Second tour ${a.name} contre ${b.name} : ${lead[0].shortName} devant avec ${fmt(av.values[lead[0].slug], 0)} % contre ${fmt(av.values[lead[1].slug], 0)} % en moyenne (${av.count} sondages). Tous les sondages et le vote des visiteurs.`
    : `Second tour ${a.name} contre ${b.name} : tous les sondages du duel.`;
  const body = `
    <p class="crumb"><a href="/">Accueil</a> › <a href="/#duels">Second tour</a> › ${esc(a.shortName)} contre ${esc(b.shortName)}</p>
    <h1>${esc(a.name)} contre ${esc(b.name)}</h1>
    ${lead ? `<div class="seo-duel"><div style="--c:${esc(a.color)}">${avatarHtml(a)}<b>${fmt(av.values[a.slug], 0)} %</b><a href="/candidat/${esc(a.slug)}">${esc(a.shortName)}</a></div><span class="vs">contre</span><div style="--c:${esc(b.color)}">${avatarHtml(b)}<b>${fmt(av.values[b.slug], 0)} %</b><a href="/candidat/${esc(b.slug)}">${esc(b.shortName)}</a></div></div>
    <p class="muted">Moyenne de ${av.count} sondages récents (jusqu'au ${esc(fmtDate(av.to))}).</p>` : ""}
    <h2>Tous les sondages de ce duel</h2>
    <div class="seo-scroll"><table class="seo-table"><thead><tr><th>Institut</th><th>Date</th><th>Échantillon</th><th>${esc(a.shortName)}</th><th>${esc(b.shortName)}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="seo-cta"><a class="btn primary" href="/#duels">Voter dans ce duel</a> <a class="btn" href="/#test">Faire le test</a></p>`;
  return shell(req, { title: `Second tour ${a.shortName} – ${b.shortName} : sondages 2027 — ${SITE_NAME}`, description: desc, path: `/duel/${key}`, image: `/cards/${lead ? lead[0].slug : "default"}.png` }, body);
}

// ---------- liste des candidats ----------
function candidatesPage(req) {
  const polls = ds.getPolls();
  const avg = st.averages(polls, 60, true), rank = new Map(avg.rows.map((r, i) => [r.slug, { i, ...r }]));
  const list = polls.activeSlugs.map(s => polls.candidates[s]).filter(c => c && !c.generic)
    .sort((x, y) => (rank.has(x.slug) ? rank.get(x.slug).i : 999) - (rank.has(y.slug) ? rank.get(y.slug).i : 999) || x.order - y.order);
  const body = `
    <p class="crumb"><a href="/">Accueil</a> › Candidats</p>
    <h1>Les candidats à la présidentielle 2027</h1>
    <p class="muted">Classés selon la moyenne des sondages des 60 derniers jours.</p>
    <ul class="seo-cands">${list.map(c => { const r = rank.get(c.slug);
      return `<li style="--c:${esc(c.color)}"><a href="/candidat/${esc(c.slug)}">${avatarHtml(c)}<span><b>${esc(c.name)}</b><small>${esc(c.party)}${r ? ` · ${fmt(r.avg)} %` : ""}</small></span></a></li>`; }).join("")}</ul>`;
  return shell(req, { title: `Candidats à la présidentielle 2027 : sondages et positions — ${SITE_NAME}`, description: "La liste des candidats à la présidentielle 2027 avec leur moyenne dans les sondages, leurs duels de second tour et leurs positions.", path: "/candidats" }, body);
}

// ---------- plan du site ----------
function sitemap(req) {
  const base = baseUrl(req), polls = ds.getPolls();
  const day = (polls.updatedAt || new Date().toISOString()).slice(0, 10);
  const urls = [["/", "hourly", 1], ["/candidats", "daily", .8], ["/methode.html", "monthly", .5], ["/confidentialite.html", "yearly", .2], ["/mentions-legales.html", "yearly", .1], ["/donnees-ouvertes.html", "yearly", .2]];
  polls.activeSlugs.forEach(s => { if (!polls.candidates[s].generic) urls.push([`/candidat/${s}`, "daily", .7]); });
  polls.matchups.forEach(m => { if (m.polls.length) urls.push([`/duel/${m.key}`, "daily", .6]); });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, f, p]) => `  <url><loc>${esc(base + u)}</loc><lastmod>${day}</lastmod><changefreq>${f}</changefreq><priority>${p}</priority></url>`).join("\n")}\n</urlset>\n`;
}

const robots = req => `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`;

module.exports = { renderIndex, HOME_META, candidatePage, duelPage, candidatesPage, sitemap, robots, baseUrl, shell, esc, fmt, fmtDate, headMeta };
