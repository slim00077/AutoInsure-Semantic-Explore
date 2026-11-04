# Rapport de validation NLP → SPARQL

> Généré automatiquement le 2026-11-04 20:36 par `semantic-service/tools/nlp_validation_report.py` — chaque ligne a été **réellement exécutée** par le module (spaCy + NLTK + RDFLib + règles + templates). **Aucune API LLM.**

**Résultat global : 86 / 86 cas conformes** à l'attendu (statut, intention, et résultats comparés à une requête SPARQL de référence écrite à la main, indépendante du module NLP).

Graphe utilisé : ontologie d'origine `assurance_auto.xml` + extensions (copie temporaire, aucune donnée du projet modifiée).

## Légende
- **Statut** : `ok` (requête générée et exécutée) · `clarification_needed` (rien exécuté, on demande de reformuler) · `entity_not_found` (entité inexistante ou rôle incompatible, rien exécuté) · `unsupported` (compris mais non traduisible / écriture / négation non sûre, rien exécuté) · `empty`.
- **Résultats** : identifiants OWL renvoyés ; ✅ = identique à la vérité terrain SPARQL, ❌ = écart.

## Synthèse par catégorie

| Catégorie | Conformes | Total |
|---|---|---|
| Questions de l'énoncé | 10 | 10 |
| Synonymes | 8 | 8 |
| Accents, casse, fautes | 5 | 5 |
| Structures de phrase | 11 | 11 |
| Comptage, montants, dates | 8 | 8 |
| Négation | 15 | 15 |
| Négation (refus voulu) | 4 | 4 |
| Entités inconnues | 4 | 4 |
| Entités ambiguës | 1 | 1 |
| Rôle incompatible | 4 | 4 |
| Rôle compatible (contrôle) | 2 | 2 |
| Vide / hors domaine | 8 | 8 |
| Structures non supportées / écriture | 4 | 4 |
| Injection | 2 | 2 |

## Questions de l'énoncé

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels véhicules sont assurés par Ahmed ? | `ok` | SEARCH_VEHICLE | Ahmed → AhmedBenAli | assuré Ahmed Ben Ali | Voiture_001 |
| ✅ | Quels contrats couvrent le vol ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | type « vol » (GarantieVol) | Contrat_001 |
| ✅ | Quels sinistres concernent une Peugeot 208 ? | `ok` | SEARCH_CLAIM | Peugeot 208 → Voiture_001 | véhicule Peugeot 208 (123TN4567) | Sinistre_001 |
| ✅ | Quel est le montant de l'indemnisation du sinistre 001 ? | `ok` | SEARCH_INDEMNIFICATION | sinistre 001 → Sinistre_001 | sinistre S-001 | Indemnisation_001, Indemnisation_004 |
| ✅ | Quels assurés ont déclaré un accident en 2026 ? | `ok` | SEARCH_INSURED + FILTER_BY_TYPE, FILTER_BY_DATE | — | type « accident de la circulation » (AccidentCirculation); en 2026 | AhmedBenAli |
| ✅ | Quels contrats couvrent les dommages matériels ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | type « dommage matériel » (DommageMateriel) | Contrat_001, Contrat_002, Contrat_003 |
| ✅ | Quels véhicules ont subi un accident ? | `ok` | SEARCH_VEHICLE + FILTER_BY_TYPE | — | type « accident de la circulation » (AccidentCirculation) | Voiture_001 |
| ✅ | Quels sinistres ont été évalués par l'expert Karim ? | `ok` | SEARCH_CLAIM | Karim → Expert_001 | expert Karim Trabelsi | Sinistre_001 |
| ✅ | Quels contrats possèdent une garantie tous risques ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | type « tous risques » (GarantieDommagesTousAccidents) | Contrat_001 |
| ✅ | Quels sinistres ont une indemnisation supérieure à 3000 euros ? | `ok` | SEARCH_CLAIM + FILTER_BY_AMOUNT | — | montant d'indemnisation supérieur à 3000 | Sinistre_001, Sinistre_003 |

## Synonymes

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quelles voitures sont assurées par Fatma ? | `ok` | SEARCH_VEHICLE | Fatma → FatmaTrabelsi | assuré Fatma Trabelsi | Voiture_002 |
| ✅ | Quelles automobiles ont subi un accident ? | `ok` | SEARCH_VEHICLE + FILTER_BY_TYPE | — | type « accident de la circulation » (AccidentCirculation) | Voiture_001 |
| ✅ | Quels clients ont déclaré un sinistre ? | `ok` | SEARCH_INSURED | — | avec sinistre | AhmedBenAli, FatmaTrabelsi, YoussefHamdi |
| ✅ | Quels souscripteurs ont un contrat actif ? | `ok` | SEARCH_INSURED | — | statut « actif » | AhmedBenAli, FatmaTrabelsi, YoussefHamdi |
| ✅ | Montre les remboursements refusés | `ok` | SEARCH_INDEMNIFICATION | — | statut « refusée » | Indemnisation_002 |
| ✅ | Quelles couvertures incendie existent ? | `ok` | SEARCH_GUARANTEE + FILTER_BY_TYPE | — | type « incendie » (GarantieIncendie) | GarantieIncendie_003 |
| ✅ | Quelles polices sont actives ? | `ok` | SEARCH_CONTRACT | — | statut « actif » | Contrat_001, Contrat_002, Contrat_003 |
| ✅ | Quels dégâts matériels ? | `ok` | SEARCH_DAMAGE + FILTER_BY_TYPE | — | type « dommage matériel » (DommageMateriel) | Dommage_001, Dommage_002, Dommage_003 |

