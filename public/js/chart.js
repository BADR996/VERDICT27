// Graphique en courbes interactif, en SVG pur (aucune bibliothèque, aucune requête externe).
import { esc, nextFrame, fmtNum, toIso } from "./util.js";

const NS = "http://www.w3.org/2000/svg";
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function niceMax(v) {
  const steps = [5, 10, 20, 25, 30, 40, 50, 60, 70, 80, 100];
  return steps.find(s => s >= v) || 100;
}

// series : [{ key, label, color, points:[{t,v,label,date}], trend:[{t,v|null}] }]
export function drawChart({ svg, box, tip, series, from, to, yMin = 0, yMax = null, animate = true }) {
  const width = Math.max(280, box.clientWidth || 640);
  const height = Math.round(Math.min(440, Math.max(280, width * 0.48)));
  const m = { l: 40, r: 16, t: 14, b: 30 };
  const iw = width - m.l - m.r, ih = height - m.t - m.b;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";

  const all = series.flatMap(s => s.points).filter(p => p.t >= from && p.t <= to);
  if (!series.length || !all.length) {
    svg.innerHTML = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="axis-t">Aucun sondage sur cette période pour la sélection.</text>`;
    tip.hidden = true;
    return;
  }
  const vals = all.map(p => p.v).concat(series.flatMap(s => s.trend.filter(t => t.v !== null).map(t => t.v)));
  const vmax = Math.max(...vals), vmin = Math.min(...vals);
  let y0 = yMin, y1 = yMax, step = null;
  if (yMax === null) {
    // échelle automatique : s'adapte aux valeurs affichées (2-3 % comme 35 %), part de 0 sauf si les courbes sont groupées en hauteur
    const pad = Math.max((vmax - vmin) * 0.12, vmax * 0.06, 0.4);
    let lo = vmin - pad; const hi = vmax + pad;
    if (lo < hi * 0.4) lo = 0;
    const raw = (hi - lo) / 5;
    step = [0.5, 1, 2, 2.5, 5, 10, 20].find(x => x >= raw) || 20;
    y0 = Math.max(0, Math.floor(lo / step) * step); y1 = Math.ceil(hi / step) * step;
    if (y1 - y0 < step * 2) y1 = y0 + step * 2;
  } else if (yMin === "auto") y0 = Math.max(0, Math.floor((vmin - 4) / 5) * 5);
  const X = t => m.l + ((t - from) / (to - from || 1)) * iw;
  const Y = v => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const el = (name, attrs = {}, parent = svg) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  };

  // grille horizontale
  const ticks = step ? Math.round((y1 - y0) / step) : 5;
  const dec = step && step < 1 ? 1 : (step === 2.5 ? 1 : 0);
  for (let i = 0; i <= ticks; i++) {
    const v = y0 + ((y1 - y0) * i) / ticks;
    el("line", { x1: m.l, x2: width - m.r, y1: Y(v), y2: Y(v), stroke: "#dfe5f0", "stroke-width": 1 });
    const tx = el("text", { x: m.l - 8, y: Y(v) + 4, "text-anchor": "end", class: "axis-t" });
    tx.textContent = `${v.toFixed(dec).replace(".", ",")} %`;
  }
  // axe du temps
  const spanDays = (to - from) / 864e5;
  const nx = width < 520 ? 4 : 6;
  for (let i = 0; i <= nx; i++) {
    const t = from + ((to - from) * i) / nx, d = new Date(t);
    const label = spanDays > 240 ? `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    const anchor = i === 0 ? "start" : i === nx ? "end" : "middle";
    const tx = el("text", { x: X(t), y: height - 8, "text-anchor": anchor, class: "axis-t" });
    tx.textContent = label;
  }

  // courbes : tendance + points
  const gLines = el("g"), gDots = el("g");
  series.forEach(s => {
    // la tendance est tracée par segments continus (rupture quand il n'y a pas de sondage proche)
    let d = "", pen = false;
    s.trend.filter(p => p.t >= from - 1 && p.t <= to + 1).forEach(p => {
      if (p.v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`;
      pen = true;
    });
    if (d) {
      const path = el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.bold ? 4.8 : 3.2, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1 }, gLines);
      if (animate) {
        path.style.strokeDasharray = "1"; path.style.strokeDashoffset = "1";
        nextFrame(() => { path.style.transition = "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)"; path.style.strokeDashoffset = "0"; });
      }
    }
    s.points.filter(p => p.t >= from && p.t <= to).forEach(p => {
      el("circle", { cx: X(p.t), cy: Y(p.v), r: 3.4, fill: s.color, opacity: .38 }, gDots);
    });
  });

  // interaction : repère vertical + infobulle
  const cross = el("line", { y1: m.t, y2: m.t + ih, stroke: "#0b1b3a", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0 });
  const hl = el("g");
  const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", style: "cursor:crosshair" });
  const dates = [...new Set(all.map(p => p.t))].sort((a, b) => a - b);

  const valueAt = (s, t) => {
    const exact = s.points.find(p => p.t === t);
    if (exact) return { v: exact.v, label: exact.label, exact: true };
    const tr = s.trend.filter(p => p.v !== null);
    if (!tr.length) return null;
    const near = tr.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a);
    return Math.abs(near.t - t) > (to - from) / 40 + 864e5 ? null : { v: near.v, exact: false };
  };

  function show(clientX) {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * width;
    const t = from + ((px - m.l) / iw) * (to - from);
    const nearest = dates.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a);
    cross.setAttribute("x1", X(nearest)); cross.setAttribute("x2", X(nearest)); cross.setAttribute("opacity", .5);
    hl.innerHTML = "";
    const rows = [];
    series.forEach(s => {
      const val = valueAt(s, nearest);
      if (!val) return;
      el("circle", { cx: X(nearest), cy: Y(val.v), r: 6, fill: s.color, stroke: "#fff", "stroke-width": 2.5 }, hl);
      rows.push({ s, val });
    });
    rows.sort((a, b) => b.val.v - a.val.v);
    const d = new Date(nearest);
    tip.innerHTML = `<b>${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}</b>` + rows.map(({ s, val }) =>
      `<div class="row"><span><i class="dot" style="background:${esc(s.color)}"></i>${esc(s.label)}</span><span>${val.exact ? "" : "≈ "}${fmtNum(Math.round(val.v * 10) / 10)}&nbsp;%</span></div>` +
      (val.exact && val.label ? `<div class="row" style="opacity:.65;font-size:.78rem"><span>${esc(val.label)}</span><span></span></div>` : "")).join("");
    tip.hidden = false;
    const boxW = box.clientWidth, tw = tip.offsetWidth;
    const left = Math.min(Math.max((X(nearest) / width) * boxW, tw / 2 + 4), boxW - tw / 2 - 4);
    tip.style.left = left + "px";
    tip.style.top = "8px";
  }
  const hide = () => { cross.setAttribute("opacity", 0); hl.innerHTML = ""; tip.hidden = true; };
  hit.addEventListener("pointermove", e => show(e.clientX));
  hit.addEventListener("pointerdown", e => show(e.clientX));
  hit.addEventListener("pointerleave", hide);
  svg.setAttribute("aria-label", "Évolution : " + series.map(s => s.label).join(", "));
}

export { toIso };
