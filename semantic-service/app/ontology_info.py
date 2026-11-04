"""Introspection de l'ontologie (classes, propriétés, individus, graphe, statistiques) et validation structurelle.

Tout est calculé à partir du graphe RDF réel (aucune donnée codée en dur).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable

from rdflib import BNode, Graph, Literal, URIRef
from rdflib.collection import Collection
from rdflib.namespace import OWL, RDF, RDFS, XSD

from .store import ACT, Store, local_name

DATATYPE_PROP = OWL.DatatypeProperty
OBJECT_PROP = OWL.ObjectProperty


# ----------------------------------------------------------------------------- helpers
def lit(g: Graph, s: URIRef, p: URIRef) -> str | None:
    v = g.value(s, p)
    return str(v) if v is not None else None


def display_label(g: Graph, node: URIRef) -> str:
    """Libellé lisible d'un individu (nom + prénom, marque + modèle, numéro de contrat...)."""
    n = local_name(node)
    a = lambda name: lit(g, node, ACT[name])  # noqa: E731
    if a("prenom") or a("nom"):
        return " ".join(x for x in (a("prenom"), a("nom")) if x)
    if a("marque"):
        base = " ".join(x for x in (a("marque"), a("modele")) if x)
        return f"{base} ({a('immatriculation')})" if a("immatriculation") else base
    for key in ("numeroContrat", "numeroSinistre", "raisonSociale"):
        if a(key):
            return a(key)  # type: ignore[return-value]
    return n


def rdfs_label(g: Graph, node: URIRef, lang: str = "fr") -> str:
    best = None
    for o in g.objects(node, RDFS.label):
        if isinstance(o, Literal):
            if o.language == lang:
                return str(o)
            best = best or str(o)
    return best or local_name(node)


def comment(g: Graph, node: URIRef) -> str | None:
    for o in g.objects(node, RDFS.comment):
        return str(o)
    return None


def named_classes(g: Graph) -> list[URIRef]:
    return sorted({c for c in g.subjects(RDF.type, OWL.Class) if isinstance(c, URIRef)}, key=str)


def parents(g: Graph, c: URIRef) -> list[URIRef]:
    return [p for p in g.objects(c, RDFS.subClassOf) if isinstance(p, URIRef)]


def ancestors_map(g: Graph) -> dict[URIRef, set[URIRef]]:
    cache: dict[URIRef, set[URIRef]] = {}

    def anc(c: URIRef) -> set[URIRef]:
        if c in cache:
            return cache[c]
        cache[c] = set()
        res: set[URIRef] = set()
        for p in parents(g, c):
            res.add(p)
            res |= anc(p)
        cache[c] = res
        return res

    for c in named_classes(g):
        anc(c)
    return cache


def individuals(g: Graph) -> list[URIRef]:
    return sorted({i for i in g.subjects(RDF.type, OWL.NamedIndividual) if isinstance(i, URIRef)}, key=str)


def direct_types(g: Graph, i: URIRef) -> list[URIRef]:
    return sorted(
        (t for t in g.objects(i, RDF.type) if isinstance(t, URIRef) and t != OWL.NamedIndividual), key=str
    )


def types_closure(g: Graph, i: URIRef, anc: dict[URIRef, set[URIRef]]) -> set[URIRef]:
    out: set[URIRef] = set()
    for t in direct_types(g, i):
        out.add(t)
        out |= anc.get(t, set())
    return out


def _restriction_text(g: Graph, r: BNode) -> dict[str, Any] | None:
    on_p = g.value(r, OWL.onProperty)
    if on_p is None:
        return None
    on_c = g.value(r, OWL.onClass) or g.value(r, OWL.someValuesFrom) or g.value(r, OWL.allValuesFrom)
    kind = value = None
    for key, label in (
        (OWL.minQualifiedCardinality, "min"),
        (OWL.maxQualifiedCardinality, "max"),
        (OWL.qualifiedCardinality, "exactly"),
        (OWL.minCardinality, "min"),
        (OWL.maxCardinality, "max"),
        (OWL.cardinality, "exactly"),
    ):
        v = g.value(r, key)
        if v is not None:
            kind, value = label, int(v)
    if kind is None:
        if g.value(r, OWL.someValuesFrom) is not None:
            kind = "some"
        elif g.value(r, OWL.allValuesFrom) is not None:
            kind = "only"
        elif g.value(r, OWL.hasValue) is not None:
            kind, on_c = "hasValue", g.value(r, OWL.hasValue)
    labels = {"min": "au moins", "max": "au plus", "exactly": "exactement", "some": "au moins un", "only": "uniquement", "hasValue": "valeur"}
    p_name = local_name(on_p)
    c_name = local_name(on_c) if isinstance(on_c, URIRef) else (str(on_c) if on_c is not None else None)
    text = f"{p_name} {labels.get(kind or '', '')}{(' ' + str(value)) if value is not None else ''} {c_name or ''}".strip()
    return {"kind": kind, "value": value, "property": p_name, "onClass": c_name, "text": text}


