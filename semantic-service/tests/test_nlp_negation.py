"""Négation, rôles incompatibles, demandes d'écriture et existence : le NLP ne doit jamais ignorer une négation
ni exécuter une requête dont il n'a pas compris la portée.

Données de référence : ontologie d'origine + extensions (Contrat_001 = tous risques avec vol ; Contrat_003 = incendie ; …).
"""
import pytest
from rdflib.plugins.sparql import prepareQuery

from app.store import with_prefixes


def _ids(r):
    return sorted({row["x"]["local"] for row in r["result"]["rows"]})


def _all_ids(nlp_service, store, focus_question):
    return _ids(nlp_service.search(focus_question, store))


# (question, résultat attendu) — la négation est l'ensemble complémentaire de la version affirmative
NEGATION_CASES = [
    ("Quels contrats ne couvrent pas le vol ?", ["Contrat_002", "Contrat_003", "Contrat_004"]),
    ("Quels contrats ne possèdent pas de garantie incendie ?", ["Contrat_001", "Contrat_002", "Contrat_004"]),
    ("Quels contrats sont sans garantie vol ?", ["Contrat_002", "Contrat_003", "Contrat_004"]),
    ("Quels contrats n'ont jamais couvert le vol ?", ["Contrat_002", "Contrat_003", "Contrat_004"]),
    ("Quels contrats ne couvrent pas le vol et l'incendie ?", ["Contrat_002", "Contrat_004"]),
    ("Quels contrats couvrent le vol mais pas l'incendie ?", ["Contrat_001"]),
    ("Quels contrats couvrent l'incendie mais pas le vol ?", ["Contrat_003"]),
    ("Quels contrats ne sont pas actifs ?", ["Contrat_004"]),
    ("Quels véhicules ne sont pas assurés par Ahmed ?", ["Moto_001", "Voiture_002"]),
    ("Quels assurés n'ont pas déclaré d'accident ?", ["FatmaTrabelsi", "YoussefHamdi"]),
    ("Quels sinistres ne sont pas des accidents ?", ["Sinistre_002", "Sinistre_003"]),
    ("Quelles indemnisations ne sont pas refusées ?", ["Indemnisation_001", "Indemnisation_003", "Indemnisation_004"]),
    ("Quels sinistres ne concernent pas une Peugeot 208 ?", ["Sinistre_002", "Sinistre_003"]),
]


@pytest.mark.parametrize("question,expected", NEGATION_CASES)
def test_negation_returns_complement(nlp_service, shared_store, question, expected):
    r = nlp_service.search(question, shared_store)
    assert r["status"] == "ok", r["message"]
    assert r["negations"], "la négation doit être détectée et exposée"
    assert "NOT EXISTS" in r["sparql"]
    prepareQuery(with_prefixes(r["sparql"]))
    assert _ids(r) == expected


def test_negation_is_exact_complement_of_affirmation(nlp_service, shared_store):
    yes = set(_ids(nlp_service.search("Quels contrats couvrent le vol ?", shared_store)))
    no = set(_ids(nlp_service.search("Quels contrats ne couvrent pas le vol ?", shared_store)))
    everything = set(_ids(nlp_service.search("Quels contrats ?", shared_store)))
    assert yes and no and not (yes & no) and (yes | no) == everything


def test_negation_scope_is_explained(nlp_service, shared_store):
    r = nlp_service.translate("Quels contrats ne couvrent pas le vol ?", shared_store)
    n = r["negations"][0]
    assert n["kind"] == "ne_pas" and n["cue"] == "ne … pas"
    assert "vol" in n["scope"] and n["negated"][0]["kind"] == "type"
    assert any("pas de" in c["description"] for c in r["constraints"])


def test_negated_count(nlp_service, shared_store):
    r = nlp_service.search("Combien de contrats ne couvrent pas le vol ?", shared_store)
    assert r["status"] == "ok" and r["result"]["rows"][0]["nombre"]["value"] == "3"


def test_negated_existence(nlp_service, shared_store):
    r = nlp_service.search("Quels assurés n'ont pas de sinistre ?", shared_store)
    assert r["status"] == "ok" and "NOT EXISTS" in r["sparql"] and _ids(r) == []
    r = nlp_service.search("Quels véhicules ne sont pas assurés ?", shared_store)
    assert r["status"] == "ok" and "NOT EXISTS" in r["sparql"]


def test_negation_variables_do_not_leak_into_outer_query(nlp_service, shared_store):
    """La négation d'un type de garantie ne doit pas être corrélée à la garantie affirmée (variables privées)."""
    r = nlp_service.search("Quels contrats couvrent le vol mais pas l'incendie ?", shared_store)
    assert "?n1_guarantee" in r["sparql"] and "actors:contient ?guarantee ." in r["sparql"]
    assert _ids(r) == ["Contrat_001"]


