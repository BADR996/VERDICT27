// Section « Évolution » : graphique interactif (candidats au choix, période au choix, duels).
import { $, $$, S, esc, avatar, toMs, toIso, isoMinus, store } from "./util.js";
import { drawChart } from "./chart.js";
import { activeCands, latestDate, averages, seriesFirstRound, seriesDuel, qualified, trend, ORIENTS, seriesOrientation, hasOrientations } from "./stats.js";

const st = { auto: true, mode: "first", selected: new Set(), orient: new Set(ORIENTS.map(o => o.key).filter(k => k !== "divers")), duel: null, range: 365, from: null, to: null };
let first = true;

export function initEvo() {
  const { polls } = S;
  if (!polls.firstRound.length) return;
  const top = averages(90, false).rows.slice(0, 5).map(r => r.slug);
  st.selected = new Set(top);

  // duels proposés : ceux qui ont au moins 2 sondages, les plus récents d'abord
  const duels = polls.matchups.filter(m => m.polls.length >= 2);
  st.duel = (duels[0] || polls.matchups[0] || {}).key || null;
  $("#evo-duel").innerHTML = (duels.length ? duels : polls.matchups).map(m =>
    `<option value="${esc(m.key)}">${esc(m.title)} (${m.polls.length} sondages)</option>`).join("");

  if (!hasOrientations()) $("#evo-mode [data-m=orient]").hidden = true;
  $$("#evo-mode button").forEach(b => b.addEventListener("click", () => {
    st.mode = b.dataset.m;
    $$("#evo-mode button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    first = true; renderAll();
  }));
  $("#evo-duel").addEventListener("change", e => { st.duel = e.target.value; first = true; renderAll(); });
  $$("#evo-range button").forEach(b => b.addEventListener("click", () => { const r = Number(b.dataset.r); st.auto = r === -1; if (st.auto) fitRange(); else setRange(r); first = true; renderAll(); }));
  $("#evo-from").addEventListener("change", e => { st.from = toMs(e.target.value); customRange(); });
  $("#evo-to").addEventListener("change", e => { st.to = toMs(e.target.value); customRange(); });
  $("#evo-chips").addEventListener("click", e => {
    const chip = e.target.closest("[data-slug]"), q = e.target.closest("[data-quick]"), oc = e.target.closest("[data-orient]");
    if (oc) {
      const k = oc.dataset.orient;
      st.orient.has(k) ? st.orient.delete(k) : st.orient.add(k);
      first = false; renderAll();
    } else if (chip) {
      const k = chip.dataset.slug;
      st.selected.has(k) ? st.selected.delete(k) : st.selected.add(k);
      first = false; renderAll();
    } else if (q) {
      const all = activeCands().map(c => c.slug);
      st.selected = new Set(q.dataset.quick === "all" ? all : q.dataset.quick === "none" ? [] : top);
      first = true; renderAll();
    }
  });
  window.addEventListener("resize", debounce(() => { first = false; renderChart(); }, 150));

  // sélection depuis la section « duels »
  window.addEventListener("politest:show-duel", e => {
    const m = S.polls.matchups.find(x => x.key === e.detail.key);
    if (!m) return;
    if (![...$("#evo-duel").options].some(o => o.value === m.key)) $("#evo-duel").insertAdjacentHTML("beforeend", `<option value="${esc(m.key)}">${esc(m.title)}</option>`);
    st.mode = "duel"; st.duel = m.key; $("#evo-duel").value = m.key;
    $$("#evo-mode button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.m === "duel")));
    first = true; renderAll();
    document.getElementById("evolution").scrollIntoView({ behavior: "smooth" });
  });

  renderAll();
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function setRange(days) {
  st.auto = false;
  const end = latestDate();
  st.to = toMs(end);
  st.from = days === 0 ? toMs(S.polls.firstRound[S.polls.firstRound.length - 1].date) : toMs(isoMinus(end, days));
  st.range = days;
  $$("#evo-range button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.r) === days)));
  syncDates();
}
// période « Ajustée » : de la première à la dernière mesure des courbes affichées
function fitRange() {
  const pts = currentSeriesPoints();
  const end = toMs(latestDate());
  if (!pts.length) { st.to = end; st.from = end - 365 * 864e5; }
  else {
    const t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(...pts.map(p => p.t));
    const pad = Math.max((t1 - t0) * 0.03, 5 * 864e5);
    st.from = t0 - pad; st.to = t1 + pad;
    if (st.to - st.from < 30 * 864e5) st.from = st.to - 30 * 864e5;
  }
  st.range = -1;
  $$("#evo-range button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.r) === -1)));
  syncDates();
}
function currentSeriesPoints() {
  if (st.mode === "first") return [...st.selected].flatMap(k => seriesFirstRound(k));
  if (st.mode === "orient") return ORIENTS.filter(o => st.orient.has(o.key)).flatMap(o => seriesOrientation(o.key));
  const m = S.polls.matchups.find(x => x.key === st.duel);
  return m ? m.candidates.flatMap(k => seriesDuel(m, k)) : [];
}
function customRange() {
  st.auto = false;
  st.range = -1;
  $$("#evo-range button").forEach(b => b.setAttribute("aria-pressed", "false"));
  if (st.from && st.to && st.from < st.to) { first = false; renderChart(); }
}
function syncDates() {
  $("#evo-from").value = toIso(st.from); $("#evo-to").value = toIso(st.to);
}

function renderAll() { if (st.auto) fitRange(); renderChips(); renderChart(); }

function renderChips() {
  const chips = $("#evo-chips"), wrap = $("#evo-duel-wrap");
  const isFirst = st.mode === "first";
  wrap.hidden = st.mode !== "duel";
  chips.hidden = st.mode === "duel";
  if (st.mode === "orient") {
    chips.innerHTML = ORIENTS.map(o => `<button type="button" class="chip ${st.orient.has(o.key) ? "on" : ""}" data-orient="${o.key}" style="--c:${o.color}" aria-pressed="${st.orient.has(o.key)}"><i class="dot" style="background:${o.color}"></i>${o.label}</button>`).join("");
    return;
  }
  if (!isFirst) return;
  const Q = qualified();
  chips.innerHTML = activeCands().map(c =>
    `<button type="button" class="chip ${st.selected.has(c.slug) ? "on" : ""}${Q.has(c.slug) ? " qual" : ""}" title="${Q.has(c.slug) ? "Qualifié pour le second tour (d\u2019après la moyenne)" : ""}" data-slug="${esc(c.slug)}" style="--c:${esc(c.color)}" aria-pressed="${st.selected.has(c.slug)}">${avatar(c, "xs")}${esc(c.shortName)}${Q.has(c.slug) ? " ★" : ""}</button>`).join("") +
    `<button type="button" class="link" data-quick="top">Les 5 premiers</button><button type="button" class="link" data-quick="all">Tous</button><button type="button" class="link" data-quick="none">Aucun</button>`;
}

function renderChart() {
  const svg = $("#evo-svg"), box = $("#evo-box"), tip = $("#evo-tip");
  let series = [], yMin = 0, yMax = null;
  if (st.mode === "first") {
    series = [...st.selected].map(slug => {
      const c = S.polls.candidates[slug];
      const pts = seriesFirstRound(slug);
      return { key: slug, label: c.shortName, color: c.color, points: pts, trend: trend(pts, st.from, st.to), bold: qualified().has(slug) };
    });
    $("#evo-note").textContent = "Un point par sondage (moyenne de ses scénarios quand le candidat est testé). La ligne lisse les variations entre instituts.";
  } else if (st.mode === "orient") {
    series = ORIENTS.filter(o => st.orient.has(o.key)).map(o => {
      const pts = seriesOrientation(o.key);
      return { key: o.key, label: o.label, color: o.color, points: pts, trend: trend(pts, st.from, st.to) };
    });
    $("#evo-note").textContent = "Somme des intentions de vote des candidats de chaque orientation (classement de franceinfo, modifiable dans candidates.csv). Le total varie selon les candidats testés dans chaque sondage.";
  } else {
    const m = S.polls.matchups.find(x => x.key === st.duel);
    if (m) {
      series = m.candidates.map(slug => {
        const c = S.polls.candidates[slug];
        const pts = seriesDuel(m, slug);
        return { key: slug, label: c.shortName, color: c.color, points: pts, trend: trend(pts, st.from, st.to) };
      });
      yMin = "auto"; yMax = 100;
    }
    $("#evo-note").textContent = "Duel de second tour : un point par sondage. Les deux courbes sont complémentaires (leur somme fait 100 %).";
  }
  if (st.mode === "duel") {
    // pour un duel, on resserre l'axe vertical autour des valeurs
    const vals = series.flatMap(s => s.points.map(p => p.v));
    if (vals.length) { const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 5) * 5), hi = Math.min(100, Math.ceil((Math.max(...vals) + 5) / 5) * 5); yMin = lo; yMax = hi; }
  }
  drawChart({ svg, box, tip, series, from: st.from, to: st.to, yMin, yMax, animate: first });
  first = false;
}

export { store };
