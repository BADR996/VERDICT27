// Image de résultat à poster (1080 × 1350) : dessinée dans le navigateur, rien n'est envoyé au serveur.
import { S, initials, readableOn } from "./util.js";

const W = 1080, H = 1350;
const DISPLAY = '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif';
const BODY = '"Figtree", "Segoe UI", system-ui, sans-serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// photo du candidat si le navigateur la laisse dessiner (CORS), sinon null → initiales
function loadPhoto(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous"; img.referrerPolicy = "no-referrer";
    const t = setTimeout(() => resolve(null), 3500);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = url;
  });
}

function avatar(ctx, c, photo, cx, cy, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = c.color + "22"; ctx.fill();
  if (photo) {
    ctx.save(); ctx.clip();
    const s = Math.max((2 * r) / photo.width, (2 * r) / photo.height);
    const dw = photo.width * s, dh = photo.height * s;
    ctx.drawImage(photo, cx - dw / 2, cy - r - (dh - 2 * r) * 0.2, dw, dh);       // visage plutôt en haut de la photo
    ctx.restore();
  } else {
    ctx.fillStyle = c.color; ctx.font = `800 ${Math.round(r * .8)}px ${DISPLAY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initials(c.name), cx, cy + 4);
  }
  ctx.lineWidth = 8; ctx.strokeStyle = c.color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function radar(ctx, items, overlays, cx, cy, R) {
  const n = items.length;
  const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const poly = (f, style, fill) => {
    ctx.beginPath();
    items.forEach((_, i) => { const [x, y] = pt(i, R * f(i)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (style) { Object.assign(ctx, style.props); ctx.setLineDash(style.dash || []); ctx.stroke(); ctx.setLineDash([]); }
  };
  [.25, .5, .75, 1].forEach(f => poly(() => f, { props: { lineWidth: f === .5 ? 2.5 : 1.5, strokeStyle: f === .5 ? "#9aa5bd" : "#dfe5f0" }, dash: f === .5 ? [8, 8] : [] }));
  ctx.strokeStyle = "#dfe5f0"; ctx.lineWidth = 1.5;
  items.forEach((_, i) => { const [x, y] = pt(i, R); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); });
  overlays.forEach(o => {
    const ok = items.every(a => o.scores && o.scores[a.code] !== undefined);
    if (!ok) return;
    poly(i => (o.scores[items[i].code] + 100) / 200, { props: { lineWidth: 5, strokeStyle: o.c.color, lineJoin: "round" }, dash: [12, 9] }, o.c.color + "14");
  });
  poly(i => (items[i].score + 100) / 200, { props: { lineWidth: 7, strokeStyle: "#0055a4", lineJoin: "round" } }, "rgba(0,85,164,.2)");
  items.forEach((a, i) => {
    const [x, y] = pt(i, (R * (a.score + 100)) / 200);
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fillStyle = a.couleur; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.stroke();
  });
  ctx.font = `700 25px ${BODY}`; ctx.fillStyle = "#0b1b3a"; ctx.textBaseline = "middle";
  items.forEach((a, i) => {
    const [x, y] = pt(i, R + 30), c = Math.cos(ang(i));
    ctx.textAlign = Math.abs(c) < .2 ? "center" : c > 0 ? "left" : "right";
    ctx.fillText(`${a.icone} ${a.nom}`, x + (Math.abs(c) < .2 ? 0 : c > 0 ? 8 : -8), y + (Math.sin(ang(i)) > .5 ? 14 : 0));
  });
}

// themes : { code: {nom, icone, couleur, score} } ; matches : [{slug, pct, scores}]
export async function makeCard(themes, matches, { photos = true } = {}) {
  try { await Promise.all([document.fonts.load(`800 60px ${DISPLAY}`), document.fonts.load(`700 28px ${BODY}`)]); } catch { /* polices système */ }
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const items = Object.values(themes).filter(a => a.score !== null);
  const top = matches.filter(m => S.polls.candidates[m.slug]).slice(0, 3).map(m => ({ ...m, c: S.polls.candidates[m.slug] }));

  // fond
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#071231"); g.addColorStop(.55, "#0a2766"); g.addColorStop(1, "#1366c2");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 100, H, 40, W - 100, H, 700);
  glow.addColorStop(0, "rgba(215,0,15,.45)"); glow.addColorStop(1, "rgba(215,0,15,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // en-tête
  ctx.save(); ctx.translate(76, 84); ctx.rotate(-.07);
  ctx.fillStyle = "#0055a4"; ctx.fillRect(0, 0, 18, 36); ctx.fillStyle = "#fff"; ctx.fillRect(18, 0, 18, 36); ctx.fillStyle = "#d7000f"; ctx.fillRect(36, 0, 18, 36);
  ctx.restore();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.font = `800 46px ${DISPLAY}`; ctx.fillText("verdict27", 148, 116);
  ctx.textAlign = "right"; ctx.font = `700 26px ${BODY}`; ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillText("PRÉSIDENTIELLE 2027", W - 70, 112);

  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = `800 80px ${DISPLAY}`;
  ctx.fillText("Mon profil politique", 70, 250);

  const x0 = 50, w0 = W - 100;
  let y = 292;
  if (top.length) {
    const best = top[0], photo = photos ? await loadPhoto(best.c.photo) : null;
    ctx.fillStyle = "#fff"; rr(ctx, x0, y, w0, 236, 40); ctx.fill();
    avatar(ctx, best.c, photo, x0 + 140, y + 118, 80);
    const pctTxt = best.pct + " %";
    ctx.font = `800 100px ${DISPLAY}`; const pw = ctx.measureText(pctTxt).width;
    const tx = x0 + 256, avail = x0 + w0 - 40 - pw - 24 - tx;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#c2410c"; ctx.font = `800 22px ${BODY}`; ctx.fillText("LE PLUS PROCHE DE MOI", tx, y + 78);
    let fs = 50; ctx.font = `800 ${fs}px ${DISPLAY}`;
    while (ctx.measureText(best.c.name).width > avail && fs > 28) { fs -= 2; ctx.font = `800 ${fs}px ${DISPLAY}`; }
    ctx.fillStyle = "#0b1b3a"; ctx.fillText(best.c.name, tx, y + 134);
    ctx.fillStyle = "#56627f"; ctx.font = `600 28px ${BODY}`; ctx.fillText(best.c.party || "", tx, y + 178);
    ctx.textAlign = "right"; ctx.fillStyle = best.c.color; ctx.font = `800 100px ${DISPLAY}`; ctx.fillText(pctTxt, x0 + w0 - 40, y + 150);
    y += 262;
  }

  // radar
  const ph = 520;
  ctx.fillStyle = "#fff"; rr(ctx, x0, y, w0, ph, 40); ctx.fill();
  radar(ctx, items, top.slice(0, 1), W / 2, y + 262, 158);
  ctx.textAlign = "left"; ctx.font = `700 23px ${BODY}`;
  let lx = x0 + 40; const ly = y + ph - 22;
  [["Moi", "#0055a4"], ...top.slice(0, 1).map(m => [m.c.shortName, m.c.color])].forEach(([t, col]) => {
    ctx.fillStyle = col; ctx.fillRect(lx, ly - 16, 34, 8); ctx.fillStyle = "#56627f"; ctx.fillText(t, lx + 46, ly - 6); lx += 46 + ctx.measureText(t).width + 36;
  });
  y += ph + 22;

  // classement des suivants
  if (top.length > 1) {
    top.slice(1).forEach((m, i) => {
      const yy = y + i * 54;
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.font = `700 28px ${BODY}`; ctx.fillText(m.c.shortName, 70, yy + 30);
      ctx.fillStyle = "rgba(255,255,255,.22)"; rr(ctx, 330, yy + 8, 560, 26, 13); ctx.fill();
      ctx.fillStyle = "#fff"; rr(ctx, 330, yy + 8, Math.max(26, 560 * m.pct / 100), 26, 13); ctx.fill();
      ctx.textAlign = "right"; ctx.fillStyle = "#fff"; ctx.fillText(m.pct + " %", W - 70, yy + 31);
    });
  }

  // appel à l'action
  ctx.fillStyle = "#d7000f"; rr(ctx, x0, H - 106, w0, 70, 35); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `800 30px ${DISPLAY}`;
  ctx.fillText(`Et toi ? Le test dure 2 minutes · ${location.host}`, W / 2, H - 62);

  return new Promise((resolve, reject) => cv.toBlob(b => b ? resolve(b) : reject(new Error("image")), "image/png"));
}

// Si le navigateur refuse d'exporter l'image avec la photo (CORS), on recommence avec les initiales.
export async function makeCardSafe(themes, matches) {
  try { return await makeCard(themes, matches); }
  catch { return makeCard(themes, matches, { photos: false }); }
}
