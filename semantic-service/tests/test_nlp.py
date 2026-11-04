"""Tests du module NLP/TALN : intentions, entités, SPARQL généré (validité + résultats), cas ambigus."""
import pytest
from rdflib.plugins.sparql import prepareQuery

from app.nlp.lexicon import CONCEPT_INDEX, INTENTS, normalize, normalize_phrase
from app.store import with_prefixes

# (question, intention, modificateurs, ids d'individus liés attendus, ids résultats attendus)
CASES = [
    ("Quels véhicules sont assurés par Ahmed ?", "SEARCH_VEHICLE", [], ["AhmedBenAli"], ["Voiture_001"]),
    ("Quels contrats couvrent le vol ?", "SEARCH_CONTRACT", ["FILTER_BY_TYPE"], [], ["Contrat_001"]),
    ("Quels sinistres concernent une Peugeot 208 ?", "SEARCH_CLAIM", [], ["Voiture_001"], ["Sinistre_001"]),
    ("Quel est le montant de l'indemnisation du sinistre 001 ?", "SEARCH_INDEMNIFICATION", [], ["Sinistre_001"], ["Indemnisation_001", "Indemnisation_004"]),
    ("Quels assurés ont déclaré un accident en 2026 ?", "SEARCH_INSURED", ["FILTER_BY_DATE", "FILTER_BY_TYPE"], [], ["AhmedBenAli"]),
    ("Quels contrats couvrent les dommages matériels ?", "SEARCH_CONTRACT", ["FILTER_BY_TYPE"], [], ["Contrat_001", "Contrat_002", "Contrat_003"]),
    ("Quels véhicules ont subi un accident ?", "SEARCH_VEHICLE", ["FILTER_BY_TYPE"], [], ["Voiture_001"]),
    ("Quels contrats possèdent une garantie tous risques ?", "SEARCH_CONTRACT", ["FILTER_BY_TYPE"], [], ["Contrat_001"]),
    ("Quels sinistres ont une indemnisation supérieure à 3000 euros ?", "SEARCH_CLAIM", ["FILTER_BY_AMOUNT"], [], ["Sinistre_001", "Sinistre_003"]),
    ("Quels dommages corporels ont été déclarés ?", "SEARCH_DAMAGE", ["FILTER_BY_TYPE"], [], ["Dommage_004"]),
    ("Quelles expertises a réalisées l'expert Gharbi ?", "SEARCH_EXPERTISE", [], ["Expert_002"], ["Expertise_002"]),
    ("Quelles garanties couvre le contrat C-003 ?", "SEARCH_GUARANTEE", [], ["Contrat_003"], ["GarantieBrisDeGlace_003", "GarantieIncendie_003", "GarantieRC_003"]),
    ("Quelles indemnisations ont été refusées ?", "SEARCH_INDEMNIFICATION", [], [], ["Indemnisation_002"]),
    ("Quels sinistres ont eu lieu à Sfax ?", "SEARCH_CLAIM", [], [], ["Sinistre_003"]),
    ("Quels sinistres avant 2026 ?", "SEARCH_CLAIM", ["FILTER_BY_DATE"], [], []),
    ("Quelles motos sont assurées ?", "SEARCH_VEHICLE", ["FILTER_BY_TYPE"], [], ["Moto_001"]),
    ("Quels contrats ont une prime supérieure à 500 ?", "SEARCH_CONTRACT", ["FILTER_BY_AMOUNT"], [], ["Contrat_001", "Contrat_003"]),
]


@pytest.mark.parametrize("question,intent,modifiers,entities,ids", CASES)
def test_question_to_sparql_to_results(nlp_service, shared_store, question, intent, modifiers, entities, ids):
    r = nlp_service.search(question, shared_store)
    assert r["status"] == "ok", r["message"]
    assert r["intent"] == intent
    assert sorted(r["modifiers"]) == sorted(modifiers)
    linked = [x["id"] for e in r["entities"] for x in e["resolved"]]
    for ent in entities:
        assert ent in linked
    # SPARQL valide (analyse syntaxique RDFLib), préfixé, sans clause dangereuse
    assert r["valid"] is True
    prepareQuery(with_prefixes(r["sparql"]))
    assert "SERVICE" not in r["sparql"].upper() and "DROP" not in r["sparql"].upper()
    # résultat
    assert r["executed"] is True
    got = sorted({row["x"]["local"] for row in r["result"]["rows"]})
    assert got == sorted(ids)
    assert r["explanation"]
    assert r["executionMs"] >= 0


