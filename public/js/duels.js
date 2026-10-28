// Section « Second tour » : matrice de tous les duels, fiche du duel, votes des visiteurs.
import { $, $$, S, esc, avatar, fmtNum, fmtPct, fmtDate, dateLabel, pairKey, readableOn, store, toast, api, voterToken, isoMinus } from "./util.js";
import { activeCands, averages, qualified } from "./stats.js";

const sel = { a: null, b: null, reveal: new Set(), mode: "polls", size: "10", extra: new Set(), hide: new Set() };
const CONSENT_KEY = "politest.v3.voteConsent";

export async function initDuels() {
  const cands = activeCands();
  if (cands.length < 2) { $("#duel-panel").innerHTML = '<p class="muted">Pas assez de candidats actifs.</p>'; return; }
  const m0 = S.polls.matchups.find(m => m.candidates.every(s => cands.some(c => c.slug === s)));
  const qa = [...qualified()];
  [sel.a, sel.b] = qa.length >= 2 ? qa.slice(0, 2) : m0 ? m0.candidates : [cands[0].slug, cands[1].slug];
  renderMatrix();
  renderPanel();
  $("#matrix").addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    sel.a = b.dataset.a; sel.b = b.dataset.b;
    renderMatrix(); renderPanel();
    if (window.innerWidth < 980) $("#duel-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $$("#mx-size button").forEach(b => b.addEventListener("click", () => {
    sel.size = b.dataset.n;
    $$("#mx-size button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderMatrix();
  }));
  $("#mx-pick-btn").addEventListener("click", () => {
    const box = $("#mx-picker"), open = box.hidden;
    box.hidden = !open;
    $("#mx-pick-btn").setAttribute("aria-expanded", String(open));
    if (open) renderPicker();
  });
  $("#mx-picker").addEventListener("click", e => {
    const c = e.target.closest("[data-pick]"), r = e.target.closest("[data-reset]");
    if (c) {
      const slug = c.dataset.pick, idx = sortedCands().findIndex(x => x.slug === slug), inBase = idx < Number(sel.size);
      if (inBase) (sel.hide.has(slug) ? sel.hide.delete(slug) : sel.hide.add(slug));
      else (sel.extra.has(slug) ? sel.extra.delete(slug) : sel.extra.add(slug));
    } else if (r) { sel.extra.clear(); sel.hide.clear(); }
    else return;
    renderMatrix(); renderPicker();
  });
  $$("#mx-mode button").forEach(b => b.addEventListener("click", () => {
    sel.mode = b.dataset.m;
    $$("#mx-mode button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderMatrix();
  }));
  setInterval(() => { if (!document.hidden) refreshVotes(); }, 30000);      // votes des autres visiteurs
  $("#duel-panel").addEventListener("click", onPanelClick);
  $("#duel-panel").addEventListener("change", onPanelChange);
}

// ---------- données d'un duel ----------
function pairInfo(a, b) {
  const m = S.polls.matchups.find(x => x.key === pairKey(a, b));
  if (!m || !m.polls.length) return null;
  const last = m.polls[0];
  const recent = m.polls.filter(p => p.date && p.date >= isoMinus(last.date, 90));
  const avg = k => recent.reduce((s, p) => s + p.values[k], 0) / recent.length;
  return { m, last, va: last.values[a], vb: last.values[b], avgA: avg(a), avgB: avg(b), nRecent: recent.length };
}

function tallyOf(a, b) {
  const t = S.votes.tallies[pairKey(a, b)] || {};
  return { na: t[a] || 0, nb: t[b] || 0 };
}

// ---------- matrice ----------
// candidats classés par moyenne des sondages récents, puis les autres
function sortedCands() {
  const all = activeCands();
  const rank = averages(90, false).rows.map(r => r.slug);
  return [...all].sort((a, b) => {
    const ia = rank.indexOf(a.slug), ib = rank.indexOf(b.slug);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.order - b.order;
  });
}
// grille : les 10 (ou 15) premiers, moins ceux que l'utilisateur retire, plus ceux qu'il ajoute
function matrixCands() {
  const sorted = sortedCands(), N = Number(sel.size) || 10;
  const list = sorted.filter((c, i) => (i < N && !sel.hide.has(c.slug)) || sel.extra.has(c.slug));
  // le duel sélectionné reste toujours visible
  [sel.a, sel.b].forEach(k => { if (!list.some(c => c.slug === k)) { const c = sorted.find(x => x.slug === k); if (c) list.push(c); } });
  return list;
}
function renderPicker() {
  const box = $("#mx-picker");
  if (box.hidden) { updatePickBtn(); return; }
  const shown = new Set(matrixCands().map(c => c.slug));
  box.innerHTML = `<p class="mx-picker-h"><b>Cochez les candidats à afficher dans la grille</b> <span class="muted">(${shown.size} affichés)</span></p>
    <div class="mx-chips">${sortedCands().map(c => `<button type="button" class="chip ${shown.has(c.slug) ? "on" : ""}" data-pick="${esc(c.slug)}" style="--c:${esc(c.color)}" aria-pressed="${shown.has(c.slug)}">${avatar(c, "xs")}${esc(c.shortName)}</button>`).join("")}</div>
    <p class="mx-picker-f"><button type="button" class="link" data-reset>Revenir à la sélection de départ</button></p>`;
  updatePickBtn();
}
function updatePickBtn() {
  const n = sel.extra.size + sel.hide.size;
  $("#mx-pick-btn").innerHTML = `<span aria-hidden="true">＋</span> Ajouter ou retirer des candidats${n ? ` <b class="mx-n">${n}</b>` : ""}`;
}

