# Répartition du travail (5 étudiants)

Le projet est découpé en modules à **contrats stables** (API REST, `frontend/src/lib/types.ts`, ontologie) : chacun travaille sur sa branche sans bloquer les autres.

| Étudiant | Module | Branche Git | Fichiers principaux |
|---|---|---|---|
| **1** | Ontologie OWL : classes, ObjectProperties, DataProperties, individus, axiomes, **validation HermiT** | `feat/ontologie` | `ontology/*`, `docs/ONTOLOGIE.md`, `semantic-service/app/ontology_info.py` (validateur), `tests/test_store.py::test_validator_*` |
| **2** | Back-End Express, API REST, RDFLib, CRUD SPARQL, persistance | `feat/backend-rdf` | `backend/src/{domain,semantic,routes,util}`, `semantic-service/app/{store,main,config}.py`, `backend/tests/{crud,sparql}.test.ts`, `docs/API.md` |
| **3** | Front-End React : Dashboard, assurés, véhicules, contrats (+ garanties) | `feat/frontend-gestion` | `frontend/src/pages/{Dashboard,Insured,Vehicles,Contracts,Guarantees,Landing}.tsx`, `components/{ui,crud,toast}.tsx`, `components/layout/` |
| **4** | NLP/TALN : spaCy, intentions, entités, templates SPARQL, tests NLP | `feat/nlp` | `semantic-service/app/nlp/*`, `semantic-service/tests/test_nlp.py`, `backend/tests/nlp.test.ts`, `docs/NLP_PIPELINE.md` |
| **5** | Ontology Explorer, ontographe, SPARQL Explorer, recherche sémantique, sinistres/expertises/indemnisations, **intégration & tests** | `feat/explorers-integration` | `frontend/src/pages/{OntologyExplorer,SparqlExplorer,SemanticSearch,Claims,Expertises,Indemnifications}.tsx`, `components/Ontograph.tsx`, `scripts/`, `README.md`, `docs/GUIDE_DEMO.md` |

## Interfaces entre modules

| Producteur → consommateur | Contrat |
|---|---|
| 1 → 2, 4 | IRI et noms de classes/propriétés ; `ontology/assurance_auto*.{xml,ttl}` (toute nouvelle propriété : mettre à jour `templates.COLUMNS/EDGES` côté 4 et les DTO côté 2) |
| 2 → 3, 5 | Routes REST de [API.md](API.md) + DTO TypeScript |
| 2 → 4 | `POST /sparql/query` interne (exécution des requêtes générées) |
| 4 → 5 | Réponse de `/api/nlp/{translate,search}` (champs documentés) |

## Workflow Git

Le dépôt **existe déjà** (branche `main`, remote `origin` = `slim00077/AutoInsure-Semantic-Explore`) : **ne pas refaire `git init`**.

```bash
git fetch origin && git status                    # toujours vérifier l'état avant de travailler
git checkout -b feat/<module>                     # une branche par étudiant (voir tableau)
# … travail, puis :
npm test                                          # pytest + Vitest : doit rester vert avant toute fusion
git add <fichiers précis> && git commit
git fetch origin && git rebase origin/main        # intégrer le travail des autres SANS le réécrire
git push -u origin feat/<module>                  # jamais de --force ; ouvrir une Pull Request
```

Règles : ne jamais committer `.env`, `data/`, `node_modules/`, `.venv/` (ils sont ignorés) ; ne pas modifier `ontology/assurance_auto.xml` (original) ; toute évolution d'ontologie passe par `ontology/assurance_auto_extensions.ttl` + mise à jour de `templates.COLUMNS/EDGES` et des DTO.

Ordre d'intégration conseillé : 1 (ontologie) → 2 (back) → 4 (NLP) → 3 (front gestion) → 5 (explorateurs, intégration).
Conflits probables : `frontend/src/lib/{types,services}.ts` et `components/layout/AppLayout.tsx` (ajouter des lignes, ne pas réordonner).

## Checklist par étudiant avant la soutenance

| # | À savoir et à pouvoir montrer | Commande / fichier |
|---|---|---|
| 1 — Ontologie | Expliquer **HermiT** : ontologie cohérente, 0 classe insatisfiable, `ContratActif` = C-001..003, `SinistreExpertise` = S-001/S-003 ; la différence **monde ouvert / monde fermé** ; les 2 extensions et pourquoi l'original est intact ; propositions d'amélioration (`estPossedePar`, `statutContrat` fonctionnelle) | `npm run test:hermit` · `docs/HERMIT_VALIDATION.md` · `docs/ONTOLOGY_EXTENSION_VALIDATION.md` · `docs/OWL_REASONING_INTEGRATION.md` |
| 2 — Back / RDF | Cycle CRUD avant/après dans le SPARQL Explorer ; **garde-fous** (SERVICE, LOAD, FROM, USING, GRAPH refusés ; effacement massif refusé ; sauvegarde avant suppression) ; **persistance** après redémarrage et **récupération** d'un fichier corrompu ; le bug `USING <file://>` trouvé à l'audit | `docs/SPARQL_VALIDATION_REPORT.md` · `docs/PERSISTENCE_VALIDATION.md` · `npm run test:persistence` |
| 3 — Front gestion | Parcours Dashboard → CRUD → compteurs mis à jour ; messages d'erreur par champ, états de chargement/erreur ; résultats des 42 tests navigateur | `docs/MANUAL_CRUD_TEST_REPORT.md` · `npm run test:e2e` |
| 4 — NLP | Chaque étape du pipeline ; **négation** (marqueur, portée, `FILTER NOT EXISTS`, refus des cas non sûrs) ; rôles incompatibles ; absence d'API LLM (`llm:false`) ; limites | `docs/NLP_PIPELINE.md` · `docs/NLP_VALIDATION_REPORT.md` · `npm run report:nlp` |
| 5 — Explorateurs / intégration | Ontographe, SPARQL Explorer, recherche NLP, déroulé de 12 minutes ; lancer la pile complète et l'ensemble des tests | `docs/GUIDE_DEMO.md` · `docs/FINAL_PROJECT_AUDIT.md` |

Tous : savoir répondre à « RDFLib raisonne-t-il ? » (non — voir `OWL_REASONING_INTEGRATION.md`) et « pourquoi pas de LLM ? » (contrainte du professeur, module maison).