## Accents, casse, fautes

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels vehicules sont assures par Ahmed | `ok` | SEARCH_VEHICLE | Ahmed → AhmedBenAli | assuré Ahmed Ben Ali | Voiture_001 |
| ✅ | QUELS CONTRATS COUVRENT LE VOL | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | type « vol » (GarantieVol) | Contrat_001 |
| ✅ | quelles voitures sont couvertes par un contrat tous risque | `ok` | SEARCH_VEHICLE + FILTER_BY_TYPE | — | type « tous risques » (AssuranceTousRisques) | Voiture_001 |
| ✅ | Quelles voitures peugot ont subi un accident ? | `ok` | SEARCH_VEHICLE + FILTER_BY_TYPE | peugot → Voiture_001 | véhicule Peugeot 208 (123TN4567); type « accident de la circulation » (AccidentCirculation) | Voiture_001 |
| ✅ | Quels sinistres ont été expertisés par l'expert Karim | `ok` | SEARCH_CLAIM | Karim → Expert_001 | expert Karim Trabelsi | Sinistre_001 |

## Structures de phrase

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Donne-moi la liste des contrats qui incluent la garantie vol | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | type « vol » (GarantieVol) | Contrat_001 |
| ✅ | Je voudrais savoir quelles voitures sont protégées contre le vol | `ok` | SEARCH_VEHICLE + FILTER_BY_TYPE | — | type « vol » (GarantieVol) | Voiture_001 |
| ✅ | Liste des véhicules | `ok` | SEARCH_VEHICLE | — | — | Moto_001, Voiture_001, Voiture_002 |
| ✅ | Montant indemnisation sinistre 001 | `ok` | SEARCH_INDEMNIFICATION | sinistre 001 → Sinistre_001 | sinistre S-001 | Indemnisation_001, Indemnisation_004 |
| ✅ | Qui a déclaré un sinistre ? | `ok` | SEARCH_INSURED | — | avec sinistre | AhmedBenAli, FatmaTrabelsi, YoussefHamdi |
| ✅ | Y a-t-il des sinistres liés à un incendie ? | `ok` | SEARCH_CLAIM + FILTER_BY_TYPE | — | type « incendie » (IncendieVehicule) | Sinistre_003 |
| ✅ | Quelles sont les garanties du contrat C-001 ? | `ok` | SEARCH_GUARANTEE | contrat C-001 → Contrat_001 | contrat C-001 | GarantieBrisDeGlace_001, GarantieRC_001, GarantieTousAccidents_001, GarantieVol_001 |
| ✅ | Quelles garanties couvre le contrat C-003 ? | `ok` | SEARCH_GUARANTEE | contrat C-003 → Contrat_003 | contrat C-003 | GarantieBrisDeGlace_003, GarantieIncendie_003, GarantieRC_003 |
| ✅ | Quels véhicules sont réparés par un garage ? | `ok` | SEARCH_VEHICLE | — | avec garage | Moto_001, Voiture_001 |
| ✅ | Quels assurés ont une moto ? | `ok` | SEARCH_INSURED + FILTER_BY_TYPE | — | type « moto » (Moto) | YoussefHamdi |
| ✅ | Quels experts ont évalué un dommage corporel ? | `ok` | SEARCH_EXPERTISE + FILTER_BY_TYPE | — | type « dommage corporel » (DommageCorporel) | Expert_001 |

## Comptage, montants, dates

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Combien de contrats couvrent le vol ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | type « vol » (GarantieVol) | nombre = 1 |
| ✅ | Combien de sinistres a déclaré Fatma Trabelsi ? | `ok` | SEARCH_CLAIM | Fatma Trabelsi → FatmaTrabelsi | assuré Fatma Trabelsi | nombre = 1 |
| ✅ | Quelles indemnisations dépassent 4000 euros ? | `ok` | SEARCH_INDEMNIFICATION + FILTER_BY_AMOUNT | — | montant d'indemnisation supérieur à 4000 | Indemnisation_001, Indemnisation_003 |
| ✅ | Quelles indemnisations sont comprises entre 2000 et 5000 euros ? | `ok` | SEARCH_INDEMNIFICATION + FILTER_BY_AMOUNT | — | montant d'indemnisation entre 2000 et 5000 | Indemnisation_001, Indemnisation_004 |
| ✅ | Quels sinistres en octobre 2026 ? | `ok` | SEARCH_CLAIM + FILTER_BY_DATE | — | en octobre 2026 | Sinistre_001 |
| ✅ | Quels sinistres avant 2026 ? | `ok` | SEARCH_CLAIM + FILTER_BY_DATE | — | avant 2026 | (aucun résultat) |
| ✅ | Quels sinistres ont eu lieu à Sfax ? | `ok` | SEARCH_CLAIM | Sfax → Sfax | lieu « Sfax » | Sinistre_003 |
| ✅ | Quels contrats ont une prime supérieure à 500 ? | `ok` | SEARCH_CONTRACT + FILTER_BY_AMOUNT | — | prime du contrat supérieur à 500 | Contrat_001, Contrat_003 |