function renderMatrix() {
  const cands = matrixCands();
  const n = cands.length;
  const grid = $("#matrix");
  const compact = n > 16;
  grid.classList.toggle("compact", compact);
  grid.style.minWidth = compact ? "" : (118 + n * 36) + "px";
  grid.style.gridTemplateColumns = compact ? `120px repeat(${n}, 30px)` : `118px repeat(${n}, minmax(36px, 1fr))`;
  const Q = qualified();
  let html = `<div></div>` + cands.map(c => `<div class="mx-h ${Q.has(c.slug) ? "qual" : ""}" title="${esc(c.name)}${Q.has(c.slug) ? " (qualifié pour le second tour d\u2019après la moyenne)" : ""}">${avatar(c, "sm")}</div>`).join("");
  for (const r of cands) {
    html += `<div class="mx-h row ${Q.has(r.slug) ? "qual" : ""}">${avatar(r, "xs")}<span>${esc(r.shortName)}${Q.has(r.slug) ? " ★" : ""}</span></div>`;
    for (const c of cands) {
      if (r.slug === c.slug) { html += `<span class="mx-c diag"></span>`; continue; }
      const info = pairInfo(r.slug, c.slug);
      const t = tallyOf(r.slug, c.slug);
      const dot = sel.mode === "polls" && t.na + t.nb > 0 ? '<i class="dotv" title="Des visiteurs ont voté"></i>' : "";
      const isSel = pairKey(r.slug, c.slug) === pairKey(sel.a, sel.b);
      const likely = Q.has(r.slug) && Q.has(c.slug);
      const attrs = `data-a="${esc(r.slug)}" data-b="${esc(c.slug)}"`;
      // le chiffre affiché est toujours celui du candidat de la ligne ; la couleur est celle du candidat en tête
      let mine = null, other = null, tip = "", label = "";
      if (sel.mode === "votes") {
        const tot = t.na + t.nb;
        if (tot) { mine = (t.na / tot) * 100; other = (t.nb / tot) * 100; label = `${Math.round(mine)}`; tip = `Visiteurs : ${r.name} ${Math.round(mine)} % – ${Math.round(other)} % ${c.name} (${tot} vote${tot > 1 ? "s" : ""})`; }
      } else if (info) {
        mine = info.va; other = info.vb; label = fmtNum(info.va);
        tip = `${r.name} ${fmtNum(info.va)} % – ${fmtNum(info.vb)} % ${c.name} (${info.last.pollster}, ${fmtDate(info.last.date)})`;
      }
      if (mine === null) {
        const why = sel.mode === "votes" ? "aucun vote : soyez le premier" : "pas de sondage, votez !";
        html += `<button class="mx-c none ${isSel ? "sel" : ""}${likely ? " likely" : ""}" ${attrs} title="${esc(r.name)} contre ${esc(c.name)} : ${why}" aria-label="${esc(r.name)} contre ${esc(c.name)}, ${why}">–${dot}</button>`;
        continue;
      }
      const lc = S.polls.candidates[mine >= other ? r.slug : c.slug];
      const strength = Math.round(Math.min(100, 58 + Math.abs(mine - other) * 1.6));
      html += `<button class="mx-c ${isSel ? "sel" : ""}${likely ? " likely" : ""}" ${attrs} style="background:color-mix(in srgb, ${esc(lc.color)} ${strength}%, #fff);color:${strength > 70 ? readableOn(lc.color) : "#0b1b3a"}" title="${esc(tip)}" aria-label="${esc(tip)}">${label}${dot}</button>`;
    }
  }
  grid.innerHTML = html;
  const what = sel.mode === "votes" ? "part des votes des visiteurs" : "score au dernier sondage";
  $("#mx-legend").innerHTML =
    `<span>Chiffre : ${what} du candidat de la <b>ligne</b>. Couleur : le candidat en tête (plus elle est vive, plus l'écart est grand).</span>` +
    `<span><i style="background:repeating-linear-gradient(45deg,#edf0f7 0 4px,#f7f8fc 4px 8px);border:1px solid #cfd6e6"></i>${sel.mode === "votes" ? "Aucun vote" : "Pas de sondage : à vous de voter"}</span>` +
    (sel.mode === "polls" ? `<span><i style="background:#0b1b3a;border-radius:50%;width:8px;height:8px"></i>Des visiteurs ont voté</span>` : "") +
    `<span><i style="background:#fff;border:2px solid #f5a524"></i>★ Duel probable : les deux premiers de la moyenne</span>`;
}

