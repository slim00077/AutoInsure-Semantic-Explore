# Validation OWL avec HermiT

> Exécuté le 2026-11-04 sur `ontology/assurance_auto.xml` (original, **non modifié**) puis sur « original + extensions ».
> Sortie brute complète : [`hermit/hermit_output.txt`](hermit/hermit_output.txt) · recoupement avec l'application : [`hermit/crosscheck_output.json`](hermit/crosscheck_output.json).
> Reproductible : `npm run test:hermit` (et `npm run test:hermit:cross`).

## 1. Installation de Java (Phase 1)

| Étape | Résultat |
|---|---|
| `winget --version` | v1.29.380 disponible |
| Java déjà installé ? | Non (`java` introuvable) |
| `winget search --id EclipseAdoptium.Temurin` | JDK 11, 17, 21, … disponibles |
| `winget install --id EclipseAdoptium.Temurin.21.JDK --scope user --silent` | **Échec, code 16** : « Aucun programme d'installation applicable n'a été trouvé » — le MSI Temurin est **machine-wide** (il n'existe pas de variante utilisateur) |
| Contournement légitime (sans élévation de droits) | Archive **ZIP officielle** Eclipse Temurin (API Adoptium → `OpenJDK21U-jdk_x64_windows_hotspot_21.0.13_9.zip`, 205 Mo). **SHA-256 vérifié** : `a4dbaa05…04f9` = valeur publiée par Adoptium |
| Installation | `%LOCALAPPDATA%\Programs\Java\jdk-21.0.13+9` (dossier utilisateur, aucun droit administrateur) |
| Variables | `JAVA_HOME` et `PATH` (…`\bin` en tête) définies **au niveau utilisateur** (`[Environment]::SetEnvironmentVariable(…, "User")`). Les nouveaux terminaux les voient ; un terminal ou VS Code déjà ouvert doit être redémarré. |
| Vérification | `java -version` → `openjdk version "21.0.13" 2026-10-20 LTS`, Temurin-21.0.13+9 ; `javac -version` → `javac 21.0.13` ; `JAVA_HOME=C:\Users\amira\AppData\Local\Programs\Java\jdk-21.0.13+9` |
| Outil de build | Apache Maven 3.9.9 téléchargé depuis Maven Central (SHA-512 vérifié) dans `%LOCALAPPDATA%\Programs\Maven` — utilisé **uniquement** pour récupérer HermiT/OWLAPI ; non requis au runtime |

Aucune protection Windows n'a été contournée. Java n'est **pas** nécessaire pour exécuter l'application (Python + Node suffisent) : HermiT est un **outil de validation**.

## 2. Méthode

Protégé (GUI) n'est pas installé sur la machine (aucun dossier `Protege*`) → pas d'automatisation de l'interface. Utilitaire Java isolé et reproductible :

- `tools/hermit-validator/` : Maven (`org.semanticweb.hermit:1.4.5.519`, OWLAPI **5.1.9** en dépendance transitive) + `HermitValidation.java`.
- L'ontologie d'origine est ouverte **en lecture seule** ; le SHA-256 est comparé avant/après. Les tests de contraintes se font sur des **copies en mémoire** auxquelles on ajoute des axiomes de test. Rien n'est écrit dans l'ontologie.
- HermiT s'annonce `1.4.1.513` (chaîne de version interne de l'implémentation de l'artefact 1.4.5.519 : c'est la valeur renvoyée par `getReasonerVersion()`).

## 3. Résultats — ontologie d'origine (A)

| Vérification | Résultat |
|---|---|
| Chargement RDF/XML (DOCTYPE à entités `&owl;` `&xsd;`) | ✔ en 442 ms — 666 axiomes (487 logiques), 45 classes, 29 ObjectProperties, **38** DataProperties, 56 individus |
| Initialisation de HermiT | ✔ 335 ms |
| `isConsistent()` | ✔ **COHÉRENTE** (26 ms) |
| Classes insatisfiables | ✔ **aucune** (0 classe ≡ `owl:Nothing`) |
| Précalcul (hiérarchie, assertions de classes et de propriétés) | ✔ 90 ms |

### Restrictions de classe vues par HermiT (12 + 2 définitions = les « 14 » de `ONTOLOGIE.md`)

