// Envoie l'alerte mensuelle « ce qui a bougé » aux abonnés confirmés.
//   npm run send-digest                 envoie à tous (une seule fois par mois et par abonné)
//   npm run send-digest -- --dry        n'envoie rien : écrit un aperçu dans data/apercu-alerte.html
//   npm run send-digest -- --to=moi@exemple.fr   envoie seulement un message d'essai à cette adresse
//   npm run send-digest -- --force      renvoie même si déjà envoyé ce mois-ci
// Nécessite SITE_URL (ex. https://politest.fr) et le SMTP (voir lib/mailer.js).

const fs = require("fs");
const path = require("path");
const mailer = require("../lib/mailer");
const { buildDigest, monthKey } = require("../lib/digest");

async function run({ dry = false, to = null, force = false } = {}) {
  const base = (process.env.SITE_URL || "").replace(/\/+$/, "");
  if (!base && !dry) throw new Error("Définissez SITE_URL (adresse publique du site, ex. https://politest.fr) : elle sert aux liens du message.");
  const digest = buildDigest(base || "http://localhost:3000");
  if (!digest) throw new Error("Pas assez de sondages pour construire l'alerte.");
  const unsub = token => `${base || "http://localhost:3000"}/desabonnement?t=${token}`;

  if (dry) {
    const f = path.join(__dirname, "..", "data", "apercu-alerte.html");
    fs.writeFileSync(f, digest.html(unsub("TOKEN-EXEMPLE")));
    console.log(`Aperçu écrit dans ${f}\nObjet : ${digest.subject}\n\n${digest.text(unsub("TOKEN-EXEMPLE"))}`);
    return { sent: 0 };
  }
  if (!mailer.enabled()) throw new Error("SMTP non configuré (SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM).");
  const send = (email, token) => mailer.send({
    to: email, subject: digest.subject, text: digest.text(unsub(token)), html: digest.html(unsub(token)),
    headers: { "List-Unsubscribe": `<${unsub(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
  });

  if (to) { await send(to, "essai"); console.log("Message d'essai envoyé à " + to); return { sent: 1 }; }

  const db = require("../db");
  const month = monthKey(new Date());
  let sent = 0, skipped = 0, failed = 0;
  for (const s of db.confirmedSubs()) {
    if (s.last_sent === month && !force) { skipped++; continue; }
    try { await send(s.email, s.token); db.markSent(s.email, month); sent++; }
    catch (e) { failed++; console.error("Échec pour un abonné :", e.message); }
    await new Promise(r => setTimeout(r, 400));                      // on ne mitraille pas le serveur d'envoi
  }
  console.log(`Alerte « ${digest.subject} » : ${sent} envoyé(s), ${skipped} déjà reçu(s) ce mois-ci, ${failed} échec(s).`);
  return { sent, skipped, failed };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  run({ dry: args.includes("--dry"), force: args.includes("--force"), to: (args.find(a => a.startsWith("--to=")) || "").slice(5) || null })
    .catch(e => { console.error("Erreur :", e.message); process.exit(1); });
}
module.exports = { run };