// recharge les votes de tous les visiteurs et met à jour la grille et la fiche
async function refreshVotes() {
  try {
    const v = await api("/api/votes?voter=" + encodeURIComponent(voterToken()));
    S.votes = v;
    renderMatrix();
    if (!document.activeElement || !document.activeElement.closest("#duel-panel")) renderPanel();
  } catch { /* hors ligne : on garde l'affichage actuel */ }
}

// ---------- fiche du duel ----------
function renderPanel() {
  const { a, b } = sel;
  const ca = S.polls.candidates[a], cb = S.polls.candidates[b];
  const info = pairInfo(a, b);
  const key = pairKey(a, b);
  const opts = s => activeCands().map(c => `<option value="${esc(c.slug)}" ${c.slug === s ? "selected" : ""}>${esc(c.name)}</option>`).join("");

  const side = (c, v, lead) => `<div class="duel-side ${lead ? "lead" : ""}" style="--c:${esc(c.color)};color:${readableOn(c.color)}">
      ${avatar(c, "xl")}<span class="nm">${esc(c.name)}</span>
      <span class="pc">${v === undefined ? "?" : `${fmtNum(v)}<small>&nbsp;%</small>`}</span>
      <span class="tag">${esc(c.party)}${lead ? " · en tête" : ""}</span></div>`;

  let poll = "";
  if (info) {
    const m = info.m;
    poll = `
      <div class="duel-bar" role="img" aria-label="${esc(ca.shortName)} ${info.va} %, ${esc(cb.shortName)} ${info.vb} %">
        <span style="width:${info.va}%;background:${esc(ca.color)}"></span><span style="width:${info.vb}%;background:${esc(cb.color)}"></span></div>
      <p class="muted small" style="margin:0">Dernier sondage : ${esc(info.last.pollster)}, ${esc(dateLabel(info.last))}${info.last.sample ? `, ${info.last.sample.toLocaleString("fr-FR")} personnes` : ""}.
        ${info.nRecent > 1 ? `Moyenne sur 90 jours : ${esc(ca.shortName)} ${fmtNum(Math.round(info.avgA * 10) / 10)} %, ${esc(cb.shortName)} ${fmtNum(Math.round(info.avgB * 10) / 10)} % (${info.nRecent} sondages).` : ""}
        ${m.absentFromFirstRound ? "Hypothèse : un des candidats n'est pas dans les sondages du premier tour." : ""}</p>
      <table class="mini"><thead><tr><th>Institut</th><th>Date</th><th class="n">${esc(ca.shortName)}</th><th class="n">${esc(cb.shortName)}</th></tr></thead>
      <tbody>${m.polls.slice(0, 6).map(p => `<tr><td>${esc(p.pollster)}</td><td>${esc(dateLabel(p))}</td>
        <td class="n"><b style="color:${p.values[a] > p.values[b] ? esc(ca.color) : "inherit"}">${fmtNum(p.values[a])}</b></td>
        <td class="n"><b style="color:${p.values[b] > p.values[a] ? esc(cb.color) : "inherit"}">${fmtNum(p.values[b])}</b></td></tr>`).join("")}</tbody></table>
      <div class="table-actions"><button class="btn small" type="button" data-act="evo">Voir l'évolution de ce duel</button></div>`;
  } else {
    poll = `<p class="muted" style="margin:14px 0 0">Aucun sondage publié pour ce duel. Votre vote contribue à une première estimation.</p>`;
  }

  $("#duel-panel").innerHTML = `
    <div class="duel-picker field">
      <select aria-label="Premier candidat" data-pick="a">${opts(a)}</select><span class="vs">contre</span>
      <select aria-label="Second candidat" data-pick="b">${opts(b)}</select>
    </div>
    <div class="duel-head">${side(ca, info?.va, info && info.va > info.vb)}${side(cb, info?.vb, info && info.vb > info.va)}</div>
    ${poll}
    ${voteBox(key, a, b, ca, cb)}`;
}