```
ContratAssurance ⊑ ≥1 aPourPrime.Prime ⊓ ≥1 contient.Garantie ⊓ ≥1 couvre.Vehicule ⊓ ∃contient.GarantieResponsabiliteCivile
AssuranceIntermediaire ⊑ ∃contient.GarantieIncendie      AssuranceTousRisques ⊑ ∃contient.GarantieDommagesTousAccidents
Sinistre ⊑ =1 concerne.Vehicule ⊓ ≥1 provoque.Dommage    Expertise ⊑ =1 realisePar.Expert
Indemnisation ⊑ =1 verseeA.Personne ⊓ ≤1 appliqueFranchise.Franchise ⊓ ≤1 utiliseBareme.BaremeIndemnisation
8 axiomes DisjointClasses (39 classes engagées)
```

### Classes définies (inférées par HermiT)

| Classe | Définition OWL | Instances inférées | Attendu (calculé indépendamment) | |
|---|---|---|---|---|
| `ContratActif` | `ContratAssurance ⊓ statutContrat = "Actif"` | **Contrat_001, Contrat_002, Contrat_003** | identique | ✔ |
| `SinistreExpertise` | `Sinistre ⊓ ∃faitObjetDe.Expertise` | **Sinistre_001, Sinistre_003** | identique | ✔ |

`Contrat_004` (statut `Expire`) et `Sinistre_002` (vol sans expertise) ne sont correctement **pas** inférés. Exemple d'appartenance inférée : `Contrat_001` asserté `AssuranceTousRisques` → HermiT en déduit `ContratAssurance` **et** `ContratActif` ; `Sinistre_001` asserté `AccidentCirculation` → `Sinistre` **et** `SinistreExpertise`.

### `owl:inverseOf`

11 assertions de la 1re propriété de chaque paire inverse (`propose/estProposePar`, `couvre/estCouvertPar`, `declare/estDeclarePar`) n'ont **pas** leur inverse dans le fichier ; HermiT les infère toutes (11/11). Le service RDFLib les **matérialise** au chargement pour obtenir le même effet en SPARQL.

### Tests de contraintes sur copies en mémoire (15 vérifications ✔)

| Contrainte testée | Axiome ajouté en mémoire | Verdict HermiT |
|---|---|---|
| Disjonction | un individu `GarantieVol` **et** `GarantieIncendie` | incohérent ✔ |
| Disjonction | `Moto_001` aussi `Voiture` | incohérent ✔ |
| Grandes classes disjointes | `Voiture_001` aussi `Assure` | incohérent ✔ |
| Domaine de `possede` (Assure) | `Voiture_001 possede Contrat_001` | incohérent ✔ |
| Range de `possede` (ContratAssurance) | `AhmedBenAli possede Voiture_002` | incohérent ✔ |
| Fonctionnelle / `=1 concerne` | `Sinistre_001 concerne` un 2ᵉ véhicule **distinct** | incohérent ✔ |
| `=1 realisePar` | `Expertise_001` réalisée par 2 experts **distincts** | incohérent ✔ |
| `≤1 appliqueFranchise` | 2 franchises **distinctes** | incohérent ✔ |
| **Monde ouvert** | `Sinistre` sans dommage ni véhicule | **cohérent** ✔ (≥1 = existence implicite) |
| **Monde ouvert** | `ContratAssurance` sans prime ni garantie | **cohérent** ✔ |
| Définition | nouveau contrat `statutContrat "Actif"` | inféré `ContratActif` ✔ |
| Définition | sinistre `faitObjetDe` une Expertise | inféré `SinistreExpertise` ✔ |
| Définition (négatif) | contrat `"Expire"` | pas `ContratActif` ✔ |
| Hiérarchie | `AssuranceTousRisques ⊑ ContratAssurance`, `ContratActif ⊑ ContratAssurance` | inférés ✔ |

> **Point à retenir (question probable du jury)** : OWL est en **monde ouvert** et sans hypothèse de nom unique. Une cardinalité minimale (« un contrat a au moins une prime ») **n'est pas violée** par un contrat sans prime : HermiT suppose qu'elle existe. Les contrôles « il en faut au moins une » de l'application (contrat sans véhicule refusé en 422…) sont donc une **validation en monde fermé** faite par l'API et le validateur structurel, pas du raisonnement OWL.

## 4. Résultats — original + extensions (B)

Les extensions (`statutSinistre`, `contenuDocument`, 16 axiomes dont 10 logiques) sont chargées par OWLAPI comme par RDFLib. Mêmes vérifications qu'en (A), plus :