def class_restrictions(g: Graph, c: URIRef) -> list[dict[str, Any]]:
    out = []
    for o in g.objects(c, RDFS.subClassOf):
        if isinstance(o, BNode) and (o, RDF.type, OWL.Restriction) in g:
            r = _restriction_text(g, o)
            if r:
                out.append(r)
    return out


def class_equivalents(g: Graph, c: URIRef) -> list[str]:
    out = []
    for o in g.objects(c, OWL.equivalentClass):
        if isinstance(o, BNode):
            inter = g.value(o, OWL.intersectionOf)
            if inter is not None:
                parts = []
                for m in Collection(g, inter):
                    if isinstance(m, URIRef):
                        parts.append(local_name(m))
                    elif isinstance(m, BNode):
                        r = _restriction_text(g, m)
                        parts.append(f"({r['text']})" if r else "?")
                out.append(" ⊓ ".join(parts))
        elif isinstance(o, URIRef):
            out.append(local_name(o))
    return out


def disjoint_groups(g: Graph) -> list[list[URIRef]]:
    groups = []
    for node in g.subjects(RDF.type, OWL.AllDisjointClasses):
        members = g.value(node, OWL.members)
        if members is not None:
            groups.append([m for m in Collection(g, members) if isinstance(m, URIRef)])
    return groups


def properties_of(g: Graph, kind: URIRef) -> list[URIRef]:
    return sorted({p for p in g.subjects(RDF.type, kind) if isinstance(p, URIRef)}, key=str)


# ----------------------------------------------------------------------------- classes
def get_classes(store: Store) -> list[dict[str, Any]]:
    g = store.graph
    anc = ancestors_map(g)
    inds = individuals(g)
    closures = {i: types_closure(g, i, anc) for i in inds}
    direct_count: dict[URIRef, int] = defaultdict(int)
    total_count: dict[URIRef, int] = defaultdict(int)
    for i in inds:
        for t in direct_types(g, i):
            direct_count[t] += 1
        for t in closures[i]:
            total_count[t] += 1

    groups = disjoint_groups(g)
    obj_props = properties_of(g, OBJECT_PROP)
    data_props = properties_of(g, DATATYPE_PROP)

    result = []
    classes = named_classes(g)
    children: dict[URIRef, list[URIRef]] = defaultdict(list)
    for c in classes:
        for p in parents(g, c):
            children[p].append(c)

    for c in classes:
        self_and_anc = {c} | anc[c]
        result.append(
            {
                "id": local_name(c),
                "uri": str(c),
                "label": rdfs_label(g, c),
                "comment": comment(g, c),
                "parents": sorted(local_name(p) for p in parents(g, c)),
                "children": sorted(local_name(x) for x in children[c]),
                "ancestors": sorted(local_name(a) for a in anc[c]),
                "directInstances": direct_count.get(c, 0),
                "totalInstances": total_count.get(c, 0),
                "restrictions": class_restrictions(g, c),
                "equivalentTo": class_equivalents(g, c),
                "disjointWith": sorted(
                    {local_name(m) for grp in groups if c in grp for m in grp if m != c}
                ),
                "dataProperties": [
                    {"id": local_name(p), "range": local_name(next(iter(g.objects(p, RDFS.range)), XSD.string))}
                    for p in data_props
                    if any(d in self_and_anc for d in g.objects(p, RDFS.domain))
                ],
                "objectProperties": [
                    {"id": local_name(p), "range": [local_name(r) for r in g.objects(p, RDFS.range)]}
                    for p in obj_props
                    if any(d in self_and_anc for d in g.objects(p, RDFS.domain))
                ],
                "incomingProperties": [
                    {"id": local_name(p), "domain": [local_name(d) for d in g.objects(p, RDFS.domain)]}
                    for p in obj_props
                    if any(r in self_and_anc for r in g.objects(p, RDFS.range))
                ],
            }
        )
    return result


