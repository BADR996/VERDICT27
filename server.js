const express = require("express");
const cron = require("node-cron");
const path = require("path");
const fs = require("fs");
const ds = require("./lib/dataset");
const { definition } = require("./lib/profile");
const { TIERS, themesForTier, score, matches, matchesFromScores, candidateThemeScores, MIN_SHARED } = require("./scoring");
const { main: updatePolls } = require("./scraper/update-polls");
const db = require("./db");
const news = require("./lib/news");
const seo = require("./lib/seo");
const health = require("./lib/health");
const mailer = require("./lib/mailer");
const { buildDigest } = require("./lib/digest");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);   // derrière un hébergeur
app.use(compression());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ extended: false, limit: "4kb" }));

// ---------- pages indexables et aperçus de partage (avant les fichiers statiques) ----------
app.get("/", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.type("html").send(seo.renderIndex(req, seo.HOME_META));
});

// lien de partage d'un profil : /p/<profil encodé>. Les réseaux sociaux lisent le titre et l'image ci-dessous.
function decodeProfile(enc) {
  try {
    const o = JSON.parse(Buffer.from(String(enc), "base64url").toString("utf8"));
    const s = o && o.s;
    if (!s || typeof s !== "object") return null;
    const out = {};
    for (const t of ds.getThemes()) { const v = Number(s[t.code]); if (Number.isFinite(v)) out[t.code] = Math.max(-100, Math.min(100, Math.round(v))); }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}
app.get("/p/:enc", (req, res) => {
  const prof = req.params.enc.length < 400 ? decodeProfile(req.params.enc) : null;
  if (!prof) return res.redirect(302, "/");
  const best = matchesFromScores(prof)[0], c = best && ds.getPolls().candidates[best.slug];
  const meta = { ...seo.HOME_META, path: "/p/" + req.params.enc };
  if (c) {
    meta.title = `Mon profil politique : proche de ${c.name} (${best.pct} %) — verdict27`;
    meta.description = `Voici mon profil sur 8 thèmes : ${c.name} est le candidat le plus proche de moi. Et toi, quel candidat te ressemble ? Le test dure 2 minutes.`;
    meta.image = fs.existsSync(path.join(__dirname, "public", "cards", c.slug + ".png")) ? `/cards/${c.slug}.png` : "/cards/default.png";
  } else { meta.title = "Mon profil politique — verdict27"; }
  res.set("Cache-Control", "no-cache");
  res.type("html").send(seo.renderIndex(req, meta));
});
const sendPage = (res, html) => html ? (res.set("Cache-Control", "public, max-age=300"), res.type("html").send(html)) : res.status(404).type("html").send("<!doctype html><meta charset=utf-8><title>Page introuvable</title><p>Page introuvable. <a href=\"/\">Retour à l'accueil</a></p>");
app.get("/candidats", (req, res) => sendPage(res, seo.candidatesPage(req)));
app.get("/candidat/:slug", (req, res) => sendPage(res, seo.candidatePage(req, req.params.slug)));
app.get("/duel/:key", (req, res) => sendPage(res, seo.duelPage(req, req.params.key)));
app.get("/sitemap.xml", (req, res) => { res.set("Cache-Control", "public, max-age=3600"); res.type("application/xml").send(seo.sitemap(req)); });
app.get("/robots.txt", (req, res) => { res.type("text/plain").send(seo.robots(req)); });

// fichiers statiques : polices et images mises en cache longtemps, le reste 5 minutes
app.use(express.static(path.join(__dirname, "public"), {
  index: false,
  setHeaders(res, file) {
    if (/\.(woff2?|ttf)$/i.test(file)) res.set("Cache-Control", "public, max-age=31536000, immutable");
    else if (/\.(png|jpe?g|webp|svg)$/i.test(file)) res.set("Cache-Control", "public, max-age=86400");
    else res.set("Cache-Control", "public, max-age=300");
  }
}));

// ---------- limites d'envoi (en mémoire uniquement, jamais écrites sur disque) ----------
const buckets = new Map();
function limited(name, ip, max, windowMs = 3600e3) {
  const key = name + "|" + ip, now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length > max;
}
setInterval(() => buckets.clear(), 6 * 3600e3).unref();

// ---------- sondages ----------
app.get("/api/polls", (_req, res) => {
  const p = ds.getPolls();
  res.set("Cache-Control", "no-cache");
  res.json({
    updatedAt: p.updatedAt, source: p.source, firstRound: p.firstRound, matchups: p.matchups,
    candidates: p.candidates, activeSlugs: p.activeSlugs
  });
});

app.get("/api/stats", (_req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  res.json({ contributions: db.count(), votes: db.voteCount(), voters: db.voterCount() });
});

// Publicité : data/ads.json (désactivée par défaut). Seuls les emplacements renseignés sont envoyés au navigateur.
function adsConfig() {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "ads.json"), "utf8"));
    if (!a.enabled) return null;
    const slots = {};
    for (const [k, v] of Object.entries(a.slots || {})) if (v && String(v.html || "").trim()) slots[k] = { label: v.label || "Publicité", html: v.html, minHeight: Number(v.minHeight) || 0 };
    if (!Object.keys(slots).length && !String(a.headScript || "").trim()) return null;
    return { consent: a.consent === "external" ? "external" : "builtin", headScript: String(a.headScript || ""), slots };
  } catch { return null; }
}

