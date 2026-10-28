# Guide de lancement — verdict27

Trois sujets : **1. héberger le site**, **2. publicité (où, comment, avec quelles précautions)**, **3. SEO et communication**.
Les prix et règles ci-dessous sont des ordres de grandeur relevés fin octobre 2026 : vérifiez-les sur les sites des fournisseurs avant de vous engager.

---

## 1. Héberger le site

### Ce dont l'application a besoin
- **Node 22.13 ou plus** (SQLite intégré), un processus qui tourne en permanence (collecte des sondages toutes les X heures, flux d'actualité toutes les 20 min, alerte mensuelle).
- **Un disque qui survit aux redémarrages** : `data/politest.db` (contributions, votes, abonnés), `data/polls.json`, `data/news.json`, `data/.salt`. Sans disque persistant, vous perdez les votes à chaque déploiement.
- **HTTPS** (obligatoire pour le partage, le consentement, la confiance) : le plus simple est de le laisser à un reverse proxy (Caddy) ou à la plateforme.
- Une seule instance (SQLite = un seul écrivain). Largement suffisant pour des dizaines de milliers de visites par jour : le site est surtout du fichier statique compressé.

### Les trois façons de faire

| Option | Pour qui | Avantages | Limites |
|---|---|---|---|
| **VPS en Europe** (Hetzner, OVHcloud, Scaleway…, quelques €/mois) | Vous êtes à l'aise avec un terminal | Le moins cher, disque persistant natif, données en UE (RGPD), contrôle total | Vous gérez les mises à jour de sécurité et les sauvegardes |
| **Plateforme avec volume persistant** (Railway, Fly.io, Render offre payante…) | Vous voulez déployer depuis GitHub sans administrer de serveur | Déploiement en un `git push`, HTTPS inclus | Prix à l'usage, volume à configurer, région à choisir en UE |
| **Hébergement mutualisé / serverless** (Vercel, Netlify, mutualisé PHP) | — | — | **À éviter** : pas de processus permanent ni de disque persistant |

Les offres gratuites qui « s'endorment » après 15 min d'inactivité ne conviennent pas (première visite très lente, collecte interrompue).

**Recommandation** : un petit VPS en UE avec Caddy. Étapes :

1. Louer le VPS (Ubuntu LTS, 1–2 Go de RAM suffisent), se connecter en SSH, créer un utilisateur non-root, activer le pare-feu (ports 22, 80, 443).
2. Installer Node 22 LTS, copier le projet (`scp` du zip ou `git clone`), `npm install --omit=dev`.
3. Réserver le **nom de domaine** (`verdict27.fr` et idéalement `.com`, chez un registrar au choix, ~10 €/an) puis créer un enregistrement DNS **A** (et AAAA) vers l'IP du VPS.
4. Créer un service systemd :
   ```ini
   [Unit]
   Description=verdict27
   After=network.target
   [Service]
   WorkingDirectory=/srv/verdict27
   ExecStart=/usr/bin/node server.js
   Restart=always
   User=verdict27
   Environment=PORT=3000 TRUST_PROXY=1 SITE_URL=https://verdict27.fr ADMIN_TOKEN=<long-secret>
   Environment=VOTER_SALT=<texte-aleatoire> DIGEST_AUTO=1
   [Install]
   WantedBy=multi-user.target
   ```
5. Installer Caddy, avec un `Caddyfile` de deux lignes : `verdict27.fr { reverse_proxy localhost:3000 }` (HTTPS automatique, redirection de `www` à ajouter si besoin).
6. **Après le premier démarrage** : `npm run build-cards` (images de partage), ouvrir `https://verdict27.fr/api/health` (doit répondre 200), vérifier `/sitemap.xml` et `/robots.txt`.
7. **Sauvegardes** : une tâche cron quotidienne qui copie `data/politest.db` (de préférence via `sqlite3 data/politest.db ".backup /sauvegardes/vs-$(date +%F).db"`) vers un autre endroit (stockage objet, autre machine). Testez une restauration.
8. **Supervision** : un service gratuit de ping (UptimeRobot, BetterStack…) sur `/api/health` ; l'application répond 503 si les sondages n'ont pas été mis à jour depuis plus de 6 h. Renseignez `ALERT_EMAIL` ou `ALERT_WEBHOOK` pour être prévenu.
9. **E-mails** (alerte mensuelle) : un service d'envoi transactionnel européen (Brevo, Mailjet, Scaleway TEM…) → variables `SMTP_*` et `MAIL_FROM` ; configurez **SPF, DKIM et DMARC** sur le domaine, sinon les messages finiront en indésirables.
10. Mises à jour : remplacez les fichiers, `npm install --omit=dev`, `systemctl restart verdict27`. Vos données (`data/politest.db`, `data/*.csv`) ne bougent pas.

### Avant d'ouvrir au public (checklist)
- Compléter les **mentions légales** (éditeur, hébergeur, contact), `confidentialite.html` et `methode.html` : tous les crochets `[ … ]`.
- Compléter `data/sources_positions.csv` (au moins pour les 10–15 premiers candidats) : c'est ce qui rend le test défendable face à la critique.
- Décider si les petits candidats (positions génériques) apparaissent dans les résultats.
- Vérifier le texte de **neutralité** et la méthode : un test de positionnement politique est examiné de près en période électorale.
- Faire valider par un juriste les points sensibles : publication/reprise de sondages (loi du 19 juillet 1977 et Commission des sondages), consentement pour les données d'opinion (données sensibles au sens du RGPD), éventuelle analyse d'impact (AIPD) pour le questionnaire consensus.

---

## 2. Publicité

### Où l'afficher (déjà prévu dans le site)
Trois emplacements dans le code, **tous vides et désactivés par défaut**. On les active dans `data/ads.json` (`"enabled": true` puis on colle le code de la régie dans `html`) :

| Emplacement | Où | Pourquoi là |
|---|---|---|
| `news` | Sous la colonne « À la une » | Zone vue dès l'arrivée, hors du parcours du test |
| `between` | Entre « Sondages » et « Évolution » | Entre deux blocs de lecture, pleine largeur |
| `result` | Sous le classement de fin de test | Moment où l'attention est la plus haute, mais **après** la réponse |

Règles que j'ai appliquées et que je vous conseille de garder :
- **Jamais d'annonce pendant les questions** (cela fausse l'expérience et risque d'orienter les réponses).
- Annonce toujours **étiquetée « Publicité »**, hauteur réservée (pas de saut de page).
- Pages SEO (`/candidat/...`, `/duel/...`) : pas d'annonce au départ ; à ajouter plus tard si le trafic le justifie.

### Consentement (obligatoire)
- Les annonces personnalisées déposent des traceurs : il faut un **consentement préalable**, et **refuser doit être aussi simple qu'accepter** (position de la CNIL, qui a mis en demeure des éditeurs dont le bouton « refuser » était peu visible). Le bandeau intégré suit cette règle : deux boutons de même poids, choix gardé 6 mois, lien « Gérer mes choix publicitaires » en pied de page. Rien n'est chargé avant « Accepter ».
- **Google AdSense dans l'Espace économique européen** : pour servir des annonces personnalisées, il exige un **CMP certifié Google et compatible avec le cadre IAB TCF**. Le bandeau intégré **ne suffit donc pas pour AdSense** : choisissez un CMP certifié (liste tenue à jour par Google, offres gratuites ou payantes), collez son script dans `headScript` et passez `"consent": "external"` (le bandeau intégré disparaît, le CMP prend le relais). Sans CMP certifié, AdSense ne sert au mieux que des annonces non personnalisées ou limitées.
- Mettez à jour `confidentialite.html` (section « Publicité ») avec le nom de la régie, les finalités et la liste des cookies.

### Précautions propres au sujet politique
- La politique de Google sur les **publicités politiques dans l'UE** vise les annonceurs : depuis octobre 2025 Google ne diffuse plus de publicités politiques ou électorales dans l'UE. Les textes consultés ne disent pas comment cela joue pour un éditeur AdSense dont le site parle d'élections : **lisez les règles AdSense sur les contenus sensibles avant de candidater**, et attendez-vous à une demande d'annonces plus faible sur ce type de page.
- Désactivez dans la régie les catégories sensibles (politique, religion, paris…) : une publicité d'un parti à côté des résultats d'un test serait vécue comme un parrainage.
- Votre crédibilité est votre actif principal : l'indépendance affichée (« aucun candidat, parti ou média ne finance ce site ») vaut plus que quelques centaines d'euros de publicité.

### Quels revenus attendre ?
Revenus ≈ pages vues ÷ 1000 × RPM (revenu pour 1000 pages). Le RPM varie énormément selon le sujet, la saison et le consentement (les visiteurs qui refusent ne rapportent presque rien en pub personnalisée) : mesurez-le sur votre trafic réel avant de faire des plans. Le trafic politique est très saisonnier : pic autour des débats et de la campagne officielle, creux entre.

### Alternatives ou compléments à la pub
- **Partenariat / mécénat** clairement signalé (fondation, média, école de journalisme) : un seul sponsor, pas de traceurs.
- **Dons** (HelloAsso, Liberapay, Ko-fi) : bien accepté par un public qui se méfie de la pub.
- **Publicité contextuelle sans cookies** (régies européennes qui ne déposent pas de traceurs) : pas besoin de bandeau, revenus plus faibles.
- **Liens affiliés** vers des livres/essais politiques : à manier avec prudence côté neutralité.

**Ordre conseillé** : lancer sans pub, mesurer le trafic 4–8 semaines (outil de mesure sans cookies, type Plausible ou Matomo configuré sans consentement), puis activer un seul emplacement (`result` ou `news`) avec un CMP certifié.

---

## 3. SEO et communication

### SEO : ce qui est déjà en place
Pages serveur indexables (`/candidats`, `/candidat/<nom>`, `/duel/<A>--<B>`), `sitemap.xml`, `robots.txt`, balises Open Graph dynamiques, liens de partage `/p/<code>` avec image, polices et pages rapides (compression, cache).

### À faire au lancement
1. Enregistrer le site dans **Google Search Console** et **Bing Webmaster Tools**, soumettre `https://verdict27.fr/sitemap.xml`.
2. Vérifier `SITE_URL` (sinon les liens canoniques et le sitemap pointent au mauvais endroit).
3. Choisir **une seule adresse** (avec ou sans `www`) et rediriger l'autre.
4. Écrire un titre et une description soignés pour la page d'accueil : par exemple « Sondages présidentielle 2027 : moyenne, évolution, 2nd tour et test » (c'est la requête que vous voulez gagner).

