// Santé du site : fraîcheur des sondages, état du scraper, état du fil d'actualité.
// Quand quelque chose cloche, une alerte part (une fois par jour au plus) vers :
//   - ALERT_WEBHOOK : adresse qui reçoit un POST JSON {"text": "..."} (Slack, Discord, Mattermost, ntfy…) ;
//   - ALERT_EMAIL   : une adresse e-mail (nécessite le SMTP, voir lib/mailer.js).
// Sans l'un ni l'autre, le problème est seulement visible sur /api/health et dans les journaux.

const fs = require("fs");
const path = require("path");
const ds = require("./dataset");
const mailer = require("./mailer");

const STATUS = path.join(__dirname, "..", "data", "scraper-status.json");
const ALERT_STATE = path.join(__dirname, "..", "data", "alert-state.json");
const STALE_HOURS = Number(process.env.STALE_HOURS || 6);
const read = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } };

function status() {
  const polls = ds.getPolls(), s = read(STATUS);
  const updatedAt = polls.updatedAt ? Date.parse(polls.updatedAt) : 0;
  const ageH = updatedAt ? (Date.now() - updatedAt) / 36e5 : null;
  let newsAt = null;
  try { newsAt = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "news.json"), "utf8")).updatedAt || null; } catch { /* pas encore de fil */ }
  const problems = [];
  if (!polls.firstRound.length) problems.push("Aucun sondage chargé.");
  if (ageH !== null && ageH > STALE_HOURS) problems.push(`Les sondages n'ont pas été mis à jour depuis ${Math.round(ageH)} h.`);
  if ((s.consecutiveFailures || 0) >= 3) problems.push(`Le scraper a échoué ${s.consecutiveFailures} fois de suite : ${s.lastError}`);
  if (s.rejected > Math.max(10, (s.firstRound || 0) * 0.15)) problems.push(`${s.rejected} scénarios rejetés par le contrôle de cohérence (la structure de la page source a peut-être changé).`);
  return {
    ok: problems.length === 0, problems,
    polls: { updatedAt: polls.updatedAt, ageHours: ageH === null ? null : Math.round(ageH * 10) / 10, firstRound: polls.firstRound.length, matchups: polls.matchups.length },
    scraper: { lastRun: s.lastRun || null, lastOk: s.lastOk || null, lastError: s.lastError || null, consecutiveFailures: s.consecutiveFailures || 0, rejected: s.rejected ?? null },
    news: { updatedAt: newsAt }
  };
}

async function notify(text) {
  const done = [];
  if (process.env.ALERT_WEBHOOK) {
    try {
      const r = await fetch(process.env.ALERT_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }) });
      done.push("webhook " + r.status);
    } catch (e) { done.push("webhook en échec : " + e.message); }
  }
  if (process.env.ALERT_EMAIL && mailer.enabled()) {
    try { await mailer.send({ to: process.env.ALERT_EMAIL, subject: "verdict27 : alerte", text }); done.push("e-mail envoyé"); }
    catch (e) { done.push("e-mail en échec : " + e.message); }
  }
  return done;
}

// à appeler régulièrement : prévient au plus une fois par jour pour le même problème
async function checkAndAlert() {
  const s = status();
  if (s.ok) { try { fs.rmSync(ALERT_STATE); } catch { /* rien à effacer */ } return s; }
  const state = read(ALERT_STATE), key = s.problems.join("|");
  if (state.key === key && Date.now() - (state.at || 0) < 24 * 36e5) return s;
  console.warn("[santé] " + s.problems.join(" "));
  if (process.env.ALERT_WEBHOOK || process.env.ALERT_EMAIL) {
    await notify("verdict27 : " + s.problems.join(" "));
    try { fs.writeFileSync(ALERT_STATE, JSON.stringify({ key, at: Date.now() })); } catch { /* lecture seule */ }
  }
  return s;
}

module.exports = { status, checkAndAlert, notify };
