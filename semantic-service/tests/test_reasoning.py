"""Frontière entre SPARQL/RDFLib et le raisonnement OWL (HermiT).

Ces tests DOCUMENTENT ce que l'application fait réellement : RDFLib n'est PAS un raisonneur OWL.
  - fait par l'application : matérialisation de owl:inverseOf, suppression symétrique des inverses,
    subClassOf* par chemins de propriétés, validation structurelle (monde fermé), garde-fous du CRUD ;
  - NON fait par RDFLib : inférence de classes définies (ContratActif, SinistreExpertise), domaines/ranges comme règles
    d'inférence, détection d'incohérence logique, cardinalités comme contraintes d'insertion.
Les ensembles attendus ci-dessous ont été calculés par HermiT (docs/HERMIT_VALIDATION.md, tools/hermit-validator).
"""
import pytest
from rdflib import URIRef
from rdflib.namespace import OWL

from app import ontology_info
from app.store import ACT

# Résultats de HermiT 1.4.x sur l'ontologie d'origine (voir docs/hermit/hermit_output.txt)
HERMIT_CONTRAT_ACTIF = ["Contrat_001", "Contrat_002", "Contrat_003"]
HERMIT_SINISTRE_EXPERTISE = ["Sinistre_001", "Sinistre_003"]


def ids(store, q):
    return sorted(r["x"]["local"] for r in store.query(q)["rows"])


# ----------------------------------------------------------------------------- owl:inverseOf
def test_every_inverse_pair_is_materialized_at_load(store):
    g = store.graph
    pairs = list(g.subject_objects(OWL.inverseOf))
    assert len(pairs) >= 3  # propose/estProposePar, couvre/estCouvertPar, declare/estDeclarePar
    checked = 0
    for p, q in pairs:
        for s, o in g.subject_objects(p):
            if isinstance(o, URIRef):
                assert (o, q, s) in g, f"inverse manquante : {o} {q} {s}"
                checked += 1
    assert checked >= 11  # 11 assertions p(a,b) vérifiées par HermiT (docs/hermit)


def test_inverse_is_materialized_after_insert(store):
    store.update("INSERT DATA { actors:Contrat_004 actors:couvre actors:Voiture_002 }")
    assert store.query("ASK { actors:Voiture_002 actors:estCouvertPar actors:Contrat_004 }")["boolean"] is True


def test_deleting_one_direction_removes_both(store):
    """Régression : sans suppression symétrique, la matérialisation recréait le triplet supprimé (DELETE sans effet)."""
    assert store.query("ASK { actors:Voiture_001 actors:estCouvertPar actors:Contrat_001 }")["boolean"] is True
    r = store.update("DELETE DATA { actors:Contrat_001 actors:couvre actors:Voiture_001 }")
    assert r["removed"] == 2
    assert store.query("ASK { actors:Contrat_001 actors:couvre actors:Voiture_001 }")["boolean"] is False
    assert store.query("ASK { actors:Voiture_001 actors:estCouvertPar actors:Contrat_001 }")["boolean"] is False
    # et en supprimant l'inverse : le sens direct disparaît aussi
    r = store.update("DELETE DATA { actors:Voiture_002 actors:estCouvertPar actors:Contrat_002 }")
    assert r["removed"] == 2
    assert store.query("ASK { actors:Contrat_002 actors:couvre actors:Voiture_002 }")["boolean"] is False


# ----------------------------------------------------------------------------- classes définies
def test_rdflib_does_not_infer_defined_classes(store):
    """Limite documentée : ContratActif / SinistreExpertise ne sont PAS typés par RDFLib (HermiT le fait)."""
    assert store.query("ASK { ?c a actors:ContratActif }")["boolean"] is False
    assert store.query("ASK { ?s a actors:SinistreExpertise }")["boolean"] is False


def test_equivalent_sparql_filters_match_hermit_inference(store):
    actif = ids(store, 'SELECT ?x WHERE { ?x a/rdfs:subClassOf* actors:ContratAssurance ; actors:statutContrat "Actif" }')
    assert actif == HERMIT_CONTRAT_ACTIF
    expertise = ids(store, "SELECT ?x WHERE { ?x a/rdfs:subClassOf* actors:Sinistre ; actors:faitObjetDe ?e . ?e a actors:Expertise }")
    assert expertise == HERMIT_SINISTRE_EXPERTISE


