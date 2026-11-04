# Rapport de tests CRUD dans un navigateur (Playwright)

> **Ce que c'est** : les formulaires CRUD n'avaient jamais été testés dans un navigateur. Ils le sont désormais par des scénarios Playwright pilotant **Google Chrome** (canal `chrome`, 1366×900) — ce sont des tests automatisés qui reproduisent les gestes d'un utilisateur (saisie, clics, listes déroulantes), pas des tests faits « à la main » devant l'écran. Plusieurs captures ont été relues à l'écran pour vérifier le rendu (toutes sont fournies).
> **Résultat : 42 / 42 tests CRUD réussis** (65 / 65 avec les tests des explorateurs ; 0 test instable, 0 ignoré ; durée 6 min 08 s). Sorties : [`playwright_results.json`](playwright_results.json), captures dans [`screenshots/crud/`](screenshots/crud/).

## 1. Isolation des données (aucune donnée du projet n'a été touchée)

- `e2e/stack-server.mjs` démarre une **pile dédiée** : service Python sur **8201**, API Express sur **4100**, Vite sur **5273**, avec un **dossier de données temporaire** (`%TEMP%utoinsure-e2e-*`) supprimé à la fin. Le vrai `data/assurance_live.ttl` et les ports 4000/5173/8001 ne sont pas utilisés.
- Chaque enregistrement de test porte un préfixe identifiable (« Pwtest Automate », immatriculation `PW-123-TT`, contrat `C-901`, lieu « Pwville »…). **Seuls ces enregistrements sont supprimés** (ordre inverse des dépendances). Aucun individu de l'ontologie n'est supprimé.
- Dernier test : **le graphe RDF est revenu exactement à son nombre initial de triplets** (comparaison via `/api/health`), preuve qu'aucun résidu ne subsiste (y compris triplets inverses, dommages, rapport, garanties exigées).

## 2. Ce qui est testé pour chaque module

| Module | CREATE | READ | UPDATE | DELETE | Cas d'erreur testés |
|---|---|---|---|---|---|
| **Assurés** | assuré « Pwtest Automate » (permis, naissance) → toast « Assuré créé dans le graphe RDF » | ligne du tableau + fiche détail + vérification API | permis modifié → toast « Assuré modifié » | suppression confirmée, ligne disparue | formulaire vide, permis invalide (message par champ), **doublon** de permis (409/422) |
| **Véhicules** | véhicule relié au conducteur → toast | tableau + relation inverse côté assuré (API) | valeur modifiée | supprimé | vide, année invalide, **doublon d'immatriculation** |
| **Contrats** | contrat RC (n° `C-901`) : **garantie exigée ajoutée automatiquement** | tableau + API (garanties, véhicule) | prime modifiée (725) | supprimé | vide (assuré/véhicule obligatoires), **doublon de numéro** |
| **Garanties** | garantie *Vol* ajoutée au contrat de test (plafond 4200) | API | plafond modifié (5000) | supprimée | **doublon** (même type sur le même contrat) |
| **Sinistres** | sinistre déclaré avec un dommage → toast « Sinistre déclaré dans le graphe RDF » | tableau + API (statut `Declare`, dommage, véhicule) | statut → `EnExpertise` (extension `statutSinistre`) | supprimé **avec son dommage** | vide ; **relation incorrecte** : seuls les contrats de l'assuré choisi sont proposés (C-001 d'un autre assuré absent) |
| **Expertises** (+ experts) | expert « Pwexpert Verif » puis expertise avec **rapport** (`contenuDocument`) | API (rapport présent) | conclusion modifiée | expertise puis expert supprimés | vide (expert vide, expertise sans sinistre/expert) |
| **Indemnisations** | indemnisation **calculée par barème** (franchise 500) : montant 0 < m < 3500 | API | statut → `Acceptee` | supprimée | vide ; **doublon** : le dommage déjà indemnisé n'est plus proposé |

Transversal : **relations incorrectes** — suppression d'un assuré encore référencé → **409** affiché (« Suppression impossible », l'assuré reste) ; via l'API : conducteur non-`Conducteur`, contrat sans véhicule (**422**), sinistre sans dommage → 4xx ; **état de chargement** (requête ralentie à 2,5 s → squelettes visibles), **état d'erreur** (API injoignable → message + bouton *Réessayer* qui récupère), **erreur serveur 500** affichée proprement, **notifications de succès** (toasts) vérifiées à la création, à la modification et à la suppression ; le dashboard est chargé avec les données de test (capture `18-dashboard-with-test-data.png`, sans assertion sur les valeurs des compteurs).

## 3. Constats pendant la campagne

| Constat | Nature | Action |
|---|---|---|
| Le n° de contrat doit respecter `C-001` (3 chiffres) ; `C-PW1` est refusé avec « format C-001 attendu » | **Règle métier correcte** (le test a été adapté) | aucune |
| Un sinistre dont la date sort de la période du contrat est refusé (« hors de la période du contrat ») | **Règle métier correcte** | aucune (documenté dans le guide de démo) |
| *SPARQL Explorer* : exécuter une requête vide ne donnait **aucun retour** | Défaut d'ergonomie | corrigé (message « La requête est vide… ») |
| Aucun défaut fonctionnel trouvé dans les 7 modules CRUD | — | — |

## 4. Limites de cette campagne

- Un seul navigateur (**Chrome**, bureau). Firefox, Safari, mobile, accessibilité clavier/lecteur d'écran **non testés**.
- Les tests CRUD s'appuient sur des libellés (labels de champs) : un renommage d'interface les casse (ils échouent bruyamment, jamais silencieusement).
- La relecture visuelle humaine reste utile avant la soutenance (captures disponibles).

## 5. Détail des 42 tests CRUD

