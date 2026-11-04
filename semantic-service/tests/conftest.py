"""Fixtures : chaque test reçoit un triple store isolé (dossier de données temporaire)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402


def _point_config_to(monkeypatch, folder: Path) -> None:
    monkeypatch.setattr(config, "DATA_DIR", folder)
    monkeypatch.setattr(config, "LIVE_PATH", folder / "assurance_live.ttl")
    monkeypatch.setattr(config, "BACKUP_DIR", folder / "backups")


@pytest.fixture()
def data_dir(tmp_path, monkeypatch):
    _point_config_to(monkeypatch, tmp_path)
    return tmp_path


@pytest.fixture()
def store(data_dir):
    from app.store import Store

    return Store()


@pytest.fixture(scope="session")
def nlp_service():
    from app.nlp.service import get_nlp_service

    return get_nlp_service()


@pytest.fixture(scope="session")
def shared_store(tmp_path_factory):
    """Store partagé en lecture seule pour les tests NLP (évite de recharger le graphe à chaque test)."""
    mp = pytest.MonkeyPatch()
    _point_config_to(mp, tmp_path_factory.mktemp("nlp_data"))
    from app.store import Store

    s = Store()
    yield s
    mp.undo()
