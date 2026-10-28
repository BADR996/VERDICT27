// Questionnaire de contribution (consensus) : facultatif, proposé avant le test (ou à la fin), consentements séparés.
// Les réponses sont des boutons (un toucher = choisir, un second toucher = effacer).
import { $, $$, S, esc, api, toast } from "./util.js";

const C = { tier: null, answers: {}, code: null, profile: {}, sent: false };

export function setContribData(tier, answers) { C.tier = tier; C.answers = answers; }

function toSetup() {
  $("#contrib-slot").append($("#contrib"));
  $("#contrib").classList.add("pre"); $("#contrib").classList.remove("card"); $("#contrib").hidden = false;
}
function toResult() {
  $("#contrib-result-slot").append($("#contrib"));
  $("#contrib").classList.remove("pre"); $("#contrib").classList.add("card");
}

// À la fin du test : envoi automatique si le consentement a été donné avant, sinon on propose la carte.
export async function contribAtEnd() {
  $("#contrib-done").hidden = true;
  if (C.sent) return;
  if ($("#consent").checked) { toResult(); await send(); return; }
  toResult(); $("#contrib").hidden = false;
}
export function hideContrib() { $("#contrib").hidden = true; $("#contrib-done").hidden = true; }

export function resetContrib() {
  C.code = null; C.sent = false; C.profile = {};
  $("#contrib-done").hidden = true; $("#contrib-deleted").hidden = true; $("#contrib-delete").hidden = false;
  $("#contrib-error").hidden = true;
  $("#consent").checked = false; $("#consent-sens").checked = false;
  $$("#contrib .opt").forEach(b => b.setAttribute("aria-pressed", "false"));
  $("#contrib-send").disabled = false;
  toSetup();
  $("#contrib-slot").hidden = true; $("#contrib-open").setAttribute("aria-expanded", "false"); $("#contrib-open").textContent = "Je participe";
  syncSens(); updateCount();
}

export function initContrib() {
  const def = S.config.profile;
  $("#contrib-sections").innerHTML = def.sections.map(sec => `
    <details class="fold" ${sec.sensitive ? "" : "open"} data-sec="${esc(sec.id)}">
      <summary>${esc(sec.title)} <span class="badge ${sec.sensitive ? "sens" : ""}">${sec.sensitive ? "sensible" : "ordinaire"}</span></summary>
      <div class="body"><p class="intro">${esc(sec.intro)}</p><div class="fields">
        ${def.fields.filter(f => f.section === sec.id).map(f => `
          <fieldset class="f" data-key="${esc(f.key)}" data-sens="${sec.sensitive ? 1 : 0}">
            <legend>${esc(f.label)}</legend>
            <div class="opts">${f.options.map(o => `<button type="button" class="opt" aria-pressed="false" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>
          </fieldset>`).join("")}
      </div></div></details>`).join("");

  $("#contrib-sections").addEventListener("click", e => {
    const b = e.target.closest(".opt"); if (!b || b.disabled) return;
    const on = b.getAttribute("aria-pressed") !== "true";
    $$(".opt", b.closest(".opts")).forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", on ? "true" : "false");
    updateCount();
  });
  $("#consent-sens").addEventListener("change", syncSens);
  $("#contrib").addEventListener("submit", e => { e.preventDefault(); send(); });
  $("#contrib-delete").addEventListener("click", del);
  $("#contrib-open").addEventListener("click", () => {
    const open = $("#contrib-slot").hidden;
    $("#contrib-slot").hidden = !open;
    $("#contrib-open").setAttribute("aria-expanded", String(open));
    $("#contrib-open").textContent = open ? "Replier" : "Je participe";
  });
  syncSens(); updateCount();
}

function syncSens() {
  const on = $("#consent-sens").checked;
  $$("#contrib fieldset[data-sens='1']").forEach(f => {
    f.disabled = !on; f.classList.toggle("off", !on);
    if (!on) $$(".opt", f).forEach(b => b.setAttribute("aria-pressed", "false"));
  });
  updateCount();
}
function updateCount() {
  const fs = $$("#contrib fieldset.f").filter(f => !f.disabled);
  const n = fs.filter(f => $(".opt[aria-pressed='true']", f)).length;
  $("#contrib-count").textContent = `${n} information${n > 1 ? "s" : ""} sur ${fs.length}`;
  $("#contrib-bar").style.width = (fs.length ? (n / fs.length) * 100 : 0) + "%";
}

async function send() {
  const err = $("#contrib-error");
  err.hidden = true;
  if (!$("#consent").checked) { err.textContent = "Cochez la case de consentement pour envoyer vos réponses."; err.hidden = false; return; }
  if (!C.tier || !Object.keys(C.answers).length) { err.textContent = "Terminez d'abord le test : vos réponses partiront alors automatiquement."; err.hidden = false; return; }
  const profile = {};
  $$("#contrib fieldset.f").forEach(f => { const b = $(".opt[aria-pressed='true']", f); if (!f.disabled && b) profile[f.dataset.key] = b.dataset.v; });
  $("#contrib-send").disabled = true;
  try {
    const r = await api("/api/contribute", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: true, consentSensitive: $("#consent-sens").checked, tier: C.tier, answers: C.answers, profile }) });
    C.code = r.id; C.sent = true;
    $("#contrib-code").textContent = r.id;
    $("#contrib").hidden = true; $("#contrib-done").hidden = false;
    $("#contrib-done").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (x) {
    err.textContent = x.message || "Envoi impossible."; err.hidden = false;
    $("#contrib-send").disabled = false;
  }
}

async function del() {
  if (!C.code) return;
  try {
    await api("/api/contribute/" + encodeURIComponent(C.code), { method: "DELETE" });
    $("#contrib-deleted").hidden = false; $("#contrib-delete").hidden = true; $("#contrib-code").textContent = "—";
    C.code = null; C.sent = false;
  } catch (x) { toast(x.message || "Suppression impossible"); }
}
