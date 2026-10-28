// Questionnaire facultatif de contribution : trois blocs, tous les champs sont facultatifs.
//
// Principe RGPD retenu : on ne collecte que ce qui sert à la finalité (comprendre et pondérer des opinions,
// comme le font les instituts de sondage), jamais plus. Volontairement ABSENT : santé, orientation sexuelle,
// appartenance syndicale, adresse ou code postal exact, date de naissance exacte, origine ethnique ou « raciale ».
//
//   bloc 1 « Vous »            : données ordinaires.
//   bloc 2 « Politique »       : données sensibles (opinions politiques) : consentement explicite séparé.
//   bloc 3 « Parcours »        : données sensibles (origines, religion)   : consentement explicite séparé.

const REGIONS = [
  "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire", "Corse", "Grand Est",
  "Hauts-de-France", "Île-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire",
  "Provence-Alpes-Côte d'Azur", "Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte", "Hors de France"
];

function definition(polls) {
  const activeNames = (polls ? polls.activeSlugs : []).map(s => polls.candidates[s].name);
  const vote22 = [
    "Nathalie Arthaud", "Fabien Roussel", "Jean-Luc Mélenchon", "Yannick Jadot", "Anne Hidalgo", "Emmanuel Macron",
    "Valérie Pécresse", "Jean Lassalle", "Nicolas Dupont-Aignan", "Marine Le Pen", "Éric Zemmour", "Philippe Poutou",
    "Vote blanc ou nul", "Abstention", "Je n'étais pas inscrit(e) ou pas en âge de voter"
  ];

  const sections = [
    { id: "vous", title: "Vous", sensitive: false,
      intro: "Les informations utilisées par les instituts de sondage pour équilibrer un échantillon." },
    { id: "politique", title: "Votre rapport à la politique", sensitive: true,
      intro: "Ces informations révèlent des opinions politiques : ce sont des données sensibles, enregistrées seulement avec votre accord explicite." },
    { id: "parcours", title: "Votre parcours", sensitive: true,
      intro: "Origines et religion : données sensibles, enregistrées seulement avec votre accord explicite. Totalement facultatif." }
  ];

  const income = ["Aucun revenu", "Moins de 1 000 €", "1 000 à 1 499 €", "1 500 à 1 999 €", "2 000 à 2 999 €", "3 000 à 4 499 €", "4 500 € et plus"];
  const fields = [
    // ----- bloc 1 -----
    { key: "sex", section: "vous", label: "Votre sexe", options: ["Femme", "Homme", "Autre"] },
    { key: "age", section: "vous", label: "Votre âge", options: ["18-24 ans", "25-34 ans", "35-44 ans", "45-54 ans", "55-64 ans", "65 ans et plus"] },
    { key: "region", section: "vous", label: "Votre région", options: REGIONS },
    { key: "commune", section: "vous", label: "Où habitez-vous ?", options: ["Commune rurale (moins de 2 000 habitants)", "Petite ville (2 000 à 20 000)", "Ville moyenne (20 000 à 100 000)", "Grande ville (plus de 100 000)", "Agglomération parisienne"] },
    { key: "diplome", section: "vous", label: "Votre diplôme le plus élevé", options: ["Aucun diplôme", "Brevet, CAP ou BEP", "Baccalauréat", "Bac +2 (BTS, DUT)", "Bac +3 (licence)", "Bac +5 (master, école)", "Doctorat"] },
    { key: "pcs", section: "vous", label: "Votre catégorie socioprofessionnelle", options: ["Agriculteur exploitant", "Artisan, commerçant ou chef d'entreprise", "Cadre ou profession intellectuelle supérieure", "Profession intermédiaire", "Employé", "Ouvrier", "Retraité", "Étudiant ou lycéen", "Sans activité professionnelle"] },
    { key: "statut", section: "vous", label: "Votre situation actuelle", options: ["Salarié du privé", "Salarié du public ou fonctionnaire", "À mon compte", "En recherche d'emploi", "Retraité", "Étudiant", "Au foyer", "Autre"] },
    { key: "income", section: "vous", label: "Votre revenu net mensuel (personnel)", options: income },
    { key: "income_home", section: "vous", label: "Le revenu net mensuel de votre foyer", options: ["Moins de 1 500 €", "1 500 à 2 499 €", "2 500 à 3 499 €", "3 500 à 4 999 €", "5 000 à 7 499 €", "7 500 € et plus"] },
    { key: "famille", section: "vous", label: "Votre situation familiale", options: ["Célibataire", "En couple", "Marié(e) ou pacsé(e)", "Séparé(e) ou divorcé(e)", "Veuf ou veuve"] },
    { key: "enfants", section: "vous", label: "Enfants à charge", options: ["Aucun", "1", "2", "3 ou plus"] },
    { key: "logement", section: "vous", label: "Votre logement", options: ["Propriétaire", "Locataire (secteur privé)", "Locataire (logement social)", "Hébergé gratuitement"] },
    { key: "nationalite", section: "vous", label: "Votre nationalité", options: ["Française", "Française et autre", "Autre nationalité européenne", "Autre nationalité hors Europe"] },
    { key: "inscrit", section: "vous", label: "Inscrit(e) sur les listes électorales ?", options: ["Oui", "Non", "Je ne sais pas"] },

    // ----- bloc 2 : opinions politiques (sensible) -----
    { key: "gauche_droite", section: "politique", label: "Sur une échelle de gauche à droite", options: ["0 (très à gauche)", "1", "2", "3", "4", "5 (au centre)", "6", "7", "8", "9", "10 (très à droite)", "Je ne me place pas"] },
    { key: "parti_proche", section: "politique", label: "Le parti dont vous vous sentez le plus proche", options: ["Lutte ouvrière", "Nouveau Parti anticapitaliste", "Parti communiste français", "La France insoumise", "Parti socialiste", "Place publique", "Les Écologistes", "Renaissance", "MoDem", "Horizons", "Les Républicains", "UDI", "Debout la France", "Rassemblement national", "Reconquête", "Un autre parti", "Aucun parti"] },
    { key: "vote22_t1", section: "politique", label: "Votre vote au 1er tour de 2022", options: vote22 },
    { key: "vote22_t2", section: "politique", label: "Votre vote au 2nd tour de 2022", options: ["Emmanuel Macron", "Marine Le Pen", "Vote blanc ou nul", "Abstention", "Je n'étais pas inscrit(e) ou pas en âge de voter"] },
    { key: "leg24", section: "politique", label: "Votre vote au 1er tour des législatives de 2024", options: ["Nouveau Front populaire (gauche et écologistes)", "Ensemble (majorité présidentielle)", "Les Républicains ou UDI", "Rassemblement national et alliés", "Un autre candidat", "Vote blanc ou nul", "Abstention", "Je n'étais pas inscrit(e) ou pas en âge de voter"] },
    { key: "intention27", section: "politique", label: "Pour qui voteriez-vous au 1er tour en 2027 ?", options: [...activeNames, "Un autre candidat", "Vote blanc ou nul", "Je ne sais pas encore", "Je ne voterai pas"] },
    { key: "certitude", section: "politique", label: "Êtes-vous sûr(e) de ce choix ?", options: ["Certain(e)", "Plutôt sûr(e)", "Pas vraiment sûr(e)"] },
    { key: "participation", section: "politique", label: "Irez-vous voter en 2027 ?", options: ["Certainement", "Probablement", "Peut-être", "Probablement pas", "Certainement pas"] },
    { key: "interet", section: "politique", label: "Votre intérêt pour la politique", options: ["Beaucoup", "Assez", "Peu", "Pas du tout"] },
    { key: "media", section: "politique", label: "Votre principale source d'information", options: ["Télévision", "Radio", "Presse (papier ou site)", "Réseaux sociaux", "YouTube ou podcasts", "Entourage", "Aucune en particulier"] },

    // ----- bloc 3 : origines et religion (sensible) -----
    { key: "birth", section: "parcours", label: "Vous êtes né(e)…", options: ["en France", "à l'étranger"] },
    { key: "parents", section: "parcours", label: "Vos parents sont nés…", options: ["Tous les deux en France", "L'un en France, l'autre à l'étranger", "Tous les deux à l'étranger"] },
    { key: "religion", section: "parcours", label: "Votre religion", options: ["Sans religion", "Catholique", "Protestante", "Orthodoxe", "Musulmane", "Juive", "Bouddhiste", "Autre religion"] },
    { key: "pratique", section: "parcours", label: "Votre pratique religieuse", options: ["Régulière", "Occasionnelle", "Aucune"] }
  ];
  return { sections, fields };
}

module.exports = { definition };
