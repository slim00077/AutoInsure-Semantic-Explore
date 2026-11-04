# Guide de démonstration (≈ 12 minutes)

## Avant de commencer

```bash
npm run dev            # puis ouvrir http://localhost:5173
```

Si l'état a été modifié lors d'une répétition : *Ontology Explorer → Réinitialiser* (sauvegarde automatique).

## Déroulé

1. **Accueil (1 min)** — problématique, chaîne Assuré → … → Indemnisation, chiffres réels de l'ontologie (45 classes, 69 propriétés, 56 individus, 846 triplets). Cliquer *Accéder à l'application*.
2. **Dashboard (1 min)** — KPI et graphiques *calculés par SPARQL* ; badge « Cohérente » (validation structurelle). Garder cet écran pour la suite.
3. **Ontology Explorer (2 min)** — Hiérarchie → `ContratAssurance` : sous-classes, **axiomes** (≥1 prime, ≥1 garantie, ≥1 véhicule, ∃ RC), classes disjointes, individus. Onglet *Propriétés* (domaine/range, inverse, fonctionnelle). Onglet **Ontographe** : survol d'un nœud, « Toutes les classes », *Instances*. Onglet *Cohérence* + rappel HermiT/Protégé et export RDF/XML.
4. **CRUD et persistance (3 min)**
   1. *Assurés* → Ajouter « Sonia Mansour » (permis `B9988776`) ; tenter un doublon → message 409/422.
   2. *Véhicules* → Ajouter une Kia Picanto reliée à Sonia comme conducteur.
   3. *Contrats* → Créer un contrat **Tous risques** : l'application ajoute seule *RC* et *Dommages tous accidents* (axiomes OWL).
   4. *Sinistres* → Déclarer un accident ; ajouter un dommage ; *Expertises* → expert + rapport ; *Indemnisations* → barème : le montant `(coût − franchise) × taux` est calculé en direct.
   5. Retour *Dashboard* : les compteurs ont changé. Dans *SPARQL Explorer*, montrer le nouvel individu (`ASK { actors:SoniaMansour a actors:Assure }`).
   6. Redémarrer le service (`Ctrl+C`, `npm run dev`) : les données sont toujours là (`data/assurance_live.ttl`).
   7. Tenter de supprimer Sonia (409 : encore référencée), puis supprimer dans l'ordre inverse.
5. **SPARQL Explorer (1 min 30)** — exemples (jointure, GROUP BY, ASK), filtrage des résultats, erreur de syntaxe expliquée, `SERVICE`/`CLEAR ALL` refusés, historique.
6. **Recherche NLP (3 min)** — c'est le cœur de la validation :
   - Bandeau « **aucune API LLM** » : spaCy 3.8.2 · NLTK 3.9.1 · RDFLib 7.1.1.
   - « Quels véhicules sont assurés par Ahmed ? » → détailler : tokens/lemmes/POS (*assurés* = VERB), intention `SEARCH_VEHICLE`, entité liée à `AhmedBenAli`, SPARQL, résultat, temps.
   - « Quels contrats couvrent le vol ? » → `FILTER_BY_TYPE` (garantie vs sinistre).
   - « Quels sinistres ont une indemnisation supérieure à 3000 euros ? » → `FILTER_BY_AMOUNT`.
   - « Quels assurés ont déclaré un accident en 2026 ? » → type + date.
   - **« …évalués par l'expert Ahmed ? »** → refus explicite (aucun expert Ahmed ; Ahmed Ben Ali est un assuré). Créer l'expert *Ahmed Kefi* (page Expertises) + une expertise, relancer : la requête devient exécutable.
   - « Quels sinistres concernent Trabelsi ? » → ambiguïté (expert / assurée) → clarification.
   - « Quel temps fait-il à Paris ? » → « je n'ai pas compris », aucune requête.
   - Ouvrir *Dictionnaire & intentions* : synonymes, intentions, pipeline.
7. **Tests (30 s)** — `npm test` : 66 tests Python + 63 tests API ; montrer le test de retour exact au nombre de triplets initial.

## Questions probables du jury

| Question | Élément de réponse |
|---|---|
| Pourquoi pas de LLM ? | Contrainte du professeur ; le module est réellement développé : spaCy (analyse) + NLTK + RDFLib + règles/dictionnaire/templates ; `llm:false` exposé par l'API. |
| Comment évitez-vous les injections ? | Aucune chaîne de la question dans le SPARQL ; individus validés dans le gazetteer ; littéraux échappés ; tests dédiés. |
| Et si la question est ambiguë ? | Statuts `clarification_needed` / `entity_not_found` : jamais d'exécution sur une compréhension douteuse. |
| Raisonnement OWL ? | RDFLib ne raisonne pas : inverses matérialisées, `subClassOf*` dans les requêtes, axiomes appliqués par l'API, HermiT dans Protégé. |
| Pourquoi pas Fuseki ? | Java non requis, volumétrie faible ; interface identique, migration localisée dans `semantic/client.ts`. |
| Ontologie modifiée ? | Original intact ; deux propriétés ajoutées dans un fichier d'extension séparé (statut de sinistre, contenu de rapport). |
| Limites ? | Voir README § Limites (HermiT non exécuté ici, français seul, pas de négation, devise non gérée). |

## Plan B

- Service Python lent au démarrage (spaCy) : attendre le badge vert « Triple store connecté ».
- Port occupé : `SEMANTIC_PORT`, `PORT` (backend), `vite --port`.
- État incohérent après répétition : *Réinitialiser* ou supprimer `data/assurance_live.ttl`.
