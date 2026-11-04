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

```bash
git init && git add . && git commit -m "Base du projet"      # une seule fois (le dépôt n'est pas encore initialisé)
git checkout -b feat/<module>                                # une branche par étudiant
# … travail, puis :
npm test                                                     # doit rester vert avant toute fusion
git rebase main && git push && ouvrir une Pull Request
```

Ordre d'intégration conseillé : 1 (ontologie) → 2 (back) → 4 (NLP) → 3 (front gestion) → 5 (explorateurs, intégration).
Conflits probables : `frontend/src/lib/{types,services}.ts` et `components/layout/AppLayout.tsx` (ajouter des lignes, ne pas réordonner).

## Checklist par étudiant avant la soutenance

1. Ontologie : exécuter HermiT, capturer l'inférence (`ContratActif`, `SinistreExpertise`), proposer l'inverse de `possede`.
2. Back : présenter un cycle CRUD complet dans le SPARQL Explorer (avant/après), les garde-fous et la persistance après redémarrage.
3. Front : parcours Dashboard → CRUD → mise à jour immédiate des statistiques.
4. NLP : expliquer chaque étape du pipeline, les limites, démontrer l'absence d'API LLM (`llm:false`, aucune clé, aucun appel réseau sortant).
5. Explorateurs : ontographe, requêtes SPARQL, recherche NLP, plan de démonstration.
