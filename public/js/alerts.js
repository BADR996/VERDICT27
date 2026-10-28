// Formulaire d'inscription à l'alerte mensuelle (affiché seulement si le serveur sait envoyer des e-mails).
import { $, api } from "./util.js";

export function initAlerts(site) {
  if (!site || !site.mailEnabled) return;
  $("#alertes").hidden = false;
  const form = $("#sub-form"), msg = $("#sub-msg"), btn = $("#sub-send");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    msg.className = "small";
    const email = $("#sub-email").value.trim();
    if (!email) { msg.textContent = "Indiquez votre adresse e-mail."; msg.classList.add("err"); return; }
    if (!$("#sub-consent").checked) { msg.textContent = "Cochez la case pour accepter de recevoir l'alerte."; msg.classList.add("err"); return; }
    btn.disabled = true;
    try {
      await api("/api/abonnement", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true, website: form.elements.website.value }) });
      msg.textContent = "Presque fini : un e-mail de confirmation vient de vous être envoyé (pensez à regarder les indésirables).";
      msg.classList.add("ok"); form.reset();
    } catch (err) { msg.textContent = err.message; msg.classList.add("err"); }
    finally { btn.disabled = false; }
  });
}
