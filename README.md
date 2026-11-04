# AutoInsure Semantic Explorer

> **Ontologie pour l'Assurance Automobile et la Gestion des Sinistres** — projet universitaire de Web Sémantique.
> Application web complète (React + Express + service sémantique Python) construite **sur notre ontologie Protégé `assurance_auto.xml`**, avec recherche en langage naturel → SPARQL réalisée par **notre propre module NLP (spaCy / NLTK / RDFLib), sans aucune API LLM**.

## Sommaire

1. [Problématique et objectifs](#problématique-et-objectifs)
2. [Architecture](#architecture)
3. [Technologies](#technologies)
4. [Structure des dossiers](#structure-des-dossiers)
5. [Installation](#installation) · [Configuration](#configuration) · [Lancement](#lancement)
6. [Fonctionnalités](#fonctionnalités)
7. [API REST](#api-rest)
8. [Ontologie](#ontologie)
9. [Module NLP/TALN](#module-nlptaln)
10. [Exemples SPARQL](#exemples-sparql)
11. [Tests](#tests)
12. [Répartition du travail (5 étudiants)](#répartition-du-travail-5-étudiants)
13. [Limites et points ouverts](#limites-et-points-ouverts)

## Problématique et objectifs

*Comment le Web Sémantique peut-il structurer et interroger efficacement les connaissances de l'assurance automobile et de la gestion des sinistres ?*

- Modéliser la chaîne **Assuré → Contrat → Véhicule → Garantie → Sinistre → Dommage → Expertise → Indemnisation** en OWL (classes, ObjectProperties, DataProperties, individus, axiomes).
- Exploiter l'ontologie comme **base de données sémantique** : CRUD par SPARQL Update, persistance, statistiques calculées par SPARQL.
- Offrir une interface professionnelle : dashboard, explorateur d'ontologie et ontographe, explorateur SPARQL, recherche en français.
- **Contrainte du professeur respectée** : la conversion question → SPARQL n'utilise ni OpenAI, ni Gemini, ni Claude, ni OpenRouter, ni aucune API LLM. Le module repose sur spaCy, NLTK, RDFLib, un dictionnaire de synonymes, des règles et des templates SPARQL contrôlés.

> Note : l'infographie du projet initial évoque une « API IA » pour la partie langage naturel. Elle n'a **pas** été retenue, conformément à l'énoncé du professeur.

## Architecture

```
 Navigateur ──► React/Vite (5173) ──/api──► Express/TypeScript (4000) ──HTTP──► Service sémantique FastAPI (8001)
                                              │ validation Zod                     │ RDFLib : graphe OWL/RDF persistant
                                              │ CRUD → SPARQL Update               │ SPARQL query/update sécurisés
                                              │ journaux secondaires (JSON)        │ introspection OWL, validation
                                                                                   │ NLP : spaCy + NLTK + règles + templates
                                                                                   ▼
                                                              data/assurance_live.ttl  (graphe persistant)
                                                              ontology/assurance_auto.xml (original, intact)
```

- **Source de vérité = graphe RDF/OWL** (RDFLib). Aucune base MySQL. Seuls l'historique SPARQL/NLP et le journal d'activité sont stockés en JSON (`data/*.json`), à titre secondaire.
- **Fuseki** n'a pas été retenu : Java n'est pas requis et RDFLib suffit pour 850 triplets. Le service expose la même interface (`/sparql/query`, `/sparql/update`) : migrer vers Fuseki ne toucherait que `backend/src/semantic/client.ts`.
- Détails et diagrammes : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Technologies

| Couche | Outils |
|---|---|
| Front-End | React 18, Vite, TypeScript, Tailwind CSS 4, React Router, Axios, Lucide, Recharts, Framer Motion, React Flow + Dagre (ontographe) |
| Back-End | Node.js, Express 4, TypeScript, Zod (validation), CORS, dotenv |
| Web sémantique | OWL, RDF, SPARQL 1.1, **RDFLib 7**, Protégé, HermiT (côté Protégé) |
| NLP/TALN | **spaCy 3.8** (`fr_core_news_md`), **NLTK 3.9** (distance d'édition), règles, dictionnaire de synonymes, templates SPARQL |
| Service | Python 3.11, FastAPI, Uvicorn |
| Tests | pytest, Vitest, Supertest |

Rôle de chaque bibliothèque NLP : spaCy → tokenisation, lemmes, POS, dépendances, NER ; NLTK → `edit_distance` pour tolérer les fautes de frappe dans l'appariement des entités ; RDFLib → gazetteer des individus, validation et exécution SPARQL.

## Structure des dossiers

```
projetweb/
├── resources/                    Fichiers fournis (XML, PDF, DOCX, infographie) — non modifiés
├── ontology/
│   ├── assurance_auto.xml        Copie byte-identique de l'ontologie officielle
│   └── assurance_auto_extensions.ttl   Extensions contrôlées (statutSinistre, contenuDocument)
├── semantic-service/             Python : RDFLib + FastAPI + NLP
│   ├── app/store.py              Triple store, SPARQL sécurisé, persistance
│   ├── app/ontology_info.py      Classes, propriétés, graphe, statistiques, validateur
│   ├── app/nlp/                  lexicon · gazetteer · analyzer · templates · service
│   └── tests/                    66 tests pytest
├── backend/                      Express/TypeScript
│   ├── src/domain/               Logique métier par entité (insured, vehicles, contracts, claims…)
│   ├── src/semantic/             Client du service, constructeur SPARQL Update sûr, index des individus
│   ├── src/routes/               Routes REST
│   └── tests/                    63 tests Vitest/Supertest (service Python de test lancé automatiquement)
├── frontend/                     React : pages, composants, hooks, services Axios typés
├── scripts/                      setup, dev, run-semantic (multi-plateforme)
├── data/                         Graphe persistant, sauvegardes, journaux (ignoré par Git)
└── docs/                         Architecture, API, NLP, ontologie, répartition, démo
```

## Installation

Prérequis : **Node.js ≥ 20**, **Python 3.10–3.12** (3.11 recommandé : roues spaCy), accès Internet pour le premier téléchargement.

```bash
npm run setup          # venv Python + dépendances + modèle spaCy fr_core_news_md + npm install (backend, frontend)
```

Équivalent manuel :

```bash
cd semantic-service && py -3.11 -m venv .venv          # Windows (python3 -m venv .venv sous Linux/macOS)
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m spacy download fr_core_news_md
cd ../backend && npm install && cd ../frontend && npm install
```

## Configuration

Copier les fichiers d'exemple (aucun secret requis, **aucune clé API LLM**) :

| Fichier | Variables |
|---|---|
| `backend/.env.example` → `backend/.env` | `PORT`, `CORS_ORIGIN`, `SEMANTIC_URL`, `DATA_DIR`, `LOG_LEVEL` |
| `frontend/.env.example` → `frontend/.env` | `VITE_API_URL` (vide en développement : proxy Vite) |
| Variables du service Python | `DATA_DIR`, `ONTOLOGY_PATH`, `EXTENSIONS_PATH`, `SPACY_MODEL` |

## Lancement

```bash
npm run dev            # démarre les 3 processus avec logs préfixés
```

ou séparément (3 terminaux) :

```bash
npm run dev:semantic   # http://127.0.0.1:8001  (docs Swagger : /docs)
npm run dev:backend    # http://localhost:4000/api
npm run dev:frontend   # http://localhost:5173
```

Au premier démarrage, le service charge `ontology/assurance_auto.xml` + les extensions, matérialise les `owl:inverseOf`, puis écrit `data/assurance_live.ttl`. Aux démarrages suivants, c'est ce fichier qui est rechargé : **les modifications persistent**. Le bouton *Réinitialiser* (Ontology Explorer) ou `POST /api/ontology/reset` revient à l'ontologie d'origine (sauvegarde automatique dans `data/backups/`).

Build de production : `npm run build` (backend → `backend/dist`, frontend → `frontend/dist`).

## Fonctionnalités

| Page | Contenu |
|---|---|
| **Accueil** | Présentation du projet, de l'ontologie, de la recherche sémantique ; chiffres réels lus dans l'API |
| **Dashboard** | KPI (classes, propriétés, individus, contrats, véhicules, sinistres, indemnisations), graphiques par type de contrat/sinistre/garantie, statut des indemnisations, sinistres par mois, activité récente, état de cohérence — **tout calculé par SPARQL** |
| **Ontology Explorer** | Hiérarchie interactive, détail de classe (propriétés, restrictions, individus), propriétés (domaine/range/inverse), individus, **ontographe** (schéma et instances), validation de cohérence, export RDF/XML (Protégé) |
| **Assurés / Véhicules / Contrats / Sinistres / Expertises / Indemnisations** | CRUD complet, recherche, filtres, fiches détail, relations conservées, erreurs de validation par champ |
| **Garanties** | Les 6 sous-classes de `Garantie` avec instances réelles, plafonds, garanties exigées par les axiomes |
| **SPARQL Explorer** | Éditeur, exécution (Ctrl+Entrée), résultats filtrables, export CSV, erreurs expliquées, 13 exemples, historique |
| **Recherche NLP** | Pipeline visible : question, tokens/lemmes/POS, intention, entités liées aux individus, concepts et synonymes, SPARQL généré, résultats, explication en français, temps par étape |

## API REST

Résumé (détail : [docs/API.md](docs/API.md)) :

| Domaine | Routes |
|---|---|
| Ontologie | `GET /api/ontology/{classes,properties,individuals,individuals/:id,graph,statistics,validate,export,activity}` · `POST /api/ontology/reset` |
| CRUD | `/api/{insured,vehicles,contracts,guarantees,claims,expertises,indemnifications,experts}` : `GET`, `GET /:id`, `POST`, `PUT/PATCH /:id`, `DELETE /:id` |
| Compléments | `POST /api/claims/:id/damages`, `PUT/DELETE /api/damages/:id`, `GET /api/references`, `GET /api/guarantee-types`, `POST /api/indemnifications-simulate` |
| SPARQL | `POST /api/sparql/query` · `POST /api/sparql/update` · `GET /api/sparql/{history,examples}` |
| NLP | `POST /api/nlp/translate` · `POST /api/nlp/search` · `GET /api/nlp/{module,history}` |

Erreurs uniformes : `{ "error": { "code", "message", "details?" } }` (400 / 403 / 404 / 409 intégrité / 422 validation / 503 service injoignable).

## Ontologie

Notre fichier `assurance_auto.xml` est conservé tel quel (45 classes, 29 ObjectProperties, 40 DataProperties, 56 individus, 14 restrictions de cardinalité/existentielles, 8 groupes de disjonction, 2 classes définies). Analyse complète, lacunes et extensions : [docs/ONTOLOGIE.md](docs/ONTOLOGIE.md).

Extensions contrôlées (fichier séparé `ontology/assurance_auto_extensions.ttl`, compatible Protégé) :

- `statutSinistre` (DatatypeProperty fonctionnelle sur `Sinistre`) — le site doit afficher un statut de sinistre ;
- `contenuDocument` (DatatypeProperty sur `Document`) — texte des rapports d'expertise.

**Cohérence.** Une validation structurelle RDFLib (domaines, ranges, propriétés fonctionnelles, cardinalités, disjonctions, clés uniques, inverses) est exécutée à la demande et dans les tests ; elle réussit sur l'ontologie. **HermiT n'a pas pu être exécuté ici (Java absent de la machine de développement)** : à lancer dans Protégé sur l'export RDF/XML (`Reasoner → HermiT`).

## Module NLP/TALN

Pipeline : question → prétraitement → spaCy (tokens, lemmes, POS, dépendances, NER) → entités liées aux individus OWL → nombres/montants/dates → concepts et synonymes → intention + focus → template SPARQL → validation RDFLib → exécution → explication en français.

- **Intentions** : `SEARCH_VEHICLE`, `SEARCH_INSURED`, `SEARCH_CONTRACT`, `SEARCH_GUARANTEE`, `SEARCH_CLAIM`, `SEARCH_DAMAGE`, `SEARCH_EXPERTISE`, `SEARCH_INDEMNIFICATION` + modificateurs `FILTER_BY_AMOUNT`, `FILTER_BY_DATE`, `FILTER_BY_TYPE` (+ `SEARCH_COMPANY`/`SEARCH_GARAGE`).
- **Synonymes** : voiture = véhicule = automobile ; assuré = client = souscripteur ; remboursement = indemnisation ; couverture = garantie ; etc. (dictionnaire consultable dans l'application).
- **Sécurité** : aucune chaîne de la question n'est insérée dans le SPARQL ; individus = noms locaux validés (regex + existence dans le graphe), classes vérifiées dans l'ontologie, nombres = `Decimal`, filtres par whitelist. Tests d'injection inclus.
- **Honnêteté** : hors domaine, entité inconnue, homonyme ambigu, rôle incompatible (ex. « l'expert Ahmed » alors qu'Ahmed est un assuré) → message explicite, **aucune requête exécutée**.

Documentation détaillée (règles, templates, limites) : [docs/NLP_PIPELINE.md](docs/NLP_PIPELINE.md).

Questions fonctionnelles (testées) : « Quels véhicules sont assurés par Ahmed ? » · « Quels contrats couvrent le vol ? » · « Quels sinistres concernent une Peugeot 208 ? » · « Quel est le montant de l'indemnisation du sinistre 001 ? » · « Quels assurés ont déclaré un accident en 2026 ? » · « Quels contrats couvrent les dommages matériels ? » · « Quels véhicules ont subi un accident ? » · « Quels contrats possèdent une garantie tous risques ? » · « Quels sinistres ont une indemnisation supérieure à 3000 euros ? » · « Quels sinistres ont été évalués par l'expert Trabelsi ? ».
La question *« …évalués par l'expert Ahmed ? »* est refusée avec explication : aucun expert nommé Ahmed n'existe (Ahmed Ben Ali est un assuré). Elle devient exécutable dès qu'on crée un expert Ahmed (page Expertises).

## Exemples SPARQL

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
# Contrats couvrant le vol
SELECT ?contrat ?numero WHERE {
  ?contrat actors:numeroContrat ?numero ; actors:contient ?g .
  ?g a actors:GarantieVol .
}

# Indemnisations > 3000 avec franchise et barème
SELECT ?i ?montant ?franchise ?taux WHERE {
  ?i actors:montantIndemnisation ?montant FILTER(?montant > 3000)
  OPTIONAL { ?i actors:appliqueFranchise/actors:montantFranchise ?franchise }
  OPTIONAL { ?i actors:utiliseBareme/actors:tauxIndemnisation ?taux }
}

# Nombre de sinistres par type (sous-classes)
SELECT ?type (COUNT(?s) AS ?n) WHERE { ?s a ?type . ?type rdfs:subClassOf actors:Sinistre } GROUP BY ?type
```

Les préfixes `actors`, `rdf`, `rdfs`, `owl`, `xsd` sont disponibles sans déclaration. `SERVICE`, `LOAD`, `CLEAR`, `DROP`, `CREATE`, `COPY`, `MOVE` sont refusés.

## Tests

```bash
npm test                 # pytest (66) + Vitest backend (63)
npm run test:python      # chargement ontologie, SPARQL, sécurité, persistance, validateur, NLP
npm run test:backend     # endpoints, CRUD, SPARQL, NLP, erreurs, cas ambigus (démarre son propre service Python sur le port 8101)
npm run test:frontend    # tests unitaires front
```

Les tests CRUD vérifient notamment que le graphe RDF **revient exactement à son nombre de triplets initial** après création puis suppression de toutes les entités, et que la persistance survit à un « redémarrage » du store.

## Répartition du travail (5 étudiants)

| # | Module | Dossiers principaux |
|---|---|---|
| 1 | Ontologie OWL, axiomes, individus, validation HermiT | `ontology/`, `docs/ONTOLOGIE.md`, `semantic-service/app/ontology_info.py` (validateur) |
| 2 | Back-End Express, API REST, RDFLib, CRUD SPARQL, persistance | `backend/src/{domain,semantic,routes}`, `semantic-service/app/{store,main}.py` |
| 3 | Front React : dashboard, assurés, véhicules, contrats | `frontend/src/pages/{Dashboard,Insured,Vehicles,Contracts,Guarantees}.tsx`, `components/ui.tsx` |
| 4 | NLP/TALN : spaCy, intentions, entités, templates SPARQL, tests NLP | `semantic-service/app/nlp/`, `semantic-service/tests/test_nlp.py` |
| 5 | Ontology Explorer, ontographe, SPARQL Explorer, recherche sémantique, intégration | `frontend/src/pages/{OntologyExplorer,SparqlExplorer,SemanticSearch,Claims,Expertises,Indemnifications}.tsx`, `Ontograph.tsx`, `backend/tests` |

Branches Git suggérées : `feat/ontologie`, `feat/backend-rdf`, `feat/frontend-gestion`, `feat/nlp`, `feat/explorers-integration`. Les modules communiquent par des contrats stables (API REST + `frontend/src/lib/types.ts`), donc travaillent en parallèle. Détails : [docs/REPARTITION_TRAVAIL.md](docs/REPARTITION_TRAVAIL.md).

## Limites et points ouverts

- **HermiT non exécuté** dans cet environnement (pas de Java) ; validation structurelle RDFLib à la place. Les classes définies (`ContratActif`, `SinistreExpertise`) ne sont pas inférées côté RDFLib : l'application utilise des filtres équivalents (`statutContrat "Actif"`, `faitObjetDe`).
- Raisonnement léger : seul `owl:inverseOf` est matérialisé (un `DELETE` SPARQL brut peut laisser une inverse orpheline).
- NLP : français uniquement ; recherches (pas de négation ni de raisonnement multi-étapes) ; « accident » = `AccidentCirculation` ; la relation Garantie ↔ type de Dommage n'existe pas dans l'ontologie (« contrats couvrant les dommages matériels » = contrats rattachés à un sinistre ayant provoqué un dommage matériel) ; montants sans devise.
- Pas d'authentification (hors périmètre du sujet) ; l'API n'est pas conçue pour être exposée telle quelle sur Internet.
- Le graphe est chargé en mémoire (adapté à des milliers de triplets, pas à des millions) ; le front principal pèse ~250 ko gzip.