## Négation

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels contrats ne couvrent pas le vol ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | pas de type « vol » (GarantieVol) · négation : « ne … pas » (ok) | Contrat_002, Contrat_003, Contrat_004 |
| ✅ | Quels contrats ne possèdent pas de garantie incendie ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | pas de type « incendie » (GarantieIncendie) · négation : « ne … pas » (ok) | Contrat_001, Contrat_002, Contrat_004 |
| ✅ | Quels contrats sont sans garantie vol ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | pas de type « vol » (GarantieVol) · négation : « sans » (ok) | Contrat_002, Contrat_003, Contrat_004 |
| ✅ | Quels contrats n'ont jamais couvert le vol ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | pas de type « vol » (GarantieVol) · négation : « n' … jamais » (ok) | Contrat_002, Contrat_003, Contrat_004 |
| ✅ | Quels contrats ne couvrent pas le vol et l'incendie ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | pas de type « vol » (GarantieVol); pas de type « incendie » (GarantieIncendie) · négation : « ne … pas » (ok) | Contrat_002, Contrat_004 |
| ✅ | Quels contrats couvrent le vol mais pas l'incendie ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | type « vol » (GarantieVol); pas de type « incendie » (GarantieIncendie) · négation : « pas » (ok) | Contrat_001 |
| ✅ | Quels contrats ne sont pas actifs ? | `ok` | SEARCH_CONTRACT | — | pas statut « actif » · négation : « ne … pas » (ok) | Contrat_004 |
| ✅ | Combien de contrats ne couvrent pas le vol ? | `ok` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | pas de type « vol » (GarantieVol) · négation : « ne … pas » (ok) | nombre = 3 |
| ✅ | Quels véhicules ne sont pas assurés par Ahmed ? | `ok` | SEARCH_VEHICLE | Ahmed → AhmedBenAli | pas de assuré Ahmed Ben Ali · négation : « ne … pas » (ok) | Moto_001, Voiture_002 |
| ✅ | Quels assurés n'ont pas déclaré d'accident ? | `ok` | SEARCH_INSURED + FILTER_BY_TYPE | — | pas de type « accident de la circulation » (AccidentCirculation) · négation : « n' … pas » (ok) | FatmaTrabelsi, YoussefHamdi |
| ✅ | Quels sinistres ne sont pas des accidents ? | `ok` | SEARCH_CLAIM + FILTER_BY_TYPE | — | pas de type « accident de la circulation » (AccidentCirculation) · négation : « ne … pas » (ok) | Sinistre_002, Sinistre_003 |
| ✅ | Quelles indemnisations ne sont pas refusées ? | `ok` | SEARCH_INDEMNIFICATION | — | pas statut « refusée » · négation : « ne … pas » (ok) | Indemnisation_001, Indemnisation_003, Indemnisation_004 |
| ✅ | Quels sinistres ne concernent pas une Peugeot 208 ? | `ok` | SEARCH_CLAIM | Peugeot 208 → Voiture_001 | pas de véhicule Peugeot 208 (123TN4567) · négation : « ne … pas » (ok) | Sinistre_002, Sinistre_003 |
| ✅ | Quels assurés n'ont pas de sinistre ? | `ok` | SEARCH_INSURED | — | sans sinistre · négation : « n' … pas » (ok) | (aucun résultat) |
| ✅ | Quels sinistres n'ont pas d'indemnisation ? | `ok` | SEARCH_CLAIM | — | sans indemnisation · négation : « n' … pas » (ok) | (aucun résultat) |

## Négation (refus voulu)

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels contrats ne couvrent que le vol ? | `unsupported` | SEARCH_CONTRACT + FILTER_BY_TYPE | — | type « vol » (GarantieVol) · négation : « ne … que » (unsupported) | non exécuté : La structure restrictive « ne … que » n'est pas une négation et n'est pas prise en charge (reformulez sans « ne … que »). |
| ✅ | Quels sinistres n'ont pas une indemnisation supérieure à 3000 euros ? | `unsupported` | SEARCH_CLAIM + FILTER_BY_AMOUNT | — | montant d'indemnisation supérieur à 3000 · négation : « n' … pas » (unsupported) | non exécuté : La négation de « montant d'indemnisation supérieur à 3000 » n'est pas prise en charge : reformulez avec le comparateur contraire (ex. « inférieur à »  |
| ✅ | Quels contrats ne sont pas ? | `unsupported` | SEARCH_CONTRACT | — | — · négation : « ne … pas » (unsupported) | non exécuté : Une négation (« ne … pas ») est détectée mais je ne sais pas à quel critère l'appliquer de façon sûre (types, statuts, entités et existence de relatio |
| ✅ | sans | `unsupported` | — | — | — · négation : « sans » (unsupported) | non exécuté : Une négation (« sans ») est détectée mais je ne sais pas à quel critère l'appliquer de façon sûre (types, statuts, entités et existence de relations s |