def test_tokens_lemmas_pos_come_from_spacy(nlp_service, shared_store):
    r = nlp_service.translate("Quels véhicules sont assurés par Ahmed ?", shared_store)
    toks = {t["text"]: t for t in r["tokens"]}
    assert toks["véhicules"]["lemma"] == "véhicule" and toks["véhicules"]["pos"] == "NOUN"
    assert toks["assurés"]["pos"] == "VERB"  # participe : relation « assurer », pas le concept Assuré
    assert any(e["label"] == "PER" for e in r["spacyEntities"])
    assert [s["name"] for s in r["steps"]][:3] == [
        "Prétraitement", "spaCy (tokenisation, lemmatisation, POS, dépendances, NER)",
        "Extraction des entités (gazetteer ontologie + références codées)",
    ]


def test_noun_vs_participle_disambiguation(nlp_service, shared_store):
    noun = nlp_service.translate("Quels assurés ont déclaré un accident ?", shared_store)
    assert noun["focus"] == "insured"
    verb = nlp_service.translate("Quels véhicules sont assurés par Ahmed ?", shared_store)
    assert verb["focus"] == "vehicle"


@pytest.mark.parametrize(
    "q,intent",
    [
        ("Quelles voitures sont couvertes ?", "SEARCH_VEHICLE"),
        ("Quelles automobiles ont été expertisées ?", "SEARCH_VEHICLE"),
        ("Quels clients ont un sinistre ?", "SEARCH_INSURED"),
        ("Quels souscripteurs ont un contrat actif ?", "SEARCH_INSURED"),
        ("Montre les remboursements refusés", "SEARCH_INDEMNIFICATION"),
        ("Quelles indemnités dépassent 3000 ?", "SEARCH_INDEMNIFICATION"),
        ("Quelles couvertures incendie existent ?", "SEARCH_GUARANTEE"),
        ("Quelles polices sont actives ?", "SEARCH_CONTRACT"),
        ("Quels dégâts matériels ?", "SEARCH_DAMAGE"),
    ],
)
def test_french_synonyms(nlp_service, shared_store, q, intent):
    assert nlp_service.translate(q, shared_store)["intent"] == intent


def test_all_required_intents_exist():
    for i in ["SEARCH_VEHICLE", "SEARCH_INSURED", "SEARCH_CONTRACT", "SEARCH_GUARANTEE", "SEARCH_CLAIM", "SEARCH_DAMAGE",
              "SEARCH_EXPERTISE", "SEARCH_INDEMNIFICATION", "FILTER_BY_AMOUNT", "FILTER_BY_DATE", "FILTER_BY_TYPE"]:
        assert i in INTENTS


def test_lexicon_normalization():
    assert normalize("Assurés") == "assure" and normalize("l'assuré") == "assure"
    assert normalize_phrase("Bris de glace") == normalize_phrase("bris  de  glaces")[:2] + ("glace",)
    assert normalize_phrase("bris de glace") in CONCEPT_INDEX  # clé de singularisation cohérente côté dictionnaire et texte
    assert normalize_phrase("tous risques") in CONCEPT_INDEX


def test_amount_variants(nlp_service, shared_store):
    def rows(q):
        r = nlp_service.search(q, shared_store)
        assert r["status"] == "ok", r["message"]
        return sorted({x["x"]["local"] for x in r["result"]["rows"]})

    assert rows("Quelles indemnisations dépassent 4000 euros ?") == ["Indemnisation_001", "Indemnisation_003"]
    assert rows("Quelles indemnisations sont inférieures à 2500 euros ?") == ["Indemnisation_002", "Indemnisation_004"]
    assert rows("Quelles indemnisations sont comprises entre 2000 et 5000 euros ?") == ["Indemnisation_001", "Indemnisation_004"]
    assert rows("Quelles indemnisations d'au moins 9360 euros ?") == ["Indemnisation_003"]
    assert rows("Quelles indemnisations de 3 000 euros au plus ?") == ["Indemnisation_002", "Indemnisation_004"]


def test_date_variants(nlp_service, shared_store):
    def rows(q):
        r = nlp_service.search(q, shared_store)
        assert r["status"] == "ok", r["message"]
        return sorted({x["x"]["local"] for x in r["result"]["rows"]})

    assert rows("Quels sinistres en 2026 ?") == ["Sinistre_001", "Sinistre_002", "Sinistre_003"]
    assert rows("Quels sinistres depuis septembre 2026 ?") == ["Sinistre_001", "Sinistre_002"]
    assert rows("Quels sinistres après 2026 ?") == []
    assert rows("Quels sinistres en octobre 2026 ?") == ["Sinistre_001"]


def test_count_questions(nlp_service, shared_store):
    r = nlp_service.search("Combien de sinistres a déclaré Fatma Trabelsi ?", shared_store)
    assert r["questionType"] == "COUNT"
    assert r["result"]["rows"][0]["nombre"]["value"] == "1"
    assert "1 sinistre" in r["explanation"]


