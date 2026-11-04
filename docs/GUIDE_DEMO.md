# Guide de démonstration — 12 minutes

> Déroulé répété en conditions réelles (parcours automatisés `e2e/tests/explorers.spec.ts` et `crud.spec.ts`) : chaque étape ci-dessous correspond à un comportement **vérifié**. Captures : `docs/screenshots/`.

## Avant la soutenance (5 min, une seule fois)

```bash
npm run dev                  # démarre Python (8001), Express (4000), React (5173) — attendre le badge vert « Triple store connecté »
```

1. **Réchauffer spaCy** : poser une question dans *Recherche NLP* (la 1ʳᵉ prend ≈ 10 s : chargement du modèle). Pendant la démo, tout répond en < 1 s.
2. **État propre** : *Ontology Explorer → Réinitialiser* (sauvegarde automatique) — le graphe revient à 846 triplets.
3. **OneDrive** : le projet est dans OneDrive ; pour éviter verrous/conflits sur `data/assurance_live.ttl`, lancer avec `DATA_DIR` hors OneDrive (ex. `set DATA_DIR=C:\temp\autoinsure` pour les deux processus) ou mettre la synchronisation en pause.
4. Dossier de secours : `docs/screenshots/` et `docs/hermit/hermit_output.txt` (au cas où une machine plante).

## Déroulé (12 minutes)

| # | Min | Écran | Ce que vous faites / dites |
|---|---|---|---|
| 1 | 0:00 | **Dashboard** | KPI (classes, propriétés, individus, contrats, sinistres, indemnisations) et graphiques : « tout est **calculé par SPARQL** sur le graphe RDF ». Badge « Cohérente » = validation structurelle (≠ HermiT, voir étape 12). |
| 2 | 0:45 | **Ontology Explorer** | Hiérarchie → `ContratAssurance` : sous-classes, **axiomes** (≥1 prime, ≥1 garantie, ≥1 véhicule, ∃ garantie RC), classes disjointes, individus. Onglet *Propriétés* (domaine/range, inverse, fonctionnelle). Onglet **Ontographe** : survol d'un nœud, « Toutes les classes ». |
| 3 | 2:15 | **Assurés → Ahmed Ben Ali** (fiche) puis **Véhicules** | « Ahmed possède le contrat C-001 (tous risques, actif) qui couvre la Peugeot 208 » : contrats, véhicule, sinistres déclarés. |
| 4 | 3:15 | **Sinistres → Déclarer un sinistre** | Type *Accident de la circulation*, **date = aujourd'hui** (doit être dans la période du contrat C-001 : 2026-01-01 → 2027-01-01, sinon l'application refuse — règle métier), lieu « Tunis », assuré *Ahmed Ben Ali*, contrat *C-001*, véhicule *Peugeot 208*, description, **un dommage** (matériel, 1500). *Enregistrer* → notification verte « Sinistre déclaré dans le graphe RDF ». Montrer l'erreur si on valide le formulaire vide. |
| 5 | 4:30 | **SPARQL Explorer** | Montrer la représentation RDF du sinistre créé : `DESCRIBE actors:Sinistre_004` (ou `SELECT ?p ?o WHERE { actors:Sinistre_004 ?p ?o }`) → type, `concerne`, `rattacheAContrat`, `provoque`, `statutSinistre "Declare"` (extension), et l'inverse `estDeclarePar` **matérialisée**. |
| 6 | 5:30 | SPARQL Explorer | `SELECT` avec jointure : <br>`SELECT ?contrat ?numero ?type WHERE { ?contrat a/rdfs:subClassOf* actors:ContratAssurance ; actors:numeroContrat ?numero ; actors:contient ?g . ?g a ?type FILTER(?type = actors:GarantieVol) }` → C-001. Puis un exemple `FILTER/OPTIONAL/ORDER BY`. |
| 7 | 6:15 | SPARQL Explorer | **Sécurité** (30 s) : `SELECT * FROM <file:///etc/passwd> …` → 403 ; `CLEAR ALL` → 403 ; `DELETE WHERE { ?s ?p ?o }` → 403 « supprimerait 8xx triplets ». « Aucun accès fichier/réseau, un seul graphe, sauvegarde avant toute suppression. » |
| 8 | 6:45 | **Recherche NLP** | Taper : **« Quels contrats couvrent le vol ? »** (ou « Quels véhicules sont assurés par Ahmed ? »). Bandeau « **aucune API LLM** » : spaCy 3.8.2 · NLTK 3.9.1 · RDFLib 7.1.1. |
| 9 | 7:30 | NLP — étape 2 | **Traitement spaCy** : tableau tokens / lemmes / POS / dépendances (« assurés » = **VERB**, participe → relation *assurer* ≠ *Assuré* nom). |
| 10 | 8:15 | NLP — étapes 3 à 5 | Intention `SEARCH_CONTRACT` + modificateur `FILTER_BY_TYPE` ; entités liées aux individus (`AhmedBenAli`) ; synonymes → concepts OWL ; **SPARQL généré** (template contrôlé, aucune chaîne de la question insérée). |
| 11 | 9:15 | NLP — étape 6 | **Résultats réels** + explication en français. Puis la **négation** : « Quels contrats ne couvrent pas le vol ? » → bloc *Négation détectée* (« ne … pas », portée « le vol ») et `FILTER NOT EXISTS` → C-002, C-003, C-004 (complémentaire exact). Enfin le garde-fou : « Quels sinistres ont été évalués par Ahmed ? » → refus « rôle incompatible » (Ahmed est assuré), **aucune requête exécutée**. |
| 12 | 10:30 | Terminal / `docs/HERMIT_VALIDATION.md` | **HermiT** : « RDFLib ne raisonne pas ; le raisonnement OWL est vérifié avec HermiT » → `npm run test:hermit` (ou montrer `docs/hermit/hermit_output.txt`) : ontologie **cohérente**, 0 classe insatisfiable, `ContratActif` = C-001..003, `SinistreExpertise` = S-001, S-003, 49 vérifications ✔ ; recoupement : sur des données créées par l'application, HermiT et nos requêtes renvoient **les mêmes ensembles**. |
| — | 11:30 | Nettoyage | *Sinistres → Supprimer* le sinistre de démonstration (ou *Réinitialiser*). Questions du jury (1 min). |