## Entités inconnues

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels véhicules sont assurés par Zorglub ? | `entity_not_found` | SEARCH_VEHICLE | — | — | non exécuté : « Zorglub » ne correspond à aucun individu de l'ontologie. Je n'exécute pas de requête sur une entité introuvable. |
| ✅ | Quel est le sinistre 007 ? | `entity_not_found` | — | sinistre 007 → ∅ | — | non exécuté : Aucun individu « sinistre 007 » n'existe dans l'ontologie (Sinistre_007). Je n'exécute pas de requête sur une entité introuvable. |
| ✅ | Quel est le montant de l'indemnisation du sinistre 99 ? | `entity_not_found` | SEARCH_INDEMNIFICATION | sinistre 99 → ∅ | — | non exécuté : Aucun individu « sinistre 99 » n'existe dans l'ontologie (Sinistre_099). Je n'exécute pas de requête sur une entité introuvable. |
| ✅ | Quelles voitures Mercedes ont subi un accident ? | `entity_not_found` | SEARCH_VEHICLE + FILTER_BY_TYPE | — | type « accident de la circulation » (AccidentCirculation) | non exécuté : « Mercedes » ne correspond à aucun individu de l'ontologie. Je n'exécute pas de requête sur une entité introuvable. |

## Entités ambiguës

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels sinistres concernent Trabelsi ? | `clarification_needed` | SEARCH_CLAIM | Trabelsi → Expert_001, FatmaTrabelsi | — | non exécuté : « Trabelsi » est ambigu : Karim Trabelsi (Expert_001) ; Fatma Trabelsi (FatmaTrabelsi). Précisez le prénom ou le rôle (assuré, expert...). |

## Rôle incompatible

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels sinistres ont été évalués par l'expert Ahmed ? | `entity_not_found` | SEARCH_CLAIM | Ahmed → ∅ | avec expert | non exécuté : Aucun expert nommé « Ahmed » dans l'ontologie. Individus portant ce nom : Ahmed Ben Ali (Assure/Conducteur). Je n'exécute pas de requête avec un rôle  |
| ✅ | Quels sinistres ont été évalués par Ahmed ? | `entity_not_found` | SEARCH_CLAIM | Ahmed → ∅ | — | non exécuté : Le verbe « évaluer » attend un expert, mais « Ahmed » désigne : Ahmed Ben Ali (Assure/Conducteur). Je n'exécute pas de requête avec un rôle incompatib |
| ✅ | Quels véhicules sont conduits par l'expert Karim ? | `entity_not_found` | SEARCH_VEHICLE | Karim → ∅ | avec expert | non exécuté : Le verbe « conduire » attend un conducteur, mais « Karim » désigne : Karim Trabelsi (Expert). Je n'exécute pas de requête avec un rôle incompatible. |
| ✅ | Quels sinistres ont été déclarés par l'expert Karim ? | `entity_not_found` | SEARCH_CLAIM | Karim → ∅ | avec expert | non exécuté : Le verbe « déclarer » attend un assuré ou conducteur, mais « Karim » désigne : Karim Trabelsi (Expert). Je n'exécute pas de requête avec un rôle incom |

## Rôle compatible (contrôle)

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels véhicules sont conduits par Ahmed ? | `ok` | SEARCH_VEHICLE | Ahmed → AhmedBenAli | conducteur Ahmed Ben Ali | Voiture_001 |
| ✅ | Quels sinistres ont été évalués par l'expert Trabelsi ? | `ok` | SEARCH_CLAIM | Trabelsi → Expert_001 | expert Karim Trabelsi | Sinistre_001 |

## Vide / hors domaine

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | *(vide)* | `empty` | — | — | — | non exécuté : Posez une question en français (ex. « Quels véhicules sont assurés par Ahmed ? »). |
| ✅ |     | `empty` | — | — | — | non exécuté : Posez une question en français (ex. « Quels véhicules sont assurés par Ahmed ? »). |
| ✅ | ? | `clarification_needed` | — | — | — | non exécuté : Je n'ai pas compris ce que vous cherchez (véhicules, assurés, contrats, garanties, sinistres, dommages, expertises, indemnisations...). Pouvez-vous re |
| ✅ | Quel temps fait-il à Paris ? | `clarification_needed` | — | — | — | non exécuté : Je n'ai pas compris ce que vous cherchez (véhicules, assurés, contrats, garanties, sinistres, dommages, expertises, indemnisations...). Termes non rec |
| ✅ | Bonjour | `clarification_needed` | — | — | — | non exécuté : Je n'ai pas compris ce que vous cherchez (véhicules, assurés, contrats, garanties, sinistres, dommages, expertises, indemnisations...). Termes non rec |
| ✅ | Raconte-moi une blague | `clarification_needed` | — | — | — | non exécuté : Je n'ai pas compris ce que vous cherchez (véhicules, assurés, contrats, garanties, sinistres, dommages, expertises, indemnisations...). Termes non rec |
| ✅ | azerty uiop | `clarification_needed` | — | — | — | non exécuté : Je n'ai pas compris ce que vous cherchez (véhicules, assurés, contrats, garanties, sinistres, dommages, expertises, indemnisations...). Termes non rec |
| ✅ | Mercedes | `clarification_needed` | — | — | — | non exécuté : Je n'ai pas compris ce que vous cherchez (véhicules, assurés, contrats, garanties, sinistres, dommages, expertises, indemnisations...). Termes non rec |

