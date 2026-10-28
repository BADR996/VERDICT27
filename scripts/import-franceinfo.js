// Importe la liste des candidats (et leur famille politique) depuis la page « Portraits » de franceinfo enregistrée en HTML.
// Usage : node scripts/import-franceinfo.js page.html
// Ajoute les candidats manquants dans data/candidates.csv et renseigne la colonne « orientation ».
// Ne modifie jamais une orientation déjà saisie à la main.
const fs = require("fs");
const cheerio = require("cheerio");
const ds = require("../lib/dataset");
const { readCsv, writeCsv } = require("../lib/csv");

const file = process.argv[2];
if (!file) { console.error("Usage : node scripts/import-franceinfo.js page.html"); process.exit(1); }
const $ = cheerio.load(fs.readFileSync(file, "utf8"));
const slugify = s => ds.strip(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const FAMILIES = new Set(["extreme-gauche", "gauche", "centre", "droite", "extreme-droite", "divers"]);

const found = [];
$("article.if-cand__card").each((_, a) => {
  const $a = $(a), cls = $a.attr("class");
  const fam = (cls.match(/card--(extreme-gauche|gauche|centre|droite|extreme-droite|divers)\b/) || [])[1];
  const name = $a.find(".if-cand__card-name").clone().children().remove().end().text().trim();
  if (!name || !fam) return;
  found.push({ name, party: $a.find(".if-cand__card-party").text().trim(), fam, retired: /card--retire/.test(cls) });
});
if (found.length < 20) { console.error(`Seulement ${found.length} candidats trouvés : la page a-t-elle changé ?`); process.exit(1); }

const csv = readCsv(ds.F.candidates);
const cols = ["slug", "nom", "nom_court", "parti", "couleur", "actif", "photo", "ordre", "orientation"];
const rows = csv.rows.map(r => ({ ...r }));
const by = new Map(rows.map(r => [r.slug, r]));
let added = 0, set = 0;
let order = Math.max(0, ...rows.map(r => Number(r.ordre) || 0));
for (const f of found) {
  const slug = slugify(f.name);
  let r = by.get(slug);
  if (!r) {
    const parts = f.name.split(" ");
    r = { slug, nom: f.name, nom_court: parts[parts.length - 1], parti: f.party, couleur: "", actif: f.retired ? "non" : "", photo: "", ordre: ++order, orientation: "" };
    rows.push(r); by.set(slug, r); added++;
  }
  if (!r.orientation) { r.orientation = f.fam; set++; }
}
// Candidats connus par les sondages mais absents de franceinfo : classement à confirmer (voir DONNEES.md).
const MANUAL = { "eric-zemmour": "extreme-droite", "jordan-bardella": "extreme-droite", "francois-hollande": "gauche",
  "dominique-de-villepin": "centre", "philippe-poutou": "extreme-gauche", "laurent-wauquiez": "droite" };
for (const [slug, fam] of Object.entries(MANUAL)) { const r = by.get(slug); if (r && !r.orientation) { r.orientation = fam; set++; } }
rows.forEach(r => { if (r.orientation && !FAMILIES.has(r.orientation)) console.warn(`Orientation inconnue pour ${r.slug} : ${r.orientation}`); });
writeCsv(ds.F.candidates, cols, rows);
console.log(`${found.length} candidats lus sur franceinfo, ${added} ajoutés, ${set} orientations renseignées.`);
