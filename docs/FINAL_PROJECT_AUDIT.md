# Audit final du projet — AutoInsure Semantic Explorer

> Audit réalisé le 2026-11-04 (machine Windows 11, Node 24, Python 3.11, JDK Temurin 21.0.13 installé pendant l'audit).
> Règle suivie : **rien n'est déclaré terminé sans exécution vérifiée**. Les chiffres ci-dessous proviennent de la dernière exécution complète (section 7) ; les rapports détaillés sont liés.

## 0. Synthèse en 6 lignes

1. **HermiT exécuté** (Java installé au niveau utilisateur) : ontologie **cohérente**, 0 classe insatisfiable, `ContratActif` et `SinistreExpertise` correctement inférées ; les réponses de l'application sont **identiques** aux inférences de HermiT.
2. **Formulaires CRUD testés dans un vrai navigateur** : 42 tests (7 modules), graphe revenu exactement à son état initial.
3. **Négation NLP** implémentée proprement (portée → `FILTER NOT EXISTS`), refus des rôles incompatibles et des demandes d'écriture ; 86/86 questions conformes à une vérité terrain SPARQL.
4. **9 défauts réels corrigés** (dont une **lecture de fichiers locaux via `USING <file://>`** et l'**effacement total du graphe** via `DELETE WHERE { ?s ?p ?o }`).
5. **Persistance** vérifiée de bout en bout (redémarrage Python puis Express, interface React, fichier corrompu → récupération).
6. **Rien n'est poussé sur GitHub** ; un commit propre est prêt sur la branche `chore/audit-hermit-e2e-nlp-negation`.

## 1. Tâches terminées

| Phase | Livrable | Preuve |
|---|---|---|
| 0 Inspection | Checklist | [REMAINING_TASKS.md](REMAINING_TASKS.md) |
| 1 Java + HermiT | JDK 21 installé (utilisateur, hash vérifié) ; HermiT sur l'ontologie d'origine ; 49 vérifications ✔ | [HERMIT_VALIDATION.md](HERMIT_VALIDATION.md), `hermit/hermit_output.txt` |
| 2 Extensions | Original intact ; `statutSinistre` / `contenuDocument` chargés (RDFLib et OWLAPI), sans conflit | [ONTOLOGY_EXTENSION_VALIDATION.md](ONTOLOGY_EXTENSION_VALIDATION.md) |
| 3 Raisonnement OWL | Frontière SPARQL/OWL documentée et testée ; recoupement application ↔ HermiT 12/12 | [OWL_REASONING_INTEGRATION.md](OWL_REASONING_INTEGRATION.md) |
| 4 CRUD navigateur | 42 tests Playwright + 23 (explorateurs/NLP/démarrage), captures | [MANUAL_CRUD_TEST_REPORT.md](MANUAL_CRUD_TEST_REPORT.md), `screenshots/` |
| 5 NLP | Négation, rôles, écriture, majuscules, existence ; 86 cas | [NLP_VALIDATION_REPORT.md](NLP_VALIDATION_REPORT.md), [NLP_PIPELINE.md](NLP_PIPELINE.md) |
| 6 SPARQL | Sécurité et fonctionnalités, 3 défauts corrigés | [SPARQL_VALIDATION_REPORT.md](SPARQL_VALIDATION_REPORT.md) |
| 7 Persistance | 26 vérifications de bout en bout + récupération d'un fichier corrompu | [PERSISTENCE_VALIDATION.md](PERSISTENCE_VALIDATION.md) |
| 8 Git | État inspecté, `.gitignore` complété, commit prêt (non poussé) | §11 |
| 9 Démo | Guide de 12 min, questions du jury, répartition, README | [GUIDE_DEMO.md](GUIDE_DEMO.md), [REPARTITION_TRAVAIL.md](REPARTITION_TRAVAIL.md) |
| 10 Vérification finale | Toutes les suites relancées | §7 |

### Défauts réels trouvés puis corrigés (avec test de non-régression)

| # | Défaut | Où | Test |
|---|---|---|---|
| 1 | `USING <file:///…>` / `WITH` / `FROM` : RDFLib **chargeait** l'URI → lecture de fichiers locaux, SSRF | `store.py` | `test_using_clause_never_reads_local_files` + 20 autres |
| 2 | `DELETE WHERE { ?s ?p ?o }` effaçait les 846 triplets et le fichier persistant | `store.py` | `test_mass_delete_is_refused_and_rolled_back` |
| 3 | Erreur d'évaluation SPARQL paresseuse → HTTP 500 | `store.py` | `test_http_status_codes` |
| 4 | Suppression d'un seul sens d'un `owl:inverseOf` silencieusement annulée (`removed: 0`) | `store.py` | `test_deleting_one_direction_removes_both` |
| 5 | Fichier persistant illisible → le service ne démarrait plus | `store.py` | `test_persistence.py` (8) |
| 6 | **Négation ignorée** : « Quels contrats ne couvrent pas le vol ? » renvoyait le contrat qui couvre le vol | NLP | `test_nlp_negation.py` (40) |
| 7 | « Évalués par **Ahmed** » (assuré) / « conduits par l'**expert** Karim » exécutés en silence avec le mauvais rôle | NLP | idem |
| 8 | « Supprime tous les contrats » transformé en liste ; « Qui a déclaré… » renvoyait des sinistres ; question en MAJUSCULES comprise de travers | NLP | idem |
| 9 | Requête SPARQL vide sans retour visuel | front | Playwright |

## 2. Tâches partiellement réalisées

| Tâche | Ce qui est fait | Ce qui manque |
|---|---|---|
| **Protégé (GUI)** | OWLAPI 5.1.9 (même bibliothèque que Protégé) + HermiT exécutés par un utilitaire reproductible | Ouverture manuelle dans Protégé non effectuée (non installé) ; marche à suivre fournie |
| **Tests « manuels » navigateur** | Automatisés (Playwright, Chrome), captures relues en partie | Pas de test humain à l'écran ; Firefox / Safari / mobile / accessibilité non testés |
| **Raisonnement dans l'application** | Équivalents SPARQL de `ContratActif` / `SinistreExpertise` **prouvés égaux à HermiT** | Pas de raisonneur dans le runtime (choix assumé : Java hors runtime) |
| **Négation NLP** | Types, statuts, entités, existences, `mais pas`, `ni` | Montants/dates et « ne … que » **refusés** (non implémentés) |
| **Robustesse SPARQL** | Fichiers/réseau/graphes/effacement massif | Pas de délai maximal d'exécution |

## 3. Tâches bloquées (permissions système / prérequis externes)

| Blocage | Détail exact | Contournement |
|---|---|---|
| `winget install … Temurin … --scope user` | Code 16 : « Aucun programme d'installation applicable » (le MSI Temurin n'existe qu'en installation machine) | ZIP officiel Adoptium + SHA-256 vérifié, installé dans `%LOCALAPPDATA%\Programs\Java` (aucune élévation de droits) |
| Protégé non installé | Aucune installation détectée ; pas de téléchargement/installation de logiciel graphique sans nécessité | Utilitaire Java |
| `git push` | Non demandé (action sortante) | Commit local prêt, voir §11 |
| Une commande de nettoyage `rm` a été refusée par la protection de l'outil | Seuls des fichiers de sortie ignorés par Git étaient visés ; non nécessaire | Non contournée |

## 4. Fichiers créés

**Documentation** (`docs/`) : `REMAINING_TASKS.md`, `HERMIT_VALIDATION.md`, `ONTOLOGY_EXTENSION_VALIDATION.md`, `OWL_REASONING_INTEGRATION.md`, `MANUAL_CRUD_TEST_REPORT.md`, `NLP_VALIDATION_REPORT.md` (généré), `SPARQL_VALIDATION_REPORT.md`, `PERSISTENCE_VALIDATION.md`, `FINAL_PROJECT_AUDIT.md` ; données : `hermit/hermit_output.txt`, `hermit/crosscheck_output.json`, `nlp_validation_results.json`, `persistence_results.json`, `playwright_results.json` ; `screenshots/` (29 captures).
**Tests Python** (`semantic-service/tests/`) : `test_sparql_security.py` (47), `test_nlp_negation.py` (40), `test_reasoning.py` (16), `test_extensions.py` (11), `test_persistence.py` (8).
**Outils** : `semantic-service/tools/nlp_validation_report.py` ; `tools/hermit-validator/{pom.xml, run.mjs, crosscheck.mjs, src/main/java/fr/autoinsure/HermitValidation.java}`.
**E2E** : `e2e/{package.json, package-lock.json, playwright.config.ts, stack-server.mjs, persistence.mjs, lib/stack.mjs, tests/{smoke,crud,explorers}.spec.ts}`.

## 5. Fichiers modifiés

| Fichier | Modification |
|---|---|
| `semantic-service/app/store.py` | `_forbidden_reason` (FROM/USING/WITH/GRAPH/SERVICE), garde-fou d'effacement massif, sauvegarde avant suppression + rotation, suppression symétrique des inverses, récupération d'un fichier illisible, erreurs paresseuses |
| `semantic-service/app/config.py`, `main.py` | seuils (`MAX_DELETE_*`, `KEEP_UPDATE_BACKUPS`) ; `/health` expose `recovery` |
| `semantic-service/app/nlp/{analyzer,lexicon,templates,service}.py` | négation (cibles, portée, `NOT EXISTS`), rôles stricts, écriture, majuscules, « qui », existence positive |
| `backend/tests/{sparql,nlp}.test.ts` | +7 tests API |
| `frontend/src/pages/{SemanticSearch,SparqlExplorer}.tsx`, `lib/types.ts` | affichage de l'analyse de négation ; message pour requête vide |
| `package.json`, `scripts/run-semantic.mjs`, `.gitignore` | scripts `test:e2e`, `test:persistence`, `test:hermit[:cross]`, `report:nlp`, `setup:e2e` ; ignorés : sorties Playwright, `tools/hermit-validator/target/`, `*.corrupt-*.ttl` |
| `README.md`, `docs/{API,ARCHITECTURE,GUIDE_DEMO,NLP_PIPELINE,ONTOLOGIE,REPARTITION_TRAVAIL}.md` | mises à jour (HermiT exécuté, 40 → 38 DataProperties de l'original, dépôt Git existant, négation, sécurité, tests) |

**Non modifiés** : `ontology/assurance_auto.xml` et `resources/*` (SHA-256 identique), `ontology/assurance_auto_extensions.ttl`, `backend/.env`, `data/`.

## 6. Commandes exécutées (principales)

```
winget --version ; winget search/install --id EclipseAdoptium.Temurin.21.JDK --scope user   (échec code 16)
Adoptium API + téléchargement ZIP + Get-FileHash SHA-256 ; Expand-Archive ; [Environment]::SetEnvironmentVariable(JAVA_HOME / Path, "User")
java -version ; javac -version
Téléchargement Maven 3.9.9 (Maven Central, SHA-512) ; mvn dependency:copy-dependencies ; javac ; java fr.autoinsure.HermitValidation
python -m pytest ; npm test (backend, frontend) ; npm run build
npm install (e2e) ; npx playwright test ; node e2e/persistence.mjs
node tools/hermit-validator/crosscheck.mjs ; python tools/nlp_validation_report.py
git status/branch/remote/log/diff/check-ignore/grep (lecture seule) ; git checkout -b chore/audit-hermit-e2e-nlp-negation ; git add ; git commit
```

Aucune commande destructrice (`git reset --hard`, `migrate:fresh`, suppression de données) n'a été lancée ; aucune variable d'environnement ou secret existant n'a été modifié (`backend/.env` n'a pas été lu au-delà des **noms** de clés).

## 7. Résultats des tests (dernière exécution complète)

Chaque suite a été relancée **à neuf** en fin d'audit (aucun résultat repris d'un rapport précédent). Test Playwright : exécution complète juste avant les dernières modifications, qui n'ont porté que sur la documentation et `.gitignore`.

| Suite | Commande | Résultat |
|---|---|---|
| **Python** (store, SPARQL, sécurité, persistance, extensions, raisonnement, NLP) | `pytest` | **188 / 188** ✔ (avant l'audit : 66) |
| **API** (Express + service Python de test) | `npm test` (backend) | **70 / 70** ✔ (avant : 63) |
| **Front-End** (unitaires) + type-check + build de production | `npm test` (frontend), `npm run build` | **6 / 6** ✔ ; build ✔ (avertissement de taille de chunk, sans gravité) |
| **Playwright** (navigateur Chrome, pile isolée) | `npx playwright test` | **65 / 65** ✔, 0 instable, 0 ignoré, 6 min 08 s — dont 42 CRUD, 22 explorateurs/NLP, 1 démarrage |
| **HermiT** (ontologie d'origine + extensions) | `npm run test:hermit` | **49 / 49** ✔ — cohérente, 0 insatisfiable, classes définies inférées |
| **Recoupement application ↔ HermiT** | `npm run test:hermit:cross` | **12 / 12** ✔ |
| **Validation des extensions** | `test_extensions.py` + HermiT section B | **11 / 11** + 10 vérifications HermiT ✔ |
| **NLP** (86 questions, vérité terrain SPARQL) | `npm run report:nlp` | **86 / 86** ✔ + 40 tests `test_nlp_negation.py` + 49 `test_nlp.py` + 4 tests API |
| **Sécurité SPARQL** | `test_sparql_security.py` + API + Playwright | **47 + 3 + 12** ✔ |
| **Persistance / redémarrages** | `npm run test:persistence` | **26 / 26** ✔ + 8 tests `test_persistence.py` |

Aucun résultat n'a été inventé : les sorties brutes sont dans `hermit/`, `persistence_results.json`, `playwright_results.json`, `nlp_validation_results.json`.

## 8. Limites connues

1. **RDFLib ne raisonne pas** ; HermiT est hors runtime (Java). `ContratActif`/`SinistreExpertise` sont répondus par des filtres équivalents.
2. **Monde ouvert vs fermé** : les contrôles de l'application sont en monde fermé ; un `INSERT DATA` brut n'est pas bloqué par les axiomes.
3. NLP : français, une question à la fois ; négation de montants/dates refusée ; vocabulaire limité au dictionnaire ; dépend du modèle spaCy `md`.
4. SPARQL : pas de timeout ; le seuil anti-effacement est une heuristique ; pas d'authentification.
5. Persistance : récupération = dernière sauvegarde (peut être antérieure aux dernières écritures) ; un seul processus Python par `DATA_DIR` ; projet dans **OneDrive** (conflits de synchronisation possibles).
6. Tests navigateur : Chrome seulement ; les formulaires sont repérés par leurs libellés.
7. Individus insérés sans `owl:NamedIndividual` invisibles du validateur/NLP.
8. Aucune validation sur Linux/macOS (scripts écrits multiplateformes mais exécutés uniquement sous Windows).

## 9. Lancer le projet final

```bash
npm run setup                      # une fois : venv Python + dépendances + modèle spaCy + npm install
npm run dev                        # Python 8001 · Express 4000 · React 5173
npm test                           # pytest + Vitest back
npm run test:frontend              # Vitest front
npm run setup:e2e && npm run test:e2e        # Playwright (Chrome requis), pile isolée
npm run test:persistence           # redémarrages, sauvegardes, récupération
npm run test:hermit:cross          # HermiT : JDK 17+ et Maven requis (installés dans %LOCALAPPDATA%\Programs sur cette machine)
npm run report:nlp                 # régénère docs/NLP_VALIDATION_REPORT.md
```

Nouveau terminal : `JAVA_HOME` et `PATH` utilisateur sont déjà définis (redémarrer VS Code / le terminal ouvert avant l'audit).

## 10. Ce que les cinq membres doivent savoir pour la soutenance

1. **RDFLib ne raisonne pas.** Dire clairement : triplets + SPARQL ; inverses matérialisées ; `subClassOf*` ; axiomes appliqués par l'API ; raisonnement OWL = HermiT.
2. **HermiT a été exécuté** : cohérente, 0 insatisfiable, `ContratActif` = C-001..003, `SinistreExpertise` = S-001/S-003 ; savoir expliquer *monde ouvert* (contrat sans prime = pas d'incohérence) et *pas de nom unique*.
3. **Aucun LLM** : spaCy + NLTK + RDFLib + règles + templates. `llm:false`.
4. **Négation** : marqueur → portée → `FILTER NOT EXISTS` ; ce qui est **refusé** et pourquoi (jamais ignoré).
5. **Sécurité SPARQL** : citer le bug `USING <file://>` trouvé et corrigé ; effacement massif refusé ; sauvegardes.
6. **L'ontologie d'origine n'est pas modifiée** (hash) ; extensions séparées.
7. **Démo** : suivre [GUIDE_DEMO.md](GUIDE_DEMO.md) ; réchauffer spaCy avant ; date du sinistre dans la période du contrat ; `DATA_DIR` hors OneDrive.
8. **Répartition** : chacun a une checklist dans [REPARTITION_TRAVAIL.md](REPARTITION_TRAVAIL.md) ; ne jamais `git init`, ne jamais `git push --force`.
9. Être honnête sur les limites (§8) : le jury apprécie un périmètre clair.

## 11. Git (Phase 8)

| Contrôle | Constat |
|---|---|
| Dépôt | **Existant** — pas de `git init` |
| Branche initiale | `main` (alignée sur `origin/main` au moment du contrôle, 1 commit) ; travail déplacé sur **`chore/audit-hermit-e2e-nlp-negation`** |
| Remote | `origin` = `https://github.com/slim00077/AutoInsure-Semantic-Explore.git` — **conservé** |
| `.env` exclu / `.env.example` inclus | ✔ (`backend/.env` ignoré ; 4 `.env.example` suivis) |
| `node_modules`, `.venv`, `dist`, `data/*`, sorties Playwright, `target/` | ✔ ignorés |
| Ontologie d'origine, extensions TTL, docs | ✔ inclus |
| Secrets / clés / LLM | ✔ aucune clé trouvée (`git grep`), aucune dépendance LLM |
| Fichiers volumineux | PDF de cours 10 Mo (déjà suivi) ; captures `docs/screenshots` 3,7 Mo ajoutées |
| Historique | non réécrit ; **aucun push, aucun `--force`** |

**Sûr à pousser ?** Oui sur une **nouvelle branche** (`git push -u origin chore/audit-hermit-e2e-nlp-negation`) puis Pull Request : elle ne modifie pas `main` et ne peut pas écraser le travail des autres. Avant : `git fetch origin` et vérifier que `origin/main` n'a pas avancé (sinon `git rebase origin/main`, sans `--force` sur `main`). Les fins de ligne : le dépôt utilise `core.autocrlf=true`, d'où des avertissements LF→CRLF sans conséquence.
