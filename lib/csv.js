// Lecture / écriture de fichiers CSV, pensés pour Excel en français :
//  - séparateur détecté automatiquement (point-virgule, virgule ou tabulation) ;
//  - BOM UTF-8 accepté ; guillemets et retours à la ligne dans les cellules gérés ;
//  - lignes vides ignorées ; lignes dont la 1re cellule commence par # = commentaires (exemples).

const fs = require("fs");

function detectDelimiter(firstLine) {
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseRows(text, delim) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Renvoie { rows: [{colonne: valeur}], columns: [...] }. Fichier absent => vide.
function readCsv(file) {
  if (!fs.existsSync(file)) return { rows: [], columns: [] };
  let text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = detectDelimiter(firstLine);
  const raw = parseRows(text, delim).filter(r => r.some(c => c.trim() !== ""));
  if (!raw.length) return { rows: [], columns: [] };
  const columns = raw[0].map(c => c.trim());
  const rows = [];
  raw.slice(1).forEach((r, i) => {
    if ((r[0] || "").trim().startsWith("#")) return;
    const obj = { _line: i + 2 };
    columns.forEach((c, j) => { obj[c] = (r[j] ?? "").trim(); });
    rows.push(obj);
  });
  return { rows, columns };
}

function writeCsv(file, columns, rows, delim = ";") {
  const esc = v => {
    const s = v == null ? "" : String(v);
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(esc).join(delim), ...rows.map(r => columns.map(c => esc(r[c])).join(delim))];
  fs.writeFileSync(file, "﻿" + lines.join("\r\n") + "\r\n");
}

module.exports = { readCsv, writeCsv };
