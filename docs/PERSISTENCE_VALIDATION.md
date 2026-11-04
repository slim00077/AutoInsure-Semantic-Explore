# Validation de la persistance et des redémarrages

> Script : `e2e/persistence.mjs` (`npm run test:persistence`) — **26 vérifications, 0 échec** (résultat brut : [`persistence_results.json`](persistence_results.json)).
> Tests complémentaires : `semantic-service/tests/test_persistence.py` (8 tests) et `test_store.py`.
> Pile **isolée** : ports 8221 / 4120 / 5221, dossier de données **temporaire** (le vrai `data/` n'est jamais touché).

## 1. Scénario exécuté (dans l'ordre)

| # | Action | Vérification | Résultat |
|---|---|---|---|
| 0 | Démarrage à froid | graphe chargé depuis l'ontologie d'origine puis écrit dans `assurance_live.ttl` (846 triplets, `source=original`) | ✔ |
| 1 | `POST /api/insured` (« Persist Redemarrage », permis `PERSIST01`) | HTTP 201 | ✔ |
| 2 | `ASK` SPARQL + lecture du fichier | l'individu est dans le graphe **et** dans `assurance_live.ttl` | ✔ |
| 3 | **Arrêt du service Python** | `/api/health` → **503 « degraded »** ; une route métier → erreur JSON structurée `SEMANTIC_SERVICE_UNAVAILABLE` (503) ; l'interface React affiche un message d'erreur avec bouton *Réessayer* — aucun plantage | ✔ ×3 |
| 4 | **Redémarrage de Python** | `source=live` (rechargé depuis le fichier), **même nombre de triplets** (852 = 852), l'individu existe | ✔ ×3 |
| 5 | **Arrêt puis redémarrage d'Express** | le port ne répond plus ; au retour `/api/health` ok et service sémantique joignable | ✔ ×2 |
| 6 | `GET /api/insured?q=Persist` | retrouve **le même individu** (id, permis) | ✔ |
| 7 | **Interface React** (Chrome piloté) | la ligne « Persist Redemarrage » s'affiche avec son permis | ✔ |
| 8 | Fichiers et sauvegardes | fichier lisible/inscriptible ; aucun `*.tmp` résiduel ; `DELETE WHERE { <individu> ?p ?o }` accepté, **sauvegarde `before_update` créée**, individu absent du fichier ; `DELETE WHERE { ?s ?p ?o }` **refusé (403)**, graphe intact | ✔ ×5 |
| 9 | **Fichier persistant corrompu** (écrasé avec du texte invalide) puis redémarrage | le service **démarre** (`source=recovered:<sauvegarde>`), le fichier corrompu est **conservé** (`assurance_live.corrupt-*.ttl`), `/health` expose la récupération, les données sont de nouveau disponibles | ✔ ×4 |
| 10 | `POST /api/ontology/reset` | sauvegarde `before_reset` créée, retour à l'ontologie d'origine + extensions (846 triplets) | ✔ ×2 |

## 2. Fonctionnement de la persistance

| Sujet | Comportement |
|---|---|
| Emplacement | `DATA_DIR` (défaut `projetweb/data/`), fichier `assurance_live.ttl`, sauvegardes `data/backups/`, historiques JSON secondaires (`sparql_history`, `nlp_history`, journal d'activité) — **tout est ignoré par Git** (`data/*`, sauf `.gitkeep`) |
| Écriture | **atomique** : sérialisation dans `assurance_live.ttl.tmp` puis `os.replace` → jamais de fichier à moitié écrit après un arrêt brutal ; test : aucun `*.tmp` résiduel |
| Rechargement | au démarrage, le fichier live (s'il existe) prime sur l'ontologie d'origine ; les gazetteers NLP sont reconstruits (version du store) |
| Sauvegardes | `before_update` (avant toute mise à jour qui **supprime** des triplets, rotation 30), `before_reset` (avant la réinitialisation), `manual` |
| Réinitialisation | `POST /api/ontology/reset` = ontologie d'origine + extensions ; l'état courant est sauvegardé avant |
| Original | `ontology/assurance_auto.xml` n'est jamais écrit (hash identique) |
| Permissions | `DATA_DIR` et le fichier live testés en lecture/écriture ; le comportement si `data/` n'est pas inscriptible n'a **pas** été testé (échec attendu à la création du dossier / à l'écriture) |

## 3. Défaut trouvé et corrigé

**Un fichier `assurance_live.ttl` illisible faisait planter le service au démarrage** (`BadSyntax`), sans option de récupération. Risque réel ici : le projet est dans un dossier **OneDrive** (conflits/verrous de synchronisation possibles). Désormais (`Store._recover`) : le fichier est mis de côté (jamais supprimé), la sauvegarde **valide** la plus récente est restaurée (les sauvegardes illisibles sont ignorées), à défaut l'ontologie d'origine ; le fait est journalisé et visible dans `GET /health` (`source: "recovered:…"`, bloc `recovery`).

## 4. Limites

- **Récupération = dernier état sauvegardé**, qui peut être antérieur aux dernières modifications (les sauvegardes sont prises avant les *suppressions*, pas avant chaque insertion). Les données perdues sont à rejouer ; le fichier corrompu est conservé pour tentative de réparation manuelle.
- **Un seul processus Python par `DATA_DIR`** : le verrou est en mémoire (`RLock`). Deux services pointant le même dossier s'écraseraient mutuellement.
- **OneDrive** : pour la démo, préférer un `DATA_DIR` hors OneDrive (`DATA_DIR=C:\temp\autoinsure`) ou mettre la synchronisation en pause, afin d'éviter verrous et conflits sur `assurance_live.ttl`.
- Express ne met pas les écritures en file d'attente entre redémarrages : une requête envoyée pendant que le service Python est arrêté reçoit un 503 (vérifié) ; le cas d'une requête *en cours d'exécution* au moment exact de l'arrêt n'a pas été testé.
- Les historiques JSON (SPARQL/NLP/activité) sont secondaires et non transactionnels.
