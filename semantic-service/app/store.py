"""Triple store RDFLib persistant : chargement OWL, SPARQL query/update sécurisés, sauvegarde."""
from __future__ import annotations

import os
import re
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.namespace import OWL, RDF, RDFS, XSD
from rdflib.plugins.sparql import prepareQuery
from rdflib.plugins.sparql.parser import parseUpdate
from rdflib.plugins.sparql.algebra import translateUpdate
from rdflib.plugins.sparql.sparql import SPARQLError

from . import config

ACT = Namespace(config.ONTOLOGY_NS)

INIT_NS = {
    "actors": ACT,
    "rdf": RDF,
    "rdfs": RDFS,
    "owl": OWL,
    "xsd": XSD,
}


def with_prefixes(text: str) -> str:
    """Ajoute les préfixes usuels (actors, rdf, rdfs, owl, xsd) non déclarés par l'utilisateur.

    RDFLib refuse deux préfixes pour le même espace de noms : si l'utilisateur déclare déjà
    le sien (ex. PREFIX : <...actors#>), on n'ajoute pas 'actors'.
    """
    header = []
    for prefix, ns in INIT_NS.items():
        if re.search(rf"PREFIX\s+{prefix}\s*:", text, re.IGNORECASE):
            continue
        if str(ns) in text:
            continue
        header.append(f"PREFIX {prefix}: <{ns}>\n")
    return "".join(header) + text


SERVICE_NODES = {"Service", "ServiceGraphPattern"}
FORBIDDEN_UPDATE_OPS = {"Load", "Clear", "Drop", "Create", "Add", "Move", "Copy"}


class SparqlRejected(ValueError):
    """Requête refusée par les garde-fous de sécurité (pas une erreur de syntaxe)."""


class SparqlSyntaxError(ValueError):
    """Erreur de syntaxe ou d'évaluation SPARQL, message affichable à l'utilisateur."""


def local_name(uri: Any) -> str:
    s = str(uri)
    for sep in ("#", "/"):
        if sep in s:
            s = s.rsplit(sep, 1)[1]
    return s


def _contains_node(node: Any, names: set[str]) -> bool:
    """Parcourt récursivement l'algèbre SPARQL à la recherche d'opérateurs interdits (SERVICE...)."""
    name = getattr(node, "name", None)
    if name in names:
        return True
    if isinstance(node, dict):
        return any(_contains_node(v, names) for v in node.values())
    if isinstance(node, (list, tuple, set)):
        return any(_contains_node(v, names) for v in node)
    return False


def term_to_json(term: Any) -> dict[str, Any] | None:
    if term is None:
        return None
    if isinstance(term, URIRef):
        return {"type": "uri", "value": str(term), "local": local_name(term)}
    if isinstance(term, BNode):
        return {"type": "bnode", "value": str(term)}
    if isinstance(term, Literal):
        out: dict[str, Any] = {"type": "literal", "value": str(term)}
        if term.datatype:
            out["datatype"] = str(term.datatype)
        if term.language:
            out["lang"] = term.language
        return out
    return {"type": "literal", "value": str(term)}


