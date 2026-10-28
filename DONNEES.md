# Alimenter les données de verdict27

Tout se fait en modifiant des fichiers dans le dossier `data/` (ouvrables avec Excel : séparateur point-virgule,
encodage UTF-8). Après chaque modification : `npm run check-data` vérifie les fichiers et signale les erreurs ligne par ligne.
Le site relit les fichiers automatiquement, sans redémarrage.

Pour générer ou compléter les fichiers modèles : `npm run templates` (ne supprime jamais ce que vous avez saisi).

## 1. Liste des candidats : `data/candidates.csv`

`slug;nom;nom_court;parti;couleur;actif;photo;ordre`

- `slug` : identifiant (minuscules, tirets), identique à celui du sondage importé (voir la clé `candidates` de `data/polls.json`) ou nouveau pour un candidat de votre choix.
- `actif` : `oui` / `non`. Vide = automatique (affiché s'il apparaît dans un sondage des 150 derniers jours).
- `couleur` : code hexadécimal (`#0055a4`). `ordre` : ordre d'affichage.
- `orientation` : `extreme-gauche`, `gauche`, `centre`, `droite`, `extreme-droite` ou `divers`. Sert au graphique « Par orientation ». Vide = le candidat n'est pas compté dans ce graphique.
- Une ligne qui commence par `#` est ignorée.

Import de la page franceinfo « Portraits » (candidats déclarés et famille politique) : enregistrez la page en HTML, puis

    node scripts/import-franceinfo.js page.html

Le script ajoute les candidats manquants (les candidats « retirés » passent à `actif = non`) et renseigne l'orientation sans jamais écraser une valeur que vous avez saisie. Zemmour, Bardella, Hollande, Villepin, Poutou et Wauquiez ne figurent pas sur franceinfo : leur orientation est mon classement par défaut, à confirmer (Villepin surtout).

Tout candidat de `candidates.csv` est affiché, sauf si sa colonne `actif` vaut `non`.

## 2. Résultats de sondages : `data/sondages.csv`

Format « long » : une ligne par candidat et par scénario.

`type;date;institut;echantillon;scenario;candidat;score`

    1er tour;2026-10-25;Ifop;1200;A;marine-le-pen;33,5
    1er tour;2026-10-25;Ifop;1200;A;jean-luc-melenchon;18
    2nd tour;2026-10-25;Ifop;1200;;marine-le-pen;48
    2nd tour;2026-10-25;Ifop;1200;;jean-luc-melenchon;52

- `type` : `1er tour` ou `2nd tour`. `date` : AAAA-MM-JJ. `scenario` : une lettre pour distinguer plusieurs hypothèses du même sondage (inutile au 2nd tour).
- Un sondage saisi à la main **remplace** celui importé de Wikipédia pour le même institut et la même date.
- Les sondages importés arrivent seuls toutes les 30 minutes ; ce fichier sert aux ajouts et corrections.

## 3. Photos : `public/photos/<slug>.jpg`

Déposez `marine-le-pen.jpg` (ou `.png`, `.webp`). Priorité : colonne `photo` de candidates.csv, puis ce dossier, puis la photo Wikimédia, puis les initiales. Voir `public/photos/LISEZMOI.txt`.
Photo d'en-tête : déposez `public/img/hero.jpg` (Élysée, Paris…) : elle remplace automatiquement l'illustration. Vérifiez les droits.

## 4. Questions : `data/questions.csv` et `data/themes.csv`

`id;theme;niveau;sens;texte`

- `theme` : code défini dans `themes.csv` (`econ`, `welf`, `soci`, `euro`, `ecol`, `immi`, `auth`, `inst`). Vous pouvez ajouter un thème (nom, icône, couleur, deux pôles, description).
- `niveau` : 1 = test rapide (20), 2 = ajoutée au moyen (50), 3 = ajoutée au précis (tout).
- `sens` : `1` si être d'accord rapproche du second pôle du thème, `-1` du premier. Gardez les sens équilibrés (le contrôle vous avertit sinon).
- Après ajout d'une question, relancez `npm run templates` pour qu'elle apparaisse dans positions.csv.

## 5. Positions des candidats : deux façons de les saisir

Le résultat du test est centré sur les candidats : le plus proche en tête, un pourcentage d'accord par thème, et un radar qui compare l'utilisateur aux trois plus proches. Il faut donc les positions des candidats. Tant qu'elles sont vides, le site n'affiche que le profil par thème.

**Rapide : `data/positions_themes.csv`** (8 lignes x un candidat par colonne). Une note de -100 à +100 par thème, sur la même échelle que le profil de l'utilisateur : -100 = premier pôle du thème, +100 = second pôle, 0 = au milieu. La colonne `nom` rappelle les deux pôles de chaque thème. Il faut au moins 4 thèmes renseignés pour qu'un candidat soit classé.

**Fine : `data/positions.csv`** (une ligne par question, 208 lignes). Valeurs de 1 à 5 : 1 = pas du tout d'accord avec la phrase, 3 = neutre, 5 = tout à fait d'accord. Case vide = inconnu. Les notes sont moyennées par thème (3 questions notées minimum par thème). Si les deux fichiers renseignent le même thème, `positions_themes.csv` l'emporte.

Conseils : remplissez un candidat à la fois, avec des sources citables (programme, votes, déclarations datées), gardez-les, et laissez vide ce que vous ne savez pas. Ces notes décident de qui apparaît « proche » de l'utilisateur : une méthode transparente protège votre crédibilité.

## 5 bis. Sources des positions : `data/sources_positions.csv`

C'est ce qui répond à « d'où vient cette note ? ». Le résultat du test propose, pour chaque candidat, un bouton « Pourquoi ce score ? » qui affiche ses positions thème par thème avec leurs sources ; la fiche `/candidat/<slug>` aussi.

`candidat;nom;theme;position_calculee;source_titre;source_url;date;extrait`

- Une ligne par source. Vous pouvez en mettre plusieurs pour le même candidat et le même thème (dupliquez la ligne).
- `position_calculee` et `nom` sont remplies automatiquement (rappel de la note actuelle) : ne les modifiez pas. Remplissez `source_titre` et `source_url` (adresse complète `https://…`), et si possible `date` et `extrait`.
- `npm run templates` ajoute les lignes manquantes sans effacer vos sources. `npm run check-data` indique combien de positions sont sourcées.
- Une position sans source s'affiche « source à compléter » : le site ne cache pas ce qui reste une estimation.

**Contrôle de cohérence.** `npm run check-data` signale aussi les notes de `positions.csv` qui vont à l'envers du sens de la question (par exemple « d'accord » avec une phrase libérale alors que les autres réponses du même thème sont étatistes). La V6 est livrée avec ce fichier corrigé automatiquement : la liste des lignes modifiées est dans `corrections-positions.csv`.

