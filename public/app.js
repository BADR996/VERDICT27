"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nextFrame = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

// Stockage local : simple confort (reprise du test). L'appli fonctionne sans.
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignoré */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignoré */ } }
};

const fmtNum = v => v === 0.5 ? "<1" : Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
const fmtDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const dateLabel = p => /\d{4}/.test(p.dateLabel) ? p.dateLabel : `${p.dateLabel} ${(p.date || "").slice(0, 4)}`;

// ---------- Avatars ----------
function initials(name) {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}
// Photo : public/photos/<slug>.jpg (si vous l'ajoutez) > photo Wikimédia > initiales.
function avatar(c, cls = "") {
  const photo = c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  return `<span class="av ${cls}${c.photo ? "" : " todo"}" title="${esc(c.name)}">${esc(initials(c.name))}${photo}</span>`;
}

// ============================================================
//  SONDAGES
// ============================================================
let POLLS = null;
let shownPolls = 12;
const expanded = new Set();

function computeAverages(polls, cands, days = 60) {
  const dated = polls.filter(p => p.date);
  if (!dated.length) return { rows: [], from: null, to: null, count: 0 };
  const to = dated[0].date;
  const d = new Date(to + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const from = d.toISOString().slice(0, 10);
  const win = dated.filter(p => p.date >= from);
  const acc = {};
  for (const p of win) {
    // un sondage peut avoir plusieurs scénarios : on moyenne d'abord DANS le sondage, puis entre sondages
    const per = {};
    for (const s of p.scenarios) for (const [k, v] of Object.entries(s.values)) (per[k] ||= []).push(v);
    for (const [k, arr] of Object.entries(per)) {
      if (!cands[k] || cands[k].generic) continue;
      const a = (acc[k] ||= { sum: 0, n: 0 });
      a.sum += arr.reduce((x, y) => x + y, 0) / arr.length;
      a.n++;
    }
  }
  const rows = Object.entries(acc)
    .filter(([, a]) => a.n >= 2)
    .map(([slug, a]) => ({ slug, avg: a.sum / a.n, n: a.n }))
    .sort((a, b) => b.avg - a.avg);
  return { rows, from, to, count: win.length };
}

async function loadPolls() {
  const res = await fetch("/api/polls");
  POLLS = await res.json();
  const { firstRound, matchups, candidates } = POLLS;

  if (!firstRound.length) {
    $("#polls-meta").textContent = "Aucun sondage pour le moment : la première mise à jour n'a pas encore abouti.";
    $("#podium-cols").innerHTML = '<p class="muted">Les sondages arrivent bientôt.</p>';
    return;
  }
  const when = POLLS.updatedAt ? new Date(POLLS.updatedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "inconnue";
  $("#polls-meta").textContent =
    `${firstRound.length} sondages du premier tour et ${matchups.length} duels de second tour. Dernière mise à jour : ${when}.`;
  if (POLLS.source) $("#source-link").href = POLLS.source;

  const avg = computeAverages(firstRound, candidates);
  renderPodium(avg, candidates);
  renderRank(avg, candidates);
  renderDuels();
  renderPollsTable(avg, candidates);
}

function renderPodium(avg, cands) {
  const top = avg.rows.slice(0, 3);
  if (!top.length) { $("#podium-cols").innerHTML = '<p class="muted">Pas assez de sondages récents.</p>'; return; }
  const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);   // le premier au centre
  const max = top[0].avg;
  $("#podium-cols").innerHTML = order.map(i => {
    const r = top[i], c = cands[r.slug];
    return `<div class="pcol">
      ${avatar(c, "lg")}
      <div class="bar" data-h="${Math.round((r.avg / max) * 170)}">${Math.round(r.avg)}&nbsp;%</div>
      <div class="who">${esc(c.shortName)}<small>${esc(c.party)}</small></div>
    </div>`;
  }).join("");
  $("#podium-cap").textContent =
    `Moyenne de ${avg.count} sondages du premier tour, du ${fmtDate(avg.from)} au ${fmtDate(avg.to)}.`;
  nextFrame(() => document.querySelectorAll(".pcol .bar").forEach(b => { b.style.height = b.dataset.h + "px"; }));
}

function renderRank(avg, cands) {
  $("#avg-note").textContent =
    `Sondages des 60 jours précédant le plus récent (${fmtDate(avg.to)}). Les candidats testés dans moins de deux sondages n'apparaissent pas.`;
  const rows = avg.rows.slice(0, 10);
  const max = rows.length ? rows[0].avg : 1;
  $("#rank").innerHTML = rows.map(r => {
    const c = cands[r.slug];
    return `<li>${avatar(c)}
      <div><div class="name">${esc(c.name)}<small>${esc(c.party)}</small></div>
        <div class="track"><span class="fill" data-w="${(r.avg / max) * 100}"></span></div></div>
      <div class="val">${r.avg.toFixed(1).replace(".", ",")}&nbsp;%</div></li>`;
  }).join("");
  nextFrame(() => document.querySelectorAll("#rank .fill").forEach(f => { f.style.width = f.dataset.w + "%"; }));
}

// ----- second tour -----
function renderDuels() {
  const { matchups } = POLLS;
  const sel = $("#matchup-select");
  if (!matchups.length) { sel.hidden = true; $("#duel").innerHTML = '<p class="muted">Aucun duel pour le moment.</p>'; return; }
  sel.innerHTML = matchups.map((m, i) =>
    `<option value="${i}">${esc(m.title)} (${m.polls.length} sondage${m.polls.length > 1 ? "s" : ""})</option>`).join("");
  sel.onchange = () => showDuel(Number(sel.value));
  showDuel(0);
}

function showDuel(i) {
  const m = POLLS.matchups[i], cands = POLLS.candidates;
  const [ka, kb] = m.candidates, a = cands[ka], b = cands[kb];
  const last = m.polls[0];
  const va = last.values[ka], vb = last.values[kb];
  const note = m.absentFromFirstRound
    ? '<p class="muted small">Ces candidats ne sont pas dans les sondages du premier tour (hypothèse).</p>' : "";
  $("#duel").innerHTML = `
    <div class="duel-head">
      <div class="duel-side">${avatar(a, "lg")}<span>${esc(a.name)}</span><b>${fmtNum(va)}&nbsp;%</b></div>
      <div class="duel-side">${avatar(b, "lg")}<span>${esc(b.name)}</span><b>${fmtNum(vb)}&nbsp;%</b></div>
    </div>
    <div class="duel-bar" role="img" aria-label="${esc(a.shortName)} ${va} %, ${esc(b.shortName)} ${vb} %">
      <span class="a" style="width:${va}%"></span><span class="b" style="width:${vb}%"></span></div>
    <p class="duel-meta muted small">Dernier sondage : ${esc(last.pollster)}, ${esc(dateLabel(last))}${last.sample ? `, ${last.sample.toLocaleString("fr-FR")} personnes` : ""}.</p>
    ${note}
    <table class="mini"><thead><tr><th>Institut</th><th>Date</th><th class="n">${esc(a.shortName)}</th><th class="n">${esc(b.shortName)}</th></tr></thead>
    <tbody>${m.polls.slice(0, 8).map(p => `<tr><td>${esc(p.pollster)}</td><td>${esc(dateLabel(p))}</td>
      <td class="n">${fmtNum(p.values[ka])}</td><td class="n">${fmtNum(p.values[kb])}</td></tr>`).join("")}</tbody></table>`;
}

// ----- tableau du premier tour -----
function renderPollsTable(avg, cands) {
  const cols = avg.rows.slice(0, 8).map(r => r.slug);
  const head = `<thead><tr><th>Institut</th><th>Date</th><th>Échantillon</th>${cols.map(k =>
    `<th><span class="cand">${avatar(cands[k], "sm")}${esc(cands[k].shortName)}</span></th>`).join("")}</tr></thead>`;

  const rows = POLLS.firstRound.slice(0, shownPolls).map((p, idx) => {
    const sorted = [...p.scenarios].sort((x, y) => Object.keys(y.values).length - Object.keys(x.values).length);
    const main = sorted[0], extra = sorted.slice(1);
    const topVal = Math.max(...Object.values(main.values));
    const cells = s => cols.map(k => {
      const v = s.values[k];
      return v === undefined ? '<td class="no">–</td>' : `<td class="${v === Math.max(...Object.values(s.values)) ? "top" : ""}">${fmtNum(v)}</td>`;
    }).join("");
    const toggle = extra.length
      ? `<button class="more" type="button" data-poll="${idx}" aria-expanded="${expanded.has(idx)}">${expanded.has(idx) ? "masquer" : `+${extra.length} scénario${extra.length > 1 ? "s" : ""}`}</button>` : "";
    const extraRows = expanded.has(idx)
      ? extra.map(s => `<tr class="extra"><td colspan="3">Autre scénario</td>${cells(s)}</tr>`).join("") : "";
    void topVal;
    return `<tr><td>${esc(p.pollster)}${toggle}</td><td>${esc(dateLabel(p))}</td><td>${p.sample ? p.sample.toLocaleString("fr-FR") : ""}</td>${cells(main)}</tr>${extraRows}`;
  }).join("");

  $("#polls-table").innerHTML = head + `<tbody>${rows}</tbody>`;
  const more = $("#more-polls");
  more.hidden = shownPolls >= POLLS.firstRound.length;
}
$("#polls-table").addEventListener("click", e => {
  const b = e.target.closest(".more");
  if (!b) return;
  const i = Number(b.dataset.poll);
  expanded.has(i) ? expanded.delete(i) : expanded.add(i);
  renderPollsTable(computeAverages(POLLS.firstRound, POLLS.candidates), POLLS.candidates);
});
$("#more-polls").addEventListener("click", () => {
  shownPolls += 12;
  renderPollsTable(computeAverages(POLLS.firstRound, POLLS.candidates), POLLS.candidates);
});

// ============================================================
//  TEST POLITIQUE
// ============================================================
const LABELS = ["Pas du tout d'accord", "Plutôt pas d'accord", "Neutre", "Plutôt d'accord", "Tout à fait d'accord"];
const progressKey = t => `politest.v2.progress.${t}`;
let cfg = null, tier = null, questions = [], answers = {}, idx = 0, lastTier = null, lastAnswers = null, running = false;

async function initQuiz() {
  cfg = await (await fetch("/api/quiz/config")).json();
  renderTiers();
  renderContribFields();
}

function renderTiers() {
  $("#tier-buttons").innerHTML = cfg.tiers.map(t => {
    const saved = store.get(progressKey(t.key));
    const resume = saved && saved.n === t.available && saved.idx > 0 && saved.idx < t.available
      ? `<span class="resume">Reprendre à la question ${saved.idx + 1}</span>` : "";
    return `<button class="tier" type="button" data-tier="${t.key}">
      <span class="name">${esc(t.label)}</span>
      <span class="num">${t.available}<small>questions</small></span>
      <span class="desc">Environ ${t.minutes} minutes. Résultat : ${esc(t.precision.toLowerCase())}.</span>${resume}</button>`;
  }).join("");
}
$("#tier-buttons").addEventListener("click", e => {
  const b = e.target.closest(".tier");
  if (b) startQuiz(b.dataset.tier);
});

async function startQuiz(key) {
  const res = await fetch(`/api/quiz/questions?tier=${key}`);
  questions = await res.json();
  tier = key; answers = {}; idx = 0;
  const saved = store.get(progressKey(key));
  if (saved && saved.n === questions.length && saved.idx < questions.length) { answers = saved.answers || {}; idx = saved.idx; }
  running = true;
  $("#quiz-start").hidden = true; $("#quiz-result").hidden = true; $("#quiz-run").hidden = false;
  renderQuestion();
  $("#test").scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveProgress() { store.set(progressKey(tier), { n: questions.length, idx, answers }); }

function renderQuestion() {
  const q = questions[idx];
  $("#question-text").textContent = q.text;
  $("#progress-text").textContent = `Question ${idx + 1} sur ${questions.length}`;
  const pct = Math.round((idx / questions.length) * 100);
  $("#progress-bar").style.width = pct + "%";
  $("#progress").setAttribute("aria-valuenow", pct);
  $("#answer-buttons").innerHTML = LABELS.map((l, i) =>
    `<button type="button" data-v="${i + 1}" class="${answers[q.id] === i + 1 ? "selected" : ""}"><span class="k">${i + 1}</span><span>${l}</span></button>`).join("");
  $("#btn-prev").disabled = idx === 0;
}

function choose(v) {
  const q = questions[idx];
  answers[q.id] = v;
  document.querySelectorAll("#answer-buttons button").forEach(b => b.classList.toggle("selected", Number(b.dataset.v) === v));
  setTimeout(next, 160);
}
function next() {
  if (!running) return;
  if (idx + 1 < questions.length) { idx++; saveProgress(); renderQuestion(); }
  else finish();
}
$("#answer-buttons").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b) choose(Number(b.dataset.v));
});
$("#btn-prev").addEventListener("click", () => { if (idx > 0) { idx--; renderQuestion(); } });
$("#btn-skip").addEventListener("click", () => { delete answers[questions[idx].id]; next(); });
$("#btn-quit").addEventListener("click", () => {
  running = false; saveProgress(); renderTiers();
  $("#quiz-run").hidden = true; $("#quiz-start").hidden = false;
});
document.addEventListener("keydown", e => {
  if (!running || e.target.closest("input, select, textarea")) return;
  if (e.key >= "1" && e.key <= "5") choose(Number(e.key));
  else if (e.key === "ArrowLeft" && idx > 0) { idx--; renderQuestion(); }
});