Parcours alternatifs si le temps le permet : CRUD complet d'un assuré (*Sonia Mansour*, doublon refusé), contrat **Tous risques** qui reçoit automatiquement les garanties exigées par les axiomes, expertise + rapport (`contenuDocument`), indemnisation calculée `(coût − franchise) × taux`, **redémarrage** du service Python (`Ctrl+C`, relancer) : les données persistent.

## Questions probables du jury — réponses exactes

| Question | Réponse précise (et vérifiable) |
|---|---|
| **Pourquoi pas un LLM ?** | Contrainte du professeur. Le module est écrit par l'équipe : spaCy (analyse), NLTK (distance d'édition), RDFLib, dictionnaire de synonymes, règles, templates SPARQL contrôlés. `GET /api/nlp/module` renvoie `llm: false` ; aucun appel réseau sortant, aucune clé (`git grep` ne trouve aucun client LLM). |
| **RDFLib raisonne-t-il ?** | **Non.** RDFLib est un triple store + moteur SPARQL. Nous matérialisons `owl:inverseOf`, suivons `rdfs:subClassOf*` dans les requêtes, et appliquons les axiomes de cardinalité dans l'API. L'inférence complète est vérifiée avec **HermiT** (hors runtime). |
| **HermiT a-t-il été exécuté ?** | **Oui** (Java Temurin 21, OWLAPI 5.1.9 + HermiT 1.4.x, utilitaire `tools/hermit-validator`) : cohérente, 0 classe insatisfiable, 49 vérifications, + 12 vérifications de recoupement avec l'application. Protégé (GUI) n'a pas été utilisé : la marche à suivre est dans `HERMIT_VALIDATION.md`. |
| **Quelle différence entre OWL et SPARQL ?** | SPARQL **interroge** des faits ; OWL **déduit** de nouveaux faits (types, hiérarchie, incohérence) à partir d'axiomes. Ex. : `ContratActif` n'est écrit nulle part ; HermiT le déduit de `statutContrat "Actif"`, et notre application renvoie le même ensemble grâce à un filtre SPARQL équivalent. |
| **Que veut dire « monde ouvert » ?** | OWL suppose qu'une information absente est *inconnue* : un contrat sans prime n'est **pas** incohérent pour HermiT (test à l'appui). Nos contrôles « il faut une prime » sont une validation en monde fermé, faite par l'API. |
| **Comment gérez-vous la négation ?** | Analyse linguistique explicite (marqueur `ne…pas`/`sans`/`pas de`, portée, spaCy `advmod`) puis `FILTER NOT EXISTS` avec variables privées. Négation de montant/date et « ne…que » : **refusées** (jamais ignorées). Sémantique = négation par l'échec (monde fermé du graphe). |
| **Et si la question est ambiguë ou le rôle faux ?** | `clarification_needed` / `entity_not_found` : aucune requête exécutée. Ex. « Trabelsi » = expert **et** assurée → on demande de préciser ; « évalués par Ahmed » → Ahmed est assuré → refus. |
| **Comment évitez-vous l'injection SPARQL ?** | Aucune sous-chaîne de la question n'est insérée ; individus validés (regex + existence dans le graphe), classes vérifiées dans l'ontologie, nombres `Decimal`, statuts en liste blanche ; tests d'injection. |
| **L'explorateur SPARQL est-il sûr ?** | Refus de `SERVICE`, `LOAD`, `CLEAR`, `DROP`, `CREATE/COPY/MOVE/ADD`, **`FROM`/`USING`/`WITH`/`GRAPH`** (un audit a montré que `USING <file://…>` faisait lire un fichier local : corrigé), effacement massif refusé, sauvegarde avant suppression. Limite : pas de timeout d'exécution. |
| **L'ontologie d'origine est-elle modifiée ?** | Non (SHA-256 identique, vérifié avant/après HermiT). Deux propriétés ajoutées dans un fichier séparé (`statutSinistre`, `contenuDocument`), compatibles Protégé et validées par HermiT. |
| **Pourquoi pas Fuseki ?** | Java non requis au runtime, volume faible (≈ 850 triplets) ; l'interface `/sparql/query|update` est la même : migrer ne toucherait que `backend/src/semantic/client.ts`. |
| **Que se passe-t-il si le fichier de données est corrompu ?** | Le service démarre quand même : fichier mis de côté, dernière sauvegarde valide restaurée, visible dans `/health` (testé). |
| **Qu'est-ce qui n'est pas fait ?** | Authentification ; timeout SPARQL ; raisonneur dans le runtime ; NLP multilingue / multi-tours ; négation de montants/dates ; test sur Firefox/Safari/mobile (voir `FINAL_PROJECT_AUDIT.md`). |
| **Combien de tests ?** | pytest 188 · Vitest API 70 · Vitest front 6 · Playwright 65 · persistance 26 · HermiT 49 + 12 · rapport NLP 86 cas (voir `FINAL_PROJECT_AUDIT.md` pour les chiffres du dernier run). |

## Plan B

- Service Python lent au démarrage (spaCy) : attendre le badge vert « Triple store connecté ».
- Port occupé : `SEMANTIC_PORT`, `PORT` (backend), `vite --port`.
- État incohérent après répétition : *Réinitialiser* ; en dernier recours supprimer `data/assurance_live.ttl` (l'original est reconstruit).
- Date du sinistre refusée (« hors de la période du contrat ») : choisir une date dans la période du contrat (C-001 : 2026-01-01 → 2027-01-01).
- Pas de réseau / machine de secours : captures dans `docs/screenshots/`, sortie HermiT dans `docs/hermit/`.