# ----------------------------------------------------------------------------- propriétés
def get_properties(store: Store) -> list[dict[str, Any]]:
    g = store.graph
    out = []
    for kind, label in ((OBJECT_PROP, "object"), (DATATYPE_PROP, "datatype")):
        for p in properties_of(g, kind):
            inverse = {local_name(o) for o in g.objects(p, OWL.inverseOf)} | {
                local_name(s) for s in g.subjects(OWL.inverseOf, p)
            }
            out.append(
                {
                    "id": local_name(p),
                    "uri": str(p),
                    "kind": label,
                    "label": rdfs_label(g, p),
                    "comment": comment(g, p),
                    "domain": sorted(local_name(d) for d in g.objects(p, RDFS.domain)),
                    "range": sorted(local_name(r) for r in g.objects(p, RDFS.range)),
                    "functional": (p, RDF.type, OWL.FunctionalProperty) in g,
                    "inverseOf": sorted(inverse),
                    "usage": sum(1 for _ in g.subject_objects(p)),
                }
            )
    return out


# ----------------------------------------------------------------------------- individus
def _value_json(g: Graph, o: Any) -> dict[str, Any]:
    if isinstance(o, URIRef):
        return {"type": "uri", "id": local_name(o), "label": display_label(g, o)}
    if isinstance(o, Literal):
        d: dict[str, Any] = {"type": "literal", "value": str(o)}
        if o.datatype:
            d["datatype"] = local_name(o.datatype)
        return d
    return {"type": "bnode", "value": str(o)}


def describe_individual(store: Store, ident: str) -> dict[str, Any] | None:
    g = store.graph
    node = ACT[ident]
    if (node, RDF.type, OWL.NamedIndividual) not in g:
        return None
    props = []
    for p, o in sorted(g.predicate_objects(node), key=lambda po: (str(po[0]), str(po[1]))):
        if p in (RDF.type,):
            continue
        props.append({"property": local_name(p), **_value_json(g, o)})
    incoming = []
    for s, p in sorted(g.subject_predicates(node), key=lambda sp: (str(sp[0]), str(sp[1]))):
        if isinstance(s, URIRef):
            incoming.append({"property": local_name(p), "id": local_name(s), "label": display_label(g, s)})
    return {
        "id": ident,
        "uri": str(node),
        "label": display_label(g, node),
        "types": [local_name(t) for t in direct_types(g, node)],
        "properties": props,
        "incoming": incoming,
    }


def get_individuals(store: Store, type_filter: str | None = None) -> list[dict[str, Any]]:
    g = store.graph
    anc = ancestors_map(g)
    wanted = ACT[type_filter] if type_filter else None
    out = []
    for i in individuals(g):
        closure = types_closure(g, i, anc)
        if wanted is not None and wanted not in closure:
            continue
        props = []
        for p, o in sorted(g.predicate_objects(i), key=lambda po: str(po[0])):
            if p == RDF.type:
                continue
            props.append({"property": local_name(p), **_value_json(g, o)})
        out.append(
            {
                "id": local_name(i),
                "uri": str(i),
                "label": display_label(g, i),
                "types": [local_name(t) for t in direct_types(g, i)],
                "allTypes": sorted(local_name(t) for t in closure),
                "properties": props,
            }
        )
    return out


# ----------------------------------------------------------------------------- ontographe
def _top_group(c: URIRef, anc: dict[URIRef, set[URIRef]]) -> str:
    chain = anc.get(c, set())
    tops = [a for a in chain if not anc.get(a)]
    return local_name(tops[0]) if tops else local_name(c)