def test_nlp_answers_use_the_same_equivalent_filters(nlp_service, store):
    r = nlp_service.search("Quels contrats sont actifs ?", store)
    assert sorted({x["x"]["local"] for x in r["result"]["rows"]}) == HERMIT_CONTRAT_ACTIF
    r = nlp_service.search("Quels sinistres ont fait l'objet d'une expertise ?", store)
    got = sorted({x["x"]["local"] for x in r["result"]["rows"]}) if r["status"] == "ok" else r["message"]
    assert got == HERMIT_SINISTRE_EXPERTISE, got


# ----------------------------------------------------------------------------- hiérarchie par chemins de propriétés
def test_subclass_reasoning_is_emulated_by_property_paths(store):
    direct = store.query("SELECT ?x WHERE { ?x a actors:ContratAssurance }")["count"]
    via_path = store.query("SELECT ?x WHERE { ?x a/rdfs:subClassOf* actors:ContratAssurance }")["count"]
    assert direct == 0 and via_path == 4  # les contrats sont typés par leurs sous-classes ; HermiT infère le super-type


# ----------------------------------------------------------------------------- contraintes : HermiT rejette, RDFLib accepte, le validateur signale
VIOLATIONS = [
    ("disjonction GarantieVol/GarantieIncendie", "actors:TestV a owl:NamedIndividual, actors:GarantieVol, actors:GarantieIncendie .", "Classes disjointes respectées"),
    ("véhicule typé Assure", "actors:Voiture_001 a actors:Assure .", "Classes disjointes respectées"),
    ("domaine de possede (Voiture possede Contrat)", "actors:Voiture_001 actors:possede actors:Contrat_001 .", "Domaines et ranges respectés"),
    ("range de possede (Assure possede Voiture)", "actors:AhmedBenAli actors:possede actors:Voiture_002 .", "Domaines et ranges respectés"),
    ("fonctionnelle concerne (2 véhicules)", "actors:Sinistre_001 actors:concerne actors:Voiture_002 .", "Propriétés fonctionnelles (≤ 1 valeur)"),
    ("cardinalité =1 realisePar (2 experts)", "actors:Expertise_001 actors:realisePar actors:Expert_002 .", "Propriétés fonctionnelles (≤ 1 valeur)"),
    ("cardinalité ≤1 appliqueFranchise", "actors:Indemnisation_001 actors:appliqueFranchise actors:Franchise_001, actors:Franchise_002 .", "Restrictions de cardinalité et existentielles"),
]


@pytest.mark.parametrize("name,triples,check", VIOLATIONS, ids=[v[0] for v in VIOLATIONS])
def test_hermit_rejects_but_rdflib_accepts_and_validator_flags(store, name, triples, check):
    base = ontology_info.validate(store)
    assert base["valid"] if "valid" in base else all(c["passed"] for c in base["checks"])
    store.update(f"INSERT DATA {{ {triples} }}")  # RDFLib n'est pas un raisonneur : l'insertion brute n'est pas bloquée
    report = ontology_info.validate(store)
    failed = {c["name"] for c in report["checks"] if not c["passed"]}
    assert check in failed, f"{name} : le validateur aurait dû signaler « {check} » (échecs : {failed})"


def test_open_world_vs_closed_world_sinistre_without_damage(store):
    """HermiT (monde ouvert) : un Sinistre sans dommage est cohérent. Le validateur (monde fermé) le signale : voulu."""
    store.update("INSERT DATA { actors:SinistreVide a owl:NamedIndividual, actors:Sinistre, actors:AccidentCirculation . }")
    report = ontology_info.validate(store)
    assert any(c["name"].startswith("Restrictions de cardinalité") and not c["passed"] for c in report["checks"])


def test_validator_is_honest_about_not_being_a_reasoner():
    assert "PAS d'inférence OWL" in (ontology_info.validate.__doc__ or "").replace("n'", "").replace("Ne réalise", "") or \
        "inférence OWL complète" in (ontology_info.validate.__doc__ or "")
