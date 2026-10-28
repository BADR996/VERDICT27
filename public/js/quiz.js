// Test politique : on choisit la durée, puis le thème de départ ; questions rangées par thème.
import { $, $$, S, esc, avatar, store, toast, api, nextFrame, fmtPct } from "./util.js";
import { setContribData, resetContrib, contribAtEnd, hideContrib } from "./contrib.js";
import { makeCardSafe } from "./card.js";

const LABELS = ["Pas du tout d'accord", "Plutôt pas d'accord", "Neutre", "Plutôt d'accord", "Tout à fait d'accord"];
const Q = { tier: null, themes: [], answers: {}, seen: new Set(), ti: 0, qi: 0, running: false, timer: null };
const AUTO_MS = 3200;                       // enchaînement automatique du test rapide
const NEXT_TIER = { express: "quick", quick: "medium", medium: "full" };
const stopTimer = () => { if (Q.timer) { clearTimeout(Q.timer); Q.timer = null; } };
let setupTier = null;
const progressKey = t => `politest.v3.progress.${t}`;
const total = () => Q.themes.reduce((s, t) => s + t.questions.length, 0);
const seenIn = th => th.questions.filter(q => Q.seen.has(q.id)).length;

export function initQuiz() {
  renderTiers();
  const shared = location.pathname.match(/^\/p\/([\w-]+)$/) || location.hash.match(/^#profil=([\w-]+)$/);   // lien /p/… (nouveau) ou #profil=… (ancien)
  if (shared) { try { showShared(JSON.parse(atob(shared[1].replace(/-/g, "+").replace(/_/g, "/")))); } catch { /* lien invalide : ignoré */ } }

  $("#tier-buttons").addEventListener("click", e => {
    const b = e.target.closest("[data-tier]");
    if (b) chooseTier(b.dataset.tier);
  });
  // aperçu de l'accueil : un clic sur une durée ouvre directement le choix du thème
  $(".teaser-tiers").addEventListener("click", e => {
    const a = e.target.closest("[data-go]");
    if (!a) return;
    e.preventDefault();
    if (!$("#quiz-setup").hidden) { chooseTier(a.dataset.go); document.getElementById("test").scrollIntoView({ behavior: "smooth" }); }
    else document.getElementById("test").scrollIntoView({ behavior: "smooth" });
  });
  $("#theme-grid").addEventListener("click", e => {
    const b = e.target.closest("[data-theme]");
    if (b) startQuiz(setupTier, b.dataset.theme);
  });
  $("#theme-all").addEventListener("click", () => startQuiz(setupTier, null));
  $("#theme-pick").addEventListener("click", e => { if (e.target.closest("[data-resume]")) startQuiz(setupTier, null, true); });

  $("#answer-buttons").addEventListener("click", e => { const b = e.target.closest("button"); if (b) choose(Number(b.dataset.v)); });
  $("#btn-prev").addEventListener("click", prev);
  $("#btn-skip").addEventListener("click", skip);
  $("#btn-quit").addEventListener("click", quit);
  $("#btn-finish-now").addEventListener("click", () => {
    if (!Object.keys(Q.answers).length) return toast("Répondez d'abord à au moins une question.");
    finish();
  });
  $("#theme-nav").addEventListener("click", e => { const b = e.target.closest("[data-ti]"); if (b) jump(Number(b.dataset.ti)); });
  $("#theme-done").addEventListener("click", e => {
    const b = e.target.closest("[data-ti], [data-finish], [data-stay]");
    if (!b) return;
    stopTimer();
    if (b.dataset.stay !== undefined) { $$("#theme-done .autonext, #theme-done [data-stay]").forEach(x => x.remove()); return; }
    if (b.dataset.finish !== undefined) finish(); else jump(Number(b.dataset.ti));
  });
  $("#btn-restart").addEventListener("click", () => {
    stopTimer();
    history.replaceState(null, "", "/");
    $("#quiz-result").hidden = true; $("#quiz-setup").hidden = false;
    $("#btn-share").hidden = false;
    resetContrib(); resetSetup(); renderTiers();
    $("#test").scrollIntoView({ behavior: "smooth" });
  });
  $("#btn-share").addEventListener("click", share);
  $("#btn-refine").addEventListener("click", refine);
  $("#btn-card").addEventListener("click", shareCard);
  $("#quiz-result").addEventListener("click", e => { const b = e.target.closest("[data-why]"); if (b) toggleWhy(b); });
  document.addEventListener("keydown", e => {
    if (!Q.running || $("#quiz-card").hidden || e.target.closest("input, select, textarea")) return;
    if (e.key >= "1" && e.key <= "5") choose(Number(e.key));
    else if (e.key === "ArrowLeft") prev();
  });
}

// ---------- 1 : durée, 2 : thème de départ ----------
function renderTiers() {
  $("#tier-buttons").innerHTML = S.config.tiers.map(t => {
    const saved = store.get(progressKey(t.key));
    const resume = saved && saved.n === t.available && Object.keys(saved.answers || {}).length > 0 ? `<span class="resume">Reprendre : ${Object.keys(saved.answers).length} réponses</span>` : "";
    return `<button class="tier" type="button" data-tier="${t.key}" aria-pressed="${setupTier === t.key}">
      <span class="name">${esc(t.label)}</span>
      <span class="num">${t.available}<small>questions</small></span>
      <span class="desc">Environ ${t.minutes} minutes. Résultat : ${esc(t.precision.toLowerCase())}.</span>${resume}</button>`;
  }).join("");
}

function resetSetup() {
  setupTier = null;
  $("#theme-pick").hidden = true;
  $("#step-1").classList.add("on"); $("#step-2").classList.remove("on");
}

function chooseTier(key) {
  if (key === "express") { setupTier = key; const saved = store.get(progressKey(key)); startQuiz(key, null, !!(saved && Object.keys(saved.answers || {}).length)); return; }
  setupTier = key;
  renderTiers();
  const t = S.config.tiers.find(x => x.key === key);
  const saved = store.get(progressKey(key));
  const canResume = saved && saved.n === t.available && Object.keys(saved.answers || {}).length > 0;
  $("#theme-grid").innerHTML =
    (canResume ? `<button class="theme-card" style="--c:var(--red)" type="button" data-resume><span class="ic">⏯️</span><span class="nm">Reprendre mon test</span><span class="ds">Vous aviez répondu à ${Object.keys(saved.answers).length} questions.</span></button>` : "") +
    S.config.themes.filter(th => t.perTheme[th.code]).map(th => `
      <button class="theme-card" type="button" data-theme="${esc(th.code)}" style="--c:${esc(th.couleur)}">
        <span class="ic" aria-hidden="true">${th.icone}</span><span class="nm">${esc(th.nom)}</span>
        <span class="ds">${esc(th.description)}</span><span class="ct">${t.perTheme[th.code]} questions</span></button>`).join("");
  $("#theme-pick").hidden = false;
  $("#step-2").classList.add("on");
  nextFrame(() => $("#theme-pick").scrollIntoView({ behavior: "smooth", block: "nearest" }));
}

// ---------- 3 : questions ----------
async function startQuiz(tier, startCode, resume = false) {
  const data = await api(`/api/quiz/questions?tier=${tier}`);
  let themes = data.themes;
  Q.answers = {}; Q.seen = new Set(); Q.ti = 0; Q.qi = 0;
  const saved = store.get(progressKey(tier));
  if (resume && saved) {
    const order = saved.order || [];
    themes = [...themes].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
    Q.answers = saved.answers || {}; Q.seen = new Set(saved.seen || []);
    Q.ti = Math.min(saved.ti || 0, themes.length - 1); Q.qi = saved.qi || 0;
  } else {
    store.del(progressKey(tier));
    if (startCode) { const i = themes.findIndex(t => t.code === startCode); themes = [...themes.slice(i), ...themes.slice(0, i)]; }
  }
  Q.tier = tier; Q.themes = themes; Q.running = true;
  $("#quiz-setup").hidden = true; $("#quiz-result").hidden = true; $("#quiz-run").hidden = false;
  renderQuestion();
  $("#test").scrollIntoView({ behavior: "smooth", block: "start" });
}

function save() {
  store.set(progressKey(Q.tier), { n: total(), order: Q.themes.map(t => t.code), ti: Q.ti, qi: Q.qi, answers: Q.answers, seen: [...Q.seen] });
}

function renderQuestion() {
  const th = Q.themes[Q.ti], q = th.questions[Q.qi];
  $("#theme-done").hidden = true; $("#quiz-card").hidden = false;
  $("#quiz-card").style.setProperty("--c", th.couleur);
  $("#q-theme").innerHTML = `<span aria-hidden="true">${th.icone}</span> ${esc(th.nom)}`;
  const solo = th.questions.length === 1;
  $("#progress-text").textContent = solo ? `Thème ${Q.ti + 1} sur ${Q.themes.length}` : `Question ${Q.qi + 1} sur ${th.questions.length}`;
  const pct = solo ? Math.round((Q.ti / Q.themes.length) * 100) : Math.round((Q.qi / th.questions.length) * 100);
  $("#progress-bar").style.width = pct + "%";
  $("#progress").setAttribute("aria-valuenow", pct);
  $("#question-text").textContent = q.text;
  $("#answer-buttons").innerHTML = LABELS.map((l, i) =>
    `<button type="button" data-v="${i + 1}" class="${Q.answers[q.id] === i + 1 ? "selected" : ""}"><span class="k">${i + 1}</span><span>${l}</span></button>`).join("");
  $("#btn-prev").disabled = Q.ti === 0 && Q.qi === 0;
  renderNav();
}

function renderNav() {
  $("#theme-nav").innerHTML = Q.themes.map((th, i) => {
    const pct = Math.round((seenIn(th) / th.questions.length) * 100);
    return `<button type="button" class="tnav ${i === Q.ti ? "now" : ""} ${pct === 100 ? "full" : ""}" data-ti="${i}" style="--c:${esc(th.couleur)};--p:${pct}" title="${esc(th.nom)} : ${seenIn(th)}/${th.questions.length}">
      <span class="ring"><i>${pct === 100 ? "✓" : th.icone}</i></span>${esc(th.nom)}</button>`;
  }).join("");
}

function choose(v) {
  const q = Q.themes[Q.ti].questions[Q.qi];
  Q.answers[q.id] = v; Q.seen.add(q.id);
  $$("#answer-buttons button").forEach(b => b.classList.toggle("selected", Number(b.dataset.v) === v));
  setTimeout(next, 170);
}
function skip() {
  const q = Q.themes[Q.ti].questions[Q.qi];
  delete Q.answers[q.id]; Q.seen.add(q.id);
  next();
}
function next() {
  if (!Q.running) return;
  const th = Q.themes[Q.ti];
  if (Q.qi + 1 < th.questions.length) { Q.qi++; save(); renderQuestion(); }
  else if (th.questions.length === 1) {           // une seule question par thème (express) : on enchaîne sans écran intermédiaire
    save();
    const i = Q.themes.findIndex((t, k) => k > Q.ti && seenIn(t) < t.questions.length);
    if (i === -1) finish(); else { Q.ti = i; Q.qi = 0; renderQuestion(); }
  }
  else { save(); themeDone(); }
}
function prev() {
  stopTimer();
  if (Q.qi > 0) Q.qi--;
  else if (Q.ti > 0) { Q.ti--; Q.qi = Q.themes[Q.ti].questions.length - 1; }
  else return;
  $("#theme-done").hidden = true;
  renderQuestion();
}
function jump(i) {
  stopTimer();
  Q.ti = i;
  const th = Q.themes[i];
  const firstUnseen = th.questions.findIndex(q => !Q.seen.has(q.id));
  Q.qi = firstUnseen === -1 ? 0 : firstUnseen;
  save(); renderQuestion();
}
function quit() {
  stopTimer();
  Q.running = false; save();
  $("#quiz-run").hidden = true; $("#quiz-setup").hidden = false;
  resetSetup(); renderTiers();
}

// ---------- fin d'un thème : petit résultat + envie de continuer ----------
async function themeDone() {
  const th = Q.themes[Q.ti];
  let line = "";
  let scale = "";
  try {
    const res = await api("/api/quiz/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: Q.answers }) });
    const r = res.themes[th.code];
    if (r && r.score !== null) {
      const pole = Math.abs(r.score) < 15 ? "plutôt équilibré(e)" : (r.score > 0 ? r.polePos : r.poleNeg).toLowerCase();
      line = `<p class="lead" style="margin:6px 0 0">Sur ce thème, vous êtes <strong>${esc(pole)}</strong>.</p>`;
      scale = `<div class="mini-axis"><div class="axis-poles"><span>${esc(r.poleNeg)}</span><span>${esc(r.polePos)}</span></div>
        <div class="scale" style="--c:${esc(th.couleur)}"><span class="fill" data-left="${r.score >= 0 ? 50 : 50 + r.score / 2}" data-width="${Math.abs(r.score) / 2}" style="left:50%;width:0"></span><span class="marker" data-left="${50 + r.score / 2}" style="left:50%"></span></div></div>`;
    }
  } catch { /* le petit résultat est facultatif */ }

  const remaining = Q.themes.map((t, i) => ({ t, i })).filter(({ t }) => seenIn(t) < t.questions.length);
  const nextOne = remaining.find(x => x.i > Q.ti) || remaining[0];
  const left = remaining.length;
  const auto = Q.tier === "quick";            // test rapide : on enchaîne tout seul
  $("#theme-done").style.setProperty("--c", th.couleur);
  $("#theme-done").innerHTML = `<div class="theme-done">
      <div class="big" aria-hidden="true">${th.icone}</div>
      <h3>${esc(th.nom)} : terminé</h3>${line}${scale}
      <p class="muted">${left ? `Plus que ${left} thème${left > 1 ? "s" : ""} pour un profil complet.` : "Vous avez fait tous les thèmes : votre profil est complet."}</p>
      ${auto ? `<div class="autonext" aria-hidden="true"><i style="animation-duration:${AUTO_MS}ms"></i></div>
      <p class="muted small" style="margin:8px 0 0">${nextOne ? `Thème suivant : ${esc(nextOne.t.icone)} ${esc(nextOne.t.nom)}…` : "Votre profil arrive…"}</p>` : ""}
      <div class="cta-row">
        ${nextOne ? `<button class="btn blue" type="button" data-ti="${nextOne.i}">${auto ? "Passer au thème suivant" : "Continuer : " + esc(nextOne.t.nom)}</button>` : ""}
        <button class="btn ${left ? "" : "primary"}" type="button" data-finish>${left ? "Voir mon profil maintenant" : "Voir mon profil complet"}</button>
      </div>
      ${auto ? `<p style="margin-top:10px"><button class="link small" type="button" data-stay>Rester sur cet écran</button></p>` : remaining.length > 1 ? `<p class="muted small" style="margin-top:14px">Ou choisissez un autre thème dans la barre ci-dessus.</p>` : ""}
    </div>`;
  stopTimer();
  if (auto) Q.timer = setTimeout(() => { Q.timer = null; if (!Q.running) return; if (nextOne) jump(nextOne.i); else finish(); }, AUTO_MS);
  $("#quiz-card").hidden = true; $("#theme-done").hidden = false;
  renderNav();
  nextFrame(() => {
    $$("#theme-done .fill").forEach(f => { f.style.left = f.dataset.left + "%"; f.style.width = f.dataset.width + "%"; });
    $$("#theme-done .marker").forEach(m => { m.style.left = m.dataset.left + "%"; });
  });
}

// affiner : on passe au test de taille supérieure en gardant les réponses déjà données
async function refine() {
  const nt = NEXT_TIER[Q.tier];
  if (!nt) return;
  const data = await api(`/api/quiz/questions?tier=${nt}`);
  Q.themes = data.themes; Q.tier = nt;
  Q.seen = new Set(Object.keys(Q.answers).map(Number));
  const i = Q.themes.findIndex(t => seenIn(t) < t.questions.length);
  Q.ti = i === -1 ? 0 : i;
  Q.qi = Math.max(0, Q.themes[Q.ti].questions.findIndex(q => !Q.seen.has(q.id)));
  Q.running = true;
  $("#quiz-result").hidden = true; $("#quiz-run").hidden = false;
  renderQuestion();
  $("#test").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- résultats ----------
async function finish() {
  stopTimer();
  if (!Object.keys(Q.answers).length) return;
  Q.running = false;
  const res = await api("/api/quiz/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: Q.answers }) });
  store.del(progressKey(Q.tier));
  setContribData(Q.tier, { ...Q.answers });
  $("#quiz-run").hidden = true; $("#quiz-result").hidden = false;
  $("#btn-share").hidden = false;
  renderResult(res.themes, res.matches);
  renderHistory(res.themes, res.matches);
  const nt = NEXT_TIER[Q.tier], tcfg = nt && S.config.tiers.find(t => t.key === nt);
  const cur = S.config.tiers.find(t => t.key === Q.tier);
  const rb = $("#btn-refine");
  rb.hidden = !tcfg;
  if (tcfg) rb.textContent = `Affiner mon résultat (+${Math.max(1, tcfg.available - Object.keys(Q.answers).length)} questions)`;
  contribAtEnd();
  $("#quiz-result").scrollIntoView({ behavior: "smooth", block: "start" });
}

let allMatches = [];
function renderResult(themes, matches = []) {
  lastThemes = themes;
  allMatches = matches.filter(m => S.polls.candidates[m.slug]);
  const list = Object.values(themes);
  const top3 = allMatches.slice(0, 3).map(m => ({ ...m, c: S.polls.candidates[m.slug] }));
  const strong = list.filter(a => a.score !== null && (a.answered ?? 2) >= (Q.tier === "express" ? 1 : 2) && Math.abs(a.score) >= 20)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 2);
  const pole = a => (a.score > 0 ? a.polePos : a.poleNeg).toLowerCase();
  const themeSummary = strong.length
    ? `Vos positions les plus marquées : ${strong.map(a => `${a.nom} (${pole(a)})`).join(" et ")}.`
    : "Vos réponses sont plutôt nuancées : aucun thème ne ressort nettement.";

  const box = $("#match-box");
  if (top3.length) {
    const best = top3[0];
    $("#result-title").textContent = "Votre résultat : les candidats les plus proches de vous";
    $("#result-summary").textContent = themeSummary;
    box.hidden = false;
    $("#best").innerHTML = `<div class="best-card" style="--c:${esc(best.c.color)}">${avatar(best.c, "xl")}
      <div><span class="kicker">Le plus proche de vous</span><div class="bn">${esc(best.c.name)}</div><div class="muted">${esc(best.c.party)}</div>
      <div class="tchips">${themeChips(best, themes)}</div></div>
      <div class="bp">${best.pct}<small>&nbsp;%</small></div></div>
      <div class="why-wrap"><button class="link why-btn" type="button" data-why="${esc(best.slug)}" aria-expanded="false">Pourquoi ce score ? Voir les positions et les sources</button><div class="why-slot"></div></div>`;
    $("#match-note").textContent = `Accord moyen entre vos positions et celles attribuées aux candidats, sur ${best.shared} thèmes. Indicatif : cela dépend des positions renseignées pour chaque candidat.`;
    drawMatches(false);
    $("#profile-title").textContent = "Votre profil, comparé aux trois plus proches";
    $("#profile-note").textContent = "Votre position sur chaque thème (trait plein) et celle des candidats (pointillés).";
  } else {
    box.hidden = true;
    $("#result-title").textContent = "Votre profil";
    $("#result-summary").textContent = themeSummary;
    $("#profile-title").textContent = "Votre profil par thème";
    $("#profile-note").textContent = S.config.hasMatches ? "" : "La comparaison avec les candidats apparaîtra dès que leurs positions auront été renseignées sur ce site.";
  }

  $("#radar").innerHTML = radar(list, top3);
  $("#result-bars").innerHTML = list.map(a => {
    if (a.score === null) return `<div class="axis"><div class="axis-title">${a.icone} ${esc(a.nom)}</div><p class="muted small">Pas de réponse sur ce thème.</p></div>`;
    const left = a.score >= 0 ? 50 : 50 + a.score / 2;
    const cm = top3.map(m => m.scores && m.scores[a.code] !== undefined
      ? `<span class="cmark" style="left:${50 + m.scores[a.code] / 2}%;background:${esc(m.c.color)}" title="${esc(m.c.shortName)}"></span>` : "").join("");
    return `<div class="axis" style="--c:${esc(a.couleur)}">
      <div class="axis-title"><span aria-hidden="true">${a.icone}</span>${esc(a.nom)}${a.answered ? `<small>${a.answered} réponse${a.answered > 1 ? "s" : ""}</small>` : ""}</div>
      <div class="axis-poles"><span>${esc(a.poleNeg)}</span><span>${esc(a.polePos)}</span></div>
      <div class="scale" role="img" aria-label="${esc(a.nom)} : ${a.score > 0 ? "+" : ""}${a.score} sur 100">
        <span class="fill" data-left="${left}" data-width="${Math.abs(a.score) / 2}" style="left:50%;width:0"></span>${cm}
        <span class="marker" data-left="${50 + a.score / 2}" style="left:50%"></span></div></div>`;
  }).join("") + (top3.length ? `<div class="radar-legend"><span><i style="background:#0055a4"></i>Vous</span>${top3.map(m => `<span><i style="background:${esc(m.c.color)}"></i>${esc(m.c.shortName)}</span>`).join("")}</div>` : "");

  nextFrame(() => {
    $$("#result-bars .fill").forEach(f => { f.style.left = f.dataset.left + "%"; f.style.width = f.dataset.width + "%"; });
    $$("#result-bars .marker").forEach(m => { m.style.left = m.dataset.left + "%"; });
  });
}

// accord par thème avec un candidat : pastille colorée (vert = proche, rouge = éloigné)
function themeChips(m, themes) {
  return Object.entries(m.themes).map(([code, p]) => {
    const t = themes[code];
    if (!t) return "";
    const hue = Math.round((Math.max(0, p - 40) / 60) * 120);
    return `<span class="tchip" style="--h:${hue}" title="${esc(t.nom)} : ${p} % d'accord"><i aria-hidden="true">${t.icone}</i>${p}</span>`;
  }).join("");
}

const MATCH_TOP = 12;
function drawMatches(all) {
  const rows = all ? allMatches : allMatches.slice(0, MATCH_TOP);
  $("#matches").innerHTML = rows.map((m, i) => {
    const c = S.polls.candidates[m.slug];
    return `<li style="--c:${esc(c.color)}"><span class="rk">${i + 1}</span>${avatar(c)}
      <div><div class="name" style="font-weight:700">${esc(c.name)} <small class="muted">${esc(c.party)}</small></div>
      <div class="track" style="height:12px;background:var(--paper);border-radius:8px;overflow:hidden;margin-top:6px"><span class="fill" data-w="${m.pct}" style="display:block;height:100%;width:0;background:${esc(c.color)};border-radius:8px;transition:width .9s cubic-bezier(.2,.8,.2,1)"></span></div>
      <div class="tchips">${themeChips(m, lastThemes)}</div>
      <div class="why-wrap"><button class="link why-btn" type="button" data-why="${esc(m.slug)}" aria-expanded="false">Pourquoi ?</button><div class="why-slot"></div></div></div>
      <span class="val">${m.pct}&nbsp;%</span></li>`;
  }).join("");
  const seg = $("#match-size");
  seg.hidden = allMatches.length <= MATCH_TOP;
  $("#match-all").textContent = `Tous les candidats (${allMatches.length})`;
  $$("#match-size button").forEach(b => { b.setAttribute("aria-pressed", String((b.dataset.all === "1") === !!all)); b.onclick = () => drawMatches(b.dataset.all === "1"); });
  nextFrame(() => $$("#matches .fill").forEach(f => { f.style.width = f.dataset.w + "%"; }));
}

// radar : le centre = 1er pôle du thème, le bord = 2e pôle (voir le détail à côté)
function radar(list, overlays = []) {
  const items = list.filter(a => a.score !== null);
  if (items.length < 3) return "";
  const W = 560, H = 470, cx = W / 2, cy = H / 2 + 4, R = 150, n = items.length;
  const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const ring = f => items.map((_, i) => pt(i, R * f).join(",")).join(" ");
  const poly = items.map((a, i) => pt(i, (R * (a.score + 100)) / 200).join(",")).join(" ");
  const labels = items.map((a, i) => {
    const [x, y] = pt(i, R + 20), c = Math.cos(ang(i));
    const anchor = Math.abs(c) < .2 ? "middle" : c > 0 ? "start" : "end";
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" font-size="14" font-weight="700" fill="#0b1b3a">${a.icone} ${esc(a.nom)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Radar de vos positions par thème">
    ${[.25, .5, .75, 1].map(f => `<polygon points="${ring(f)}" fill="none" stroke="${f === .5 ? "#9aa5bd" : "#dfe5f0"}" stroke-width="${f === .5 ? 1.6 : 1}" ${f === .5 ? 'stroke-dasharray="4 4"' : ""}/>`).join("")}
    ${items.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0].toFixed(1)}" y2="${pt(i, R)[1].toFixed(1)}" stroke="#dfe5f0"/>`).join("")}
    ${overlays.map(o => { const pts = items.map((a, i) => o.scores && o.scores[a.code] !== undefined ? pt(i, (R * (o.scores[a.code] + 100)) / 200).join(",") : null).filter(Boolean); return pts.length >= 3 ? `<polygon points="${pts.join(" ")}" fill="${esc(o.c.color)}" fill-opacity=".07" stroke="${esc(o.c.color)}" stroke-width="2.4" stroke-dasharray="6 5" stroke-linejoin="round"/>` : ""; }).join("")}
    <polygon points="${poly}" fill="rgba(0,85,164,.18)" stroke="#0055a4" stroke-width="3" stroke-linejoin="round"/>
    ${items.map((a, i) => { const [x, y] = pt(i, (R * (a.score + 100)) / 200); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${esc(a.couleur)}" stroke="#fff" stroke-width="3"><title>${esc(a.nom)} : ${a.score > 0 ? "+" : ""}${a.score}</title></circle>`; }).join("")}
    ${labels}
    <text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#56627f">Trait pointillé : position neutre. Détail de chaque thème à côté.</text></svg>`;
}

// ---------- partage ----------
let lastThemes = null;

function shareCode() {
  const sc = {};
  Object.values(lastThemes).forEach(a => { if (a.score !== null) sc[a.code] = a.score; });
  return btoa(JSON.stringify({ s: sc })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function share() {
  if (!lastThemes) return;
  const url = `${location.origin}/p/${shareCode()}`;
  const best = allMatches[0] && S.polls.candidates[allMatches[0].slug];
  const data = { title: "Mon profil politique", text: best ? `Mon profil politique : le plus proche de moi, c'est ${best.name} (${allMatches[0].pct} %). Et toi ?` : "Voici mon profil politique sur verdict27. Et toi ?", url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast("Lien copié : collez-le où vous voulez");
  } catch { /* partage annulé */ }
}

// image prête à poster (stories, réseaux) : partage natif sur mobile, téléchargement sinon
async function shareCard() {
  if (!lastThemes) return;
  const btn = $("#btn-card"), label = btn.textContent;
  btn.disabled = true; btn.textContent = "Création de l'image…";
  try {
    const blob = await makeCardSafe(lastThemes, allMatches);
    const file = new File([blob], "mon-profil-politest.png", { type: "image/png" });
    const url = `${location.origin}/p/${shareCode()}`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Mon profil politique", text: `Mon profil politique. Et toi ? ${url}` }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "mon-profil-politest.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Image enregistrée : à vous de la poster");
  } catch { toast("Impossible de créer l'image sur ce navigateur."); }
  finally { btn.disabled = false; btn.textContent = label; }
}

// ---------- « Pourquoi ce score ? » : positions du candidat par thème, avec leurs sources ----------
let positions = null;
async function loadPositions() {
  if (positions) return positions;
  try { positions = (await api("/api/positions")).positions || {}; } catch { positions = {}; }
  return positions;
}
function whyHtml(slug) {
  const c = S.polls.candidates[slug], pos = (positions || {})[slug] || {};
  const rows = Object.values(lastThemes).filter(t => t.score !== null && pos[t.code]).map(t => {
    const p = pos[t.code], me = t.score, them = p.score;
    const pole = Math.abs(them) < 15 ? "position équilibrée" : (them > 0 ? t.polePos : t.poleNeg);
    const agree = Math.round((1 - Math.abs(me - them) / 200) * 100);
    const src = p.sources.length
      ? p.sources.map(x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener nofollow">${esc(x.titre)}</a>${x.date ? ` <span class="muted">(${esc(x.date)})</span>` : ""}` : esc(x.titre)).join("<br>")
      : '<span class="nosrc">source à compléter</span>';
    return `<tr><td><span aria-hidden="true">${t.icone}</span> ${esc(t.nom)}</td>
      <td><div class="mini2" style="--c:${esc(t.couleur)}" title="Vous : ${me > 0 ? "+" : ""}${me} · ${esc(c.shortName)} : ${them > 0 ? "+" : ""}${them}"><i class="me" style="left:${50 + me / 2}%"></i><i class="them" style="left:${50 + them / 2}%;background:${esc(c.color)}"></i></div>
        <small>${esc(pole)} · accord ${agree} %</small></td><td class="srcs">${src}</td></tr>`;
  });
  const n = Object.values(pos).filter(x => x.sources.length).length;
  if (!rows.length) return '<p class="muted small">Les positions de ce candidat ne sont pas détaillées.</p>';
  return `<div class="why"><table class="why-table"><thead><tr><th>Thème</th><th>Vous (●) et ${esc(c.shortName)}</th><th>Sources</th></tr></thead><tbody>${rows.join("")}</tbody></table>
    <p class="muted small">${n}/${Object.keys(pos).length} thèmes sourcés pour ce candidat. Positions établies par l'éditeur à partir de programmes et de déclarations publiques : <a href="/methode.html">voir la méthode</a>.</p></div>`;
}
async function toggleWhy(btn) {
  const box = btn.parentElement.querySelector(".why-slot");
  const open = btn.getAttribute("aria-expanded") === "true";
  btn.setAttribute("aria-expanded", String(!open));
  if (open) { box.innerHTML = ""; return; }
  await loadPositions();
  box.innerHTML = whyHtml(btn.dataset.why);
}

// ---------- historique du profil (sur cet appareil seulement) ----------
const HIST_KEY = "politest.v6.history";
function renderHistory(themes, matches) {
  const box = $("#history");
  const hist = store.get(HIST_KEY) || [];
  const best = matches && matches[0] ? { slug: matches[0].slug, pct: matches[0].pct } : null;
  const scores = {};
  Object.values(themes).forEach(a => { if (a.score !== null) scores[a.code] = a.score; });
  const prev = hist[hist.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  store.set(HIST_KEY, hist.concat([{ d: today, tier: Q.tier, scores, best }]).slice(-12));
  if (!prev) { box.hidden = true; return; }
  const ref = prev;
  const c = x => x && S.polls.candidates[x.slug];
  const changes = Object.values(themes).filter(a => a.score !== null && ref.scores && ref.scores[a.code] !== undefined)
    .map(a => ({ a, d: a.score - ref.scores[a.code] })).filter(x => Math.abs(x.d) >= 10).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3);
  const dt = new Date(ref.d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const line1 = c(ref.best) && c(best)
    ? (ref.best.slug === best.slug ? `Comme le ${esc(dt)}, ${esc(c(best).name)} reste le candidat le plus proche (${ref.best.pct} % puis ${best.pct} %).`
      : `Le ${esc(dt)}, le plus proche de vous était ${esc(c(ref.best).name)} (${ref.best.pct} %). Aujourd'hui : ${esc(c(best).name)} (${best.pct} %).`)
    : `Votre dernier test date du ${esc(dt)}.`;
  box.hidden = false;
  box.innerHTML = `<h3 class="sub">Depuis votre dernier test</h3><p>${line1}</p>` +
    (changes.length ? `<ul class="hist-ch">${changes.map(x => `<li><span aria-hidden="true">${x.a.icone}</span> ${esc(x.a.nom)} <b class="${x.d > 0 ? "up" : "down"}">${x.d > 0 ? "▶ " + esc(x.a.polePos) : "◀ " + esc(x.a.poleNeg)}</b> <small>(${x.d > 0 ? "+" : ""}${x.d} points)</small></li>`).join("")}</ul>` : '<p class="muted small">Vos positions sont stables sur tous les thèmes.</p>') +
    '<p class="muted small">Cet historique reste sur votre appareil : il n\'est envoyé à personne.</p>';
}

// profil reçu par lien partagé : lecture seule
async function showShared(payload) {
  const sc = payload && payload.s;
  if (!sc || typeof sc !== "object") return;
  const themes = {}, clean = {};
  for (const th of S.config.themes) {
    const v = Number(sc[th.code]);
    const score = Number.isFinite(v) ? Math.max(-100, Math.min(100, Math.round(v))) : null;
    themes[th.code] = { code: th.code, nom: th.nom, icone: th.icone, couleur: th.couleur, poleNeg: th.poleNeg, polePos: th.polePos, answered: null, score };
    if (score !== null) clean[th.code] = score;
  }
  let matches = [];
  try { matches = (await api("/api/quiz/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scores: clean }) })).matches || []; } catch { /* sans comparaison */ }
  Q.tier = null;
  $("#quiz-setup").hidden = true; $("#quiz-result").hidden = false;
  hideContrib(); $("#btn-refine").hidden = true; $("#history").hidden = true;
  renderResult(themes, matches);
  $("#btn-restart").textContent = "Faire le test à mon tour";
  $("#result-summary").textContent = "Profil partagé par un visiteur. " + $("#result-summary").textContent;
  setTimeout(() => $("#test").scrollIntoView({ behavior: "smooth" }), 400);
}