async function finish() {
  running = false;
  const res = await fetch("/api/quiz/score", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers })
  });
  const result = await res.json();
  lastTier = tier; lastAnswers = { ...answers };
  store.del(progressKey(tier));
  $("#quiz-run").hidden = true; $("#quiz-result").hidden = false;
  renderResult(result);
  resetContrib();
  $("#quiz-result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResult(result) {
  const list = Object.values(result);
  const strong = list.filter(a => a.score !== null && a.answered >= 2 && Math.abs(a.score) >= 20)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 2);
  const pole = a => a.score > 0 ? a.pos : a.neg;
  $("#result-summary").textContent = strong.length
    ? `Vos positions les plus marquées : ${strong.map(a => `${a.label} (${pole(a).toLowerCase()})`).join(" et ")}.`
    : "Vos réponses sont plutôt nuancées : aucun sujet ne ressort nettement.";

  $("#result-bars").innerHTML = list.map(a => {
    if (a.score === null) return `<div class="axis"><div class="axis-title">${esc(a.label)}</div><p class="muted small">Aucune réponse sur ce sujet.</p></div>`;
    const left = a.score >= 0 ? 50 : 50 + a.score / 2;
    return `<div class="axis">
      <div class="axis-title">${esc(a.label)}<small>${a.answered} réponse${a.answered > 1 ? "s" : ""}</small></div>
      <div class="axis-poles"><span>${esc(a.neg)}</span><span>${esc(a.pos)}</span></div>
      <div class="scale" role="img" aria-label="${esc(a.label)} : ${a.score > 0 ? "+" : ""}${a.score} sur 100">
        <span class="fill" data-left="${left}" data-width="${Math.abs(a.score) / 2}" style="left:50%;width:0"></span>
        <span class="marker" data-left="${50 + a.score / 2}" style="left:50%"></span>
      </div></div>`;
  }).join("");
  nextFrame(() => {
    document.querySelectorAll("#result-bars .fill").forEach(f => { f.style.left = f.dataset.left + "%"; f.style.width = f.dataset.width + "%"; });
    document.querySelectorAll("#result-bars .marker").forEach(m => { m.style.left = m.dataset.left + "%"; });
  });
}