def get_graph(store: Store, level: str = "schema") -> dict[str, Any]:
    g = store.graph
    anc = ancestors_map(g)
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    if level == "schema":
        counts: dict[URIRef, int] = defaultdict(int)
        for i in individuals(g):
            for t in types_closure(g, i, anc):
                counts[t] += 1
        for c in named_classes(g):
            nodes.append(
                {
                    "id": local_name(c),
                    "label": rdfs_label(g, c),
                    "kind": "class",
                    "group": _top_group(c, anc) if anc.get(c) else local_name(c),
                    "instances": counts.get(c, 0),
                }
            )
            for p in parents(g, c):
                edges.append({"id": f"sub-{local_name(c)}-{local_name(p)}", "source": local_name(c), "target": local_name(p), "label": "subClassOf", "kind": "subClassOf"})
        for p in properties_of(g, OBJECT_PROP):
            for d in g.objects(p, RDFS.domain):
                for r in g.objects(p, RDFS.range):
                    if isinstance(d, URIRef) and isinstance(r, URIRef):
                        edges.append({"id": f"op-{local_name(p)}-{local_name(d)}-{local_name(r)}", "source": local_name(d), "target": local_name(r), "label": local_name(p), "kind": "objectProperty"})
    else:  # instances
        inverse_secondary = {q for p in g.subjects(OWL.inverseOf, None) for q in g.objects(p, OWL.inverseOf)}
        inds = individuals(g)
        ind_set = set(inds)
        for i in inds:
            types = direct_types(g, i)
            main = types[0] if types else None
            nodes.append(
                {
                    "id": local_name(i),
                    "label": display_label(g, i),
                    "kind": "individual",
                    "group": _top_group(main, anc) if main and anc.get(main) else (local_name(main) if main else "Thing"),
                    "className": local_name(main) if main else "Thing",
                    "types": [local_name(t) for t in types],
                }
            )
        for s, p, o in g:
            if s in ind_set and o in ind_set and p not in inverse_secondary and p != RDF.type:
                edges.append({"id": f"{local_name(s)}-{local_name(p)}-{local_name(o)}", "source": local_name(s), "target": local_name(o), "label": local_name(p), "kind": "objectProperty"})
    return {"level": level, "nodes": nodes, "edges": edges}


# ----------------------------------------------------------------------------- statistiques
def _select(store: Store, q: str) -> list[dict[str, Any]]:
    res = store.query(q)
    return [{k: v["value"] for k, v in row.items()} for row in res["rows"]]


def _count_subclasses(store: Store, root: str) -> list[dict[str, Any]]:
    """Répartition par sous-classe directe de `root` (les classes sans instance sont incluses avec 0)."""
    g = store.graph
    rows = _select(
        store,
        f"""SELECT ?t (COUNT(DISTINCT ?s) AS ?n) WHERE {{
              ?s rdf:type ?t . ?t rdfs:subClassOf actors:{root} .
            }} GROUP BY ?t""",
    )
    counts = {local_name(r["t"]): int(r["n"]) for r in rows}
    # inclut aussi les instances des sous-sous-classes
    out = []
    for c in named_classes(g):
        if ACT[root] in parents(g, c):
            out.append({"name": local_name(c), "label": rdfs_label(g, c), "count": counts.get(local_name(c), 0)})
    return sorted(out, key=lambda x: -x["count"])