@pytest.mark.parametrize(
    "q",
    [
        "Quels contrats ne couvrent que le vol ?",                       # ne … que : restriction, pas négation
        "Quels sinistres n'ont pas une indemnisation supérieure à 3000 euros ?",  # négation d'un montant
        "Quels contrats ne sont pas ?",                                  # portée introuvable
        "Pas de sinistre",
        "sans",
    ],
)
def test_unsupported_negation_never_executes(nlp_service, shared_store, q):
    r = nlp_service.search(q, shared_store)
    assert r["status"] == "unsupported" and r["executed"] is False and r["sparql"] is None


@pytest.mark.parametrize(
    "q",
    [
        "Supprime tous les contrats",
        "Efface le sinistre 001",
        "Ajoute un véhicule Peugeot",
        "Drop all contracts",
        "Quels contrats couvrent le vol ? DELETE WHERE",
    ],
)
def test_write_requests_are_refused(nlp_service, shared_store, q):
    r = nlp_service.search(q, shared_store)
    assert r["status"] == "unsupported" and r["executed"] is False and r["sparql"] is None
    assert "lecture seule" in r["message"]


def test_past_participle_is_not_a_write_request(nlp_service, shared_store):
    r = nlp_service.search("Quelles indemnisations ont été refusées ?", shared_store)
    assert r["status"] == "ok"


@pytest.mark.parametrize(
    "q",
    [
        "Quels sinistres ont été évalués par Ahmed ?",          # Ahmed = assuré, pas expert
        "Quels véhicules sont conduits par l'expert Karim ?",   # un expert ne conduit pas dans l'ontologie
        "Quels sinistres ont été déclarés par l'expert Karim ?",
    ],
)
def test_incompatible_role_is_refused(nlp_service, shared_store, q):
    r = nlp_service.search(q, shared_store)
    assert r["status"] == "entity_not_found" and r["executed"] is False and r["sparql"] is None
    assert "rôle incompatible" in r["message"] or "Aucun expert" in r["message"]


def test_compatible_roles_still_work(nlp_service, shared_store):
    assert _ids(nlp_service.search("Quels sinistres ont été évalués par l'expert Karim ?", shared_store)) == ["Sinistre_001"]
    assert _ids(nlp_service.search("Quels véhicules sont conduits par Ahmed ?", shared_store)) == ["Voiture_001"]


def test_who_question_returns_people(nlp_service, shared_store):
    r = nlp_service.search("Qui a déclaré un sinistre ?", shared_store)
    assert r["intent"] == "SEARCH_INSURED"
    assert _ids(r) == ["AhmedBenAli", "FatmaTrabelsi", "YoussefHamdi"]


def test_positive_existence_constraint(nlp_service, shared_store):
    r = nlp_service.search("Quels véhicules sont réparés par un garage ?", shared_store)
    assert r["status"] == "ok" and _ids(r) == ["Moto_001", "Voiture_001"]


@pytest.mark.parametrize(
    "q",
    ["Quels vehicules sont assures par Ahmed", "quels CONTRATS couvrent le VOL", "Quelles voitures sont couvertes par un contrat tous risque"],
)
def test_accent_case_and_plural_tolerance(nlp_service, shared_store, q):
    assert nlp_service.search(q, shared_store)["status"] == "ok"


def test_negation_follows_data_changes(nlp_service, store):
    """Un nouveau contrat sans garantie vol apparaît immédiatement dans la négation (aucun cache obsolète)."""
    before = _ids(nlp_service.search("Quels contrats ne couvrent pas le vol ?", store))
    store.update(
        """INSERT DATA { actors:ContratTest a owl:NamedIndividual, actors:ContratAssurance ; actors:numeroContrat "TEST-NEG" . }"""
    )
    after = _ids(nlp_service.search("Quels contrats ne couvrent pas le vol ?", store))
    assert "ContratTest" in after and set(after) - set(before) == {"ContratTest"}


def test_all_caps_question_is_understood(nlp_service, shared_store):
    """Régression : « QUELS CONTRATS COUVRENT LE VOL » traitait « COUVRENT » comme un nom propre inconnu."""
    r = nlp_service.search("QUELS CONTRATS COUVRENT LE VOL", shared_store)
    assert r["status"] == "ok" and _ids(r) == ["Contrat_001"]
    r = nlp_service.search("QUELS VÉHICULES SONT ASSURÉS PAR AHMED ?", shared_store)
    assert r["status"] == "ok" and _ids(r) == ["Voiture_001"]
    # un nom inconnu en majuscules reste refusé
    assert nlp_service.search("QUELS VÉHICULES SONT ASSURÉS PAR ZORGLUB ?", shared_store)["status"] == "entity_not_found"
