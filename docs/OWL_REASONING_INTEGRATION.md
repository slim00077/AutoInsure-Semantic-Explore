# Raisonnement OWL ↔ requêtes SPARQL : ce que fait vraiment l'application

> **RDFLib n'est pas un raisonneur OWL.** Le service Python stocke des triplets et exécute du SPARQL 1.1 : il ne déduit ni classes, ni cohérence. Le raisonnement OWL complet est fourni par **HermiT**, utilisé comme **outil de validation hors ligne** (Java), pas dans le runtime de l'application. Cette page dit précisément où est la frontière, avec les tests qui la prouvent.

## 1. Deux mondes différents

| | SPARQL / RDFLib (l'application) | OWL / HermiT (validation) |
|---|---|---|
| Hypothèse | Les données présentes sont *tout* ce qu'on sait (monde fermé pour `FILTER NOT EXISTS`, comptage…) | Une donnée absente est *inconnue* (monde ouvert) |
| Nom des individus | Deux IRI = deux individus | Pas d'hypothèse de nom unique (`sameAs` possible sauf `differentFrom`) |
| Sortie | Lignes de résultat | Inférences (types, hiérarchie, incohérence) |
| Coût runtime | Python seul | Java + OWLAPI |

## 2. Matrice des inférences

| Mécanisme OWL | HermiT (vérifié) | Dans l'application | Preuve |
|---|---|---|---|
| **`owl:inverseOf`** | infère l'inverse (11/11 assertions manquantes) | ✔ **matérialisé** par le store à chaque chargement et après chaque Update ; la suppression d'un sens supprime l'autre (voir §3) | `test_reasoning.py::test_every_inverse_pair_is_materialized_at_load`, `…after_insert`, `…deleting_one_direction_removes_both` |
| **`ContratActif`** (classe définie) | infère Contrat_001..003 | ✘ non typé par RDFLib. ✔ **Équivalent SPARQL** `statutContrat "Actif"` utilisé par l'API, le dashboard et le NLP ; **égal à HermiT**, y compris après des créations via le CRUD | `test_rdflib_does_not_infer_defined_classes`, `test_equivalent_sparql_filters_match_hermit_inference`, `crosscheck.mjs` (12/12) |
| **`SinistreExpertise`** (classe définie) | infère Sinistre_001, _003 | ✘ non typé. ✔ équivalent SPARQL `faitObjetDe ?e . ?e a Expertise` (NLP : « sinistres ayant fait l'objet d'une expertise ») ; égal à HermiT | idem |
| **Hiérarchie `subClassOf`** | infère les super-types | ✘ pas d'inférence ; ✔ émulée par le chemin de propriété `a/rdfs:subClassOf*` dans toutes les requêtes générées | `test_subclass_reasoning_is_emulated_by_property_paths` |
| **Cardinalités** (`≥1`, `=1`, `≤1`) | `=1`/`≤1` sur individus distincts ⇒ incohérence ; `≥1` jamais violée (monde ouvert) | ✘ non appliquées par RDFLib à l'insertion. ✔ **API** : contrat sans véhicule → 422, sinistre sans dommage → 422, garantie exigée non supprimable… ; ✔ **validateur structurel** (monde fermé) les signale | `test_hermit_rejects_but_rdflib_accepts_and_validator_flags[*]`, `crud.test.ts`, Playwright |
| **Domaine / range** | infère le type ; violation + disjonction ⇒ incohérence | ✘ pas d'inférence. ✔ listes déroulantes de l'UI restreintes au range (ex. conducteurs), vérifications de l'API (`mustExist`), validateur | idem + `crud.spec.ts` |
| **Classes disjointes** | incohérence | ✘ non bloqué par RDFLib. ✔ validateur ; l'API ne peut pas produire de tels individus | idem |
| **Fonctionnelle** | force `sameAs` ou incohérence | ✘ ; ✔ validateur (« ≤ 1 valeur ») | idem |
| **Domaine d'une extension** (`statutSinistre`, `contenuDocument`) | infère `Sinistre` / `Document` ; disjonction ⇒ incohérence | ✔ valeurs écrites par l'API sur des individus déjà typés ; validateur OK | [ONTOLOGY_EXTENSION_VALIDATION.md](ONTOLOGY_EXTENSION_VALIDATION.md) |

Légende : ✔ géré par l'application · ✘ non géré par RDFLib seul.

## 3. Défaut trouvé et corrigé : `owl:inverseOf` et suppression

**Constat** (probe puis test de non-régression) : après `DELETE DATA { Contrat_001 couvre Voiture_001 }`, la matérialisation des inverses, exécutée juste après l'Update, **recréait** `couvre` à partir de `Voiture_001 estCouvertPar Contrat_001`. Résultat : `removed: 0`, la suppression était silencieusement annulée (le README annonçait pourtant « une inverse orpheline »).

**Correction** (`Store._propagate_inverse_deletions`) : si `(s p o)` est supprimé et que `p` a un inverse `q`, `(o q s)` est supprimé aussi. C'est la sémantique OWL (un seul fait, deux écritures). Comportement vérifié : `removed: 2`, les deux sens disparaissent ; supprimer par l'inverse supprime le sens direct.

## 4. Ce qui reste hors périmètre (assumé et documenté)

- Pas de raisonneur dans le runtime. Si l'on voulait de vrais types inférés dans l'application, deux options : (a) Fuseki + un raisonneur OWL (Java), (b) bibliothèque Python `owlready2` (HermiT embarqué, nécessite Java). Non retenu : le sujet fonctionne avec RDFLib, et la correspondance est **prouvée** par le recoupement.
- Un `INSERT DATA` brut dans le SPARQL Explorer peut introduire une incohérence logique que HermiT rejetterait ; elle est détectée a posteriori par *Ontology Explorer → Cohérence* (validateur) et par HermiT, **pas bloquée à l'insertion**. Le CRUD, lui, applique les axiomes.
- Un individu inséré sans `a owl:NamedIndividual` n'est pas vu par le validateur, le gazetteer NLP ni l'explorateur d'individus (Protégé écrit toujours cette déclaration).
- Pas d'hypothèse de monde ouvert dans la négation NLP : « contrats qui ne couvrent pas le vol » = ceux pour lesquels **aucun** triplet `contient GarantieVol` n'existe (négation par l'échec, monde fermé).

## 5. Comment répondre en soutenance

> « Le web sémantique de notre application, ce sont des triplets RDF/OWL interrogés en SPARQL avec RDFLib. RDFLib ne raisonne pas : nous matérialisons `owl:inverseOf`, nous suivons `rdfs:subClassOf*` dans les requêtes, et nous appliquons les axiomes de cardinalité dans l'API. Le **raisonnement OWL** — cohérence, classes définies `ContratActif` et `SinistreExpertise`, disjonctions, domaines/ranges — est vérifié avec **HermiT** : l'ontologie est cohérente, et sur des données créées par notre application, les ensembles inférés par HermiT sont identiques à ceux que nos requêtes renvoient. »
