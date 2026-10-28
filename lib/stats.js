// Calculs côté serveur sur les sondages (même logique que public/js/stats.js) :
// utilisés par les pages candidat/duel, l'e-mail mensuel et le contrôle de santé.

const DAY = 864e5;
const ms = iso => Date.parse(iso + "T00:00:00Z");
const isoMinus = (iso, days) => new Date(ms(iso) - days * DAY).toISOString().slice(0, 10);

function latestDate(polls) {
  const p = polls.firstRound.find(x => x.date);
  return p ? p.date : null;
}

// Moyenne sur `days` jours se terminant au sondage le plus récent (un candidat non testé compte 0 % si zeroMode).
function averages(polls, days = 60, zeroMode = true) {
  const to = latestDate(polls);
  if (!to) return { rows: [], from: null, to: null, count: 0 };
  const from = isoMinus(to, days);
  const win = polls.firstRound.filter(p => p.date && p.date >= from);
  const rows = polls.activeSlugs.map(s => polls.candidates[s]).filter(c => c && !c.generic).map(c => {
    let sum = 0, tested = 0;
    for (const p of win) {
      const vals = p.scenarios.map(s => s.values[c.slug]);
      const present = vals.filter(v => v !== undefined);
      if (present.length) tested++;
      if (zeroMode) sum += vals.reduce((a, v) => a + (v ?? 0), 0) / vals.length;
      else if (present.length) sum += present.reduce((a, v) => a + v, 0) / present.length;
    }
    const n = zeroMode ? win.length : tested;
    return { slug: c.slug, avg: n ? sum / n : 0, tested, total: win.length };
  }).filter(r => r.tested > 0).sort((a, b) => b.avg - a.avg);
  return { rows, from, to, count: win.length };
}

// les deux premiers de la moyenne ; si le 2e et le 3e sont à égalité (0,1 point près), les deux sont retenus
const qualified = (polls, days = 60) => {
  const rows = averages(polls, days, true).rows;
  if (rows.length < 3) return rows.map(r => r.slug);
  const second = Math.round(rows[1].avg * 10);
  return rows.filter((r, i) => i < 2 || Math.round(r.avg * 10) === second).map(r => r.slug);
};

// valeur d'un candidat dans un sondage (moyenne de ses scénarios où il apparaît)
function valueIn(poll, slug) {
  const v = poll.scenarios.map(s => s.values[slug]).filter(x => x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// moyenne d'un duel sur ses sondages récents
function duelAverage(matchup, days = 90) {
  const dated = matchup.polls.filter(p => p.date);
  if (!dated.length) return null;
  const to = dated[0].date, from = isoMinus(to, days);
  const win = dated.filter(p => p.date >= from);
  const out = {};
  for (const slug of matchup.candidates) {
    const v = win.map(p => p.values[slug]).filter(x => x !== undefined);
    out[slug] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  return { values: out, count: win.length, to };
}

module.exports = { averages, qualified, valueIn, duelAverage, latestDate, isoMinus };