app.get("/api/site", (_req, res) => {
  const dir = path.join(__dirname, "public", "img");
  const f = ["jpg", "jpeg", "webp", "png"].map(e => "hero." + e).find(n => fs.existsSync(path.join(dir, n)));
  res.set("Cache-Control", "no-cache");
  res.json({ heroPhoto: f ? "img/" + f : null, mailEnabled: mailer.enabled(), ads: adsConfig() });
});

// ---------- test ----------
app.get("/api/quiz/config", (_req, res) => {
  const tiers = Object.entries(TIERS).map(([key, t]) => {
    const themes = themesForTier(key) || [];
    return {
      key, label: t.label, minutes: t.minutes, precision: t.precision,
      available: themes.reduce((s, th) => s + th.questions.length, 0),
      perTheme: Object.fromEntries(themes.map(th => [th.code, th.questions.length]))
    };
  });
  const polls = ds.getPolls();
  const hasMatches = Object.values(candidateThemeScores()).some(t => Object.keys(t).length >= MIN_SHARED);
  res.json({ tiers, themes: ds.getThemes(), profile: definition(polls), hasMatches });
});

app.get("/api/quiz/questions", (req, res) => {
  const themes = themesForTier(req.query.tier);
  if (!themes) return res.status(400).json({ error: "tier invalide (express | quick | medium | full)" });
  // Le sens (+1 / -1) n'est pas envoyé : le calcul reste côté serveur.
  res.json({
    themes: themes.map(th => ({
      code: th.code, nom: th.nom, icone: th.icone, couleur: th.couleur, description: th.description,
      poleNeg: th.poleNeg, polePos: th.polePos,
      questions: th.questions.map(q => ({ id: q.id, text: q.text }))
    }))
  });
});

function cleanAnswers(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const valid = new Set(ds.getQuestions().map(q => q.id));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k), a = Number(v);
    if (valid.has(id) && Number.isInteger(a) && a >= 1 && a <= 5) out[id] = a;
  }
  return Object.keys(out).length ? out : null;
}

// Calcul du score : rien n'est enregistré ici.
app.post("/api/quiz/score", (req, res) => {
  const answers = cleanAnswers(req.body && req.body.answers);
  if (!answers) return res.status(400).json({ error: "Aucune réponse valide." });
  res.json({ themes: score(answers), matches: matches(answers) });
});

// profil partagé par lien : on retrouve les candidats les plus proches à partir des scores par thème
app.post("/api/quiz/match", (req, res) => {
  const s = req.body && req.body.scores;
  if (!s || typeof s !== "object") return res.status(400).json({ error: "Scores manquants." });
  const clean = {};
  for (const t of ds.getThemes()) { const v = Number(s[t.code]); if (Number.isFinite(v)) clean[t.code] = Math.max(-100, Math.min(100, Math.round(v))); }
  res.json({ matches: matchesFromScores(clean) });
});

