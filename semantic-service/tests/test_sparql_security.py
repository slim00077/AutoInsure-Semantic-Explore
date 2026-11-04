"""Sécurité et fonctionnalités de l'explorateur SPARQL : aucune fuite fichier/réseau, graphe unique, anti-effacement massif."""
import pytest
from fastapi.testclient import TestClient

from app import config
from app.store import SparqlRejected, SparqlSyntaxError


# ----------------------------------------------------------------------------- fonctionnalités
def test_select_filter_optional_order_limit(store):
    r = store.query(
        """SELECT ?s ?prime WHERE { ?c a/rdfs:subClassOf* actors:ContratAssurance ; actors:numeroContrat ?s .
           OPTIONAL { ?c actors:aPourPrime/actors:montantPrime ?prime } FILTER(?prime > 100) } ORDER BY DESC(?prime) LIMIT 2"""
    )
    assert r["queryType"] == "SELECT" and 0 < r["count"] <= 2
    primes = [float(x["prime"]["value"]) for x in r["rows"]]
    assert primes == sorted(primes, reverse=True) and all(p > 100 for p in primes)


def test_ask_construct_describe(store):
    assert store.query("ASK { actors:AhmedBenAli a actors:Assure }")["boolean"] is True
    assert store.query("CONSTRUCT { ?s a actors:Assure } WHERE { ?s a actors:Assure }")["count"] >= 3
    assert store.query("DESCRIBE actors:AhmedBenAli")["count"] > 0


def test_limit_and_truncation(store):
    r = store.query("SELECT * WHERE { ?s ?p ?o }", limit=7)
    assert r["count"] == 7 and r["truncated"] is True


def test_insert_data_then_delete_data_roundtrip(store):
    n = len(store.graph)
    a = store.update("INSERT DATA { actors:SecTest a owl:NamedIndividual, actors:Assure ; actors:nom \"Test\" }")
    assert a["added"] == 3 and len(store.graph) == n + 3
    d = store.update("DELETE DATA { actors:SecTest a owl:NamedIndividual, actors:Assure ; actors:nom \"Test\" }")
    assert d["removed"] == 3 and len(store.graph) == n


def test_delete_insert_where_targeted(store):
    store.update("INSERT DATA { actors:SecTest2 a actors:Assure ; actors:nom \"Avant\" }")
    r = store.update('DELETE { ?x actors:nom "Avant" } INSERT { ?x actors:nom "Apres" } WHERE { ?x actors:nom "Avant" }')
    assert r["added"] == 1 and r["removed"] == 1
    assert store.query('ASK { actors:SecTest2 actors:nom "Apres" }')["boolean"] is True


@pytest.mark.parametrize("bad", ["", "   ", "SELEC * WHERE { ?s ?p ?o }", "SELECT * WHERE { ?s ?p", "hello world"])
def test_invalid_and_empty_queries_raise_syntax_error(store, bad):
    with pytest.raises(SparqlSyntaxError):
        store.query(bad)


@pytest.mark.parametrize("bad", ["", "INSERT DATA { actors:x a", "SELECT * WHERE { ?s ?p ?o }", "nonsense"])
def test_invalid_and_empty_updates_raise_syntax_error(store, bad):
    with pytest.raises(SparqlSyntaxError):
        store.update(bad)


def test_update_sent_as_query_and_query_sent_as_update_are_rejected(store):
    with pytest.raises(SparqlSyntaxError):
        store.query("INSERT DATA { actors:Z a actors:Assure }")
    with pytest.raises(SparqlSyntaxError):
        store.update("ASK { ?s ?p ?o }")


# ----------------------------------------------------------------------------- opérations interdites
@pytest.mark.parametrize(
    "bad",
    [
        "CLEAR ALL", "CLEAR DEFAULT", "CLEAR GRAPH <urn:x>", "DROP ALL", "DROP GRAPH <urn:x>", "LOAD <http://127.0.0.1:9/x>",
        "LOAD <file:///etc/passwd> INTO GRAPH <urn:x>", "CREATE GRAPH <urn:x>", "COPY DEFAULT TO <urn:x>",
        "MOVE DEFAULT TO <urn:x>", "ADD DEFAULT TO <urn:x>", "INSERT DATA { actors:Z a actors:Assure } ; CLEAR ALL",
    ],
)
def test_graph_management_and_load_are_rejected(store, bad):
    n = len(store.graph)
    with pytest.raises(SparqlRejected):
        store.update(bad)
    assert len(store.graph) == n


@pytest.mark.parametrize(
    "q",
    [
        "SELECT * WHERE { SERVICE <http://127.0.0.1:9/x> { ?s ?p ?o } }",
        "SELECT * WHERE { OPTIONAL { SERVICE SILENT <http://127.0.0.1:9/x> { ?s ?p ?o } } }",
        "SELECT * FROM <http://127.0.0.1:9/x> WHERE { ?s ?p ?o }",
        "SELECT * FROM <file:///etc/passwd> WHERE { ?s ?p ?o }",
        "SELECT * FROM NAMED <http://127.0.0.1:9/x> WHERE { GRAPH ?g { ?s ?p ?o } }",
        "SELECT * WHERE { GRAPH <urn:x> { ?s ?p ?o } }",
        "ASK FROM <http://127.0.0.1:9/x> { ?s ?p ?o }",
    ],
)
def test_query_cannot_leave_the_single_local_graph(store, q):
    with pytest.raises(SparqlRejected):
        store.query(q)


