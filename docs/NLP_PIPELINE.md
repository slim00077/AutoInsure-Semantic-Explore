# Module NLP/TALN : question en français → SPARQL

**Aucune API LLM** (OpenAI, Gemini, Claude, OpenRouter…) n'est appelée, ni directement ni indirectement. Le module est entièrement local et déterministe : spaCy + NLTK + RDFLib + règles + dictionnaire + templates. Code : `semantic-service/app/nlp/`.

## Bibliothèques utilisées

| Bibliothèque | Version | Rôle |
|---|---|---|
| **spaCy** | 3.8.2 | Modèle statistique local `fr_core_news_md` : tokenisation, lemmatisation, étiquettes morpho-syntaxiques (POS), dépendances, reconnaissance d'entités nommées |
| **NLTK** | 3.9.1 | `nltk.metrics.edit_distance` : tolérance aux fautes de frappe (« peugot » → Peugeot) |
| **RDFLib** | 7.1.1 | Lecture du graphe, gazetteer des individus, validation syntaxique des requêtes générées, exécution |
| Code maison | — | Dictionnaire de synonymes, règles d'intention, mapping OWL, templates SPARQL |

## Pipeline

```
Question → 1 Prétraitement → 2 spaCy → 3 Entités (gazetteer + références codées) → 4 Nombres/dates/comparateurs
        → 5 Concepts & synonymes → 6 Intention + focus + contraintes → 7 Template SPARQL → 8 Validation → 9 Exécution → 10 Explication
```

Chaque étape est affichée dans la page *Recherche NLP* avec son temps d'exécution.

1. **Prétraitement** (`analyzer.preprocess`) : normalisation Unicode, apostrophes, espaces ; une question écrite **en majuscules** (> 70 % de lettres capitales) est passée en minuscules (sinon chaque mot ressemble à un nom propre inconnu) et l'analyse se fie alors à l'étiquette spaCy plutôt qu'à la casse.
2. **spaCy** : tokens, lemmes, POS, dépendances, NER. Le POS lève des ambiguïtés : « assurés » **VERB** (participe, relation *assurer*) ≠ « assurés » **NOUN** (concept *Assuré*).
3. **Entités liées aux individus** (`gazetteer.py`) : le gazetteer est reconstruit à partir du graphe RDF (invalidé à chaque modification) : prénom, nom, nom complet, marque, marque + modèle, immatriculation, raison sociale, lieux. Références codées par regex : « sinistre 001 », « contrat C-003 », « S-002 ». Correspondance approchée NLTK pour les mots ≥ 5 lettres.
4. **Nombres** : montants (`3000`, `3 000 €`, `3.000`), comparateurs (« supérieur à », « plus de », « dépasse », « au moins », « inférieur à », « moins de », « au plus », « égal à », « entre X et Y », comparateur postposé « 3000 euros au plus »), dates (année, mois + année, « avant/après/depuis 2026 », « en octobre », AAAA-MM-JJ, JJ/MM/AAAA).
5. **Concepts et synonymes** (`lexicon.py`) : correspondance du plus long n-gramme sur formes ou lemmes normalisés (sans accents, singulier). Les concepts « classe » (véhicule, assuré, contrat, garantie, sinistre, dommage, expertise, indemnisation, compagnie, garage…), « type » (sous-classes OWL), « statut », « attribut » et « verbe » sont reliés à l'ontologie.
6. **Intention et frame** (`analyzer._build_frame`), puis **demandes d'écriture** (`_detect_write_request`), **négation** (`_apply_negation`) et **existence positive** (`_add_positive_existence`).
7. **Template SPARQL** (`templates.py`).
8. **Validation** : `prepareQuery` (RDFLib) ; refus si invalide.
9. **Exécution** par le store ; `SERVICE` interdit.
10. **Explication** en français (`service._explain`) avec décompte et libellés lisibles.

## Intentions

| Intention | Déclenchée quand le focus (premier nom de concept) est… |
|---|---|
| `SEARCH_VEHICLE` | véhicule / voiture / automobile / auto |
| `SEARCH_INSURED` | assuré / client / souscripteur / conducteur / victime / « qui » |
| `SEARCH_CONTRACT` | contrat / police / assurance |
| `SEARCH_GUARANTEE` | garantie / couverture / protection |
| `SEARCH_CLAIM` | sinistre / dossier / incident (ou un type de sinistre : accident, vol, incendie…) |
| `SEARCH_DAMAGE` | dommage / dégât / préjudice |
| `SEARCH_EXPERTISE` | expertise / évaluation / expert / rapport |
| `SEARCH_INDEMNIFICATION` | indemnisation / remboursement / indemnité / dédommagement |
| `FILTER_BY_AMOUNT` | (modificateur) comparateur + montant |
| `FILTER_BY_DATE` | (modificateur) année, mois, date, avant/après/depuis |
| `FILTER_BY_TYPE` | (modificateur) type = sous-classe OWL (moto, vol, tous risques, dommage matériel…) |