function voteBox(key, a, b, ca, cb) {
  const mine = S.votes.mine[key];
  const { na, nb } = tallyOf(a, b);
  const total = na + nb;
  const consent = store.get(CONSENT_KEY) === true;
  const show = mine || sel.reveal.has(key);

  let results = "";
  if (show) {
    const pa = total ? (na / total) * 100 : 0, pb = total ? (nb / total) * 100 : 0;
    results = `<div class="vote-result bars" style="margin-top:12px">
      <div class="hbar" style="--c:${esc(ca.color)}"><span>${esc(ca.shortName)}</span><div class="track"><span class="fill" style="width:${pa}%"></span></div><b>${total ? fmtPct(pa) : "–"}</b></div>
      <div class="hbar" style="--c:${esc(cb.color)}"><span>${esc(cb.shortName)}</span><div class="track"><span class="fill" style="width:${pb}%"></span></div><b>${total ? fmtPct(pb) : "–"}</b></div>
    </div>
    <p class="muted small" style="margin:8px 0 0">${total ? `${total} vote${total > 1 ? "s" : ""} de visiteurs${total < 20 ? " : encore peu pour en tirer une conclusion" : ""}.` : "Aucun vote pour l'instant : soyez le premier."} Ce n'est pas un sondage représentatif.</p>`;
  }
  return `<div class="vote-box">
    <h4>Et vous, qui l'emporterait&nbsp;?</h4>
    <p class="muted small" style="margin:0">${mine ? "Votre vote est enregistré. Vous pouvez le changer." : "Un clic, sans compte."}</p>
    <div class="vote-btns">
      <button class="vote-btn ${mine === a ? "mine" : ""}" type="button" data-vote="${esc(a)}" style="--c:${esc(ca.color)}">${avatar(ca, "xs")}${esc(ca.shortName)}</button>
      <button class="vote-btn ${mine === b ? "mine" : ""}" type="button" data-vote="${esc(b)}" style="--c:${esc(cb.color)}">${avatar(cb, "xs")}${esc(cb.shortName)}</button>
    </div>
    ${consent ? "" : `<label class="consent-line"><input type="checkbox" id="vote-consent"><span>J'accepte que mon vote soit enregistré de façon anonyme (c'est une opinion politique, donnée sensible). <a href="confidentialite.html" target="_blank" rel="noopener">Détails</a></span></label>`}
    <p class="error" id="vote-error" role="alert" hidden></p>
    ${results}
    <div class="table-actions">
      ${!show ? `<button class="link" type="button" data-act="reveal">Voir les votes des visiteurs</button>` : ""}
      ${mine ? `<button class="link" type="button" data-act="unvote">Retirer mon vote</button>` : ""}
    </div>
  </div>`;
}

// ---------- actions ----------
function onPanelChange(e) {
  const p = e.target.closest("[data-pick]");
  if (!p) return;
  sel[p.dataset.pick] = p.value;
  if (sel.a === sel.b) {
    const other = activeCands().find(c => c.slug !== sel.a);
    sel[p.dataset.pick === "a" ? "b" : "a"] = other.slug;
  }
  renderMatrix(); renderPanel();
}

async function onPanelClick(e) {
  const v = e.target.closest("[data-vote]"), act = e.target.closest("[data-act]");
  const key = pairKey(sel.a, sel.b);
  if (v) return castVote(v.dataset.vote);
  if (!act) return;
  if (act.dataset.act === "evo") window.dispatchEvent(new CustomEvent("politest:show-duel", { detail: { key } }));
  if (act.dataset.act === "reveal") { sel.reveal.add(key); renderPanel(); }
  if (act.dataset.act === "unvote") {
    try {
      const out = await api("/api/vote", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: sel.a, b: sel.b, voter: voterToken() }) });
      delete S.votes.mine[key]; S.votes.tallies[key] = out.tally;
      renderMatrix(); renderPanel(); toast("Vote retiré"); refreshVotes();
    } catch (ex) { toast(ex.message); }
  }
}

async function castVote(choice) {
  const key = pairKey(sel.a, sel.b);
  const err = $("#vote-error");
  const already = store.get(CONSENT_KEY) === true;
  const box = $("#vote-consent");
  if (!already && !(box && box.checked)) {
    err.textContent = "Cochez la case pour enregistrer votre vote.";
    err.hidden = false; return;
  }
  try {
    const out = await api("/api/vote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: sel.a, b: sel.b, choice, voter: voterToken(), consent: true })
    });
    store.set(CONSENT_KEY, true);
    S.votes.mine[key] = choice; S.votes.tallies[key] = out.tally;
    renderMatrix(); renderPanel();
    toast("Vote enregistré, merci !"); refreshVotes();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
}
