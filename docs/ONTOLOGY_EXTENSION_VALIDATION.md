# Validation des extensions de l'ontologie

> Fichiers : `ontology/assurance_auto.xml` (original, **non modifié**) et `ontology/assurance_auto_extensions.ttl` (2 propriétés + 5 valeurs initiales).
> Tests : `semantic-service/tests/test_extensions.py` (11 tests) + HermiT section B ([HERMIT_VALIDATION.md](HERMIT_VALIDATION.md)) + Playwright (`crud.spec.ts`).

## 1. L'original reste intact

| Vérification | Résultat |
|---|---|
| `ontology/assurance_auto.xml` = `resources/assurance_auto.xml` (SHA-256 identique) | ✔ `bb56e6db9e5901f4f90fc23b6b36721d80d5ade1a68440087761140d81600483` |
| Hash avant/après l'exécution de HermiT | ✔ identique |
| Le service ne réécrit jamais le XML (écrit seulement `data/assurance_live.ttl`) | ✔ (`test_reset_backs_up_current_state_and_never_touches_the_original_ontology`) |

## 2. Contenu des extensions

| Élément | Type | Domaine | Range | Particularités |
|---|---|---|---|---|
| `statutSinistre` | `owl:DatatypeProperty`, **`owl:FunctionalProperty`** | `Sinistre` | `xsd:string` | Valeurs : Declare, EnExpertise, EnCours, Indemnise, Refuse, Clos |
| `contenuDocument` | `owl:DatatypeProperty` | `Document` | `xsd:string` | Non fonctionnelle (un document peut avoir plusieurs contenus) |
| `Sinistre_001/002/003 statutSinistre` | assertions | | | `EnCours`, `Refuse`, `Clos` (cohérentes avec leurs indemnisations) |
| `Rapport_001/002 contenuDocument` | assertions | | | texte des rapports d'expertise |

## 3. Pas de doublon ni de conflit (tests)

| Test | Résultat |
|---|---|
| Les deux seules entités *déclarées* par l'extension sont `statutSinistre` et `contenuDocument` | ✔ |
| Aucun de ces IRI n'existe déjà dans l'ontologie d'origine (aucun conflit d'identifiant) | ✔ |
| Aucun libellé (`rdfs:label`) identique à un libellé existant | ✔ |
| L'extension ne touche aucune entité d'origine en dehors des 5 individus visés, et n'y ajoute que `statutSinistre` / `contenuDocument` | ✔ |
| Vocabulaire des statuts du TTL = énumération `CLAIM_STATUS` de l'API (`backend/src/domain/claims.ts`) | ✔ |

## 4. Domaines et ranges appropriés

- `statutSinistre` : domaine `Sinistre` (classe de l'original, qui regroupe `AccidentCirculation`, `VolVehicule`, … par sous-classe) ; range `xsd:string` ; **fonctionnelle** (un sinistre n'a qu'un statut) — HermiT confirme : une 2ᵉ valeur différente rend l'ontologie incohérente.
- `contenuDocument` : domaine `Document` (englobe `RapportExpertise`, `ContratDocument`, `DeclarationSinistre`) ; range `xsd:string`.
- **Effet OWL du domaine** (vérifié par HermiT) : tout individu portant `statutSinistre` est *inféré* `Sinistre`, et s'il est déjà `Voiture`/`Personne`… l'ontologie devient **incohérente** (disjonction). C'est le comportement voulu ; l'API n'écrit ces propriétés que sur des `Sinistre` / `RapportExpertise`.
- Limite : les valeurs de `statutSinistre` ne sont pas énumérées dans l'OWL (`owl:oneOf`), seulement dans l'API.

## 5. Chargement par le service Python (RDFLib)

| Vérification | Résultat |
|---|---|
| Au premier démarrage : original + extensions + inverses → `data/assurance_live.ttl` (846 triplets) | ✔ |
| `statutSinistre` présent dans le graphe et interrogeable : `SELECT ?s ?st WHERE { ?s actors:statutSinistre ?st }` → 001 EnCours, 002 Refuse, 003 Clos | ✔ |
| Modification par `DELETE/INSERT WHERE` (`EnCours` → `Indemnise`) | ✔ |
| `contenuDocument` interrogeable ; chaque sujet est bien un `Document` (domaine respecté) | ✔ |
| Validateur structurel sur original + extensions : **0 erreur** | ✔ |
| Triplets d'origine conservés (ex. `AhmedBenAli a Assure`, `Voiture_001 marque "Peugeot"`) | ✔ |
| Export Turtle et RDF/XML relus sans perte (même nombre de triplets, extensions présentes) | ✔ |
| Via l'interface : le statut du sinistre est modifiable (Playwright : `Declare → EnExpertise`) ; le rapport d'expertise est créé avec `contenuDocument` | ✔ |

## 6. Compréhension par Protégé / OWL

- **Protégé (GUI) n'est pas installé** sur la machine d'audit : ouverture manuelle non testée.
- Preuve indirecte forte : **OWLAPI 5.1.9** — la bibliothèque sur laquelle Protégé est construit — a chargé le TTL (16 axiomes dont 10 logiques), fusionné avec l'original (682 axiomes), et **HermiT** a classé l'ensemble sans erreur (cohérent, 40 DataProperties). L'export RDF/XML de l'application (écrit par RDFLib) est aussi relu par OWLAPI et validé par HermiT (`crosscheck`).
- Marche à suivre manuelle : voir l'annexe de [HERMIT_VALIDATION.md](HERMIT_VALIDATION.md). Recommandation : ouvrir l'**export fusionné** plutôt que le TTL seul (le TTL n'a pas d'en-tête `owl:Ontology`, il est « anonyme » ; Protégé l'ouvre mais le nomme automatiquement).

## 7. Correction de documentation trouvée

`docs/ONTOLOGIE.md` et le README annonçaient « 40 DataProperties » pour **l'original** : l'original en contient **38** (HermiT/OWLAPI et RDFLib concordent) ; les **40** incluent les deux extensions. Les documents ont été corrigés.
