// Fabrique les images d'aperçu des liens partagés (1200 × 630) : une par candidat + une image par défaut.
// Elles sont dans public/cards/ et déjà fournies : relancez ce script seulement si vous ajoutez des candidats,
// changez des couleurs ou voulez refaire le visuel.
//   npm run build-cards
// Nécessite le paquet « playwright » (et un navigateur Chromium) : npm install --no-save playwright && npx playwright install chromium

const fs = require("fs");
const path = require("path");
const ds = require("../lib/dataset");

let chromium;
try { ({ chromium } = require("playwright")); }
catch { try { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); } catch { /* ci-dessous */ } }
if (!chromium) { console.error("Le paquet « playwright » est absent. Installez-le : npm install --no-save playwright && npx playwright install chromium"); process.exit(1); }

const OUT = path.join(__dirname, "..", "public", "cards");
fs.mkdirSync(OUT, { recursive: true });
const FONT = path.join(__dirname, "..", "public", "fonts", "bricolage-grotesque-latin-wght-normal.woff2");
const FONT2 = path.join(__dirname, "..", "public", "fonts", "figtree-latin-wght-normal.woff2");
const b64 = f => fs.readFileSync(f).toString("base64");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ini = n => n.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");

const page = ({ title, sub, color, badge }) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:B;src:url(data:font/woff2;base64,${b64(FONT)});font-weight:200 800}
@font-face{font-family:F;src:url(data:font/woff2;base64,${b64(FONT2)});font-weight:300 900}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:F,sans-serif;color:#fff;overflow:hidden;position:relative;
 background:radial-gradient(800px 360px at 90% 100%,rgba(215,0,15,.5),transparent 70%),linear-gradient(180deg,#071231,#0a2766 55%,#1366c2)}
.top{position:absolute;left:64px;top:52px;right:64px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px;font:800 44px B;letter-spacing:-.03em}
.flag{display:flex;width:56px;height:38px;border-radius:6px;overflow:hidden;transform:rotate(-5deg)}.flag i{flex:1}.flag i:nth-child(1){background:#0055a4}.flag i:nth-child(2){background:#fff}.flag i:nth-child(3){background:#d7000f}
.tag{font:700 24px F;letter-spacing:.08em;opacity:.85}
.main{position:absolute;left:64px;right:64px;top:170px;display:flex;align-items:center;gap:44px}
.av{width:230px;height:230px;border-radius:50%;background:#fff;border:12px solid ${color || "#fff"};display:flex;align-items:center;justify-content:center;font:800 88px B;color:${color || "#0b1b3a"};flex:none}
h1{font:800 ${title.length > 28 ? 62 : 74}px/1.02 B;letter-spacing:-.035em}
h1 small{display:block;font:700 28px F;letter-spacing:.06em;text-transform:uppercase;opacity:.8;margin-bottom:14px}
p{font:600 34px/1.25 F;margin-top:18px;opacity:.92}
.cta{position:absolute;left:64px;bottom:48px;background:#d7000f;border-radius:999px;padding:20px 38px;font:800 34px B}
.url{position:absolute;right:64px;bottom:62px;font:700 26px F;opacity:.8}
</style></head><body>
<div class="top"><div class="brand"><span class="flag"><i></i><i></i><i></i></span>verdict27</div><div class="tag">PRÉSIDENTIELLE 2027</div></div>
<div class="main">${badge ? `<div class="av">${esc(badge)}</div>` : ""}<div><h1>${title}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div></div>
<div class="cta">Fais le test en 2 minutes →</div>
</body></html>`;

(async () => {
  const b = await chromium.launch({ executablePath: ["/opt/pw-browsers/chromium"].find(fs.existsSync), args: ["--no-sandbox"] }).catch(() => chromium.launch());
  const pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
  const shot = async (name, opts) => { await pg.setContent(page(opts)); await pg.evaluate(() => document.fonts.ready); await pg.screenshot({ path: path.join(OUT, name + ".png") }); };
  await shot("default", { title: "Sondages 2027 :<br>qui est devant ?<br>Et toi, tu penses quoi ?", sub: "Moyennes, duels de second tour et test politique." });
  const polls = ds.getPolls();
  let n = 0;
  for (const c of Object.values(polls.candidates)) {
    if (c.generic) continue;
    await shot(c.slug, { title: `<small>Mon profil politique</small>Proche de ${esc(c.name)}${""}`, sub: `${c.party || ""} · Et toi, quel candidat te ressemble ?`, color: c.color, badge: ini(c.name) });
    n++;
  }
  await b.close();
  console.log(`${n + 1} images écrites dans public/cards/`);
})().catch(e => { console.error(e.message); process.exit(1); });
