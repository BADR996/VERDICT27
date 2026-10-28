# verdict27 V7

Sondages de la présidentielle 2027 (mis à jour automatiquement, qualifiés du second tour surlignés) + test politique
(Express 8 questions, Rapide 20, Moyen 50, Précis 208) avec résultat partageable (lien, aperçu, image) + fil d'actualité
+ alerte e-mail mensuelle + pages indexables par candidat et par duel + questionnaire anonyme facultatif.

## Lancer

Il faut Node.js 22.13 ou plus (la version « LTS » de nodejs.org convient).

    npm install
    npm start          # http://localhost:3000

Le serveur télécharge les sondages au démarrage, puis toutes les 30 minutes.
Si Wikipédia est injoignable, il garde les dernières données (un jeu de départ est fourni dans `data/polls.json`).

## Structure

| Fichier | Rôle |
|---|---|
| `server.js` | API (sondages, test, contribution, votes, exports), mise à jour planifiée |
| `scraper/update-polls.js` | Lit la page Wikipédia et écrit `data/polls.json` |
| `lib/` | Lecture des CSV, fusion des données, questionnaire de contribution |
| `data/*.csv` | **Vos données** : candidats, sondages, thèmes, questions, positions (voir `DONNEES.md`) |
| `scoring.js` | Tailles du test, scores par thème, proximité avec les candidats |
| `db.js` | Base SQLite intégrée à Node (contributions, votes) |
| `lib/seo.js` | Pages serveur : fiche candidat `/candidat/<slug>`, fiche duel `/duel/<clé>`, `/candidats`, `sitemap.xml`, `robots.txt`, aperçus des liens partagés `/p/…` |
| `lib/health.js` | Contrôle de santé (`/api/health`) et alertes si les sondages ne se mettent plus à jour |
| `lib/mailer.js`, `lib/digest.js` | E-mail de confirmation et alerte mensuelle « ce qui a bougé » |
| `public/` | Le site (`index.html`, `methode.html`, `style.css`, `js/`), polices et images hébergées localement, `cards/` (images d'aperçu) |

**Alimenter les données : lisez `DONNEES.md`.**

## Commandes utiles

    npm run check-data                                # vérifie tous vos fichiers (positions à l'envers, sources, photos…)
    npm run send-digest -- --dry                      # aperçu de l'alerte mensuelle (data/apercu-alerte.html), n'envoie rien
    npm run build-cards                               # refait les images d'aperçu des liens (si vous ajoutez des candidats)

    npm run update-news                               # collecte du fil d'actualité et état de chaque source
    npm run update-polls                              # mise à jour manuelle des sondages
    node scraper/update-polls.js --file page.html     # test hors ligne sur une page enregistrée

Si la mise à jour affiche « Attention : N scénarios écartés », c'est le contrôle de cohérence
(la somme d'un scénario doit faire environ 100 %). Quelques tableaux de 2025 y échappent mal : sans conséquence sur l'affichage récent.

## Mise en ligne : réglages par variables d'environnement

| Variable | Rôle |
|---|---|
| `SITE_URL` | **Adresse publique du site** (ex. `https://monsite.fr`). Sert aux aperçus de liens, au plan du site et aux e-mails. Fortement conseillée. |
| `TRUST_PROXY=1` | Derrière un hébergeur qui fait proxy (Render, Railway…) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE=1`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Serveur d'envoi d'e-mails. **Sans `SMTP_HOST`, le formulaire d'alerte e-mail n'apparaît pas.** |
| `DIGEST_AUTO=1` | Envoie l'alerte mensuelle automatiquement le 1er du mois à 9 h (heure de Paris). Sinon : `npm run send-digest`. |
| `ALERT_WEBHOOK` | Adresse qui reçoit un message (POST JSON) si les sondages ne se mettent plus à jour. Compatible Slack, Discord, Mattermost, ntfy. |
| `ALERT_EMAIL` | Même alerte, par e-mail (demande le SMTP). `STALE_HOURS` (6 par défaut) règle le délai avant alerte. |
| `ADMIN_TOKEN` | Active les exports CSV |

Surveillance : `GET /api/health` répond 200 si tout va bien, 503 sinon (utilisable avec UptimeRobot ou équivalent).
Le serveur compresse les pages et met les polices, images et fichiers en cache. Un pic de trafic ne demande aucun réglage particulier :
les calculs sont légers et le test n'écrit rien en base tant que la personne ne contribue pas.

## Mise en ligne, publicité, SEO, communication

Tout est détaillé dans **`GUIDE-LANCEMENT.md`** (hébergement pas à pas, emplacements et consentement publicitaires dans `data/ads.json`, plan SEO et communication).

## Photos des candidats

Elles viennent de Wikimédia. Pour en ajouter ou en remplacer : voir `public/photos/LISEZMOI.txt`.

## Base de données et RGPD

- Rien n'est enregistré sans consentement coché. Pas de nom, d'IP, de cookie. Seule exception volontaire : l'adresse e-mail de ceux qui s'abonnent à l'alerte mensuelle (double confirmation, désinscription en un clic, aucun lien avec le test).
- Chaque contribution reçoit un code aléatoire : la personne peut la supprimer depuis la page.
- Export CSV : définissez `ADMIN_TOKEN` puis ouvrez `/api/admin/export.csv?token=VOTRE_TOKEN`.

      ADMIN_TOKEN=un-long-secret npm start          (Mac / Linux)
      $env:ADMIN_TOKEN="un-long-secret"; npm start   (Windows PowerShell)

- **À faire avant la mise en ligne** : compléter `public/confidentialite.html` (éditeur, hébergeur, durée de conservation)
  et la faire relire par un juriste ou un DPO. Le questionnaire croise opinions politiques et origines (lieu de naissance
  de la personne et de ses parents) : ce sont des données sensibles.
- Derrière un hébergeur qui fait proxy (Render, Railway…), définissez la variable `TRUST_PROXY=1`
  pour que la limite d'envois par connexion fonctionne.

## Contrôle des données

    npm run check-data

## Limites connues

- Le test est indicatif : aucune validation statistique n'a été faite. Il le devient davantage avec les données de la base.
- Le scraper dépend de la structure de la page Wikipédia : si elle change, relancez `npm run update-polls` et regardez les messages.
- La moyenne affichée est une moyenne simple des sondages des 60 derniers jours, pas une moyenne pondérée.
