// Collecte manuelle du fil d'actualité et état de chaque source.   Usage : npm run update-news
const { updateNews } = require("../lib/news");
updateNews().then(r => {
  if (r.kept) console.log("Aucune source n'a répondu : l'ancien fil est conservé.");
  console.log("\nSOURCES");
  for (const s of r.status || r.sources) console.log(s.ok ? `  ✓ ${s.nom.padEnd(16)} ${s.lus} articles lus, ${s.retenus} retenus` : `  ✗ ${s.nom.padEnd(16)} ${s.erreur}  -> vérifiez l'adresse dans data/sources.csv`);
  if (r.items) console.log(`\n${r.items.length} articles dans le fil.`);
});
