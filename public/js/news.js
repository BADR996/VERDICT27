// Colonne « À la une » : titres des médias (flux RSS) sur la présidentielle.
import { $, S, esc, api } from "./util.js";

const st = { items: [], cand: "", counts: {} };

function ago(iso) {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  if (min < 2880) return "hier";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
const fresh = iso => iso && Date.now() - new Date(iso).getTime() < 3 * 3600e3;

// couleur d'accent stable par média
function accent(name) {
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 60% 42%)`;
}

function cands(i) { return i.candidates.filter(k => S.polls.candidates[k]); }
function tags(i) {
  const l = cands(i).slice(0, 3);
  return l.length ? `<span class="news-tags">${l.map(k => `<i style="--c:${esc(S.polls.candidates[k].color)}">${esc(S.polls.candidates[k].shortName)}</i>`).join("")}</span>` : "";
}

function chips() {
  st.counts = {};
  st.items.forEach(i => cands(i).forEach(k => { st.counts[k] = (st.counts[k] || 0) + 1; }));
  const top = Object.keys(st.counts).sort((a, b) => st.counts[b] - st.counts[a]).slice(0, 10);
  if (st.cand && !top.includes(st.cand) && st.counts[st.cand]) top.push(st.cand);
  $("#news-chips").innerHTML = (top.length ? `<button type="button" class="nchip${st.cand ? "" : " on"}" data-c="">Tous</button>` : "") +
    top.map(k => {
      const c = S.polls.candidates[k];
      return `<button type="button" class="nchip${st.cand === k ? " on" : ""}" data-c="${esc(k)}" style="--c:${esc(c.color)}" aria-pressed="${st.cand === k}">${esc(c.shortName)} <b>${st.counts[k]}</b></button>`;
    }).join("");
}

export async function initNews() {
  let data;
  try { data = await api("/api/news?limit=60"); } catch { data = { items: [], sources: [] }; }
  st.items = data.items || [];
  $("#news-chips").addEventListener("click", e => {
    const b = e.target.closest(".nchip"); if (!b) return;
    st.cand = b.dataset.c; chips(); render();
    $("#news-list").scrollTop = 0;
  });
  if (data.sources && data.sources.length) $("#news-foot").textContent = `Sources : ${data.sources.join(", ")}. Titres et liens classés par date ; les articles appartiennent à leurs éditeurs.`;
  chips(); render();
  setInterval(async () => {
    if (document.hidden) return;
    try { const d = await api("/api/news?limit=60"); st.items = d.items || []; chips(); render(); } catch { /* on garde l'affichage */ }
  }, 5 * 60 * 1000);
}

function featured(i) {
  const c = cands(i)[0], col = c ? S.polls.candidates[c].color : "#0055a4";
  return `<li class="news-top"><a class="news-item feat${i.image ? " has-img" : ""}" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer" style="--acc:${accent(i.source)};--tc:${esc(col)}">
    ${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    <span class="news-meta"><b>${esc(i.source)}</b>${fresh(i.date) ? `<em class="nnew">À chaud</em>` : ""}<time datetime="${esc(i.date || "")}">${esc(ago(i.date))}</time></span>
    <span class="news-title">${esc(i.title)}</span>
    ${i.summary ? `<span class="news-sum">${esc(i.summary)}</span>` : ""}
    ${tags(i)}
  </a></li>`;
}
function row(i) {
  return `<li><a class="news-item" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer" style="--acc:${accent(i.source)}">
    ${i.image ? `<img class="thumb" src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    <span class="news-meta"><b>${esc(i.source)}</b>${fresh(i.date) ? `<em class="nnew">Nouveau</em>` : ""}<time datetime="${esc(i.date || "")}">${esc(ago(i.date))}</time></span>
    <span class="news-title">${esc(i.title)}</span>
    ${i.summary ? `<span class="news-sum">${esc(i.summary)}</span>` : ""}
    ${tags(i)}
  </a></li>`;
}

function render() {
  const list = (st.cand ? st.items.filter(i => i.candidates.includes(st.cand)) : st.items).slice(0, 40);
  $("#news-list").innerHTML = list.length
    ? featured(list[0]) + list.slice(1).map(row).join("")
    : `<li class="news-empty">${st.items.length ? "Aucun article sur ce candidat pour l'instant." : "Le fil se remplit à la première collecte (toutes les 20 minutes). Aucun article pour l'instant."}</li>`;
}