// ---------- module « Actualité du mois » (facultatif, hors du score principal) ----------
const ACT_MIN = 3;   // un candidat n'est classé que s'il a au moins 3 positions sourcées sur les questions répondues
app.get("/api/actualite", (_req, res) => {
  const a = ds.getActualite();
  if (!a.questions.length) return res.json({ enabled: false });
  res.set("Cache-Control", "public, max-age=300");
  res.json({ enabled: true, meta: a.meta, questions: a.questions, positions: a.positions, min: ACT_MIN });
});
app.post("/api/actualite/match", (req, res) => {
  const a = ds.getActualite(), ans = (req.body && req.body.answers) || {}, polls = ds.getPolls();
  const per = {};
  for (const q of a.questions) {
    const v = Number(ans[q.id]);
    if (!Number.isInteger(v) || v < 1 || v > 5) continue;
    for (const [slug, p] of Object.entries(a.positions[q.id] || {})) (per[slug] ||= []).push(1 - Math.abs(v - p.note) / 4);
  }
  const matches = Object.entries(per).filter(([slug, l]) => l.length >= ACT_MIN && polls.candidates[slug])
    .map(([slug, l]) => ({ slug, pct: Math.round((l.reduce((x, y) => x + y, 0) / l.length) * 100), shared: l.length }))
    .sort((x, y) => y.pct - x.pct);
  res.json({ matches, min: ACT_MIN });
});

// positions des candidats par thème, avec leurs sources (pour « Pourquoi ce score ? »)
app.get("/api/positions", (_req, res) => {
  const scores = candidateThemeScores(), src = ds.getPositionSources().byCand, out = {};
  for (const [slug, t] of Object.entries(scores)) {
    out[slug] = {};
    for (const [code, v] of Object.entries(t)) out[slug][code] = { score: v, sources: (src[slug] && src[slug][code]) || [] };
  }
  res.set("Cache-Control", "public, max-age=300");
  res.json({ positions: out });
});

// ---------- alerte e-mail mensuelle (double confirmation, désinscription en un clic) ----------
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,}$/;
app.post("/api/abonnement", async (req, res) => {
  if (!mailer.enabled()) return res.status(503).json({ error: "Les alertes par e-mail ne sont pas activées sur ce site." });
  const { email, consent, website } = req.body || {};
  if (website) return res.json({ ok: true });                                   // champ piège : les robots le remplissent
  if (limited("sub", req.ip, 6)) return res.status(429).json({ error: "Trop de demandes depuis cette connexion. Réessayez plus tard." });
  if (consent !== true) return res.status(400).json({ error: "Cochez la case pour confirmer que vous souhaitez recevoir l'alerte." });
  const mail = db.normEmail(email);
  if (!EMAIL_RE.test(mail) || mail.length > 254) return res.status(400).json({ error: "Adresse e-mail invalide." });
  try {
    const sub = db.subscribe(mail);
    if (!sub.confirmed) {
      const base = seo.baseUrl(req), link = `${base}/api/abonnement/confirmer?t=${sub.token}`;
      await mailer.send({
        to: mail, subject: "Confirmez votre inscription à l'alerte verdict27",
        text: `Bonjour,\n\nPour recevoir chaque mois « ce qui a bougé » dans les sondages de la présidentielle, confirmez votre adresse :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera enregistré durablement.\n`
      });
    }
    res.json({ ok: true });                                                      // même réponse dans tous les cas : on ne révèle pas qui est déjà inscrit
  } catch (e) {
    console.error("[abonnement]", e.message);
    res.status(502).json({ error: "Impossible d'envoyer l'e-mail de confirmation pour le moment." });
  }
});
app.get("/api/abonnement/confirmer", (req, res) => { db.confirmSub(req.query.t || ""); res.redirect(302, "/?abonnement=confirme"); });
const unsubPage = (req, msg, form) => seo.shell(req, { title: "Désinscription — verdict27", description: "Se désinscrire de l'alerte mensuelle.", path: "/desabonnement" },
  `<h1>Alerte mensuelle</h1><p>${msg}</p>${form || ""}<p><a href="/">Retour à l'accueil</a></p>`);
app.get("/desabonnement", (req, res) => {
  const t = String(req.query.t || ""), sub = db.subByToken(t);
  res.set("Cache-Control", "no-store");
  res.type("html").send(unsubPage(req, sub ? "Souhaitez-vous ne plus recevoir l'alerte mensuelle sur cette adresse ?" : "Ce lien n'est plus valable : vous êtes peut-être déjà désinscrit(e).",
    sub ? `<form method="post" action="/desabonnement"><input type="hidden" name="t" value="${seo.esc(t)}"><button class="btn primary" type="submit">Me désinscrire</button></form>` : ""));
});
app.post("/desabonnement", (req, res) => {                                       // sert aussi au « List-Unsubscribe » en un clic des messageries
  const ok = db.unsubscribe((req.body && req.body.t) || req.query.t || "");
  res.type("html").send(unsubPage(req, ok ? "C'est fait : votre adresse a été supprimée, vous ne recevrez plus rien." : "Ce lien n'est plus valable : vous êtes peut-être déjà désinscrit(e)."));
});