Types de question : liste, **comptage** (« combien »), valeur d'attribut (« quel est le montant de… »). Extras : `SEARCH_COMPANY`, `SEARCH_GARAGE`.

## Dictionnaire de synonymes (extrait)

| Concept OWL | Termes |
|---|---|
| Vehicule | véhicule, voiture, automobile, auto, engin |
| Assure | assuré, client, souscripteur, titulaire, adhérent |
| Indemnisation | indemnisation, remboursement, indemnité, dédommagement, compensation |
| Garantie | garantie, couverture, protection |
| ContratAssurance | contrat, police, assurance, formule |
| AccidentCirculation | accident, collision, accrochage, choc |
| GarantieDommagesTousAccidents / AssuranceTousRisques | tous risques, dommages tous accidents |
| GarantieBrisDeGlace / BrisDeGlace | bris de glace, pare-brise, vitre |
| Statuts | accepté/validé → Acceptee ; refusé/rejeté → Refusee ; en cours → EnCours ; actif → Actif ; expiré/échu → Expire |

Liste complète : onglet « Dictionnaire & intentions » de la page Recherche NLP, ou `GET /api/nlp/module`.

## Règles notables

- **Focus** = premier concept « classe » ; un concept « type » placé avant (« Quels accidents… ») impose son focus ; « qui » → assuré (ou expert/garage selon le verbe). Sans mot interrogatif (« Montre le contrat C-001 »), l'entité désignée est retournée.
- **Rôle d'une entité** : indice explicite (« l'expert Ahmed ») > rôle attendu par le verbe (*évaluer* → Expert ; *déclarer*, *posséder* → Assuré ; *conduire* → Conducteur ; *réparer* → Garage) > ambiguïté. Homonymes (Trabelsi = expert **et** assurée) → clarification si rien ne tranche.
- **Types à double sens** (« vol » : garantie *ou* sinistre) : classe explicite devant (« garantie vol »), verbe (*couvrir* → garantie ; *subir/déclarer* → sinistre), sinon valeur par défaut selon le focus. « Tous risques » sur un contrat = type de contrat **ou** garantie *Dommages tous accidents* (UNION).
- **Montant** : rattaché au concept le plus proche à gauche du comparateur (indemnisation → `montantIndemnisation`, dommage → `coutEstime`, prime, valeur du véhicule, plafond, franchise) sinon valeur par défaut selon le focus.
- **Jointures** : déduites d'un graphe de relations de l'ontologie (`templates.EDGES`, ex. `Assure -possede-> Contrat -couvre-> Vehicule`) par plus court chemin pondéré ; les personnes/organisations ne sont jamais traversées (évite des raccourcis sémantiquement faux). Les variables intermédiaires sont partagées entre contraintes (« véhicules ayant subi un **accident en 2026** » exige le même sinistre).

## Négation (analyse linguistique explicite)

La négation n'est **jamais ignorée** : elle est détectée, sa portée est calculée, puis traduite en `FILTER NOT EXISTS` ; sinon la question est refusée.

