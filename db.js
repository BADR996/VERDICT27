// Base de données SQLite : un seul fichier (data/politest.db).
// On n'y stocke JAMAIS : nom, adresse IP, user-agent. L'e-mail n'existe QUE dans la table « abonnes » (alerte mensuelle,
// double confirmation), sans aucun lien avec les réponses au test ni avec les votes.
//  - contributions : réponses au test + profil, avec consentement, identifiant aléatoire ;
//  - votes         : un vote par duel et par navigateur (jeton aléatoire stocké SOUS FORME HACHÉE) ;
//  - abonnes       : e-mail + jeton aléatoire (confirmation / désinscription), supprimés à la désinscription.
// Utilise le SQLite intégré à Node (node:sqlite, Node 22.13 ou plus) : aucune installation native.

const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const FILE = process.env.DB_FILE || path.join(__dirname, "data", "politest.db");
const db = new DatabaseSync(FILE);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,              -- date au jour près
    tier        TEXT NOT NULL,              -- quick | medium | full
    answers     TEXT NOT NULL,              -- JSON { idQuestion: 1..5 }
    scores      TEXT NOT NULL,              -- JSON { theme: score }
    age TEXT, sex TEXT, income TEXT, region TEXT, birth TEXT, parents TEXT   -- anciennes colonnes (V2)
  );
  CREATE TABLE IF NOT EXISTS votes (
    pair   TEXT NOT NULL,                   -- « slugA--slugB » (ordre alphabétique)
    voter  TEXT NOT NULL,                   -- empreinte (hash) du jeton du navigateur
    choice TEXT NOT NULL,                   -- slug du candidat choisi
    day    TEXT NOT NULL,
    PRIMARY KEY (pair, voter)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS abonnes (
    email        TEXT PRIMARY KEY,
    token        TEXT NOT NULL UNIQUE,      -- sert à confirmer puis à se désinscrire
    confirmed    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    confirmed_at TEXT,
    last_sent    TEXT                       -- mois du dernier envoi (AAAA-MM)
  );
`);
// Migration depuis la V2 : colonnes ajoutées si besoin
const cols = db.prepare("PRAGMA table_info(submissions)").all().map(c => c.name);
if (!cols.includes("profile")) db.exec("ALTER TABLE submissions ADD COLUMN profile TEXT");
if (!cols.includes("sensitive")) db.exec("ALTER TABLE submissions ADD COLUMN sensitive INTEGER DEFAULT 0");

// Sel pour hacher les jetons de vote (généré une fois, jamais publié)
const SALT_FILE = path.join(path.dirname(FILE), ".salt");
let SALT = process.env.VOTER_SALT;
if (!SALT) {
  try { SALT = fs.readFileSync(SALT_FILE, "utf8").trim(); }
  catch { SALT = crypto.randomBytes(24).toString("hex"); try { fs.writeFileSync(SALT_FILE, SALT); } catch { /* lecture seule */ } }
}
const hashVoter = token => crypto.createHash("sha256").update(SALT + ":" + token).digest("hex");
const today = () => new Date().toISOString().slice(0, 10);

// ---------- contributions ----------
const insert = db.prepare(`
  INSERT INTO submissions (id, created_at, tier, answers, scores, profile, sensitive)
  VALUES (@id, @created_at, @tier, @answers, @scores, @profile, @sensitive)
`);
function save({ tier, answers, scores, profile, sensitive }) {
  const id = crypto.randomBytes(12).toString("hex");
  insert.run({
    id, created_at: today(), tier,
    answers: JSON.stringify(answers),
    scores: JSON.stringify(Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.score]))),
    profile: JSON.stringify(profile || {}),
    sensitive: sensitive ? 1 : 0
  });
  return id;
}
const remove = id => Number(db.prepare("DELETE FROM submissions WHERE id = ?").run(id).changes) > 0;
const count = () => Number(db.prepare("SELECT COUNT(*) AS n FROM submissions").get().n);
const all = () => db.prepare("SELECT * FROM submissions ORDER BY created_at, id").all();

// ---------- votes ----------
const upsert = db.prepare(`
  INSERT INTO votes (pair, voter, choice, day) VALUES (?, ?, ?, ?)
  ON CONFLICT(pair, voter) DO UPDATE SET choice = excluded.choice, day = excluded.day
`);
const vote = (pair, token, choice) => upsert.run(pair, hashVoter(token), choice, today());
const unvote = (pair, token) => Number(db.prepare("DELETE FROM votes WHERE pair = ? AND voter = ?").run(pair, hashVoter(token)).changes) > 0;
function tallies() {
  const out = {};
  for (const r of db.prepare("SELECT pair, choice, COUNT(*) AS n FROM votes GROUP BY pair, choice").all()) {
    (out[r.pair] ||= {})[r.choice] = Number(r.n);
  }
  return out;
}
const voteCount = () => Number(db.prepare("SELECT COUNT(*) AS n FROM votes").get().n);
const voterCount = () => Number(db.prepare("SELECT COUNT(DISTINCT voter) AS n FROM votes").get().n);
const myVotes = token => {
  const out = {};
  for (const r of db.prepare("SELECT pair, choice FROM votes WHERE voter = ?").all(hashVoter(token))) out[r.pair] = r.choice;
  return out;
};
const allVotes = () => db.prepare("SELECT pair, choice, day FROM votes ORDER BY day, pair").all();

// ---------- abonnés à l'alerte mensuelle (double confirmation) ----------
const normEmail = e => String(e || "").trim().toLowerCase();
function subscribe(email) {
  email = normEmail(email);
  const row = db.prepare("SELECT * FROM abonnes WHERE email = ?").get(email);
  if (row) return { token: row.token, confirmed: !!row.confirmed, existed: true };
  const token = crypto.randomBytes(20).toString("hex");
  db.prepare("INSERT INTO abonnes (email, token, created_at) VALUES (?, ?, ?)").run(email, token, today());
  return { token, confirmed: false, existed: false };
}
const confirmSub = token => Number(db.prepare("UPDATE abonnes SET confirmed = 1, confirmed_at = ? WHERE token = ?").run(today(), String(token)).changes) > 0;
const unsubscribe = token => Number(db.prepare("DELETE FROM abonnes WHERE token = ?").run(String(token)).changes) > 0;
const subByToken = token => db.prepare("SELECT email, confirmed FROM abonnes WHERE token = ?").get(String(token));
const confirmedSubs = () => db.prepare("SELECT email, token, last_sent FROM abonnes WHERE confirmed = 1 ORDER BY created_at, email").all();
const markSent = (email, month) => db.prepare("UPDATE abonnes SET last_sent = ? WHERE email = ?").run(month, email);
const subCount = () => Number(db.prepare("SELECT COUNT(*) AS n FROM abonnes WHERE confirmed = 1").get().n);
// les demandes jamais confirmées sont supprimées au bout de 3 jours
const purgePending = () => Number(db.prepare("DELETE FROM abonnes WHERE confirmed = 0 AND created_at < date('now', '-3 day')").run().changes);

module.exports = { subscribe, confirmSub, unsubscribe, subByToken, confirmedSubs, markSent, subCount, purgePending, normEmail, save, remove, count, all, vote, unvote, tallies, voteCount, voterCount, myVotes, allVotes };