$("#btn-restart").addEventListener("click", () => {
  $("#quiz-result").hidden = true; $("#quiz-start").hidden = false; renderTiers();
  $("#test").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============================================================
//  CONTRIBUTION FACULTATIVE
// ============================================================
function renderContribFields() {
  $("#contrib-fields").innerHTML = Object.entries(cfg.fields).map(([key, f]) => `
    <label class="f">${esc(f.label)}
      <select name="${key}"><option value="">Je préfère ne pas répondre</option>
      ${f.options.map(o => `<option>${esc(o)}</option>`).join("")}</select></label>`).join("");
}
function resetContrib() {
  $("#contrib").hidden = false; $("#contrib-done").hidden = true; $("#contrib-deleted").hidden = true;
  $("#contrib-delete").hidden = false; $("#contrib-error").hidden = true;
  $("#consent").checked = false; $("#contrib-send").disabled = false;
  document.querySelectorAll("#contrib select").forEach(s => { s.value = ""; });
}
let contribId = null;
$("#contrib").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#contrib-error");
  err.hidden = true;
  if (!$("#consent").checked) {
    err.textContent = "Cochez la case de consentement pour envoyer vos réponses, ou ignorez simplement ce formulaire.";
    err.hidden = false; return;
  }
  const demo = {};
  document.querySelectorAll("#contrib select").forEach(s => { if (s.value) demo[s.name] = s.value; });
  $("#contrib-send").disabled = true;
  try {
    const res = await fetch("/api/contribute", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: true, tier: lastTier, answers: lastAnswers, demo })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "Envoi impossible.");
    contribId = out.id;
    $("#contrib-code").textContent = out.id;
    $("#contrib").hidden = true; $("#contrib-done").hidden = false;
  } catch (ex) {
    err.textContent = ex.message + " Vous pouvez réessayer.";
    err.hidden = false; $("#contrib-send").disabled = false;
  }
});
$("#contrib-delete").addEventListener("click", async () => {
  if (!contribId) return;
  await fetch(`/api/contribute/${encodeURIComponent(contribId)}`, { method: "DELETE" });
  contribId = null;
  $("#contrib-delete").hidden = true; $("#contrib-deleted").hidden = false;
});

// ---------- démarrage ----------
loadPolls().catch(() => {
  $("#polls-meta").textContent = "Impossible de charger les sondages pour le moment. Rechargez la page dans un instant.";
  $("#podium-cols").innerHTML = '<p class="muted">Sondages indisponibles.</p>';
});
initQuiz().catch(() => { $("#tier-buttons").innerHTML = '<p class="error">Le test est indisponible pour le moment. Rechargez la page.</p>'; });