1. **Marqueurs** (`lexicon.NEG_*`) : discontinus `ne … pas / jamais / plus / aucun(e) / guère / point` (la particule `ne` / `n'` + un second terme dans les 6 tokens) ; isolés `sans`, `pas`, `aucun(e)`, `jamais`, `non`, `sauf`, `hors` (« pas de », « mais pas »). Les tokens déjà reconnus comme concept (ex. « non réglé ») ne sont pas des marqueurs ; « plus de 3000 » reste un comparateur.
2. **Portée** : du marqueur (la particule `ne` incluse, donc le verbe nié est dans la portée) jusqu'à la ponctuation ou à une conjonction d'opposition (`mais`, `alors`, `puis`…). `et / ou / ni` **prolongent** la portée : « ne couvrent pas le vol et l'incendie » = ni l'un ni l'autre. La réponse expose le marqueur, la portée, le gouverneur spaCy (`head`) et les dépendances (`dep`).
3. **Ce qui est nié** (contraintes dont le jeton est dans la portée) : **type** (« pas de garantie vol »), **statut** (« pas actif »), **entité** (« pas assurés par Ahmed »), **existence d'une relation** (« n'ont pas de sinistre », « sans indemnisation », verbe nié : « ne sont pas indemnisés » → pas d'indemnisation).
4. **Gabarit sûr** : la contrainte est construite seule (seul `?x` lié) avec des variables **privées** `?n1_…`, puis enveloppée dans `FILTER NOT EXISTS { … }` — aucune corrélation accidentelle avec les contraintes affirmées : « couvrent le vol **mais pas** l'incendie » ⇒ `?x contient ?guarantee (vol)` ET `NOT EXISTS { ?x contient ?n1_guarantee (incendie) }`.
5. **Refus explicites (statut `unsupported`, rien n'est exécuté)** : négation d'un **montant ou d'une date** (« pas supérieur à 3000 » — reformuler « inférieur à »), structure restrictive « **ne … que** », négation dont la portée ne contient aucun critère reconnu (« Quels contrats ne sont pas ? »).

Sémantique : négation **par l'échec** (monde fermé du graphe RDF), pas la négation classique d'OWL. Question « Quels contrats ne couvrent pas le vol ? » → complémentaire exact de « Quels contrats couvrent le vol ? » (testé).

## Rôles incompatibles et demandes d'écriture

- **Rôle strict** (`lexicon.STRICT_VERB_ROLES`) : *évaluer* attend un Expert, *conduire* un Conducteur, *déclarer* un Assuré/Conducteur. Une personne d'un autre rôle (« évalués par **Ahmed** » alors qu'Ahmed est assuré ; « conduits par l'**expert** Karim ») produit `entity_not_found` avec « rôle incompatible » — **aucune requête**.
- **Écriture** (`lexicon.WRITE_VERBS` / `WRITE_KEYWORDS`) : « Supprime / Efface / Ajoute / Crée / Modifie… » (hors participes passés comme « refusées ») et mots-clés `DROP DELETE INSERT UPDATE CLEAR TRUNCATE ALTER` → `unsupported`, « la recherche en langage naturel est en lecture seule ».
- « **Qui** a déclaré un sinistre ? » → liste de **personnes** (`SEARCH_INSURED`) : « qui » l'emporte sur la classe nommée (`sinistre`).
- **Existence affirmative** : un concept de classe non-focus sans autre contrainte (« assurés qui ont **un sinistre** », « véhicules réparés par **un garage** ») devient une contrainte d'existence (le chemin de relations impose le lien).

## Templates SPARQL

Un gabarit de base par focus (colonnes `OPTIONAL` adaptées : véhicule → marque, modèle, immatriculation, année, valeur…), plus des fragments : `entité`, `type`, `statut`, `filtre montant`, `filtre date`, `filtre lieu`. Identifiant de template renvoyé : ex. `SEARCH_CONTRACT_LIST`, fragments `base:contract · type:GarantieVol`.

Exemple (« Quels contrats couvrent le vol ? ») :

```sparql
SELECT DISTINCT ?x ?numero ?statut ?debut ?fin ?typeContrat ?prime
WHERE {
  ?x a/rdfs:subClassOf* actors:ContratAssurance .
  ?x actors:contient ?guarantee .
  ?guarantee a/rdfs:subClassOf* actors:GarantieVol .
  OPTIONAL { ?x actors:numeroContrat ?numero }
  ...
}
ORDER BY ?x
```

## Sécurité

- Aucune sous-chaîne de la question n'est concaténée dans le SPARQL.
- Individus : nom local `^[A-Za-z][A-Za-z0-9_]{0,80}$` **et** présent dans le gazetteer ; classes : vérifiées dans l'ontologie ; nombres : `Decimal` fini borné ; statuts : liste blanche ; lieux : chaîne issue du graphe, échappée.
- Limite 500 caractères ; tests d'injection (`"} ; DROP ALL`, `<http://evil…>`, commentaires `# INSERT`) montrant que le SPARQL produit ne contient aucune opération d'écriture ni IRI externe.

## Gestion des échecs (jamais de fausse compréhension)

| Statut | Cas | Comportement |
|---|---|---|
| `clarification_needed` | pas de focus, confiance < 50 %, entité ambiguë | message + suggestions, **pas d'exécution** |
| `entity_not_found` | nom inconnu, rôle incompatible (« expert Ahmed »), référence inexistante (« sinistre 007 ») | message explicite, **pas d'exécution** |
| `unsupported` | compris mais non traduisible (aucune relation OWL), **négation non sûre**, **demande d'écriture** | message, **pas d'exécution** |
| `ok` | requête valide exécutée | résultats + explication |

## Limites

Français uniquement ; négation limitée aux types/statuts/entités/existences (voir ci-dessus) ; pas de disjonctions arbitraires, de superlatifs ni de questions multi-étapes ; pas d'agrégats autres que le comptage ; vocabulaire limité au dictionnaire (extensible dans `lexicon.py`) ; « accident » = `AccidentCirculation` ; la correspondance approchée ne s'applique qu'aux noms d'individus ; montants sans conversion de devise ; la qualité dépend du modèle spaCy `md` (erreurs de POS possibles sur des tournures rares).

## Étendre le module

1. Ajouter des termes dans `lexicon.py` (`CLASS_CONCEPTS`, `TYPE_CONCEPTS`, …).
2. Nouvelle relation : ajouter une arête dans `templates.EDGES`.
3. Nouvelle colonne : `templates.COLUMNS`.
4. Ajouter un cas dans `tests/test_nlp.py::CASES` (question, intention, entités, résultats attendus) et dans `tools/nlp_validation_report.py::CASES` (puis `npm run report:nlp` régénère [NLP_VALIDATION_REPORT.md](NLP_VALIDATION_REPORT.md) avec vérité terrain SPARQL).
