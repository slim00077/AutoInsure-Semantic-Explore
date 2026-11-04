# Analyse de l'ontologie `assurance_auto.xml`

Source de vérité : `resources/assurance_auto.xml` (copie byte-identique dans `ontology/`). Elle n'a **pas** été modifiée ni remplacée.
Documents lus : XML, PDF « Web Semantics Project » (17 pages), DOCX de préparation, infographie PNG.

## Chiffres (calculés par RDFLib)

| Élément | Nombre |
|---|---|
| Triplets (fichier original) | 819 (846 avec extensions + inverses matérialisées) |
| Classes nommées | 45 |
| ObjectProperties | 29 |
| DataProperties | 38 (**40** avec les 2 extensions) |
| Individus nommés | 56 |
| Restrictions (cardinalité / existentielles) | 14 |
| Groupes `AllDisjointClasses` | 8 |
| Classes définies (`equivalentClass`) | 2 : `ContratActif`, `SinistreExpertise` |

## Classes et hiérarchie

- **Personne** : Assure, Conducteur, Victime, Expert (rôles non disjoints : un assuré peut être conducteur).
- **Organisation** : CompagnieAssurance, Garage.
- **Vehicule** : Voiture, Moto, Camion.
- **ContratAssurance** : AssuranceResponsabiliteCivile, AssuranceIntermediaire, AssuranceTousRisques ; classe définie `ContratActif`.
- **Garantie** : GarantieResponsabiliteCivile, GarantieVol, GarantieIncendie, GarantieBrisDeGlace, GarantieCatastrophesNaturelles, GarantieDommagesTousAccidents.
- **Sinistre** : AccidentCirculation, VolVehicule, IncendieVehicule, BrisDeGlace, CatastropheNaturelle ; classe définie `SinistreExpertise`.
- **Dommage** : DommageMateriel, DommageCorporel, DommageMoral.
- Autres : Expertise, Indemnisation, Franchise, Prime, Clause, BaremeIndemnisation, **Document** (ContratDocument, DeclarationSinistre, RapportExpertise).

## Relations (domaine → range)

possede (Assure→Contrat) · propose/estProposePar (Compagnie↔Contrat, estProposePar fonctionnelle) · couvre/estCouvertPar (Contrat↔Vehicule) · contient (Contrat→Garantie) · aPourPrime, aPourClause, aPourDocument · estConduitPar (Vehicule→Conducteur) · repare (Garage→Vehicule) · declare/estDeclarePar (Assure↔Sinistre) · concerne (Sinistre→Vehicule, fonctionnelle) · implique · rattacheAContrat (fonctionnelle) · mobiliseGarantie · provoque (Sinistre→Dommage) · estDocumentePar · faitObjetDe (Sinistre→Expertise) · realisePar (Expertise→Expert, fonctionnelle) · evalue (Expertise→Dommage) · produit (Expertise→RapportExpertise) · subiPar (Dommage→Personne) · donneLieuA (Dommage→Indemnisation) · utiliseBareme, appliqueFranchise, verseeA, verseePar (fonctionnelles).

## Axiomes principaux

- `ContratAssurance` ⊑ ≥1 `aPourPrime`.Prime ⊓ ≥1 `contient`.Garantie ⊓ ≥1 `couvre`.Vehicule ⊓ ∃`contient`.GarantieResponsabiliteCivile.
- `AssuranceIntermediaire` ⊑ ∃`contient`.GarantieIncendie ; `AssuranceTousRisques` ⊑ ∃`contient`.GarantieDommagesTousAccidents.
- `Sinistre` ⊑ ≥1 `provoque`.Dommage ⊓ =1 `concerne`.Vehicule.
- `Expertise` ⊑ =1 `realisePar`.Expert.
- `Indemnisation` ⊑ ≤1 `appliqueFranchise` ⊓ ≤1 `utiliseBareme` ⊓ =1 `verseeA`.Personne.
- 8 groupes de disjonction (grandes classes, sous-types de véhicule/contrat/garantie/sinistre/dommage/document, compagnie/garage).

**Ces axiomes sont appliqués par l'API** : un contrat sans véhicule est refusé (422), un contrat « Tous risques » reçoit automatiquement la garantie *Dommages tous accidents* et la responsabilité civile, une garantie exigée ne peut pas être supprimée, un sinistre doit garder au moins un dommage, etc.

