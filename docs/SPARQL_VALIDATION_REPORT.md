# Validation de l'explorateur SPARQL : fonctionnalités et sécurité

> Tests : `semantic-service/tests/test_sparql_security.py` (47), `backend/tests/sparql.test.ts` (+3 tests API), `e2e/tests/explorers.spec.ts` (12 tests navigateur sur SPARQL Explorer).
> Les requêtes hostiles ont d'abord été jouées avec un script d'attaque (« probe ») pour constater le comportement **avant** correction.

## 1. Défauts réels trouvés et corrigés

| # | Défaut constaté (avant) | Gravité | Correction | Test de non-régression |
|---|---|---|---|---|
| 1 | **`INSERT { ?s ?p ?o } USING <file:///…> WHERE { … }`** : RDFLib *charge* l'URI d'un `USING` — le serveur a lu un fichier local (`"FILE-CONTENT-READ-BY-SERVER"` inséré dans le graphe). Même mécanisme pour `USING NAMED`, `WITH` et (réseau) `http://…` : **lecture de fichiers locaux / SSRF** malgré l'interdiction de `SERVICE` et `LOAD` | **Élevée** | `_forbidden_reason()` parcourt l'algèbre SPARQL et refuse **FROM, FROM NAMED, USING, WITH, GRAPH, quads** (403) | `test_using_clause_never_reads_local_files`, `test_query_cannot_leave_the_single_local_graph`, `test_update_is_restricted_to_the_default_graph`, API 403, UI |
| 2 | **`DELETE WHERE { ?s ?p ?o }`** (et `DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }`) supprimait les 846 triplets et **écrasait le fichier persistant**, sans sauvegarde : équivalent exact du `CLEAR` pourtant interdit | **Élevée** (perte de données) | Garde-fou anti-effacement : une mise à jour qui supprimerait plus de `max(150, 20 % du graphe)` triplets est **annulée** (403 + message) ; l'état précédent est restauré, le fichier n'est pas réécrit. Les suppressions ciblées (< seuil) restent permises | `test_mass_delete_is_refused_and_rolled_back`, API 403, UI, persistance |
| 3 | Pas de sauvegarde avant une suppression (un `DELETE` ciblé erroné était irréversible) | Moyenne | Sauvegarde automatique `data/backups/assurance_before_update_*.ttl` avant toute mise à jour qui supprime des triplets (rotation : 30 fichiers) | `test_targeted_delete_is_allowed_and_creates_a_backup`, `test_update_backups_are_rotated` |
| 4 | Les erreurs d'évaluation paresseuse (ex. `GRAPH ?g { … }` sur un graphe sans dataset) étaient levées **hors** du `try` → exception non gérée = **HTTP 500** | Moyenne | L'itération des résultats est incluse dans le `try` ; erreurs → 400 / 403 | `test_dataset_clause_error_is_not_an_unhandled_exception`, `test_http_status_codes` |
| 5 | Requête vide : le bouton *Exécuter* ne faisait rien (aucun retour) | Faible (UX) | Message « La requête est vide… » | `explorers.spec.ts` |

## 2. Matrice de tests

### Fonctionnalités (toutes ✔)

| Besoin | Vérifié par |
|---|---|
| `SELECT`, `FILTER`, `OPTIONAL`, `ORDER BY`, `LIMIT/OFFSET`, `GROUP BY`/agrégats | pytest, Vitest (toutes les requêtes d'exemple), Playwright |
| `ASK`, `CONSTRUCT`, `DESCRIBE` | pytest, Playwright |
| `INSERT DATA`, `DELETE DATA` (aller-retour, compte de triplets restauré), `DELETE/INSERT WHERE` | pytest, Vitest, Playwright |
| Troncature à `MAX_RESULT_ROWS` (5000) / `limit` | `test_limit_and_truncation` |
| Annulation complète si l'Update échoue (atomicité) | `test_update_is_atomic_on_error` (existant) |

### Erreurs et refus (toutes ✔)

| Entrée | Réponse |
|---|---|
| SPARQL invalide (`SELEC …`) | **400** `SPARQL_ERROR`, message de syntaxe affiché |
| Requête vide / espaces | 400 (service) · 422 (API Zod) · message dans l'interface |
| Update envoyé à `/query`, requête envoyée à `/update` | 400 (syntaxe) |
| Corps absent / trop long (> 20 000 / 100 000 car.) | 422 |
| `SERVICE <http://…>` (requête, `OPTIONAL`, Update) | **403** « SERVICE interdit » |
| `FROM <file://…>`, `FROM <http://…>`, `FROM NAMED`, `GRAPH`, `USING`, `WITH`, `INSERT DATA { GRAPH … }` | **403** « un seul graphe, aucun chargement » |
| `CLEAR` (ALL/DEFAULT/GRAPH), `DROP`, `LOAD`, `CREATE`, `COPY`, `MOVE`, `ADD`, y compris en 2ᵉ opération d'un Update composé | **403** « opération interdite » |
| `DELETE WHERE { ?s ?p ?o }` | **403** « supprimerait 846 triplets (limite 169) » |

## 3. Les mises à jour sont-elles limitées au graphe voulu ?

Oui : le store est un `rdflib.Graph` unique (pas un `Dataset`) ; `GRAPH`, `WITH`, `USING`, `FROM [NAMED]` et les quads sont refusés avant exécution, et un test vérifie qu'aucun graphe nommé n'apparaît jamais. Les seuls Updates acceptés sont `INSERT DATA`, `DELETE DATA` et `DELETE/INSERT … WHERE` sur le graphe par défaut.

## 4. Accès fichiers / réseau

Aucune route SPARQL ne peut lire un fichier ni appeler le réseau : `SERVICE`, `LOAD`, `FROM`, `USING`, `WITH` sont rejetés, et le NLP n'insère jamais de texte de la question dans le SPARQL (tests d'injection). À notre connaissance, aucune fonction SPARQL native de RDFLib n'accède aux fichiers ou au réseau, et aucune fonction d'extension n'est enregistrée. Une IRI `file:///…` utilisée comme *donnée* (`INSERT DATA { <file:///etc/passwd> a … }`) n'est qu'un identifiant : rien n'est lu.

## 5. Limites connues (non corrigées)

- **Pas de délai maximal d'exécution** : une requête volontairement coûteuse (produits cartésiens + `ORDER BY`) peut occuper le service ; RDFLib n'offre pas d'interruption fiable. Acceptable pour un projet local ; à protéger (timeout par processus) avant toute exposition réseau.
- Le garde-fou d'effacement massif est une **heuristique** (seuil configurable `MAX_DELETE_MIN`, `MAX_DELETE_FRACTION`) : une suppression ciblée volumineuse légitime (> 20 % du graphe) doit passer par « Réinitialiser ».
- L'API n'est pas authentifiée (hors périmètre du sujet) : toute personne qui atteint le port 4000 peut modifier le graphe dans les limites ci-dessus.
- Un `INSERT DATA` brut peut introduire des données logiquement incohérentes (voir [OWL_REASONING_INTEGRATION.md](OWL_REASONING_INTEGRATION.md)).
