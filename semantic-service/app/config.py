"""Configuration du service sémantique (variables d'environnement + valeurs par défaut)."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # racine du projet (projetweb/)


def _path(env: str, default: Path) -> Path:
    value = os.environ.get(env)
    return Path(value).expanduser().resolve() if value else default


ONTOLOGY_PATH = _path("ONTOLOGY_PATH", ROOT / "ontology" / "assurance_auto.xml")
EXTENSIONS_PATH = _path("EXTENSIONS_PATH", ROOT / "ontology" / "assurance_auto_extensions.ttl")
DATA_DIR = _path("DATA_DIR", ROOT / "data")
LIVE_PATH = DATA_DIR / "assurance_live.ttl"
BACKUP_DIR = DATA_DIR / "backups"

SPACY_MODEL = os.environ.get("SPACY_MODEL", "fr_core_news_md")
MAX_RESULT_ROWS = int(os.environ.get("MAX_RESULT_ROWS", "5000"))

ONTOLOGY_NS = "http://www.semanticweb.org/assurance/actors#"
