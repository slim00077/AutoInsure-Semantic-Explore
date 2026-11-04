# Documentation de l'API REST

Base : `http://localhost:4000/api` · JSON · CORS configurable. Le service Python (`:8001`) a sa propre doc Swagger sur `/docs` (usage interne).

## Conventions

- Listes : `{ items, total, page, pageSize }` ; paramètres `q` (recherche plein texte), `page`, `pageSize` (≤ 500), `sort`, `order`.
- Création `201`, suppression `204`, lecture/modification `200`.
- Erreur : `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "path": "nom", "message": "requis" }] } }`

| Code HTTP | `code` | Signification |
|---|---|---|
| 400 | `BAD_REQUEST`, `BAD_JSON`, `SPARQL_ERROR` | requête mal formée, JSON invalide, syntaxe SPARQL |
| 403 | `SPARQL_FORBIDDEN` | opération interdite : `SERVICE`, `LOAD/CLEAR/DROP/CREATE/COPY/MOVE/ADD`, `FROM`/`FROM NAMED`/`USING`/`WITH`/`GRAPH` (un seul graphe, aucun accès fichier/réseau) ; **effacement massif** (> max(150, 20 % du graphe) triplets) |
| 404 | `NOT_FOUND` | ressource ou route inconnue |
| 409 | `CONFLICT` | doublon (immatriculation, permis, n° contrat…) ou suppression qui briserait des relations |
| 422 | `VALIDATION_ERROR` | champ invalide, domaine/range OWL non respecté, axiome violé |
| 503 | `SEMANTIC_SERVICE_UNAVAILABLE` | service Python injoignable |

## Santé

`GET /api/health` → `{ status, api, semantic: { triples, source, version, recovery? } }` — `source` vaut `original`, `live` ou `recovered:<sauvegarde>` ; `recovery { corruptFile, restoredFrom, error }` n'apparaît que si le fichier persistant était illisible au démarrage (voir [PERSISTENCE_VALIDATION.md](PERSISTENCE_VALIDATION.md)).

## Ontologie

| Route | Description |
|---|---|
| `GET /ontology/classes` | Classes : parents, enfants, restrictions, équivalences, disjonctions, propriétés, nb d'individus |
| `GET /ontology/properties` | Object/Data properties : domaine, range, fonctionnelle, inverse, usages |
| `GET /ontology/individuals?type=Vehicule` | Individus (sous-classes incluses) avec assertions |
| `GET /ontology/individuals/:id` | Détail + références entrantes |
| `GET /ontology/graph?level=schema\|instances` | Nœuds et arêtes pour l'ontographe |
| `GET /ontology/statistics` | KPI et répartitions (requêtes SPARQL) |
| `GET /ontology/validate` | Validation structurelle |
| `GET /ontology/export?format=xml\|turtle\|nt\|jsonld` | Téléchargement |
| `GET /ontology/activity?limit=20` | Journal d'activité |
| `POST /ontology/reset` | Retour à l'ontologie d'origine (sauvegarde créée) |

## CRUD

Chaque ressource : `GET /x`, `GET /x/:id`, `POST /x`, `PUT|PATCH /x/:id`, `DELETE /x/:id`.

### `/insured` — Assure (+ Conducteur)

Corps : `{ prenom, nom, dateNaissance?, numeroPermis?, conducteur=true }`. Filtres : `conducteur`, `hasContrat`, `hasSinistre`. Suppression refusée si contrats/sinistres.

### `/vehicles` — Voiture | Moto | Camion

Corps : `{ marque, modele, anneeFabrication, immatriculation, valeurVehicule, type, conducteurId?, contratIds[] }`. Filtres : `type`, `marque`, `assureId`, `contratId`. Immatriculation unique.

### `/contracts`

Création : `{ type: AssuranceResponsabiliteCivile|AssuranceIntermediaire|AssuranceTousRisques, dateDebut, dateFin, statutContrat, prime: { montantPrime, frequencePaiement }, assureId, compagnieId?, vehiculeIds[≥1], garanties: [{ type, plafondGarantie? }], clauseIds[], numeroContrat? }`.
Règles : garanties exigées par le type ajoutées automatiquement (réponse : `autoAddedGuarantees`) ; crée Prime, ContratDocument, liens `possede`, `propose`/`estProposePar`, `couvre`/`estCouvertPar`. Filtres : `statut`, `type`, `assureId`, `compagnieId`, `garantie`.