## Structures non supportées / écriture

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Supprime tous les contrats | `unsupported` | SEARCH_CONTRACT | — | — | non exécuté : « Supprime » est une demande de modification. La recherche en langage naturel est en lecture seule : utilisez les formulaires de gestion ou SPARQL Upd |
| ✅ | Efface le sinistre 001 | `unsupported` | SEARCH_CLAIM | sinistre 001 → Sinistre_001 | sinistre S-001 | non exécuté : « Efface » est une demande de modification. La recherche en langage naturel est en lecture seule : utilisez les formulaires de gestion ou SPARQL Updat |
| ✅ | Ajoute un véhicule Peugeot | `unsupported` | SEARCH_VEHICLE | Peugeot → Voiture_001 | véhicule Peugeot 208 (123TN4567) | non exécuté : « Ajoute » est une demande de modification. La recherche en langage naturel est en lecture seule : utilisez les formulaires de gestion ou SPARQL Updat |
| ✅ | Drop all contracts | `unsupported` | — | — | — | non exécuté : « Drop » est une demande de modification. La recherche en langage naturel est en lecture seule : utilisez les formulaires de gestion ou SPARQL Update  |

## Injection

| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |
|---|---|---|---|---|---|---|
| ✅ | Quels véhicules sont assurés par Ahmed" } ; DROP ALL ; SELECT * WHERE { ?s ?p ?o | `unsupported` | SEARCH_VEHICLE | Ahmed → AhmedBenAli | assuré Ahmed Ben Ali | non exécuté : « DROP » est une demande de modification. La recherche en langage naturel est en lecture seule : utilisez les formulaires de gestion ou SPARQL Update  |
| ✅ | Quels sinistres concernent <http://evil.example/x> ? | `ok` | SEARCH_CLAIM | — | — | Sinistre_001, Sinistre_002, Sinistre_003 |

## SPARQL généré — questions de l'énoncé et négations

### Quels véhicules sont assurés par Ahmed ?

- Intention : `SEARCH_VEHICLE` [] — confiance 1.0
- Entités : [('Ahmed', ['AhmedBenAli'])]
- Explication : 1 véhicule trouvé (assuré Ahmed Ben Ali) : Peugeot 208 (123TN4567).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_VEHICLE
SELECT DISTINCT ?x ?marque ?modele ?immatriculation ?annee ?valeur ?typeVehicule
WHERE {
  ?x a/rdfs:subClassOf* actors:Vehicule .
  ?contract actors:couvre ?x .
  ?insured actors:possede ?contract .
  VALUES ?insured { actors:AhmedBenAli }
  OPTIONAL { ?x actors:marque ?marque }
  OPTIONAL { ?x actors:modele ?modele }
  OPTIONAL { ?x actors:immatriculation ?immatriculation }
  OPTIONAL { ?x actors:anneeFabrication ?annee }
  OPTIONAL { ?x actors:valeurVehicule ?valeur }
  OPTIONAL { ?x a ?typeVehicule . ?typeVehicule rdfs:subClassOf actors:Vehicule }
}
ORDER BY ?x
```

### Quels contrats couvrent le vol ?

- Intention : `SEARCH_CONTRACT` ['FILTER_BY_TYPE'] — confiance 1.0
- Entités : []
- Explication : 1 contrat trouvé (type « vol » (GarantieVol)) : C-001 (AssuranceTousRisques, Actif).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_CONTRACT
SELECT DISTINCT ?x ?numero ?statut ?debut ?fin ?typeContrat ?prime
WHERE {
  ?x a/rdfs:subClassOf* actors:ContratAssurance .
  ?x actors:contient ?guarantee .
  ?guarantee a/rdfs:subClassOf* actors:GarantieVol .
  OPTIONAL { ?x actors:numeroContrat ?numero }
  OPTIONAL { ?x actors:statutContrat ?statut }
  OPTIONAL { ?x actors:dateDebut ?debut }
  OPTIONAL { ?x actors:dateFin ?fin }
  OPTIONAL { ?x a ?typeContrat . ?typeContrat rdfs:subClassOf actors:ContratAssurance }
  OPTIONAL { ?x actors:aPourPrime/actors:montantPrime ?prime }
}
ORDER BY ?x
```

### Quels sinistres concernent une Peugeot 208 ?

