"""Chargement de l'ontologie, SPARQL, sécurité et persistance du triple store."""
import pytest
from rdflib import Graph

from app import config, ontology_info
from app.store import SparqlRejected, SparqlSyntaxError, Store

ACT = "http://www.semanticweb.org/assurance/actors#"


def test_original_ontology_is_untouched_and_parses():
    g = Graph()
    g.parse(str(config.ONTOLOGY_PATH), format="xml")
    assert len(g) == 819  # triplets de assurance_auto.xml tel que fourni
    original = (config.ROOT / "resources" / "assurance_auto.xml").read_bytes()
    assert config.ONTOLOGY_PATH.read_bytes() == original  # copie byte-identique


def test_store_loads_ontology_extensions_and_inverses(store):
    assert store.source == "original"
    assert len(store.graph) == 846
    r = store.query("SELECT ?c WHERE { ?c actors:statutSinistre ?s }")
    assert r["count"] == 3  # extension : statut du sinistre
    inv = store.query("ASK { actors:Voiture_001 actors:estCouvertPar actors:Contrat_001 }")
    assert inv["boolean"] is True  # owl:inverseOf matérialisé


def test_select_ask_filter_aggregate(store):
    r = store.query("SELECT ?m WHERE { ?i actors:montantIndemnisation ?m FILTER(?m > 3000) } ORDER BY ?m")
    assert [row["m"]["value"] for row in r["rows"]] == ["4050", "9360"]
    r = store.query("SELECT (SUM(?m) AS ?t) WHERE { ?i actors:montantIndemnisation ?m }")
    assert r["rows"][0]["t"]["value"] == "15410"
    assert store.query("ASK { ?x a actors:GarantieCatastrophesNaturelles }")["boolean"] is False


def test_user_prefix_overrides(store):
    r = store.query("PREFIX : <http://www.semanticweb.org/assurance/actors#> SELECT ?v WHERE { ?v a :Voiture }")
    assert r["count"] == 2


def test_syntax_error_is_reported(store):
    with pytest.raises(SparqlSyntaxError):
        store.query("SELECT ?x WHERE { ?x ?y")
    with pytest.raises(SparqlSyntaxError):
        store.query("")


@pytest.mark.parametrize("bad", ["CLEAR ALL", "DROP ALL", "LOAD <http://example.org/x>", "CREATE GRAPH <http://x/g>"])
def test_dangerous_updates_rejected(store, bad):
    with pytest.raises(SparqlRejected):
        store.update(bad)


def test_service_clause_rejected(store):
    with pytest.raises(SparqlRejected):
        store.query("SELECT * WHERE { SERVICE <http://example.org/sparql> { ?a ?b ?c } }")
    with pytest.raises(SparqlRejected):
        store.update("INSERT { ?a ?b ?c } WHERE { SERVICE <http://example.org/sparql> { ?a ?b ?c } }")


def test_update_changes_graph_and_persists_after_restart(store, data_dir):
    before = len(store.graph)
    res = store.update('INSERT DATA { actors:Persist_1 a owl:NamedIndividual, actors:Clause ; actors:texteClause "persisté" }')
    assert res["added"] == 3 and res["totalTriples"] == before + 3
    assert config.LIVE_PATH.exists()
    # « redémarrage » : un nouveau Store relit le fichier de persistance
    reloaded = Store()
    assert reloaded.source == "live"
    assert reloaded.query('ASK { actors:Persist_1 actors:texteClause "persisté" }')["boolean"] is True
    reloaded.update("DELETE WHERE { actors:Persist_1 ?p ?o }")
    assert Store().query("ASK { actors:Persist_1 ?p ?o }")["boolean"] is False


def test_update_is_atomic_on_error(store):
    before = len(store.graph)
    with pytest.raises(SparqlSyntaxError):
        store.update("INSERT DATA { actors:Broken a actors:Clause } ; THIS IS NOT SPARQL")
    assert len(store.graph) == before
    assert store.query("ASK { actors:Broken ?p ?o }")["boolean"] is False


def test_reset_restores_original_and_keeps_backup(store):
    store.update("DELETE WHERE { actors:Sinistre_003 ?p ?o }")
    assert len(store.graph) < 846
    info = store.reset()
    assert len(store.graph) == 846
    assert (config.BACKUP_DIR / info["backup"]).exists()


def test_export_formats(store):
    xml, mime = store.export("xml")
    assert "rdf:RDF" in xml and mime == "application/rdf+xml"
    ttl, _ = store.export("turtle")
    assert "actors:AhmedBenAli" in ttl
    with pytest.raises(ValueError):
        store.export("exe")


def test_ontology_introspection_matches_protege_model(store):
    classes = {c["id"]: c for c in ontology_info.get_classes(store)}
    assert len(classes) == 45
    assert classes["Assure"]["parents"] == ["Personne"]
    assert {"AccidentCirculation", "VolVehicule"} <= set(classes["Sinistre"]["children"])
    assert classes["ContratActif"]["equivalentTo"]  # classe définie
    props = {p["id"]: p for p in ontology_info.get_properties(store)}
    assert props["estProposePar"]["functional"] is True
    assert props["possede"]["domain"] == ["Assure"] and props["possede"]["range"] == ["ContratAssurance"]
    stats = ontology_info.get_statistics(store)
    assert stats["ontology"]["individuals"] == 56
    assert stats["entities"]["vehicules"] == 3


def test_validator_detects_violations(store):
    assert ontology_info.validate(store)["consistent"] is True
    # viole : domaine (un Vehicule ne peut pas posséder), fonctionnelle (2 immatriculations), disjonction (Vehicule + Garantie)
    store.update(
        """INSERT DATA {
          actors:Voiture_001 actors:possede actors:Contrat_002 ;
                             actors:immatriculation "AUTRE" ;
                             a actors:Garantie .
        }"""
    )
    report = ontology_info.validate(store)
    assert report["consistent"] is False
    failing = {c["name"] for c in report["checks"] if not c["passed"]}
    assert any("Domaines" in n for n in failing)
    assert any("fonctionnelles" in n for n in failing)
    assert any("disjointes" in n for n in failing)


def test_validator_detects_cardinality_violation(store):
    # un contrat sans prime viole « aPourPrime min 1 Prime »
    store.update("DELETE WHERE { actors:Contrat_002 actors:aPourPrime ?p }")
    report = ontology_info.validate(store)
    assert any("aPourPrime" in e["message"] for e in report["errors"])