## Individus

3 scénarios complets : accident de circulation accepté (Ahmed Ben Ali, Peugeot 208, contrat tous risques), vol refusé (Fatma Trabelsi, Renault Clio, contrat RC seule), incendie de moto accepté (Youssef Hamdi, Yamaha MT-07, contrat intermédiaire) ; 2 experts, 1 compagnie (Assurance Plus), 2 garages, 3 barèmes, 2 franchises, 3 clauses, 1 victime.

## Cohérence : ce qui a été vérifié

| Vérification | Outil | Résultat |
|---|---|---|
| Parsing RDF/XML (DOCTYPE à entités `&owl;`, `&xsd;`…) | RDFLib 7 | OK, 819 triplets |
| Domaines et ranges (objet et type de données) | `ontology_info.validate` | OK |
| Propriétés fonctionnelles (≤ 1 valeur) | idem | OK |
| Restrictions de cardinalité et existentielles sur les 56 individus | idem | OK |
| Disjonctions | idem | OK |
| Identifiants uniques (immatriculation, n° contrat/sinistre/permis) | idem | OK |
| Inverses matérialisées | idem | OK (après matérialisation) |
| **Raisonneur HermiT 1.4.x** (OWLAPI 5.1.9) | `tools/hermit-validator` | ✔ **Exécuté** : ontologie **cohérente**, 0 classe insatisfiable, `ContratActif` = Contrat_001..003, `SinistreExpertise` = Sinistre_001 et _003 ; 49 vérifications → [HERMIT_VALIDATION.md](HERMIT_VALIDATION.md) |

La validation RDFLib est volontairement nommée « structurelle » : elle ne remplace pas un raisonneur OWL (pas d'inférence de classes, pas de détection d'inconsistance logique subtile).

## Lacunes constatées et décisions

| # | Lacune | Décision |
|---|---|---|
| 1 | Aucun **statut de sinistre** alors que le site doit l'afficher | Ajout de `statutSinistre` (Declare, EnExpertise, EnCours, Indemnise, Refuse, Clos) + valeurs pour S-001..S-003 |
| 2 | **Rapports d'expertise** sans contenu | Ajout de `contenuDocument` sur `Document` |
| 3 | `possede` sans inverse (Contrat → Assuré) alors que le DOCX évoque « possède exactement 1 Assure » | Non modifié : l'API et les templates NLP traversent `^actors:possede`. Proposition : ajouter `estPossedePar` (fonctionnelle) dans Protégé |
| 4 | Pas de lien **Garantie ↔ type de Dommage** | Non inventé. La question « contrats couvrant les dommages matériels » est interprétée via Contrat ← Sinistre → Dommage (documenté) |
| 5 | `accident` / `sinistre` : l'énoncé les donne synonymes, l'ontologie distingue `AccidentCirculation` ⊏ `Sinistre` | « accident » → sous-classe `AccidentCirculation` ; « sinistre » → classe `Sinistre` |
| 6 | Montants sans devise | Traités comme valeurs numériques ; pas de conversion |
| 7 | Dates de naissance typées `xsd:dateTime` | Conservé ; l'API expose la partie date |
| 8 | Infographie : « API IA (langage naturel → SPARQL) » | Contraire à la restriction du professeur : remplacé par le module NLP maison |

## Compatibilité Protégé

Le fichier original reste ouvrable tel quel. L'ontologie fusionnée (original + extensions + données saisies dans l'application) s'exporte via **Ontology Explorer → Export RDF/XML** ou `GET /api/ontology/export?format=xml`. Les extensions sont aussi disponibles seules dans `ontology/assurance_auto_extensions.ttl` (à importer dans Protégé via *File → Open*, ou fusionner).

## HermiT dans Protégé (étudiant 1 — optionnel, déjà validé par l'utilitaire Java)

1. Installer Protégé 5.6 (JRE embarquée) — ou utiliser Java 17+ (déjà installé : Temurin 21).
2. Ouvrir l'export RDF/XML dans Protégé.
3. *Reasoner → HermiT 1.4 → Start reasoner* ; vérifier l'absence d'inconsistance, puis *Inferred* : `Contrat_001`, `Contrat_002` et `Contrat_003` doivent être inférés `ContratActif`, `Sinistre_001` et `Sinistre_003` `SinistreExpertise`.
4. Noter les résultats dans le rapport (capture d'écran).
