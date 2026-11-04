# Checklist des tâches restantes — AutoInsure Semantic Explorer

> Créée au début de l'audit (Phase 0) et **mise à jour à la fin** : chaque case cochée renvoie à une preuve exécutée (fichier de rapport ou commande). Rien n'est coché sans exécution vérifiée.
> Date de l'audit : 2026-11-04 · Machine : Windows 11, Node 24, Python 3.11 (venv), Git (dépôt existant).

## État constaté au démarrage (Phase 0)

| Élément | Constat |
|---|---|
| Dépôt Git | **Existant** (branche `main`, remote `origin` = `slim00077/AutoInsure-Semantic-Explore`, 1 commit, arbre propre). `docs/REPARTITION_TRAVAIL.md` affirmait à tort que le dépôt n'était pas initialisé. |
| Ontologie | `ontology/assurance_auto.xml` = copie **byte-identique** de `resources/assurance_auto.xml` (SHA-256 `bb56e6db…0483`). Extensions dans `ontology/assurance_auto_extensions.ttl`. |
| Tests existants | pytest **66** ✔ · Vitest back **63** ✔ · Vitest front **6** ✔ (relancés, pas repris du rapport précédent). |
| Java | **Absent** (`java` introuvable). `winget` v1.29 présent. |
| Playwright / E2E | Aucun test navigateur. Les formulaires CRUD n'avaient jamais été testés dans un navigateur. |
| HermiT | Jamais exécuté. |
| Négation NLP | **Non gérée** : « Quels contrats ne couvrent pas le vol ? » renvoyait le contrat qui couvre le vol (négation ignorée silencieusement). |
| Secrets | `backend/.env` ignoré par Git (uniquement des variables non secrètes : PORT, CORS_ORIGIN, SEMANTIC_URL, DATA_DIR, LOG_LEVEL). Aucune clé API ni dépendance LLM. |

## Phases

- [x] **Phase 0 — Inspection** : README, docs/, code (store, NLP, routes Express, pages React), tests lus et exécutés. *(ce fichier)*
- [x] **Phase 1 — Java + HermiT** : JDK Temurin 21.0.13 installé au niveau utilisateur, HermiT exécuté sur l'ontologie d'origine → **cohérente**, 0 classe insatisfiable, `ContratActif`/`SinistreExpertise` inférées. → [HERMIT_VALIDATION.md](HERMIT_VALIDATION.md)
- [x] **Phase 2 — Extensions** : original intact (hash), extensions chargées par RDFLib et par OWLAPI/HermiT, `statutSinistre` et `contenuDocument` fonctionnels, aucun conflit d'identifiant. → [ONTOLOGY_EXTENSION_VALIDATION.md](ONTOLOGY_EXTENSION_VALIDATION.md) *(Protégé GUI non installé : voir « Bloqué / limité »)*
- [x] **Phase 3 — Raisonnement OWL** : frontière SPARQL / OWL documentée et testée ; bug corrigé (suppression d'un seul sens d'un `owl:inverseOf` silencieusement annulée). → [OWL_REASONING_INTEGRATION.md](OWL_REASONING_INTEGRATION.md)
- [x] **Phase 4 — CRUD navigateur** : 42 tests Playwright (7 modules : créer / lire / modifier / supprimer + cas d'erreur), pile isolée, graphe revenu exactement à 846 triplets. → [MANUAL_CRUD_TEST_REPORT.md](MANUAL_CRUD_TEST_REPORT.md)
- [x] **Phase 5 — NLP** : négation explicite (portée → `FILTER NOT EXISTS`), refus des rôles incompatibles et des demandes d'écriture, majuscules ; 86/86 cas conformes à une vérité terrain SPARQL. → [NLP_VALIDATION_REPORT.md](NLP_VALIDATION_REPORT.md)
- [x] **Phase 6 — SPARQL** : 3 vrais défauts corrigés (lecture de fichiers via `USING`, effacement massif, erreurs paresseuses en HTTP 500). → [SPARQL_VALIDATION_REPORT.md](SPARQL_VALIDATION_REPORT.md)
- [x] **Phase 7 — Persistance** : 26 vérifications (redémarrage Python puis Express, UI React, sauvegardes, fichier corrompu → récupération). → [PERSISTENCE_VALIDATION.md](PERSISTENCE_VALIDATION.md)
- [x] **Phase 8 — Git** : état inspecté, `.gitignore` complété, aucun secret suivi, commit préparé sur une branche dédiée, **rien n'est poussé**. → section Git de [FINAL_PROJECT_AUDIT.md](FINAL_PROJECT_AUDIT.md)
- [x] **Phase 9 — Démo** : [GUIDE_DEMO.md](GUIDE_DEMO.md), [REPARTITION_TRAVAIL.md](REPARTITION_TRAVAIL.md) et [README](../README.md) mis à jour.
- [x] **Phase 10 — Vérification finale** : toutes les suites relancées. → [FINAL_PROJECT_AUDIT.md](FINAL_PROJECT_AUDIT.md)

## Bloqué / limité (voir détail dans le rapport final)

- [ ] **Protégé (interface graphique)** non installé sur la machine → non automatisable. Remplacé par un utilitaire Java (OWLAPI 5.1.9 + HermiT) qui exécute le même raisonneur ; marche à suivre manuelle fournie dans [HERMIT_VALIDATION.md](HERMIT_VALIDATION.md#annexe--reproduire-dans-protégé-pour-la-soutenance).
- [ ] `winget install … --scope user` impossible pour Temurin (« aucun programme d'installation applicable ») : l'archive officielle ZIP a été utilisée à la place (hash vérifié).
- [ ] **Push GitHub** : volontairement non effectué (action sortante, non demandée). À faire par l'équipe après relecture.