| Module / zone | Test | Résultat | Durée |
|---|---|---|---|
| 1. Assurés | EMPTY FORM : champs obligatoires signalés, rien n'est créé | ✅ réussi | 7.2 s |
| 1. Assurés | INVALID DATA : permis invalide refusé avec message par champ | ✅ réussi | 4.6 s |
| 1. Assurés | CREATE + success notification + READ | ✅ réussi | 6.9 s |
| 1. Assurés | DUPLICATE : même permis refusé (message d'erreur) | ✅ réussi | 4.4 s |
| 1. Assurés | UPDATE : modification du prénom et du permis | ✅ réussi | 5.8 s |
| 2. Véhicules | EMPTY + INVALID : champs obligatoires et année invalide | ✅ réussi | 6.3 s |
| 2. Véhicules | CREATE (relié au conducteur) + READ | ✅ réussi | 6.5 s |
| 2. Véhicules | DUPLICATE : immatriculation déjà utilisée refusée | ✅ réussi | 4.8 s |
| 2. Véhicules | UPDATE : valeur du véhicule | ✅ réussi | 6.0 s |
| 3. Contrats | EMPTY + règle d'axiome : sans assuré / véhicule le contrat est refusé | ✅ réussi | 5.3 s |
| 3. Contrats | CREATE (RC) : garantie exigée ajoutée automatiquement + READ | ✅ réussi | 9.4 s |
| 3. Contrats | DUPLICATE : numéro de contrat déjà utilisé refusé | ✅ réussi | 5.9 s |
| 3. Contrats | UPDATE : prime et statut | ✅ réussi | 6.5 s |
| 4. Garanties | CREATE (garantie Vol sur le contrat de test) + READ | ✅ réussi | 5.9 s |
| 4. Garanties | DUPLICATE : la même garantie ne peut pas être ajoutée deux fois | ✅ réussi | 4.4 s |
| 4. Garanties | UPDATE : plafond | ✅ réussi | 5.1 s |
| 5. Sinistres | EMPTY : les champs obligatoires sont signalés | ✅ réussi | 4.8 s |
| 5. Sinistres | INCORRECT RELATIONSHIP : le contrat proposé est limité à celui de l'assuré choisi | ✅ réussi | 4.1 s |
| 5. Sinistres | CREATE (avec un dommage) + READ | ✅ réussi | 6.3 s |
| 5. Sinistres | UPDATE : statut du sinistre (extension statutSinistre) | ✅ réussi | 5.8 s |
| 6. Expertises | EMPTY : expertise sans sinistre ni expert refusée | ✅ réussi | 4.6 s |
| 6. Expertises | CREATE expert + READ | ✅ réussi | 5.8 s |
| 6. Expertises | CREATE expertise (avec rapport) + READ | ✅ réussi | 6.4 s |
| 6. Expertises | UPDATE : conclusion de l'expertise | ✅ réussi | 5.1 s |
| 7. Indemnisations | EMPTY : sans dommage choisi, refus | ✅ réussi | 4.7 s |
| 7. Indemnisations | CREATE (calcul par barème) + READ | ✅ réussi | 6.0 s |
| 7. Indemnisations | DUPLICATE : le dommage déjà indemnisé n'est plus proposé | ✅ réussi | 3.8 s |
| 7. Indemnisations | UPDATE : statut Acceptée | ✅ réussi | 6.6 s |
| 8. Intégrité, chargement, erreurs | INCORRECT RELATIONSHIP (UI) : supprimer l'assuré encore référencé est refusé (409) avec message | ✅ réussi | 4.4 s |
| 8. Intégrité, chargement, erreurs | INCORRECT RELATIONSHIP (API) : conducteur non-Conducteur, contrat sans véhicule, sinistre sans dommage → 4xx | ✅ réussi | 0.1 s |
| 8. Intégrité, chargement, erreurs | LOADING STATE : indicateur de chargement visible pendant une requête lente | ✅ réussi | 6.2 s |
| 8. Intégrité, chargement, erreurs | ERROR STATE : API injoignable → message d'erreur et bouton Réessayer qui fonctionne | ✅ réussi | 3.1 s |
| 8. Intégrité, chargement, erreurs | SERVER ERROR : erreur 500 de l'API affichée proprement | ✅ réussi | 2.5 s |
| 8. Intégrité, chargement, erreurs | Le dashboard reflète les enregistrements créés (compteurs calculés par SPARQL) | ✅ réussi | 2.9 s |
| 9. Suppression des seuls enregistrements de test (ordre inverse) | indemnisation | ✅ réussi | 4.8 s |
| 9. Suppression des seuls enregistrements de test (ordre inverse) | expertise puis expert | ✅ réussi | 8.8 s |
| 9. Suppression des seuls enregistrements de test (ordre inverse) | sinistre (et son dommage) | ✅ réussi | 4.8 s |
| 9. Suppression des seuls enregistrements de test (ordre inverse) | garantie Vol | ✅ réussi | 6.3 s |
| 9. Suppression des seuls enregistrements de test (ordre inverse) | contrat | ✅ réussi | 5.3 s |
| 9. Suppression des seuls enregistrements de test (ordre inverse) | véhicule | ✅ réussi | 5.0 s |
| 9. Suppression des seuls enregistrements de test (ordre inverse) | assuré | ✅ réussi | 4.4 s |
| 9. Suppression des seuls enregistrements de test (ordre inverse) | le graphe RDF est revenu EXACTEMENT à son nombre initial de triplets | ✅ réussi | 0.1 s |

## 6. Rejouer

```bash
npm run setup:e2e      # une fois : installe @playwright/test (Chrome du poste utilisé, aucun téléchargement de navigateur)
npm run test:e2e       # 65 tests, pile isolée démarrée et arrêtée automatiquement (~6 min)
```
