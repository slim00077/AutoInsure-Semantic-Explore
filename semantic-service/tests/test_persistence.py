"""Persistance du graphe : redémarrage, sauvegardes, fichier illisible (récupération), chemins et fichiers temporaires."""
import hashlib
import os
import time

from fastapi.testclient import TestClient

from app import config
from app.store import Store


def test_data_survives_restart_and_leaves_no_temporary_file(store, data_dir):
    store.update("INSERT DATA { actors:Persist1 a owl:NamedIndividual, actors:Assure ; actors:nom \"Persist\" }")
    assert config.LIVE_PATH.exists() and config.LIVE_PATH.stat().st_size > 1000
    assert not list(data_dir.glob("*.tmp")), "l'écriture atomique ne doit laisser aucun fichier .tmp"
    again = Store()  # « redémarrage » du service
    assert again.source == "live"
    assert again.query("ASK { actors:Persist1 a actors:Assure }")["boolean"] is True
    assert len(again.graph) == len(store.graph)


def test_live_file_is_a_valid_turtle_document_with_original_and_extension_triples(store):
    from rdflib import Graph

    g = Graph().parse(str(config.LIVE_PATH), format="turtle")
    assert len(g) == len(store.graph)
    assert store.query("ASK { actors:statutSinistre a owl:DatatypeProperty }")["boolean"] is True  # extension persistée
    assert store.query("ASK { actors:Sinistre_001 actors:statutSinistre ?s }")["boolean"] is True


def test_reset_backs_up_current_state_and_never_touches_the_original_ontology(store):
    original = config.ONTOLOGY_PATH
    digest = hashlib.sha256(original.read_bytes()).hexdigest()
    store.update("INSERT DATA { actors:AvantReset a owl:NamedIndividual, actors:Assure }")
    r = store.reset()
    assert r["backup"].startswith("assurance_before_reset_")
    backup = config.BACKUP_DIR / r["backup"]
    assert backup.exists() and "AvantReset" in backup.read_text(encoding="utf-8")
    assert store.query("ASK { actors:AvantReset ?p ?o }")["boolean"] is False
    assert hashlib.sha256(original.read_bytes()).hexdigest() == digest


def test_corrupt_live_file_is_quarantined_and_latest_backup_restored(store, data_dir):
    store.update("INSERT DATA { actors:Garde a owl:NamedIndividual, actors:Assure }")
    store.update("DELETE DATA { actors:Garde a owl:NamedIndividual }")  # déclenche une sauvegarde « before_update »
    backups = list(config.BACKUP_DIR.glob("assurance_before_update_*.ttl"))
    assert backups
    config.LIVE_PATH.write_text("@prefix : <x> . ceci n'est pas du turtle ###", encoding="utf-8")
    recovered = Store()
    assert recovered.source.startswith("recovered:assurance_before_update_")
    assert recovered.recovery and recovered.recovery["corruptFile"].startswith("assurance_live.corrupt-")
    assert (data_dir / recovered.recovery["corruptFile"]).exists(), "le fichier illisible est conservé, jamais supprimé"
    assert recovered.query("ASK { actors:AhmedBenAli a actors:Assure }")["boolean"] is True
    again = Store()  # le fichier live a été réécrit : le démarrage suivant est normal
    assert again.source == "live" and again.recovery is None


def test_corrupt_live_file_without_backup_falls_back_to_original(store, data_dir):
    for f in config.BACKUP_DIR.glob("*"):
        f.unlink()
    config.LIVE_PATH.write_text("<<< pas du rdf >>>", encoding="utf-8")
    recovered = Store()
    assert recovered.source == "recovered:original"
    assert recovered.recovery["restoredFrom"] == "ontologie d'origine"
    assert recovered.query("ASK { actors:Sinistre_001 actors:statutSinistre ?s }")["boolean"] is True


def test_corrupt_backups_are_skipped(store, data_dir):
    store.update("INSERT DATA { actors:X a owl:NamedIndividual, actors:Assure }")
    store.update("DELETE DATA { actors:X a owl:NamedIndividual }")
    bad = config.BACKUP_DIR / "assurance_zzz_corrupt.ttl"
    bad.write_text("not turtle", encoding="utf-8")
    os.utime(bad, (time.time() + 100, time.time() + 100))  # le plus récent est illisible
    config.LIVE_PATH.write_text("not turtle either", encoding="utf-8")
    recovered = Store()
    assert recovered.source.startswith("recovered:assurance_before_update_")


def test_health_reports_recovery(store, data_dir, monkeypatch):
    import app.main as main

    config.LIVE_PATH.write_text("garbage ###", encoding="utf-8")
    recovered = Store()
    monkeypatch.setattr(main, "get_store", lambda: recovered)
    body = TestClient(main.app).get("/health").json()
    assert body["status"] == "ok" and body["recovery"]["corruptFile"].startswith("assurance_live.corrupt-")


def test_paths_are_writable(store):
    assert os.access(config.DATA_DIR, os.W_OK) and os.access(config.LIVE_PATH, os.R_OK | os.W_OK)
    assert config.BACKUP_DIR.is_dir() and os.access(config.BACKUP_DIR, os.W_OK)