- Intention : `SEARCH_CLAIM` [] — confiance 1.0
- Entités : [('Peugeot 208', ['Voiture_001'])]
- Explication : 1 sinistre trouvé (véhicule Peugeot 208 (123TN4567)) : S-001 (AccidentCirculation, Tunis).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_CLAIM
SELECT DISTINCT ?x ?numero ?date ?lieu ?description ?statut ?typeSinistre
WHERE {
  ?x a/rdfs:subClassOf* actors:Sinistre .
  ?x actors:concerne ?vehicle .
  VALUES ?vehicle { actors:Voiture_001 }
  OPTIONAL { ?x actors:numeroSinistre ?numero }
  OPTIONAL { ?x actors:dateSinistre ?date }
  OPTIONAL { ?x actors:lieuSinistre ?lieu }
  OPTIONAL { ?x actors:descriptionSinistre ?description }
  OPTIONAL { ?x actors:statutSinistre ?statut }
  OPTIONAL { ?x a ?typeSinistre . ?typeSinistre rdfs:subClassOf actors:Sinistre }
}
ORDER BY ?x
```

### Quel est le montant de l'indemnisation du sinistre 001 ?

- Intention : `SEARCH_INDEMNIFICATION` [] — confiance 1.0
- Entités : [('sinistre 001', ['Sinistre_001'])]
- Explication : Montant d'indemnisation (sinistre S-001) : 4050 (versé à Ahmed Ben Ali), 2000 (versé à Sami Jaziri).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_INDEMNIFICATION
SELECT DISTINCT ?x ?montant ?date ?statut ?motif ?beneficiaire
WHERE {
  ?x a/rdfs:subClassOf* actors:Indemnisation .
  ?damage actors:donneLieuA ?x .
  ?claim actors:provoque ?damage .
  VALUES ?claim { actors:Sinistre_001 }
  OPTIONAL { ?x actors:montantIndemnisation ?montant }
  OPTIONAL { ?x actors:dateIndemnisation ?date }
  OPTIONAL { ?x actors:statutIndemnisation ?statut }
  OPTIONAL { ?x actors:motifDecision ?motif }
  OPTIONAL { ?x actors:verseeA ?b . ?b actors:prenom ?bp . ?b actors:nom ?bn . BIND(CONCAT(?bp, " ", ?bn) AS ?beneficiaire) }
}
ORDER BY ?x
```

### Quels assurés ont déclaré un accident en 2026 ?

- Intention : `SEARCH_INSURED` ['FILTER_BY_TYPE', 'FILTER_BY_DATE'] — confiance 1.0
- Entités : []
- Explication : 1 assuré trouvé (type « accident de la circulation » (AccidentCirculation); en 2026) : Ahmed Ben Ali.

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_INSURED
SELECT DISTINCT ?x ?prenom ?nom ?permis
WHERE {
  ?x a/rdfs:subClassOf* actors:Assure .
  ?x actors:declare ?claim .
  ?claim a/rdfs:subClassOf* actors:AccidentCirculation .
  ?claim actors:dateSinistre ?date1 .
  FILTER(?date1 >= "2026-01-01T00:00:00"^^xsd:dateTime && ?date1 < "2027-01-01T00:00:00"^^xsd:dateTime)
  OPTIONAL { ?x actors:prenom ?prenom }
  OPTIONAL { ?x actors:nom ?nom }
  OPTIONAL { ?x actors:numeroPermis ?permis }
}
ORDER BY ?x
```

### Quels contrats couvrent les dommages matériels ?

- Intention : `SEARCH_CONTRACT` ['FILTER_BY_TYPE'] — confiance 1.0
- Entités : []
- Explication : 3 contrats trouvés (type « dommage matériel » (DommageMateriel)) : C-001 (AssuranceTousRisques, Actif); C-002 (AssuranceResponsabiliteCivile, Actif); C-003 (AssuranceIntermediaire, Actif).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_CONTRACT
SELECT DISTINCT ?x ?numero ?statut ?debut ?fin ?typeContrat ?prime
WHERE {
  ?x a/rdfs:subClassOf* actors:ContratAssurance .
  ?claim actors:rattacheAContrat ?x .
  ?claim actors:provoque ?damage .
  ?damage a/rdfs:subClassOf* actors:DommageMateriel .
  OPTIONAL { ?x actors:numeroContrat ?numero }
  OPTIONAL { ?x actors:statutContrat ?statut }
  OPTIONAL { ?x actors:dateDebut ?debut }
  OPTIONAL { ?x actors:dateFin ?fin }
  OPTIONAL { ?x a ?typeContrat . ?typeContrat rdfs:subClassOf actors:ContratAssurance }
  OPTIONAL { ?x actors:aPourPrime/actors:montantPrime ?prime }
}
ORDER BY ?x
```

### Quels véhicules ont subi un accident ?

