"""Gazetteer : liens entre mentions du texte et individus de l'ontologie (entity linking).

Construit à partir du graphe RDF réel : il reflète donc immédiatement les ajouts/suppressions du CRUD.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from nltk.metrics.distance import edit_distance
from rdflib import Literal, URIRef
from rdflib.namespace import RDF

from ..ontology_info import ancestors_map, display_label, individuals, types_closure
from ..store import ACT, Store, local_name
from .lexicon import normalize_phrase


@dataclass(frozen=True)
class Candidate:
    id: str  # nom local de l'individu (URI stable = ACT + id)
    label: str
    classes: frozenset[str]  # classes OWL (fermeture par subClassOf)
    kind: str  # person | vehicle | org | contract | claim | place ...
    via: str = ""  # ce qui a été reconnu (prénom, nom, marque...)


@dataclass
class Gazetteer:
    entries: dict[tuple[str, ...], list[Candidate]] = field(default_factory=dict)
    places: dict[tuple[str, ...], str] = field(default_factory=dict)
    version: int = -1
    individuals: dict[str, Candidate] = field(default_factory=dict)

    def add(self, key: tuple[str, ...], cand: Candidate) -> None:
        if not key or all(len(t) < 2 for t in key):
            return
        bucket = self.entries.setdefault(key, [])
        if all(c.id != cand.id for c in bucket):
            bucket.append(cand)


def _classes(g, node, anc) -> frozenset[str]:
    return frozenset(local_name(t) for t in types_closure(g, node, anc))


def build_gazetteer(store: Store) -> Gazetteer:
    g = store.graph
    anc = ancestors_map(g)
    gaz = Gazetteer(version=store.version)
    val = lambda n, p: (str(g.value(n, ACT[p])) if g.value(n, ACT[p]) is not None else None)  # noqa: E731
    by_brand: dict[tuple[str, ...], list[Candidate]] = {}

    for node in individuals(g):
        classes = _classes(g, node, anc)
        label = display_label(g, node)
        ident = local_name(node)
        if "Personne" in classes:
            cand = Candidate(ident, label, classes, "person")
            gaz.individuals[ident] = cand
            first, last = val(node, "prenom"), val(node, "nom")
            fk, lk = normalize_phrase(first or ""), normalize_phrase(last or "")
            if fk and lk:
                gaz.add(fk + lk, Candidate(ident, label, classes, "person", "nom complet"))
                gaz.add(lk + fk, Candidate(ident, label, classes, "person", "nom complet"))
            if fk:
                gaz.add(fk, Candidate(ident, label, classes, "person", "prénom"))
            if lk:
                gaz.add(lk, Candidate(ident, label, classes, "person", "nom"))
        elif "Vehicule" in classes:
            cand = Candidate(ident, label, classes, "vehicle")
            gaz.individuals[ident] = cand
            mk, md = normalize_phrase(val(node, "marque") or ""), normalize_phrase(val(node, "modele") or "")
            im = normalize_phrase(val(node, "immatriculation") or "")
            if mk and md:
                gaz.add(mk + md, Candidate(ident, label, classes, "vehicle", "marque + modèle"))
            if mk:
                by_brand.setdefault(mk, []).append(Candidate(ident, label, classes, "vehicle", "marque"))
            if md and (len(md) > 1 or len(md[0]) >= 3) and not md[0].isdigit():
                gaz.add(md, Candidate(ident, label, classes, "vehicle", "modèle"))
            if im:
                gaz.add(im, Candidate(ident, label, classes, "vehicle", "immatriculation"))
        elif "Organisation" in classes:
            cand = Candidate(ident, label, classes, "org")
            gaz.individuals[ident] = cand
            gaz.add(normalize_phrase(val(node, "raisonSociale") or ""), Candidate(ident, label, classes, "org", "raison sociale"))
        else:
            gaz.individuals[ident] = Candidate(ident, label, classes, "other")

    for key, cands in by_brand.items():
        for c in cands:
            gaz.add(key, c)

    for s, o in g.subject_objects(ACT["lieuSinistre"]):
        if isinstance(o, Literal):
            gaz.places[normalize_phrase(str(o))] = str(o)
    return gaz


_cache: dict[str, Gazetteer] = {}


def get_gazetteer(store: Store) -> Gazetteer:
    gaz = _cache.get("g")
    if gaz is None or gaz.version != store.version:
        gaz = build_gazetteer(store)
        _cache["g"] = gaz
    return gaz


@dataclass
class EntityMention:
    text: str
    start: int  # indices de tokens (inclus / exclus)
    end: int
    kind: str  # person | vehicle | org | place | contract | claim | ...
    candidates: list[Candidate]
    fuzzy: bool = False
    source: str = "gazetteer"
    place: str | None = None


def match_gazetteer(
    toks: list[tuple[int, str, str]], gaz: Gazetteer, consumed: set[int], texts: list[str]
) -> list[EntityMention]:
    """toks : (index_spacy, forme_normalisée, lemme_normalisé) pour les tokens non vides."""
    out: list[EntityMention] = []
    n = len(toks)
    i = 0
    while i < n:
        if toks[i][0] in consumed:
            i += 1
            continue
        found = False
        for size in range(min(4, n - i), 0, -1):
            span = toks[i : i + size]
            if any(t[0] in consumed for t in span):
                continue
            # tokens consécutifs uniquement
            if span[-1][0] - span[0][0] > size + 2:
                continue
            key = tuple(t[1] for t in span)
            if key in gaz.entries:
                cands = gaz.entries[key]
                out.append(EntityMention(" ".join(texts[t[0]] for t in span), span[0][0], span[-1][0] + 1,
                                         cands[0].kind, list(cands)))
                consumed.update(t[0] for t in span)
                i += size
                found = True
                break
            if key in gaz.places:
                out.append(EntityMention(" ".join(texts[t[0]] for t in span), span[0][0], span[-1][0] + 1, "place", [],
                                         place=gaz.places[key]))
                consumed.update(t[0] for t in span)
                i += size
                found = True
                break
        if not found:
            i += 1
    return out


def fuzzy_match(token_norm: str, gaz: Gazetteer) -> list[Candidate] | None:
    """Tolérance aux fautes de frappe (NLTK edit_distance ≤ 1, mots de ≥ 5 lettres)."""
    if len(token_norm) < 5:
        return None
    best: list[Candidate] | None = None
    for key, cands in gaz.entries.items():
        if len(key) == 1 and len(key[0]) >= 5 and abs(len(key[0]) - len(token_norm)) <= 1:
            if edit_distance(token_norm, key[0]) <= 1:
                best = (best or []) + cands
    return best