### Mots-clés à viser
- Trafic « informationnel » stable : *sondage présidentielle 2027*, *candidats présidentielle 2027*, *qui est devant dans les sondages*, *second tour 2027 sondage X contre Y* (les pages `/duel/` répondent exactement à ces requêtes).
- Trafic « test » : *test politique*, *quel candidat me correspond*, *test présidentielle 2027*, *boussole politique*.
- Pages candidat : *programme de X*, *X sondage*. Pour les faire ranker, il faut du contenu vérifiable : complétez les sources.

### Faire grandir la visibilité
- **Fraîcheur** : le site se met à jour tout seul à chaque nouveau sondage ; l'alerte mensuelle fait revenir.
- **Contenu récurrent** (court) : « le sondage de la semaine », « ce qui a changé ce mois-ci » : génère du trafic et des citations.
- **Liens entrants** : journalistes de données, médias locaux, blogs politiques, enseignants (sciences politiques, EMC), sites de fact-checking. Offrez-leur quelque chose de citable : la moyenne des sondages, un graphique, la méthode ouverte.
- Wikipédia est la source des sondages : citez-la, mais les liens depuis Wikipédia sont « nofollow » ; ne comptez pas dessus pour le référencement.

### Communication
**Le moteur de croissance du site, c'est le partage du résultat** (image + lien). Tout le plan en découle :