class Store:
    def __init__(self) -> None:
        self.graph = Graph()
        self.lock = threading.RLock()
        self.version = 0  # incrémenté à chaque modification (invalidation des caches NLP)
        self.load()

    # ------------------------------------------------------------------ chargement
    def _fresh_graph(self) -> Graph:
        g = Graph()
        g.parse(str(config.ONTOLOGY_PATH), format="xml")
        if config.EXTENSIONS_PATH.exists():
            g.parse(str(config.EXTENSIONS_PATH), format="turtle")
        self._bind(g)
        self._materialize_inverses(g)
        return g

    @staticmethod
    def _bind(g: Graph) -> None:
        g.bind("actors", ACT, override=True)
        g.bind("owl", OWL)
        g.bind("rdfs", RDFS)
        g.bind("xsd", XSD)

    def load(self) -> None:
        with self.lock:
            config.DATA_DIR.mkdir(parents=True, exist_ok=True)
            config.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            if config.LIVE_PATH.exists():
                g = Graph()
                g.parse(str(config.LIVE_PATH), format="turtle")
                self._bind(g)
                self.graph = g
                self.source = "live"
            else:
                self.graph = self._fresh_graph()
                self.source = "original"
                self.save()
            self.version += 1

    def save(self) -> None:
        with self.lock:
            tmp = config.LIVE_PATH.with_suffix(".ttl.tmp")
            self.graph.serialize(destination=str(tmp), format="turtle")
            os.replace(tmp, config.LIVE_PATH)

    def backup(self, label: str = "manual") -> Path:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = config.BACKUP_DIR / f"assurance_{label}_{stamp}.ttl"
        if config.LIVE_PATH.exists():
            shutil.copy2(config.LIVE_PATH, dest)
        return dest

    def reset(self) -> dict[str, Any]:
        """Revient à l'ontologie originale + extensions (sauvegarde l'état courant avant)."""
        with self.lock:
            backup = self.backup("before_reset")
            self.graph = self._fresh_graph()
            self.source = "original"
            self.save()
            self.version += 1
            return {"backup": backup.name, "triples": len(self.graph)}

    # ------------------------------------------------------------------ raisonnement léger
    @staticmethod
    def _materialize_inverses(g: Graph) -> int:
        """Matérialise owl:inverseOf (le raisonneur HermiT n'est pas disponible côté RDFLib)."""
        added = 0
        pairs = list(g.subject_objects(OWL.inverseOf))
        for p, q in pairs:
            for s, o in list(g.subject_objects(p)):
                if isinstance(o, URIRef) and (o, q, s) not in g:
                    g.add((o, q, s))
                    added += 1
            for s, o in list(g.subject_objects(q)):
                if isinstance(o, URIRef) and (o, p, s) not in g:
                    g.add((o, p, s))
                    added += 1
        return added

    # ------------------------------------------------------------------ SPARQL
    def query(self, text: str, limit: int | None = None) -> dict[str, Any]:
        text = (text or "").strip()
        if not text:
            raise SparqlSyntaxError("La requête SPARQL est vide.")
        started = time.perf_counter()
        with self.lock:
            try:
                prepared = prepareQuery(with_prefixes(text))
            except Exception as exc:  # erreurs du parseur pyparsing
                raise SparqlSyntaxError(f"Erreur de syntaxe SPARQL : {exc}") from exc
            if _contains_node(prepared.algebra, SERVICE_NODES):
                raise SparqlRejected("SERVICE (requêtes fédérées) est interdit pour des raisons de sécurité.")
            try:
                result = self.graph.query(prepared)
            except SPARQLError as exc:
                raise SparqlSyntaxError(f"Erreur d'évaluation SPARQL : {exc}") from exc
            except Exception as exc:
                raise SparqlSyntaxError(f"Erreur d'exécution : {exc}") from exc

            out: dict[str, Any] = {"queryType": result.type}
            cap = min(limit or config.MAX_RESULT_ROWS, config.MAX_RESULT_ROWS)
            if result.type == "SELECT":
                variables = [str(v) for v in result.vars]
                rows = []
                truncated = False
                for i, row in enumerate(result):
                    if i >= cap:
                        truncated = True
                        break
                    rows.append({v: term_to_json(row[v]) for v in variables if row[v] is not None})
                out.update(variables=variables, rows=rows, count=len(rows), truncated=truncated)
            elif result.type == "ASK":
                out.update(boolean=bool(result.askAnswer))
            else:  # CONSTRUCT / DESCRIBE
                triples = []
                for i, (s, p, o) in enumerate(result):
                    if i >= cap:
                        break
                    triples.append({"s": term_to_json(s), "p": term_to_json(p), "o": term_to_json(o)})
                out.update(triples=triples, count=len(triples))
        out["executionMs"] = round((time.perf_counter() - started) * 1000, 2)
        return out

    def update(self, text: str) -> dict[str, Any]:
        text = (text or "").strip()
        if not text:
            raise SparqlSyntaxError("La requête SPARQL Update est vide.")
        started = time.perf_counter()
        with self.lock:
            try:
                parsed = translateUpdate(parseUpdate(with_prefixes(text)))
            except Exception as exc:
                raise SparqlSyntaxError(f"Erreur de syntaxe SPARQL Update : {exc}") from exc
            ops = [getattr(r, "name", "") for r in parsed.algebra]
            bad = FORBIDDEN_UPDATE_OPS.intersection(ops)
            if bad:
                raise SparqlRejected(f"Opération(s) interdite(s) : {', '.join(sorted(bad))}. "
                                     "Seuls INSERT DATA, DELETE DATA, DELETE/INSERT WHERE sont autorisés.")
            if _contains_node(parsed.algebra, SERVICE_NODES):
                raise SparqlRejected("SERVICE est interdit pour des raisons de sécurité.")

            before = set(self.graph)
            snapshot = Graph()
            for t in before:
                snapshot.add(t)
            try:
                self.graph.update(with_prefixes(text))
                self._materialize_inverses(self.graph)
            except Exception as exc:
                # rollback complet : l'état avant la requête est restauré
                self.graph.remove((None, None, None))
                for t in snapshot:
                    self.graph.add(t)
                raise SparqlSyntaxError(f"Erreur d'exécution de l'Update : {exc}") from exc
            after = set(self.graph)
            added, removed = len(after - before), len(before - after)
            if added or removed:
                self.version += 1
                self.save()
        return {
            "added": added,
            "removed": removed,
            "totalTriples": len(self.graph),
            "executionMs": round((time.perf_counter() - started) * 1000, 2),
        }

    # ------------------------------------------------------------------ export
    def export(self, fmt: str = "xml") -> tuple[str, str]:
        fmts = {
            "xml": ("pretty-xml", "application/rdf+xml"),
            "turtle": ("turtle", "text/turtle"),
            "ttl": ("turtle", "text/turtle"),
            "nt": ("nt", "application/n-triples"),
            "jsonld": ("json-ld", "application/ld+json"),
        }
        if fmt not in fmts:
            raise ValueError(f"Format inconnu : {fmt}")
        rdflib_fmt, mime = fmts[fmt]
        with self.lock:
            return self.graph.serialize(format=rdflib_fmt), mime


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store
