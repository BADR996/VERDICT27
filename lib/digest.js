// E-mail mensuel « ce qui a bougé » : construit à partir des sondages, envoyé aux abonnés confirmés.
const ds = require("./dataset");
const st = require("./stats");
const { esc, fmt, fmtDate } = require("./seo");

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const monthKey = d => d.toISOString().slice(0, 7);

// moyenne sur 30 jours se terminant `shift` jours avant le dernier sondage
function avgAt(polls, shift) {
  const to = st.latestDate(polls);
  const end = st.isoMinus(to, shift);
  const sub = { ...polls, firstRound: polls.firstRound.filter(p => p.date && p.date <= end) };
  return st.averages(sub, 30, true);
}

function buildDigest(base, now = new Date()) {
  const polls = ds.getPolls();
  const cur = avgAt(polls, 0), prev = avgAt(polls, 30);
  if (!cur.rows.length) return null;
  const prevMap = new Map(prev.rows.map(r => [r.slug, r.avg]));
  const rows = cur.rows.slice(0, 6).map((r, i) => {
    const c = polls.candidates[r.slug], p = prevMap.get(r.slug);
    return { rank: i + 1, c, avg: r.avg, delta: p === undefined ? null : r.avg - p };
  });
  const movers = cur.rows.map(r => ({ r, c: polls.candidates[r.slug], d: prevMap.has(r.slug) ? r.avg - prevMap.get(r.slug) : null })).filter(x => x.d !== null);
  const up = [...movers].sort((a, b) => b.d - a.d)[0], down = [...movers].sort((a, b) => a.d - b.d)[0];
  const q = cur.rows.slice(0, 2).map(r => polls.candidates[r.slug]);
  const duel = polls.matchups.find(m => m.candidates.every(s => q.some(c => c.slug === s)) && m.polls.length);
  const duelAvg = duel ? st.duelAverage(duel) : null;
  const newPolls = polls.firstRound.filter(p => p.date && p.date > st.isoMinus(st.latestDate(polls), 30)).length;
  const month = MONTHS[now.getMonth()];

  const arrow = d => d === null ? "" : Math.abs(d) < 0.15 ? "=" : d > 0 ? `▲ +${fmt(d)}` : `▼ ${fmt(d)}`;
  const subject = `Présidentielle 2027 : ce qui a bougé en ${month}`;

  const lines = [
    `${newPolls} nouveaux sondages en 30 jours. Moyenne des intentions de vote (30 jours) :`,
    ...rows.map(r => `  ${r.rank}. ${r.c.name} : ${fmt(r.avg)} % ${arrow(r.delta)}`),
    up && up.d > 0.15 ? `Plus forte hausse : ${up.c.name} (${arrow(up.d)} point${Math.abs(up.d) >= 2 ? "s" : ""}).` : "",
    down && down.d < -0.15 ? `Plus forte baisse : ${down.c.name} (${arrow(down.d)} point${Math.abs(down.d) >= 2 ? "s" : ""}).` : "",
    duel && duelAvg ? `Duel probable : ${q[0].shortName} ${fmt(duelAvg.values[q[0].slug], 0)} % – ${fmt(duelAvg.values[q[1].slug], 0)} % ${q[1].shortName}.` : "",
    `Détails : ${base}/`
  ].filter(Boolean);

  const html = (unsubUrl) => `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0b1b3a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="height:5px;background:linear-gradient(90deg,#0055a4,#fff,#d7000f)"></td></tr>
<tr><td style="padding:26px 28px 8px"><div style="font-size:13px;color:#56627f;text-transform:uppercase;letter-spacing:.06em">verdict27 · ${esc(month)} ${now.getFullYear()}</div>
<h1 style="margin:6px 0 4px;font-size:24px;line-height:1.2">Présidentielle 2027 : ce qui a bougé</h1>
<p style="margin:0;color:#56627f;font-size:15px">${newPolls} nouveaux sondages en 30 jours.</p></td></tr>
<tr><td style="padding:8px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:16px">
${rows.map(r => `<tr><td style="padding:9px 0;border-top:1px solid #e6ebf4;width:26px;color:#56627f">${r.rank}</td><td style="padding:9px 0;border-top:1px solid #e6ebf4"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(r.c.color)};margin-right:8px"></span><b>${esc(r.c.name)}</b> <span style="color:#56627f;font-size:13px">${esc(r.c.party)}</span></td><td align="right" style="padding:9px 0;border-top:1px solid #e6ebf4"><b>${fmt(r.avg)} %</b> <span style="font-size:12px;color:${r.delta === null || Math.abs(r.delta) < .15 ? "#56627f" : r.delta > 0 ? "#0a7d3b" : "#b4232c"}">${esc(arrow(r.delta))}</span></td></tr>`).join("")}
</table></td></tr>
${(up && up.d > 0.15) || (down && down.d < -0.15) || (duel && duelAvg) ? `<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.5">
${up && up.d > 0.15 ? `<p style="margin:6px 0">📈 <b>Plus forte hausse :</b> ${esc(up.c.name)} (${esc(arrow(up.d))} pt)</p>` : ""}
${down && down.d < -0.15 ? `<p style="margin:6px 0">📉 <b>Plus forte baisse :</b> ${esc(down.c.name)} (${esc(arrow(down.d))} pt)</p>` : ""}
${duel && duelAvg ? `<p style="margin:6px 0">⚔️ <b>Duel probable :</b> ${esc(q[0].shortName)} ${fmt(duelAvg.values[q[0].slug], 0)} % – ${fmt(duelAvg.values[q[1].slug], 0)} % ${esc(q[1].shortName)}</p>` : ""}</td></tr>` : ""}
<tr><td style="padding:20px 28px 26px"><a href="${esc(base)}/" style="display:inline-block;background:#d7000f;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px">Voir tous les sondages</a>
<a href="${esc(base)}/#test" style="display:inline-block;margin-left:8px;color:#0055a4;font-weight:700;text-decoration:none;padding:13px 6px">Refaire le test →</a></td></tr>
</table>
<p style="max-width:520px;color:#56627f;font-size:12px;line-height:1.5;margin:16px 0 0">Vous recevez ce message car vous avez demandé l'alerte mensuelle sur verdict27. Moyennes calculées sur les sondages publiés (source : Wikipédia). <a href="${esc(unsubUrl)}" style="color:#56627f">Se désinscrire</a>.</p>
</td></tr></table></body></html>`;

  return { subject, text: (unsubUrl) => lines.join("\n") + `\n\nSe désinscrire : ${unsubUrl}\n`, html, month: monthKey(now), meta: { newPolls, last: fmtDate(st.latestDate(polls)) } };
}

module.exports = { buildDigest, monthKey };