**Textes des questions.** `data/questions.csv` contient la rédaction sobre d'origine. La version au ton plus familier est conservée dans `data/alternatives/questions_ton_jeune_v5.csv` (mêmes numéros, mêmes sens, donc compatible avec vos notes) : copiez-la sur `questions.csv` pour l'activer.

## 6. Fil d'actualité : `data/sources.csv`

La colonne « À la une » (à droite sur ordinateur, au-dessus des sondages sur mobile) lit des flux RSS de médias français toutes les 20 minutes.

`nom;url;actif;resume;images`

- `url` : l'adresse du flux RSS (ou Atom) de la rubrique politique du média.
- `actif` : `oui` / `non`. `resume` : `oui` pour afficher l'extrait fourni par le flux, `non` pour n'afficher que le titre.
- Le site ne garde que les articles qui parlent de la présidentielle ou qui citent un candidat actif, enlève les doublons, ne garde que les 14 derniers jours et classe par date, sans mise en avant. Il affiche le titre, le média, l'heure, un extrait court et un lien vers l'article chez l'éditeur. Jamais le texte complet. Les miniatures ne sont affichées que si la colonne `images` vaut `oui` pour ce média (par défaut `non`) : n'activez que si ses conditions l'autorisent.
- `images` : `oui` / `non` (défaut `non`). Reprend l'image fournie par le flux (media:content, media:thumbnail, enclosure) ; elle est chargée depuis le serveur du média, jamais copiée.
- Le fil met en avant le premier article (carte « À chaud » si < 3 h), propose des puces par candidat cité (cliquables) et marque « Nouveau » les articles de moins de 3 h.
- Les adresses fournies sont les flux habituels, mais les médias les déplacent ou les bloquent parfois. Lancez `npm run update-news` : le terminal montre, source par source, ce qui répond (✓) ou non (✗). Corrigez l'adresse ou mettez `actif = non`. Une source en panne ne gêne pas les autres.
- Choisissez des médias de sensibilités variées ; vérifiez leurs conditions d'utilisation avant la mise en ligne.
- Variables facultatives : `NEWS_DISABLED=1` coupe la collecte, `NEWS_MAX_AGE_DAYS=7` change l'ancienneté maximale, `NEWS_USER_AGENT` change l'identification du robot (mettez-y une adresse de contact).

## Récupérer les contributions et les votes

Définir `ADMIN_TOKEN`, puis ouvrir `/api/admin/export.csv?token=…` (questionnaire) et `/api/admin/votes.csv?token=…` (votes des duels agrégés).

## 7. Publicité : `data/ads.json`

Désactivée par défaut (`"enabled": false`). Trois emplacements possibles (`news`, `between`, `result`), jamais pendant les questions. Pour activer : `enabled: true`, coller le code de la régie dans `html` de chaque emplacement, puis redémarrer. `consent` : `builtin` (bandeau intégré accepter/refuser, rien n'est chargé avant « Accepter ») ou `external` (vous installez un CMP certifié via `headScript`, obligatoire pour AdSense dans l'EEE). Voir `GUIDE-LANCEMENT.md` pour les règles et précautions.

## 8. Actualité du mois : `actualite.csv`, `actualite_positions.csv`, `actualite_meta.json`

Module facultatif, séparé du score principal (section « Actualité du mois » du site). À renouveler chaque mois.

- `actualite.csv` : `id;sujet;texte`. Une affirmation par ligne, formulée de façon neutre, portant sur une réponse politique possible plutôt que sur les faits. Réponse de 1 (pas du tout d'accord) à 5.
- `actualite_positions.csv` : `question;candidat;note;source_titre;source_url;date;extrait`. Une ligne par candidat et par question, **uniquement quand une déclaration publique sourcée existe** (adresse obligatoire). Pas de ligne = pas de position connue, jamais un désaccord. `note` est l'avis que le candidat aurait sur l'affirmation (1 à 5), établi par l'éditeur d'après la source : à relire.
- `actualite_meta.json` : titre, introduction et courts rappels de contexte avec liens.
- Calcul : accord = 1 − |votre réponse − sa note| ÷ 4, moyenné sur les questions communes. Un candidat n'est classé que s'il a au moins 3 positions sourcées sur les questions auxquelles vous avez répondu ; sinon ses positions sont seulement affichées sous chaque question.
- Pour supprimer le module : videz `actualite.csv`.
