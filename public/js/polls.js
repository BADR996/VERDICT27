// Accueil (podium), moyenne, dernier sondage, tableau.
import { $, $$, S, esc, avatar, fmtNum, fmtPct, fmtDate, fmtDay, dateLabel, nextFrame, readableOn } from "./util.js";
import { averages, qualified, activeCands, latestDate, orientationAverages, hasOrientations } from "./stats.js";

const TABLE_TOP = 14;                // nombre de candidats affichés par défaut dans le tableau
const view = { days: 60, zero: true, allCols: false, shown: 12, expanded: new Set() };

function timeAgo(iso) {
  if (!iso) return "inconnue";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  return `le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
}

export function initPolls() {
  const { polls, stats } = S;
  if (!polls.firstRound.length) {
    $("#polls-meta").textContent = "Aucun sondage pour le moment : la première mise à jour n'a pas encore abouti.";
    $("#hero-sub").textContent = "Les sondages arrivent bientôt.";
    return;
  }
  $("#polls-meta").textContent = `${polls.firstRound.length} sondages du premier tour et ${polls.matchups.length} duels de second tour, mis à jour automatiquement (${timeAgo(polls.updatedAt)}).`;
  if (polls.source) $("#source-link").href = polls.source;

  const people = stats ? stats.contributions + stats.voters : 0;
  $("#hero-stats").innerHTML =
    `<span><b>${polls.firstRound.length}</b>sondages</span>` +
    `<span><b>${polls.matchups.length}</b>duels de 2nd tour</span>` +
    (people >= 5 ? `<span><b>${people}</b>participants</span>` : "") +
    `<span>mis à jour ${esc(timeAgo(polls.updatedAt))}</span>`;

  $$("#avg-range button").forEach(b => b.addEventListener("click", () => {
    view.days = Number(b.dataset.d);
    $$("#avg-range button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderAverages();
  }));
  $("#zero-mode").addEventListener("change", e => { view.zero = e.target.checked; renderAverages(); });
  $("#all-cols").addEventListener("change", e => { view.allCols = e.target.checked; renderTable(); });
  $("#more-polls").addEventListener("click", () => { view.shown += 15; renderTable(); });
  $("#polls-table").addEventListener("click", e => {
    const b = e.target.closest(".more");
    if (!b) return;
    const i = Number(b.dataset.poll);
    view.expanded.has(i) ? view.expanded.delete(i) : view.expanded.add(i);
    renderTable();
  });

  renderAverages();
  renderLast();
  renderTable();
}

// ----- moyenne + podium -----
function renderAverages() {
  const { polls } = S;
  const avg = averages(view.days, view.zero);
  const c = polls.candidates;

  const Q = new Set(avg.rows.slice(0, 2).map(r => r.slug));
  // podium
  const top = avg.rows.slice(0, 3);
  if (top.length) {
    const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);
    const max = top[0].avg;
    $("#podium").innerHTML = order.map(i => {
      const r = top[i], cd = c[r.slug];
      return `<div class="pcol" style="--c:${esc(cd.color)}">${avatar(cd, "lg")}
        <div class="bar" data-h="${Math.max(36, Math.round((r.avg / max) * 160))}">${Math.round(r.avg)}&nbsp;%</div>
        <div class="who">${esc(cd.shortName)}<small>${esc(cd.party)}</small>${Q.has(r.slug) ? '<em class="qbadge">2nd tour</em>' : ""}</div></div>`;
    }).join("");
    nextFrame(() => $$("#podium .bar").forEach(b => { b.style.height = b.dataset.h + "px"; }));
  }
  $("#hero-sub").textContent = `Moyenne des ${avg.count} derniers sondages (${view.days} jours)`;
  $("#podium-cap").textContent = view.zero
    ? "Un candidat non testé dans un sondage compte pour 0 %."
    : "Moyenne calculée uniquement sur les sondages où le candidat est testé.";

  // classement
  $("#avg-note").textContent = `Du ${fmtDate(avg.from)} au ${fmtDate(avg.to)}, ${avg.count} sondages. ` +
    (view.zero ? "Quand un candidat n'est pas testé, il compte pour 0 %." : "Seuls les sondages qui testent le candidat sont comptés.") +
    " Les deux premiers (trois en cas d'égalité à la deuxième place), surlignés, seraient qualifiés pour le second tour si le vote avait lieu aujourd'hui.";
  const rows = avg.rows.slice(0, 12);
  const max = rows.length ? rows[0].avg : 1;
  $("#rank").innerHTML = rows.map(r => {
    const cd = c[r.slug];
    return `<li class="${Q.has(r.slug) ? "qual" : ""}" style="--c:${esc(cd.color)}">${avatar(cd)}
      <div><div class="name">${esc(cd.name)}${Q.has(r.slug) ? '<em class="qbadge">2nd tour</em>' : ""}<small>${esc(cd.party)}</small></div>
        <div class="track"><span class="fill" data-w="${(r.avg / max) * 100}"></span></div></div>
      <div class="val">${fmtPct(r.avg, 1)}<small>testé ${r.tested}/${r.total}</small></div></li>`;
  }).join("");
  nextFrame(() => $$("#rank .fill").forEach(f => { f.style.width = f.dataset.w + "%"; }));

  // répartition par orientation
  const od = hasOrientations() ? orientationAverages(view.days) : [];
  $("#orient-box").hidden = !od.length;
  if (od.length) {
    $("#orient-bar").innerHTML = od.map(o => `<span style="flex:${o.avg};background:${o.color}" title="${esc(o.label)} : ${fmtPct(o.avg, 1)}">${o.avg >= 6 ? Math.round(o.avg) + "&nbsp;%" : ""}</span>`).join("");
    $("#orient-legend").innerHTML = od.map(o => `<li><i class="dot" style="background:${o.color}"></i>${esc(o.label)} <b>${fmtPct(o.avg, 1)}</b></li>`).join("");
  }
}

// ----- dernier sondage -----
function richest(p) {
  return [...p.scenarios].sort((a, b) => Object.keys(b.values).length - Object.keys(a.values).length)[0];
}
function renderLast() {
  const p = S.polls.firstRound[0];
  const sc = richest(p), c = S.polls.candidates;
  const age = p.date ? (Date.now() - new Date(p.date + "T12:00:00").getTime()) / 864e5 : 99;
  if (age <= 3) $("#last-title").insertAdjacentHTML("beforeend", ' <span class="newtag">Nouveau</span>');
  const top3 = Object.entries(sc.values).filter(([k]) => c[k]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const hl = $("#hero-last");
  hl.hidden = false;
  hl.innerHTML = `<span class="hl-dot" aria-hidden="true"></span><span><b>Dernier sondage</b> · ${esc(p.pollster)}, ${esc(dateLabel(p))} : ${top3.map(([k, v]) => `${esc(c[k].shortName)}&nbsp;${esc(fmtNum(v))}`).join(" · ")}</span>`;
  $("#last-meta").textContent = `${p.pollster}, ${dateLabel(p)}${p.sample ? `, ${p.sample.toLocaleString("fr-FR")} personnes` : ""}${p.scenarios.length > 1 ? ` (scénario le plus complet sur ${p.scenarios.length})` : ""}`;
  const Q = qualified();
  const entries = Object.entries(sc.values).filter(([k]) => c[k]).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  $("#last-bars").innerHTML = entries.map(([k, v]) => `
    <div class="hbar ${Q.has(k) ? "qual" : ""}" style="--c:${esc(c[k].color)}">${avatar(c[k], "sm")}<span>${esc(c[k].shortName)}${Q.has(k) ? '<b class="qstar" title="Qualifié pour le second tour (d\u2019après la moyenne)">★</b>' : ""}</span>
      <div class="track"><span class="fill" data-w="${(v / max) * 100}"></span></div><b>${fmtNum(v)}</b></div>`).join("");
  nextFrame(() => $$("#last-bars .fill").forEach(f => { f.style.width = f.dataset.w + "%"; }));
}

// ----- tableau -----
function tableCols() {
  const c = S.polls.candidates;
  if (!view.allCols) return averages(90, false).rows.slice(0, TABLE_TOP).map(r => c[r.slug]);
  // tous les candidats actifs (comme le graphique), les mieux placés d'abord, puis ceux qui n'ont jamais été testés
  const rank = averages(90, false).rows.map(r => r.slug);
  return activeCands().sort((a, b) => {
    const ia = rank.indexOf(a.slug), ib = rank.indexOf(b.slug);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.order - b.order;
  });
}

function renderTable() {
  const cols = tableCols();
  const Q = qualified();
  const head = `<thead><tr><th>Institut</th><th>Date</th><th title="Échantillon">Éch.</th>${cols.map(cd =>
    `<th class="c ${Q.has(cd.slug) ? "qual" : ""}" title="${esc(cd.name)}"><span class="cand" style="--c:${esc(cd.color)}">${avatar(cd, "xs")}<span class="nm">${esc(cd.shortName)}</span></span></th>`).join("")}</tr></thead>`;
  const cells = s => {
    const top = Math.max(...Object.values(s.values));
    return cols.map(cd => {
      const v = s.values[cd.slug];
      return v === undefined ? `<td class="no${Q.has(cd.slug) ? " qual" : ""}">–</td>` : `<td class="${v === top ? "top" : ""}${Q.has(cd.slug) ? " qual" : ""}" style="--c:${esc(cd.color)}">${fmtNum(v)}</td>`;
    }).join("");
  };
  const rows = S.polls.firstRound.slice(0, view.shown).map((p, i) => {
    const sorted = [...p.scenarios].sort((a, b) => Object.keys(b.values).length - Object.keys(a.values).length);
    const main = sorted[0], extra = sorted.slice(1);
    const open = view.expanded.has(i);
    const toggle = extra.length ? `<button class="more" type="button" data-poll="${i}" aria-expanded="${open}">${open ? "masquer" : `+${extra.length} scénario${extra.length > 1 ? "s" : ""}`}</button>` : "";
    const union = new Set(p.scenarios.flatMap(sc => Object.keys(sc.values)));
    const label = sc => {
      const absent = [...union].filter(k => sc.values[k] === undefined).map(k => (S.polls.candidates[k] || {}).shortName || k);
      if (!absent.length) return "Scénario complet";
      return "Sans " + (absent.length > 4 ? absent.slice(0, 3).join(", ") + ` et ${absent.length - 3} autres` : absent.length > 1 ? absent.slice(0, -1).join(", ") + " ni " + absent[absent.length - 1] : absent[0]);
    };
    const extraRows = open ? extra.map(sc => `<tr class="extra"><td class="inst scn" colspan="3"><span>↳ ${esc(label(sc))}</span></td>${cells(sc)}</tr>`).join("") : "";
    return `<tr><td class="inst" title="${esc(p.pollster)}${extra.length ? " — scénario affiché : " + esc(label(main)) : ""}"><span class="in">${esc(p.pollster)}${p.manual ? " ✎" : ""}</span>${toggle}</td><td class="dt" title="${esc(dateLabel(p))}">${p.date ? esc(fmtDay(p.date)) : esc(p.dateLabel)}</td><td class="ech">${p.sample ? p.sample.toLocaleString("fr-FR") : ""}</td>${cells(main)}</tr>${extraRows}`;
  }).join("");
  $("#polls-table").innerHTML = head + `<tbody>${rows}</tbody>`;
  $("#more-polls").hidden = view.shown >= S.polls.firstRound.length;
}

export { latestDate, readableOn };
