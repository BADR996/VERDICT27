// Module « Actualité du mois » : questions sur les événements récents, optionnel et séparé du score principal.
// Les réponses restent dans la page (rien n'est enregistré) ; le serveur calcule seulement la proximité.
import { $, $$, S, esc, api, avatar } from "./util.js";

const LABELS = ["Pas du tout d'accord", "Plutôt pas d'accord", "Neutre", "Plutôt d'accord", "Tout à fait d'accord"];
const A = { data: null, ans: {} };

export async function initActu() {
  let d;
  try { d = await api("/api/actualite"); } catch { return; }
  if (!d || !d.enabled) return;
  A.data = d;
  $("#actualite").hidden = false; $("#actu-link").hidden = false;
  $("#actu-h").textContent = (d.meta && d.meta.titre) || "Actualité du mois";
  $("#actu-intro").textContent = (d.meta && d.meta.intro) || "";
  $("#actu-ctx").innerHTML = ((d.meta && d.meta.contexte) || []).map(c =>
    `<li><b>${esc(c.sujet)}</b> — ${esc(c.texte)} ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.source || "source")}</a>` : ""}</li>`).join("");
  $("#actu-qs").innerHTML = d.questions.map(q => `
    <li class="actu-q" data-q="${esc(q.id)}">
      <span class="actu-sujet">${esc(q.sujet)}</span>
      <p class="actu-t">${esc(q.texte)}</p>
      <div class="opts" role="group" aria-label="${esc(q.texte)}">${LABELS.map((l, i) => `<button type="button" class="opt" aria-pressed="false" data-v="${i + 1}">${esc(l)}</button>`).join("")}</div>
      <div class="actu-cands"></div>
    </li>`).join("");
  $("#actu-open").addEventListener("click", () => {
    const open = $("#actu-body").hidden;
    $("#actu-body").hidden = !open;
    $("#actu-open").setAttribute("aria-expanded", String(open));
    $("#actu-open").textContent = open ? "Replier" : "Répondre (1 min)";
  });
  $("#actu-qs").addEventListener("click", e => {
    const b = e.target.closest(".opt"); if (!b) return;
    const li = b.closest(".actu-q"), on = b.getAttribute("aria-pressed") !== "true";
    $$(".opt", li).forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", String(on));
    if (on) A.ans[li.dataset.q] = Number(b.dataset.v); else delete A.ans[li.dataset.q];
    const n = Object.keys(A.ans).length;
    $("#actu-count").textContent = `${n} réponse${n > 1 ? "s" : ""} sur ${A.data.questions.length}`;
    $("#actu-go").disabled = n === 0;
  });
  $("#actu-go").addEventListener("click", show);
}

const side = n => n >= 4 ? ["d'accord", "yes"] : n <= 2 ? ["pas d'accord", "no"] : ["neutre", "mid"];

async function show() {
  let r;
  try { r = await api("/api/actualite/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: A.ans }) }); }
  catch { r = { matches: [], min: A.data.min }; }
  const cands = S.polls.candidates;
  // positions publiques par question
  $$(".actu-q").forEach(li => {
    const q = li.dataset.q, mine = A.ans[q], pos = A.data.positions[q] || {};
    const items = Object.entries(pos).filter(([k]) => cands[k]).map(([k, p]) => {
      const [lab, cls] = side(p.note), same = mine ? (side(mine)[1] === cls ? " same" : "") : "";
      return `<a class="ac ${cls}${same}" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" style="--c:${esc(cands[k].color)}" title="${esc(p.titre)}${p.extrait ? " — " + esc(p.extrait) : ""}">${esc(cands[k].shortName)} : ${lab}</a>`;
    });
    $(".actu-cands", li).innerHTML = items.length ? `<small>Positions publiques trouvées :</small> ${items.join("")}` : `<small class="muted">Aucune position publique sourcée trouvée pour l'instant.</small>`;
  });
  $("#actu-res").innerHTML = r.matches.length
    ? `<h3>Proximité sur l'actualité</h3><p class="muted small">Candidats ayant au moins ${r.min} positions sourcées sur les questions auxquelles vous avez répondu.</p>
       <ol class="matches">${r.matches.map((m, i) => { const c = cands[m.slug]; return `<li style="--c:${esc(c.color)}"><span class="rk">${i + 1}</span>${avatar(c)}<div><div class="name" style="font-weight:700">${esc(c.name)} <small class="muted">${m.shared} questions</small></div><div class="track" style="height:12px;background:var(--paper);border-radius:8px;overflow:hidden;margin-top:6px"><span style="display:block;height:100%;width:${m.pct}%;background:${esc(c.color)};border-radius:8px"></span></div></div><span class="val">${m.pct}&nbsp;%</span></li>`; }).join("")}</ol>`
    : `<p class="muted"><b>Pas de classement :</b> aucun candidat n'a encore au moins ${r.min} positions publiques sourcées sur les questions auxquelles vous avez répondu. Répondez à plus de questions, ou consultez les positions trouvées sous chaque question.</p>`;
  $("#actu-res").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