- Intention : `SEARCH_VEHICLE` ['FILTER_BY_TYPE'] — confiance 1.0
- Entités : []
- Explication : 1 véhicule trouvé (type « accident de la circulation » (AccidentCirculation)) : Peugeot 208 (123TN4567).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_VEHICLE
SELECT DISTINCT ?x ?marque ?modele ?immatriculation ?annee ?valeur ?typeVehicule
WHERE {
  ?x a/rdfs:subClassOf* actors:Vehicule .
  ?claim actors:concerne ?x .
  ?claim a/rdfs:subClassOf* actors:AccidentCirculation .
  OPTIONAL { ?x actors:marque ?marque }
  OPTIONAL { ?x actors:modele ?modele }
  OPTIONAL { ?x actors:immatriculation ?immatriculation }
  OPTIONAL { ?x actors:anneeFabrication ?annee }
  OPTIONAL { ?x actors:valeurVehicule ?valeur }
  OPTIONAL { ?x a ?typeVehicule . ?typeVehicule rdfs:subClassOf actors:Vehicule }
}
ORDER BY ?x
```

### Quels sinistres ont été évalués par l'expert Karim ?

- Intention : `SEARCH_CLAIM` [] — confiance 1.0
- Entités : [('Karim', ['Expert_001'])]
- Explication : 1 sinistre trouvé (expert Karim Trabelsi) : S-001 (AccidentCirculation, Tunis).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_CLAIM
SELECT DISTINCT ?x ?numero ?date ?lieu ?description ?statut ?typeSinistre
WHERE {
  ?x a/rdfs:subClassOf* actors:Sinistre .
  ?x actors:faitObjetDe ?expertise .
  ?expertise actors:realisePar ?expert .
  VALUES ?expert { actors:Expert_001 }
  OPTIONAL { ?x actors:numeroSinistre ?numero }
  OPTIONAL { ?x actors:dateSinistre ?date }
  OPTIONAL { ?x actors:lieuSinistre ?lieu }
  OPTIONAL { ?x actors:descriptionSinistre ?description }
  OPTIONAL { ?x actors:statutSinistre ?statut }
  OPTIONAL { ?x a ?typeSinistre . ?typeSinistre rdfs:subClassOf actors:Sinistre }
}
ORDER BY ?x
```

### Quels contrats possèdent une garantie tous risques ?

- Intention : `SEARCH_CONTRACT` ['FILTER_BY_TYPE'] — confiance 1.0
- Entités : []
- Explication : 1 contrat trouvé (type « tous risques » (GarantieDommagesTousAccidents)) : C-001 (AssuranceTousRisques, Actif).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_CONTRACT
SELECT DISTINCT ?x ?numero ?statut ?debut ?fin ?typeContrat ?prime
WHERE {
  ?x a/rdfs:subClassOf* actors:ContratAssurance .
  ?x actors:contient ?guarantee .
  ?guarantee a/rdfs:subClassOf* actors:GarantieDommagesTousAccidents .
  OPTIONAL { ?x actors:numeroContrat ?numero }
  OPTIONAL { ?x actors:statutContrat ?statut }
  OPTIONAL { ?x actors:dateDebut ?debut }
  OPTIONAL { ?x actors:dateFin ?fin }
  OPTIONAL { ?x a ?typeContrat . ?typeContrat rdfs:subClassOf actors:ContratAssurance }
  OPTIONAL { ?x actors:aPourPrime/actors:montantPrime ?prime }
}
ORDER BY ?x
```

### Quels sinistres ont une indemnisation supérieure à 3000 euros ?

- Intention : `SEARCH_CLAIM` ['FILTER_BY_AMOUNT'] — confiance 1.0
- Entités : []
- Explication : 2 sinistres trouvés (montant d'indemnisation supérieur à 3000) : S-001 (AccidentCirculation, Tunis); S-003 (IncendieVehicule, Sfax).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_CLAIM
SELECT DISTINCT ?x ?numero ?date ?lieu ?description ?statut ?typeSinistre
WHERE {
  ?x a/rdfs:subClassOf* actors:Sinistre .
  ?x actors:provoque ?damage .
  ?damage actors:donneLieuA ?indemnification .
  ?indemnification actors:montantIndemnisation ?montant1 .
  FILTER(?montant1 > 3000.0)
  OPTIONAL { ?x actors:numeroSinistre ?numero }
  OPTIONAL { ?x actors:dateSinistre ?date }
  OPTIONAL { ?x actors:lieuSinistre ?lieu }
  OPTIONAL { ?x actors:descriptionSinistre ?description }
  OPTIONAL { ?x actors:statutSinistre ?statut }
  OPTIONAL { ?x a ?typeSinistre . ?typeSinistre rdfs:subClassOf actors:Sinistre }
}
ORDER BY ?x
```

### Quels contrats ne couvrent pas le vol ?