// ---------- contribution (consentement explicite) ----------
app.post("/api/contribute", (req, res) => {
  const body = req.body || {};
  if (body.consent !== true) return res.status(400).json({ error: "Le consentement est nécessaire pour enregistrer vos réponses." });
  if (limited("contrib", req.ip, 10)) return res.status(429).json({ error: "Trop d'envois depuis cette connexion. Réessayez plus tard." });
  if (!TIERS[body.tier]) return res.status(400).json({ error: "Taille de test invalide." });
  const answers = cleanAnswers(body.answers);
  if (!answers) return res.status(400).json({ error: "Réponses invalides." });

  const def = definition(ds.getPolls());
  const profile = {};
  let usedSensitive = false;
  for (const f of def.fields) {
    const v = body.profile && body.profile[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (!f.options.includes(v)) return res.status(400).json({ error: `Valeur invalide pour « ${f.label} ».` });
    const section = def.sections.find(s => s.id === f.section);
    if (section.sensitive) {
      if (body.consentSensitive !== true) return res.status(400).json({ error: "Les informations des blocs « politique » et « parcours » demandent votre consentement explicite séparé." });
      usedSensitive = true;
    }
    profile[f.key] = v;
  }
  const id = db.save({ tier: body.tier, answers, scores: score(answers), profile, sensitive: usedSensitive });
  res.json({ ok: true, id });
});

app.delete("/api/contribute/:id", (req, res) => res.json({ ok: db.remove(String(req.params.id)) }));

// ---------- duels : votes des visiteurs ----------
const pairKey = (a, b) => [a, b].sort().join("--");
const validToken = t => typeof t === "string" && /^[A-Za-z0-9-]{16,64}$/.test(t);

app.get("/api/votes", (req, res) => {
  res.set("Cache-Control", "no-cache");
  const token = req.query.voter;
  res.json({ tallies: db.tallies(), mine: validToken(token) ? db.myVotes(token) : {} });
});

app.post("/api/vote", (req, res) => {
  const { a, b, choice, voter, consent } = req.body || {};
  const polls = ds.getPolls();
  if (consent !== true) return res.status(400).json({ error: "Acceptez l'enregistrement de votre vote anonyme pour voter." });
  if (!validToken(voter)) return res.status(400).json({ error: "Navigateur non reconnu : rechargez la page." });
  const ok = s => polls.candidates[s] && !polls.candidates[s].generic;
  if (!ok(a) || !ok(b) || a === b) return res.status(400).json({ error: "Duel invalide." });
  if (choice !== a && choice !== b) return res.status(400).json({ error: "Choix invalide." });
  if (limited("vote", req.ip, 300)) return res.status(429).json({ error: "Trop de votes depuis cette connexion. Réessayez plus tard." });
  const key = pairKey(a, b);
  db.vote(key, voter, choice);
  res.json({ ok: true, pair: key, tally: db.tallies()[key] || {} });
});

app.delete("/api/vote", (req, res) => {
  const { a, b, voter } = req.body || {};
  if (!validToken(voter) || !a || !b) return res.status(400).json({ error: "Requête invalide." });
  const key = pairKey(a, b);
  db.unvote(key, voter);
  res.json({ ok: true, pair: key, tally: db.tallies()[key] || {} });
});

// ---------- exports protégés ----------
function admin(req, res) {
  if (!ADMIN_TOKEN || req.query.token !== ADMIN_TOKEN) { res.status(403).send("Accès refusé"); return false; }
  return true;
}
const esc = v => v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
const sendCsv = (res, name, lines) => {
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${name}"`);
  res.send("﻿" + lines.join("\n"));
};

app.get("/api/admin/export.csv", (req, res) => {
  if (!admin(req, res)) return;
  const def = definition(ds.getPolls());
  const themes = ds.getThemes(), questions = ds.getQuestions();
  const legacy = ["age", "sex", "income", "region", "birth", "parents"];
  const head = ["id", "date", "test", "consentement_sensible", ...def.fields.map(f => f.key),
    ...themes.map(t => "score_" + t.code), ...questions.map(q => "q" + q.id)];
  const lines = [head.join(",")];
  for (const r of db.all()) {
    const ans = JSON.parse(r.answers), sc = JSON.parse(r.scores), prof = r.profile ? JSON.parse(r.profile) : {};
    legacy.forEach(k => { if (prof[k] === undefined && r[k]) prof[k] = r[k]; });
    lines.push([r.id, r.created_at, r.tier, r.sensitive ? "oui" : "non", ...def.fields.map(f => prof[f.key]),
      ...themes.map(t => sc[t.code]), ...questions.map(q => ans[q.id] ?? "")].map(esc).join(","));
  }
  sendCsv(res, "politest-contributions.csv", lines);
});

app.get("/api/admin/votes.csv", (req, res) => {
  if (!admin(req, res)) return;
  sendCsv(res, "politest-votes.csv", ["pair,choix,jour", ...db.allVotes().map(v => [v.pair, v.choice, v.day].map(esc).join(","))]);
});

app.get("/healthz", (_req, res) => res.json({ ok: true, contributions: db.count(), votes: db.voteCount() }));
// état détaillé : fraîcheur des sondages, scraper, actualités (répond 503 si un problème est détecté, pratique pour une sonde de surveillance)
app.get("/api/health", (_req, res) => {
  const s = health.status();
  res.set("Cache-Control", "no-store");
  res.status(s.ok ? 200 : 503).json({ ...s, subscribers: db.subCount() });
});

// ---------- mise à jour automatique des sondages (toutes les 30 minutes) ----------
let updating = false;
async function refreshPolls(label) {
  if (updating) return;
  updating = true;
  try { await updatePolls(); }
  catch (e) { console.error(`[${label}] mise à jour des sondages échouée :`, e.message); }
  finally { updating = false; }
}
cron.schedule("*/30 * * * *", async () => { await refreshPolls("cron"); health.checkAndAlert().catch(() => {}); });
cron.schedule("17 4 * * *", () => { try { db.purgePending(); } catch (e) { console.error("[abonnés]", e.message); } });
// alerte mensuelle : désactivée par défaut. DIGEST_AUTO=1 l'envoie le 1er de chaque mois à 9 h (heure de Paris), sinon `npm run send-digest`.
if (process.env.DIGEST_AUTO === "1" && mailer.enabled()) {
  cron.schedule("0 9 1 * *", () => require("./scripts/send-digest").run({}).catch(e => console.error("[alerte mensuelle]", e.message)), { timezone: "Europe/Paris" });
}

// ---------- fil d'actualité (flux RSS des médias, toutes les 20 minutes) ----------
let newsBusy = false;
async function refreshNews(label) {
  if (newsBusy || process.env.NEWS_DISABLED === "1") return;
  newsBusy = true;
  try {
    const r = await news.updateNews();
    const bad = (r.sources || r.status || []).filter(s => !s.ok);
    if (bad.length) console.log(`[${label}] fil d'actualité : ${bad.length} source(s) injoignable(s) (${bad.map(b => b.nom).join(", ")}) ; voir « npm run update-news »`);
  } catch (e) { console.error(`[${label}] fil d'actualité échoué :`, e.message); }
  finally { newsBusy = false; }
}
cron.schedule("*/20 * * * *", () => refreshNews("cron"));

app.get("/api/news", (req, res) => {
  res.set("Cache-Control", "public, max-age=120");
  const n = news.getNews();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
  const cand = String(req.query.candidate || "");
  const items = (cand ? n.items.filter(i => i.candidates.includes(cand)) : n.items).slice(0, limit);
  res.json({ updatedAt: n.updatedAt, sources: (n.sources || []).filter(s => s.ok).map(s => s.nom), items });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) console.log("(export désactivé : définissez ADMIN_TOKEN pour l'activer, voir README)");
  const issues = [...(ds.getQuestions().issues || []), ...ds.getPolls().issues, ...ds.getPositions().issues];
  if (issues.length) { console.log(`Attention : ${issues.length} problème(s) dans vos fichiers de données (lancez « npm run check-data ») :`); issues.slice(0, 5).forEach(i => console.log("  - " + i)); }
  refreshPolls("démarrage");
  refreshNews("démarrage");
});