def get_statistics(store: Store) -> dict[str, Any]:
    g = store.graph
    n = lambda cls: int(  # noqa: E731
        _select(store, f"SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE {{ ?s rdf:type/rdfs:subClassOf* actors:{cls} }}")[0]["n"]
    )
    ontology = {
        "classes": len(named_classes(g)),
        "objectProperties": len(properties_of(g, OBJECT_PROP)),
        "dataProperties": len(properties_of(g, DATATYPE_PROP)),
        "individuals": len(individuals(g)),
        "triples": len(g),
        "restrictions": sum(1 for _ in g.subjects(RDF.type, OWL.Restriction)),
        "disjointGroups": len(disjoint_groups(g)),
    }
    entities = {
        "assures": n("Assure"),
        "conducteurs": n("Conducteur"),
        "vehicules": n("Vehicule"),
        "contrats": n("ContratAssurance"),
        "garanties": n("Garantie"),
        "sinistres": n("Sinistre"),
        "dommages": n("Dommage"),
        "expertises": n("Expertise"),
        "experts": n("Expert"),
        "indemnisations": n("Indemnisation"),
        "compagnies": n("CompagnieAssurance"),
        "garages": n("Garage"),
    }
    money = _select(
        store,
        """SELECT (SUM(?m) AS ?total) (AVG(?m) AS ?avg) (COUNT(?m) AS ?n) WHERE {
             ?i a actors:Indemnisation ; actors:montantIndemnisation ?m ; actors:statutIndemnisation "Acceptee" }""",
    )[0]
    primes = _select(
        store,
        "SELECT (SUM(?m) AS ?total) WHERE { ?c a/rdfs:subClassOf* actors:ContratAssurance ; actors:aPourPrime/actors:montantPrime ?m }",
    )[0]
    by_status_indem = _select(
        store,
        "SELECT ?s (COUNT(?i) AS ?n) WHERE { ?i a actors:Indemnisation ; actors:statutIndemnisation ?s } GROUP BY ?s",
    )
    by_status_contract = _select(
        store,
        "SELECT ?s (COUNT(?c) AS ?n) WHERE { ?c a/rdfs:subClassOf* actors:ContratAssurance ; actors:statutContrat ?s } GROUP BY ?s",
    )
    by_month = _select(
        store,
        """SELECT ?m (COUNT(?s) AS ?n) WHERE { ?s a/rdfs:subClassOf* actors:Sinistre ; actors:dateSinistre ?d
             BIND(SUBSTR(STR(?d), 1, 7) AS ?m) } GROUP BY ?m ORDER BY ?m""",
    )
    by_brand = _select(
        store,
        "SELECT ?b (COUNT(?v) AS ?n) WHERE { ?v a/rdfs:subClassOf* actors:Vehicule ; actors:marque ?b } GROUP BY ?b ORDER BY DESC(?n)",
    )
    recent = _select(
        store,
        """SELECT ?s ?num ?d ?lieu WHERE { ?s a/rdfs:subClassOf* actors:Sinistre ; actors:numeroSinistre ?num ;
             actors:dateSinistre ?d . OPTIONAL { ?s actors:lieuSinistre ?lieu } } ORDER BY DESC(?d) LIMIT 5""",
    )
    return {
        "ontology": ontology,
        "entities": entities,
        "byContractType": _count_subclasses(store, "ContratAssurance"),
        "byClaimType": _count_subclasses(store, "Sinistre"),
        "byGuaranteeType": _count_subclasses(store, "Garantie"),
        "byDamageType": _count_subclasses(store, "Dommage"),
        "byVehicleType": _count_subclasses(store, "Vehicule"),
        "byIndemnisationStatus": [{"name": r["s"], "count": int(r["n"])} for r in by_status_indem],
        "byContractStatus": [{"name": r["s"], "count": int(r["n"])} for r in by_status_contract],
        "claimsByMonth": [{"month": r["m"], "count": int(r["n"])} for r in by_month],
        "vehiclesByBrand": [{"name": r["b"], "count": int(r["n"])} for r in by_brand],
        "finance": {
            "totalIndemnisationAcceptee": float(money.get("total", 0) or 0),
            "averageIndemnisationAcceptee": float(money.get("avg", 0) or 0),
            "acceptedCount": int(money.get("n", 0) or 0),
            "totalPrimes": float(primes.get("total", 0) or 0),
        },
        "recentClaims": [
            {"id": local_name(r["s"]), "number": r["num"], "date": r["d"], "place": r.get("lieu")} for r in recent
        ],
        "storeVersion": store.version,
    }