### `/guarantees` (+ `GET /guarantee-types`)

Création : `{ contratId, type, plafondGarantie? }` (un type par contrat). Suppression refusée si mobilisée par un sinistre, exigée par un axiome ou dernière garantie.

### `/claims` (sinistres)

Création : `{ type, dateSinistre, lieuSinistre, descriptionSinistre, statutSinistre?, vehiculeId, assureId, contratId, conducteurId?, garantieIds[], dommages: [{ type, description, gravite, coutEstime, victimeId? | victime: {prenom, nom} }] }`.
Règles : le contrat couvre le véhicule ; l'assuré possède le contrat ; la date est dans la période du contrat ; ≥ 1 dommage. Suppression en **cascade** (dommages, indemnisations, expertises, rapports, déclaration).
Dommages : `POST /claims/:id/damages`, `GET /damages`, `PUT|DELETE /damages/:id` (dernier dommage non supprimable).

### `/expertises` et `/experts`

Expertise : `{ sinistreId, expertId, dateExpertise?, conclusion, dommageIds?, rapport?: { contenuDocument } }`. Un sinistre « Declare » passe « EnExpertise ».

### `/indemnifications`

`{ dommageId, statutIndemnisation, dateIndemnisation?, motifDecision?, baremeId?, franchiseMontant?, montantIndemnisation? }`. Montant omis ⇒ `(coutEstime − franchise) × taux`, plafonné (barème). `POST /indemnifications-simulate { coutEstime, franchise, baremeId }`. Un dommage n'a qu'une indemnisation. Le statut du sinistre est synchronisé (Acceptee → Indemnise, Refusee → Refuse).

### `GET /references`

Compagnies, garages, experts, assurés, conducteurs, barèmes, franchises, clauses et énumérations (types, statuts) pour les formulaires.

## SPARQL

| Route | Corps | Réponse |
|---|---|---|
| `POST /sparql/query` | `{ query, limit? }` | SELECT : `{ variables, rows[{var:{type,value,local,datatype}}], count, truncated, executionMs }` ; ASK : `{ boolean }` ; CONSTRUCT/DESCRIBE : `{ triples }` |
| `POST /sparql/update` | `{ update }` | `{ added, removed, totalTriples, executionMs }` — `INSERT DATA`, `DELETE DATA`, `DELETE/INSERT WHERE` uniquement ; une suppression supprime **aussi l'inverse** (`owl:inverseOf`) ; sauvegarde automatique avant toute suppression |
| `GET /sparql/history` · `DELETE /sparql/history` | | 50 dernières exécutions |
| `GET /sparql/examples` | | 13 exemples |

## NLP

| Route | Corps | Réponse |
|---|---|---|
| `POST /nlp/translate` | `{ question }` | Analyse + SPARQL **sans exécuter** |
| `POST /nlp/search` | `{ question }` | Idem + `executed`, `result`, `executionMs`, `explanation` |
| `GET /nlp/module` | | Bibliothèques (versions), intentions, dictionnaire, pipeline, `llm:false` |
| `GET /nlp/history` | | Historique |

Champs principaux de la réponse : `status` (`ok`, `clarification_needed`, `entity_not_found`, `unsupported` — aussi pour une négation non sûre ou une demande d'écriture —, `empty`, `too_long`), `intent`, `modifiers`, `questionType`, `focusClass`, `confidence`, `tokens[{text,lemma,pos,dep}]`, `spacyEntities`, `concepts`, `entities[{resolved:[{id,label}]}]`, `constraints`, **`negations[{cue,kind,scope,head,dep,negated[{kind,text}],status}]`** (négation détectée : marqueur, portée, critères niés), `sparql`, `valid`, `template`, `fragments`, `steps[{name,ms,detail}]`, `translationMs`, `executionMs`, `explanation`, `libraries`.

Exemple :

```bash
curl -X POST localhost:4000/api/nlp/search -H "Content-Type: application/json" \
  -d '{"question":"Quels contrats couvrent le vol ?"}'
```
