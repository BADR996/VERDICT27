// Change le nom du site partout (titres, en-tête, pages, e-mails, images d'aperçu).
//   node scripts/rename-site.js "NouveauNom"          applique le changement
//   node scripts/rename-site.js "NouveauNom" --dry    montre seulement ce qui changerait
//   node scripts/rename-site.js "NouveauNom" --from="AncienNom"   si le site a déjà un autre nom que « Politest »
// Ne touche pas aux clés techniques (stockage du navigateur, nom du paquet) : les votes et reprises de test déjà en cours restent valides.
// Ensuite : `npm run build-cards` pour refaire les images d'aperçu avec le nouveau nom.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const [name, ...flags] = process.argv.slice(2);
if (!name || name.startsWith("--")) { console.error('Usage : node scripts/rename-site.js "NouveauNom" [--dry]'); process.exit(1); }
if (/[<>&"\\]/.test(name)) { console.error("Évitez les caractères < > & \" \\ dans le nom."); process.exit(1); }
const dry = flags.includes("--dry");
const fromArg = flags.find(f => f.startsWith("--from="));
const OLD = fromArg ? fromArg.slice(7) : "Politest";   // --from="Ancien nom" si le site a déjà été renommé

const EXT = new Set([".html", ".js", ".md", ".css", ".txt", ".csv"]);
const SKIP = new Set(["node_modules", ".git", "photos", "fonts", "cards"]);
let changed = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name === "rename-site.js") continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { walk(f); continue; }
    if (!EXT.has(path.extname(e.name)) || e.name === "package-lock.json") continue;
    const s = fs.readFileSync(f, "utf8");
    if (!s.includes(OLD)) continue;
    const n = s.split(OLD).length - 1;
    console.log(`  ${path.relative(ROOT, f)} : ${n} occurrence(s)`);
    if (!dry) fs.writeFileSync(f, s.split(OLD).join(name));
    changed++;
  }
})(ROOT);
console.log(dry ? `\n${changed} fichier(s) seraient modifiés (rien n'a été écrit).` : `\n${changed} fichier(s) modifié(s). Relancez ensuite : npm run build-cards`);