- Intention : `SEARCH_CONTRACT` ['FILTER_BY_TYPE'] — confiance 1.0
- Entités : []
- Explication : 3 contrats trouvés (pas de type « vol » (GarantieVol)) : C-002 (AssuranceResponsabiliteCivile, Actif); C-003 (AssuranceIntermediaire, Actif); C-004 (AssuranceResponsabiliteCivile, Expire).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_CONTRACT
SELECT DISTINCT ?x ?numero ?statut ?debut ?fin ?typeContrat ?prime
WHERE {
  ?x a/rdfs:subClassOf* actors:ContratAssurance .
  FILTER NOT EXISTS { ?x actors:contient ?n1_guarantee . ?n1_guarantee a/rdfs:subClassOf* actors:GarantieVol . }
  OPTIONAL { ?x actors:numeroContrat ?numero }
  OPTIONAL { ?x actors:statutContrat ?statut }
  OPTIONAL { ?x actors:dateDebut ?debut }
  OPTIONAL { ?x actors:dateFin ?fin }
  OPTIONAL { ?x a ?typeContrat . ?typeContrat rdfs:subClassOf actors:ContratAssurance }
  OPTIONAL { ?x actors:aPourPrime/actors:montantPrime ?prime }
}
ORDER BY ?x
```

### Quels contrats couvrent le vol mais pas l'incendie ?

- Intention : `SEARCH_CONTRACT` ['FILTER_BY_TYPE'] — confiance 1.0
- Entités : []
- Explication : 1 contrat trouvé (type « vol » (GarantieVol); pas de type « incendie » (GarantieIncendie)) : C-001 (AssuranceTousRisques, Actif).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_CONTRACT
SELECT DISTINCT ?x ?numero ?statut ?debut ?fin ?typeContrat ?prime
WHERE {
  ?x a/rdfs:subClassOf* actors:ContratAssurance .
  ?x actors:contient ?guarantee .
  ?guarantee a/rdfs:subClassOf* actors:GarantieVol .
  FILTER NOT EXISTS { ?x actors:contient ?n1_guarantee . ?n1_guarantee a/rdfs:subClassOf* actors:GarantieIncendie . }
  OPTIONAL { ?x actors:numeroContrat ?numero }
  OPTIONAL { ?x actors:statutContrat ?statut }
  OPTIONAL { ?x actors:dateDebut ?debut }
  OPTIONAL { ?x actors:dateFin ?fin }
  OPTIONAL { ?x a ?typeContrat . ?typeContrat rdfs:subClassOf actors:ContratAssurance }
  OPTIONAL { ?x actors:aPourPrime/actors:montantPrime ?prime }
}
ORDER BY ?x
```

### Quels véhicules ne sont pas assurés par Ahmed ?

- Intention : `SEARCH_VEHICLE` [] — confiance 1.0
- Entités : [('Ahmed', ['AhmedBenAli'])]
- Explication : 2 véhicules trouvés (pas de assuré Ahmed Ben Ali) : Yamaha MT-07 (87TN3321); Renault Clio (245TN8812).

```sparql
PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
# Généré par le module NLP (règles + templates) — intention SEARCH_VEHICLE
SELECT DISTINCT ?x ?marque ?modele ?immatriculation ?annee ?valeur ?typeVehicule
WHERE {
  ?x a/rdfs:subClassOf* actors:Vehicule .
  FILTER NOT EXISTS { ?n1_contract actors:couvre ?x . ?n1_insured actors:possede ?n1_contract . VALUES ?n1_insured { actors:AhmedBenAli } }
  OPTIONAL { ?x actors:marque ?marque }
  OPTIONAL { ?x actors:modele ?modele }
  OPTIONAL { ?x actors:immatriculation ?immatriculation }
  OPTIONAL { ?x actors:anneeFabrication ?annee }
  OPTIONAL { ?x actors:valeurVehicule ?valeur }
  OPTIONAL { ?x a ?typeVehicule . ?typeVehicule rdfs:subClassOf actors:Vehicule }
}
ORDER BY ?x
```

## Limites connues (honnêtes)

- **Français uniquement**, domaine fermé : le vocabulaire vient du dictionnaire `lexicon.py` et des individus du graphe. Un terme absent du dictionnaire n'est pas deviné : la question est refusée (`clarification_needed`).
- **Négation** : prise en charge pour les **types, statuts, entités et existences de relation** (`ne … pas`, `ne … jamais`, `n'… aucun`, `sans`, `pas de`, `mais pas`, `ni`). Elle est **refusée** (jamais ignorée) pour les **montants et dates** (« pas supérieur à 3000 »), les structures restrictives « ne … que » et toute négation dont la portée n'est pas identifiable.
- **Hypothèse de portée** : la portée d'une négation va du marqueur jusqu'à la ponctuation ou à « mais/alors/puis ». « ne couvrent pas le vol et l'incendie » est lu comme « ni l'un ni l'autre ».
- **Une seule question à la fois** : pas de dialogue, pas d'anaphore (« et leurs montants ? »), pas de raisonnement multi-étapes, pas de comparaison entre entités.
- **« accident »** = sous-classe `AccidentCirculation` ; « sinistre » = classe `Sinistre`. « Contrats couvrant les dommages matériels » est interprété via Contrat ← Sinistre → Dommage (l'ontologie n'a pas de lien Garantie ↔ type de dommage).
- **Lecture seule** : toute demande de modification (supprimer, ajouter, créer, modifier…) est refusée ; les ordres SQL/SPARQL (DROP, DELETE, INSERT…) dans la question aussi.
- Les **résultats sont ceux du graphe RDF courant** (RDFLib) ; ce n'est pas un raisonneur OWL : `ContratActif` / `SinistreExpertise` sont répondus par des filtres équivalents (validés contre HermiT, voir `HERMIT_VALIDATION.md`).
- Aucune requête n'est exécutée si l'entité est inconnue, ambiguë, ou si son rôle est incompatible avec le verbe (ex. « évalués par Ahmed » alors qu'Ahmed est un assuré).