| Vérification | |
|---|---|
| Ontologie fusionnée cohérente, 0 classe insatisfiable, mêmes classes définies | ✔ |
| 40 DataProperties (38 + 2) | ✔ |
| `statutSinistre` : `Sinistre_001` = EnCours, `_002` = Refuse, `_003` = Clos | ✔ |
| `contenuDocument` : `Rapport_001` est un `Document`/`RapportExpertise` | ✔ |
| `statutSinistre` **fonctionnelle** : 2 valeurs différentes ⇒ incohérent | ✔ |
| Domaine `Sinistre` : un individu portant `statutSinistre` est inféré `Sinistre` ; sur `Voiture_001` ⇒ incohérent (disjonction) | ✔ |
| Domaine `Document` : `contenuDocument` inféré `Document` ; sur `AhmedBenAli` ⇒ incohérent (Personne ⊓ Document) | ✔ |

## 5. Intégrité et bilan

- `assurance_auto.xml` : SHA-256 identique avant et après (`bb56e6db9e5901f4f90fc23b6b36721d80d5ade1a68440087761140d81600483`) — **non modifié**.
- **49 vérifications réussies, 0 échec.**
- **Aucune incohérence** : il n'y a donc pas de cause logique à expliquer ni de correction d'ontologie à proposer pour la cohérence. Rien n'a été modifié « pour faire disparaître » un problème.

## 6. Recoupement application ↔ HermiT (`crosscheck.mjs`)

Une pile isolée est lancée, des données sont créées **par l'API de l'application** (contrat Actif, contrat Résilié, sinistre expertisé, sinistre non expertisé), l'export RDF/XML de l'application est donné à HermiT, puis les réponses de l'application sont comparées :

| Vérification | Résultat |
|---|---|
| L'export du graphe applicatif (écrit par RDFLib, données créées via le CRUD) est **cohérent** pour HermiT | ✔ |
| Aucune classe insatisfiable | ✔ |
| HermiT infère `ContratActif` pour le nouveau contrat Actif, pas pour le Résilié | ✔ |
| HermiT infère `SinistreExpertise` pour le sinistre expertisé, pas pour l'autre | ✔ |
| SPARQL équivalent de l'application = ensembles HermiT (`ContratActif`, `SinistreExpertise`) | ✔ |
| Recherche NLP « Quels contrats sont actifs ? » = `ContratActif` de HermiT | ✔ |
| Recherche NLP « Quels sinistres ont fait l'objet d'une expertise ? » = `SinistreExpertise` de HermiT | ✔ |
| NLP « Quels contrats ne sont pas actifs ? » = complémentaire de `ContratActif` | ✔ |
| Validateur structurel de l'application : 0 erreur sur ces données | ✔ |

**12/12.** Détail du périmètre de raisonnement de l'application : [OWL_REASONING_INTEGRATION.md](OWL_REASONING_INTEGRATION.md).

## 7. Améliorations d'ontologie possibles (non appliquées)

1. Ajouter `estPossedePar` (inverse **fonctionnelle** de `possede`) : le DOCX évoque « un contrat est possédé par exactement 1 Assuré », aujourd'hui non exprimé.
2. Rendre `statutContrat` fonctionnelle (un contrat = un statut) — permettrait à HermiT de détecter deux statuts contradictoires.
3. Énumérer les valeurs de `statutSinistre` avec `owl:oneOf` / `DataOneOf` (aujourd'hui limitées par l'API, pas par OWL).
4. Déclarer un `owl:Ontology` dans le fichier d'extensions (il est actuellement anonyme).

## Annexe — Reproduire dans Protégé (pour la soutenance)

1. Installer Protégé 5.6 (JRE embarquée incluse).
2. *File → Open…* `ontology/assurance_auto.xml`.
3. *Reasoner → HermiT 1.4.x → Start reasoner* → l'onglet *Inferred* doit montrer `Contrat_001..003 : ContratActif` et `Sinistre_001`, `Sinistre_003 : SinistreExpertise`. Aucun message d'inconsistance.
4. Pour les extensions : *File → Open…* l'export fusionné (`GET http://localhost:4000/api/ontology/export?format=xml`) — il contient l'original, les extensions et les données saisies, et il est relu sans erreur par OWLAPI (la bibliothèque de Protégé).
5. *Window → Views → Class views → Class hierarchy (inferred)* : montrer `ContratActif ⊑ ContratAssurance`.
