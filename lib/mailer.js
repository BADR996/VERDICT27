// Envoi d'e-mails (confirmation d'abonnement, alerte mensuelle, alertes techniques) via un serveur SMTP.
// Réglages par variables d'environnement :
//   SMTP_HOST, SMTP_PORT (587 par défaut), SMTP_SECURE=1 (port 465), SMTP_USER, SMTP_PASS, MAIL_FROM
// Sans SMTP_HOST, les e-mails sont désactivés (le site fonctionne normalement, sans formulaire d'abonnement).

const nodemailer = require("nodemailer");

const enabled = () => !!process.env.SMTP_HOST;
let transport = null;
function get() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "1",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : undefined
    });
  }
  return transport;
}
const from = () => process.env.MAIL_FROM || process.env.SMTP_USER || "verdict27 <no-reply@localhost>";

async function send({ to, subject, text, html, headers }) {
  if (!enabled()) throw new Error("SMTP non configuré (variable SMTP_HOST absente).");
  return get().sendMail({ from: from(), to, subject, text, html, headers });
}

module.exports = { enabled, send, from };