def test_entity_role_disambiguation(nlp_service, shared_store):
    expert = nlp_service.search("Quels sinistres ont été évalués par l'expert Trabelsi ?", shared_store)
    assert expert["status"] == "ok" and expert["entities"][0]["resolved"][0]["id"] == "Expert_001"
    insured = nlp_service.translate("Combien de sinistres a déclaré Trabelsi ?", shared_store)
    assert insured["entities"][0]["resolved"][0]["id"] == "FatmaTrabelsi"


def test_ambiguous_question_asks_clarification(nlp_service, shared_store):
    r = nlp_service.search("Quels sinistres concernent Trabelsi ?", shared_store)
    assert r["status"] == "clarification_needed"
    assert r["executed"] is False and r["sparql"] is None
    assert "ambigu" in r["message"]


def test_role_mismatch_is_not_papered_over(nlp_service, shared_store):
    r = nlp_service.search("Quels sinistres ont été évalués par l'expert Ahmed ?", shared_store)
    assert r["status"] == "entity_not_found"
    assert "Aucun expert nommé" in r["message"] and "Ahmed Ben Ali" in r["message"]
    assert r["sparql"] is None


@pytest.mark.parametrize("q", ["Quel temps fait-il à Paris ?", "Bonjour", "Raconte-moi une blague", "azerty uiop"])
def test_out_of_domain_never_pretends_to_understand(nlp_service, shared_store, q):
    r = nlp_service.search(q, shared_store)
    assert r["status"] in {"clarification_needed", "entity_not_found"}
    assert r["executed"] is False
    assert r["sparql"] is None


def test_unknown_entities(nlp_service, shared_store):
    assert nlp_service.search("Quels véhicules sont assurés par Mohamed ?", shared_store)["status"] == "entity_not_found"
    assert nlp_service.search("Quel est le sinistre 007 ?", shared_store)["status"] == "entity_not_found"
    assert nlp_service.search("Quelles voitures Mercedes ont subi un accident ?", shared_store)["status"] == "entity_not_found"


def test_show_entity_itself(nlp_service, shared_store):
    r = nlp_service.search("Montre le contrat C-001", shared_store)
    assert r["status"] == "ok" and r["intent"] == "SEARCH_CONTRACT"
    assert [x["x"]["local"] for x in r["result"]["rows"]] == ["Contrat_001"]


def test_typo_tolerance(nlp_service, shared_store):
    r = nlp_service.search("Quelles voitures peugot ont subi un accident ?", shared_store)
    assert r["status"] == "ok" and any(e["fuzzy"] for e in r["entities"])
    assert r["result"]["rows"][0]["x"]["local"] == "Voiture_001"


@pytest.mark.parametrize(
    "q",
    [
        'Quels véhicules sont assurés par Ahmed" } ; DROP ALL ; SELECT * WHERE { ?s ?p ?o',
        "Quels sinistres ont une indemnisation supérieure à 1; DELETE WHERE { ?s ?p ?o } euros ?",
        "Quels contrats couvrent le vol ? # INSERT DATA { <a> <b> <c> }",
        "Quels sinistres concernent <http://evil.example/x> ?",
    ],
)
def test_sparql_injection_attempts_are_inert(nlp_service, shared_store, q):
    r = nlp_service.search(q, shared_store)
    sparql = (r.get("sparql") or "").upper()
    for danger in ("DROP", "DELETE", "INSERT", "SERVICE", "LOAD", "CLEAR"):
        assert danger not in sparql
    assert "EVIL.EXAMPLE" not in sparql


def test_empty_and_too_long(nlp_service, shared_store):
    assert nlp_service.translate("   ", shared_store)["status"] == "empty"
    assert nlp_service.translate("a " * 400, shared_store)["status"] == "too_long"


def test_gazetteer_follows_data_changes(nlp_service, store):
    """Un nouvel individu ajouté au graphe est immédiatement reconnu (gazetteer lié à store.version)."""
    assert nlp_service.search("Quels véhicules sont assurés par Karim Zouari ?", store)["status"] == "entity_not_found"
    store.update(
        """INSERT DATA {
          actors:KarimZouari a owl:NamedIndividual, actors:Assure, actors:Conducteur ; actors:nom "Zouari" ; actors:prenom "Karim" ;
              actors:possede actors:Contrat_002 .
        }"""
    )
    r = nlp_service.search("Quels véhicules sont assurés par Karim Zouari ?", store)
    assert r["status"] == "ok"
    assert [x["x"]["local"] for x in r["result"]["rows"]] == ["Voiture_002"]