@pytest.mark.parametrize(
    "bad",
    [
        "INSERT { ?s ?p ?o } WHERE { SERVICE <http://127.0.0.1:9/x> { ?s ?p ?o } }",
        "INSERT DATA { GRAPH <urn:evil> { actors:Z a actors:Assure } }",
        "WITH <urn:evil> INSERT { actors:Z a actors:Assure } WHERE { }",
        "INSERT { actors:Z a actors:Assure } USING <urn:evil> WHERE { }",
        "INSERT { actors:Z a actors:Assure } USING NAMED <urn:evil> WHERE { GRAPH <urn:evil> { ?s ?p ?o } }",
        "DELETE { GRAPH <urn:evil> { ?s ?p ?o } } WHERE { ?s ?p ?o }",
    ],
)
def test_update_is_restricted_to_the_default_graph(store, bad):
    n = len(store.graph)
    with pytest.raises(SparqlRejected):
        store.update(bad)
    assert len(store.graph) == n


def test_using_clause_never_reads_local_files(store, tmp_path):
    """Régression : RDFLib charge l'URI d'un USING. Un fichier local ne doit jamais être lu ni fusionné."""
    leak = tmp_path / "outside.ttl"
    leak.write_text('<urn:secret:leak> <urn:secret:value> "SECRET-READ-BY-SERVER" .\n', encoding="utf-8")
    with pytest.raises(SparqlRejected):
        store.update(f"INSERT {{ ?s ?p ?o }} USING <{leak.as_uri()}> WHERE {{ ?s ?p ?o }}")
    assert store.query("ASK { <urn:secret:leak> ?p ?o }")["boolean"] is False


def test_dataset_clause_error_is_not_an_unhandled_exception(store):
    """Régression : les erreurs d'évaluation paresseuse étaient levées hors du try (HTTP 500)."""
    with pytest.raises((SparqlRejected, SparqlSyntaxError)):
        store.query("SELECT * WHERE { GRAPH ?g { ?s ?p ?o } }")


def test_no_named_graph_ever_appears(store):
    store.update("INSERT DATA { actors:OnlyDefault a actors:Assure }")
    from rdflib import ConjunctiveGraph, Graph

    assert type(store.graph) is Graph and not isinstance(store.graph, ConjunctiveGraph)  # un seul graphe, pas de dataset


# ----------------------------------------------------------------------------- anti-effacement massif
def test_mass_delete_is_refused_and_rolled_back(store):
    n = len(store.graph)
    live_before = config.LIVE_PATH.read_bytes()
    with pytest.raises(SparqlRejected, match="supprimerait"):
        store.update("DELETE WHERE { ?s ?p ?o }")
    with pytest.raises(SparqlRejected):
        store.update("DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }")
    assert len(store.graph) == n
    assert config.LIVE_PATH.read_bytes() == live_before


def test_targeted_delete_is_allowed_and_creates_a_backup(store):
    before = len(list(config.BACKUP_DIR.glob("assurance_before_update_*.ttl")))
    r = store.update("DELETE WHERE { actors:Sinistre_002 ?p ?o }")
    assert 0 < r["removed"] < 100
    assert len(list(config.BACKUP_DIR.glob("assurance_before_update_*.ttl"))) == before + 1


def test_update_backups_are_rotated(store, monkeypatch):
    monkeypatch.setattr(config, "KEEP_UPDATE_BACKUPS", 3)
    for i in range(6):
        store.update(f'INSERT DATA {{ actors:Rot{i} actors:nom "x" }}')
        store.update(f'DELETE DATA {{ actors:Rot{i} actors:nom "x" }}')
    assert len(list(config.BACKUP_DIR.glob("assurance_before_update_*.ttl"))) == 3


# ----------------------------------------------------------------------------- codes HTTP du service
@pytest.fixture()
def client(store, monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, "get_store", lambda: store)
    return TestClient(main.app)


def test_http_status_codes(client):
    assert client.post("/sparql/query", json={"query": "SELECT * WHERE { ?s ?p ?o } LIMIT 1"}).status_code == 200
    assert client.post("/sparql/query", json={"query": "SELEC"}).status_code == 400
    assert client.post("/sparql/query", json={"query": "   "}).status_code == 400
    assert client.post("/sparql/query", json={"query": "SELECT * WHERE { GRAPH ?g { ?s ?p ?o } }"}).status_code == 403
    assert client.post("/sparql/query", json={"query": "SELECT * FROM <file:///etc/passwd> WHERE { ?s ?p ?o }"}).status_code == 403
    assert client.post("/sparql/update", json={"update": "CLEAR ALL"}).status_code == 403
    assert client.post("/sparql/update", json={"update": "DELETE WHERE { ?s ?p ?o }"}).status_code == 403
    assert client.post("/sparql/update", json={"update": "x" * 100001}).status_code == 422
    assert client.post("/sparql/query", json={}).status_code == 422