# ----------------------------------------------------------------------------- validation
def validate(store: Store) -> dict[str, Any]:
    """Validation structurelle (substitut léger de HermiT) : domaines, ranges, fonctionnelles,
    cardinalités, disjonctions et clés uniques. Ne réalise PAS d'inférence OWL complète."""
    g = store.graph
    anc = ancestors_map(g)
    inds = individuals(g)
    closure = {i: types_closure(g, i, anc) for i in inds}
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    checks: list[dict[str, Any]] = []

    def record(name: str, issues: list[dict[str, str]], level: str = "error") -> None:
        checks.append({"name": name, "passed": not issues, "issues": len(issues), "level": level})
        (errors if level == "error" else warnings).extend(issues)

    # 1. domaines / ranges
    issues = []
    for kind in (OBJECT_PROP, DATATYPE_PROP):
        for p in properties_of(g, kind):
            domains = set(g.objects(p, RDFS.domain))
            ranges = set(g.objects(p, RDFS.range))
            for s, o in g.subject_objects(p):
                if domains and isinstance(s, URIRef) and s in closure and not (domains & closure[s]):
                    issues.append({"subject": local_name(s), "property": local_name(p), "message": f"{local_name(s)} n'est pas dans le domaine {sorted(local_name(d) for d in domains)}"})
                if kind == OBJECT_PROP and ranges and isinstance(o, URIRef) and o in closure and not (ranges & closure[o]):
                    issues.append({"subject": local_name(s), "property": local_name(p), "message": f"{local_name(o)} n'est pas dans le range {sorted(local_name(r) for r in ranges)}"})
                if kind == DATATYPE_PROP and ranges and isinstance(o, Literal):
                    rng = next(iter(ranges))
                    got = o.datatype or XSD.string
                    numeric = {XSD.integer, XSD.decimal, XSD.int, XSD.long}
                    ok = got == rng or (rng == XSD.decimal and got in numeric) or (rng == XSD.string and got == XSD.string)
                    if not ok:
                        issues.append({"subject": local_name(s), "property": local_name(p), "message": f"valeur de type {local_name(got)}, {local_name(rng)} attendu"})
    record("Domaines et ranges respectés", issues)

    # 2. propriétés fonctionnelles
    issues = []
    for p in {x for x in g.subjects(RDF.type, OWL.FunctionalProperty) if isinstance(x, URIRef)}:
        per: dict[Any, set[Any]] = defaultdict(set)
        for s, o in g.subject_objects(p):
            per[s].add(o)
        for s, vals in per.items():
            if len(vals) > 1:
                issues.append({"subject": local_name(s), "property": local_name(p), "message": f"{len(vals)} valeurs pour une propriété fonctionnelle"})
    record("Propriétés fonctionnelles (≤ 1 valeur)", issues)

    # 3. restrictions de cardinalité / someValuesFrom
    issues = []
    for c in named_classes(g):
        for sup in {c} | anc[c]:
            pass
        restr_nodes = []
        for sup in {c} | anc[c]:
            for o in g.objects(sup, RDFS.subClassOf):
                if isinstance(o, BNode) and (o, RDF.type, OWL.Restriction) in g:
                    restr_nodes.append((sup, o))
        members = [i for i in inds if c in closure[i]]
        for sup, r in restr_nodes:
            info = _restriction_text(g, r)
            if not info or info["kind"] not in {"min", "max", "exactly", "some"}:
                continue
            p = ACT[info["property"]]
            on_class = ACT[info["onClass"]] if info["onClass"] else None
            for i in members:
                vals = list(g.objects(i, p))
                if on_class is not None:
                    vals = [v for v in vals if isinstance(v, URIRef) and v in closure and on_class in closure.get(v, set())]
                n_ = len(set(vals))
                bad = (
                    (info["kind"] == "min" and n_ < info["value"])
                    or (info["kind"] == "max" and n_ > info["value"])
                    or (info["kind"] == "exactly" and n_ != info["value"])
                    or (info["kind"] == "some" and n_ < 1)
                )
                if bad:
                    issues.append({"subject": local_name(i), "property": info["property"], "message": f"{local_name(i)} ({local_name(sup)}) viole « {info['text']} » ({n_} trouvé(s))"})
    record("Restrictions de cardinalité et existentielles", issues)

    # 4. disjonctions
    issues = []
    for grp in disjoint_groups(g):
        gs = set(grp)
        for i in inds:
            hit = gs & closure[i]
            if len(hit) > 1:
                issues.append({"subject": local_name(i), "property": "rdf:type", "message": f"{local_name(i)} appartient à des classes disjointes : {sorted(local_name(h) for h in hit)}"})
    record("Classes disjointes respectées", issues)

    # 5. clés uniques
    issues = []
    for key in ("immatriculation", "numeroContrat", "numeroSinistre", "numeroPermis"):
        seen: dict[str, URIRef] = {}
        for s, o in g.subject_objects(ACT[key]):
            v = str(o).strip().lower()
            if v in seen and seen[v] != s:
                issues.append({"subject": local_name(s), "property": key, "message": f"valeur « {o} » déjà utilisée par {local_name(seen[v])}"})
            seen[v] = s
    record("Identifiants uniques (immatriculation, n° contrat, n° sinistre, permis)", issues)

    # 6. inverses cohérentes
    issues = []
    for p, q in g.subject_objects(OWL.inverseOf):
        for s, o in g.subject_objects(p):
            if isinstance(o, URIRef) and (o, q, s) not in g:
                issues.append({"subject": local_name(s), "property": local_name(p), "message": f"inverse {local_name(q)} manquant pour {local_name(s)} → {local_name(o)}"})
    record("Propriétés inverses matérialisées", issues, level="warning")

    # 7. individus sans type
    issues = [
        {"subject": local_name(i), "property": "rdf:type", "message": "individu sans classe"}
        for i in inds
        if not direct_types(g, i)
    ]
    record("Tous les individus sont typés", issues)

    return {
        "consistent": not errors,
        "errors": errors,
        "warnings": warnings,
        "checks": checks,
        "individuals": len(inds),
        "triples": len(g),
        "note": (
            "Validation structurelle exécutée avec RDFLib (domaines, ranges, cardinalités, disjonctions). "
            "Elle complète mais ne remplace pas le raisonneur HermiT de Protégé."
        ),
    }
