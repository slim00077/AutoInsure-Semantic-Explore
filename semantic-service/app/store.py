"""Triple store RDFLib persistant : chargement OWL, SPARQL query/update sécurisés, sauvegarde."""
from __future__ import annotations

import logging
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
log = logging.getLogger("semantic-service.store")

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


GRAPH_MSG = (
    "FROM, FROM NAMED, USING, WITH et GRAPH sont interdits : l'application n'expose qu'un seul graphe (graphe par défaut) "
    "et ne charge jamais de fichier ou de ressource réseau."
)


def _forbidden_reason(node: Any) -> str | None:
    """Parcourt l'algèbre SPARQL et signale tout ce qui sortirait du graphe unique de l'application.

    - SERVICE : requêtes fédérées (SSRF) ;
    - FROM / FROM NAMED / USING / USING NAMED / WITH : RDFLib CHARGE l'URI indiquée (fichier local ou réseau) ;
    - GRAPH et quads : l'application n'expose qu'un seul graphe (le graphe par défaut).
    """
    name = getattr(node, "name", None)
    if name in SERVICE_NODES:
        return "SERVICE (requêtes fédérées) est interdit pour des raisons de sécurité."
    if name == "Graph":
        return GRAPH_MSG
    if isinstance(node, dict):
        # dict.get explicite : CompValue.get (RDFLib) a une autre sémantique
        if any(dict.get(node, key) for key in ("datasetClause", "using", "withClause", "quads")):
            return GRAPH_MSG
        for v in node.values():
            r = _forbidden_reason(v)
            if r:
                return r
    elif isinstance(node, (list, tuple, set)):
        for v in node:
            r = _forbidden_reason(v)
            if r:
                return r
    return None


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
        self.recovery: dict[str, str] | None = None  # renseigné si le fichier persistant était illisible au démarrage
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
                try:
                    g = Graph()
                    g.parse(str(config.LIVE_PATH), format="turtle")
                except Exception as exc:  # fichier tronqué / conflit de synchronisation OneDrive / édition manuelle
                    self._recover(exc)
                    self.version += 1
                    return
                self._bind(g)
                self.graph = g
                self.source = "live"
            else:
                self.graph = self._fresh_graph()
                self.source = "original"
                self.save()
            self.version += 1

    def _recover(self, exc: Exception) -> None:
        """Fichier persistant illisible : on le met de côté (jamais supprimé), puis on restaure la sauvegarde valide la plus
        récente, à défaut l'ontologie d'origine. Le service démarre au lieu de planter ; /health expose la récupération."""
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        corrupt = config.LIVE_PATH.with_name(f"assurance_live.corrupt-{stamp}.ttl")
        os.replace(config.LIVE_PATH, corrupt)
        log.error("Fichier persistant illisible (%s). Mis de côté : %s", str(exc).splitlines()[0][:160], corrupt.name)
        info = {"corruptFile": corrupt.name, "error": str(exc).splitlines()[0][:200]}
        candidates = sorted(config.BACKUP_DIR.glob("assurance_*.ttl"), key=lambda p: p.stat().st_mtime, reverse=True)
        for cand in candidates:
            try:
                g = Graph()
                g.parse(str(cand), format="turtle")
            except Exception:
                continue
            self._bind(g)
            self.graph = g
            self.source = f"recovered:{cand.name}"
            info["restoredFrom"] = cand.name
            break
        else:
            self.graph = self._fresh_graph()
            self.source = "recovered:original"
            info["restoredFrom"] = "ontologie d'origine"
        self.recovery = info
        self.save()
        log.warning("Données restaurées depuis : %s", info["restoredFrom"])

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

    def _backup_before_destructive(self, previous: Graph) -> None:
        """Sauvegarde l'état précédent avant toute mise à jour qui supprime des triplets (rotation : KEEP_UPDATE_BACKUPS fichiers)."""
        try:
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
            previous.serialize(destination=str(config.BACKUP_DIR / f"assurance_before_update_{stamp}.ttl"), format="turtle")
            old = sorted(config.BACKUP_DIR.glob("assurance_before_update_*.ttl"))
            for f in old[: max(0, len(old) - config.KEEP_UPDATE_BACKUPS)]:
                f.unlink(missing_ok=True)
        except OSError:
            pass  # une sauvegarde impossible ne doit pas empêcher l'opération

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

    def _propagate_inverse_deletions(self, before: set) -> int:
        """Suppression symétrique des inverses : si (s p o) a été supprimé et que p a un owl:inverseOf q, (o q s) l'est aussi.

        Sans cela, la matérialisation des inverses (juste après) recréerait le triplet supprimé depuis son inverse :
        un DELETE d'un seul sens serait silencieusement annulé. Sémantique OWL : (s p o) ⇔ (o q s), les deux sont un seul fait.
        """
        g = self.graph
        inverse: dict[Any, Any] = {}
        for p, q in g.subject_objects(OWL.inverseOf):
            inverse.setdefault(p, q)
            inverse.setdefault(q, p)
        removed = 0
        gone = before - set(g)
        for s, p, o in gone:
            q = inverse.get(p)
            if q is not None and isinstance(o, URIRef) and (o, q, s) in g:
                g.remove((o, q, s))
                removed += 1
        return removed

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
            reason = _forbidden_reason(prepared.algebra)
            if reason:
                raise SparqlRejected(reason)
            try:
                result = self.graph.query(prepared)
                out: dict[str, Any] = {"queryType": result.type}
                cap = min(limit or config.MAX_RESULT_ROWS, config.MAX_RESULT_ROWS)
                # RDFLib évalue paresseusement : les erreurs d'évaluation surviennent pendant l'itération, donc dans ce try.
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
            except SPARQLError as exc:
                raise SparqlSyntaxError(f"Erreur d'évaluation SPARQL : {exc}") from exc
            except (SparqlRejected, SparqlSyntaxError):
                raise
            except Exception as exc:
                raise SparqlSyntaxError(f"Erreur d'exécution : {exc}") from exc
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
            reason = _forbidden_reason(parsed.algebra)
            if reason:
                raise SparqlRejected(reason)

            before = set(self.graph)
            snapshot = Graph()
            for t in before:
                snapshot.add(t)
            try:
                self.graph.update(with_prefixes(text))
                self._propagate_inverse_deletions(before)
                self._materialize_inverses(self.graph)
            except Exception as exc:
                # rollback complet : l'état avant la requête est restauré
                self.graph.remove((None, None, None))
                for t in snapshot:
                    self.graph.add(t)
                raise SparqlSyntaxError(f"Erreur d'exécution de l'Update : {exc}") from exc
            after = set(self.graph)
            added, removed = len(after - before), len(before - after)
            limit_del = max(config.MAX_DELETE_MIN, int(config.MAX_DELETE_FRACTION * len(before)))
            if removed > limit_del:
                # effacement massif (ex. DELETE WHERE { ?s ?p ?o }) : on restaure l'état précédent
                self.graph.remove((None, None, None))
                for t in snapshot:
                    self.graph.add(t)
                raise SparqlRejected(
                    f"Mise à jour refusée : elle supprimerait {removed} triplets (limite {limit_del}, soit au plus "
                    f"{int(config.MAX_DELETE_FRACTION * 100)} % du graphe). Utilisez des suppressions ciblées ou « Réinitialiser » (avec sauvegarde)."
                )
            if added or removed:
                if removed:
                    self._backup_before_destructive(snapshot)
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