| Phase | Quand | Actions |
|---|---|---|
| Préparation | 2–3 semaines avant | Compléter sources et mentions légales ; tester avec 20–30 proches de sensibilités différentes ; préparer 5 captures/vidéos courtes (test en 30 s, radar, duel) |
| Lancement doux | Semaine 1 | Cercle proche, communautés où vous êtes déjà légitime ; recueillir les retours, corriger |
| Lancement public | Semaine 2–3 | Posts sur Reddit (r/france et communautés politiques, en respectant leurs règles sur l'auto-promotion), Bluesky/X, LinkedIn ; courtes vidéos pour TikTok / Reels / Shorts (« j'ai fait le test, voici mon résultat ») ; envoi à des médias et newsletters (ton neutre, chiffres et méthode en avant) |
| Entretien | Ensuite | Un temps fort par événement (nouveau sondage, débat, annonce de candidature) : « ce que change ce sondage » ; relance de l'alerte mensuelle |

Messages qui marchent pour ce type de site : **« 2 minutes »**, **« anonyme »**, **« sources vérifiables »**, **« aucun parti ne finance ce site »**. À éviter : tout ce qui ressemble à une consigne de vote ou à un classement de « meilleur » candidat.

**Tonalité** : neutralité affichée, méthode ouverte (page `methode.html`), correction rapide des erreurs. Une polémique sur un biais supposé se gère par la transparence (publier les positions et leurs sources) plutôt que par la défense.

### Indicateurs à suivre (chaque semaine)
Visiteurs uniques, taux de démarrage du test, taux de fin, partages (`/p/` ouverts), inscriptions à l'alerte, retour à J+30, pages d'entrée Google, requêtes Search Console.
