"""Templates SPARQL contrôlés : construction d'une requête à partir d'un « frame » validé.

Principe : un gabarit de base par type de focus (SELECT + colonnes OPTIONAL), plus des fragments
déclaratifs (jointures déduites du graphe de relations de l'ontologie, filtres de type/statut/montant/date).
Aucune chaîne issue de la question n'est insérée telle quelle :
  - les individus proviennent du gazetteer (nom local validé par regex + existence dans le graphe) ;
  - les classes viennent du dictionnaire et sont vérifiées dans l'ontologie ;
  - les nombres sont des Decimal ; les chaînes passent par escape_literal().
"""
from __future__ import annotations

import heapq
import re
from datetime import date
from decimal import Decimal
from typing import Any

from rdflib.namespace import OWL, RDF

from ..store import ACT, Store
from .analyzer import Frame
from .gazetteer import get_gazetteer

LOCAL_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,80}$")
STATUS_WHITELIST = {"Acceptee", "Refusee", "EnCours", "Actif", "Expire", "Resilie", "Clos"}


class Unsupported(ValueError):
    """La question est comprise mais ne peut pas être traduite avec les gabarits disponibles."""


# ----------------------------------------------------------------------------- graphe de relations de l'ontologie
NODE_CLASS = {
    "insured": "Assure", "driver": "Conducteur", "victim": "Victime", "expert": "Expert", "company": "CompagnieAssurance",
    "garage": "Garage", "vehicle": "Vehicule", "contract": "ContratAssurance", "guarantee": "Garantie", "claim": "Sinistre",
    "damage": "Dommage", "expertise": "Expertise", "indemnification": "Indemnisation",
}
# (source, ObjectProperty OWL, destination, poids)
EDGES: list[tuple[str, str, str, float]] = [
    ("insured", "possede", "contract", 1.0),
    ("company", "propose", "contract", 1.0),
    ("contract", "couvre", "vehicle", 1.0),
    ("contract", "contient", "guarantee", 1.0),
    ("vehicle", "estConduitPar", "driver", 1.0),
    ("garage", "repare", "vehicle", 1.0),
    ("insured", "declare", "claim", 1.2),
    ("claim", "concerne", "vehicle", 1.2),
    ("claim", "rattacheAContrat", "contract", 1.2),
    ("claim", "mobiliseGarantie", "guarantee", 1.2),
    ("claim", "provoque", "damage", 1.2),
    ("claim", "faitObjetDe", "expertise", 1.2),
    ("claim", "implique", "driver", 1.2),
    ("expertise", "realisePar", "expert", 1.0),
    ("expertise", "evalue", "damage", 1.0),
    ("damage", "donneLieuA", "indemnification", 1.0),
    ("indemnification", "verseePar", "company", 1.0),
    ("indemnification", "verseeA", "insured", 1.0),
    ("indemnification", "verseeA", "victim", 1.0),
    ("damage", "subiPar", "insured", 1.0),
    ("damage", "subiPar", "victim", 1.0),
]

TERMINAL_NODES = {"insured", "driver", "victim", "company", "expert", "garage"}

COLUMNS: dict[str, list[tuple[str, str]]] = {
    "vehicle": [("marque", "marque"), ("modele", "modele"), ("immatriculation", "immatriculation"), ("anneeFabrication", "annee"), ("valeurVehicule", "valeur")],
    "insured": [("prenom", "prenom"), ("nom", "nom"), ("numeroPermis", "permis")],
    "driver": [("prenom", "prenom"), ("nom", "nom"), ("numeroPermis", "permis")],
    "victim": [("prenom", "prenom"), ("nom", "nom")],
    "expert": [("prenom", "prenom"), ("nom", "nom"), ("specialite", "specialite")],
    "contract": [("numeroContrat", "numero"), ("statutContrat", "statut"), ("dateDebut", "debut"), ("dateFin", "fin")],
    "guarantee": [("plafondGarantie", "plafond")],
    "claim": [("numeroSinistre", "numero"), ("dateSinistre", "date"), ("lieuSinistre", "lieu"), ("descriptionSinistre", "description"), ("statutSinistre", "statut")],
    "damage": [("description", "description"), ("gravite", "gravite"), ("coutEstime", "cout")],
    "expertise": [("dateExpertise", "date"), ("conclusion", "conclusion")],
    "indemnification": [("montantIndemnisation", "montant"), ("dateIndemnisation", "date"), ("statutIndemnisation", "statut"), ("motifDecision", "motif")],
    "company": [("raisonSociale", "raisonSociale"), ("ville", "ville")],
    "garage": [("raisonSociale", "raisonSociale"), ("ville", "ville")],
}
TYPE_COLUMN = {
    "contract": "typeContrat", "guarantee": "typeGarantie", "claim": "typeSinistre", "damage": "typeDommage", "vehicle": "typeVehicule",
}
AMOUNT_PROP = {  # attr -> (chemin de propriétés)
    "montantIndemnisation": "actors:montantIndemnisation", "coutEstime": "actors:coutEstime", "valeurVehicule": "actors:valeurVehicule",
    "plafondGarantie": "actors:plafondGarantie", "prime": "actors:aPourPrime/actors:montantPrime",
    "franchise": "actors:appliqueFranchise/actors:montantFranchise",
}
DATE_PROP = {"claim": "dateSinistre", "contract": "dateDebut", "expertise": "dateExpertise", "indemnification": "dateIndemnisation", "insured": "dateNaissance"}
STATUS_PROP = {"contract": "statutContrat", "indemnification": "statutIndemnisation", "claim": "statutSinistre"}
OPS = {">": ">", ">=": ">=", "<": "<", "<=": "<=", "=": "="}


def escape_literal(value: str) -> str:
    value = value[:120]
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", " ") + '"'


def _num(d: Decimal) -> str:
    if not isinstance(d, Decimal) or not d.is_finite() or abs(d) > Decimal("1e12"):
        raise Unsupported("Montant hors limites.")
    s = format(d, "f")
    return s if "." in s else s + ".0"


def find_path(sources: set[str], goal: str, max_len: int = 4, require_edge: bool = False) -> list[tuple[str, str, str, bool]]:
    """Plus court chemin pondéré (Dijkstra multi-sources) dans le graphe de relations OWL."""
    adj: dict[str, list[tuple[str, str, bool, float]]] = {}
    for s, p, d, w in EDGES:
        adj.setdefault(s, []).append((d, p, True, w))
        adj.setdefault(d, []).append((s, p, False, w))
    heap: list[tuple[float, int, str, list]] = [(0.0, 0, s, []) for s in sorted(sources)]
    heapq.heapify(heap)
    best: dict[tuple[str, bool], float] = {}
    counter = 0
    while heap:
        cost, _, node, path = heapq.heappop(heap)
        if node == goal and (path or not require_edge):
            return path
        key = (node, bool(path))
        if best.get(key, float("inf")) <= cost:
            continue
        best[key] = cost
        if len(path) >= max_len or (path and node in TERMINAL_NODES):
            continue  # personnes / organisations : on peut les atteindre mais pas les traverser
        for nxt, prop, fwd, w in adj.get(node, []):
            counter += 1
            heapq.heappush(heap, (cost + w, counter, nxt, path + [(node, prop, nxt, fwd)]))
    raise Unsupported(f"Aucune relation de l'ontologie ne relie ces concepts ({', '.join(sorted(sources))} → {goal}).")


class QueryBuilder:
    def __init__(self, store: Store, frame: Frame) -> None:
        self.store = store
        self.g = store.graph
        self.gaz = get_gazetteer(store)
        self.frame = frame
        self.focus = frame.focus or ""
        self.bound: dict[str, str] = {self.focus: "?x"}
        self.typed: set[str] = set()
        self.patterns: list[str] = []
        self.counter = 0
        self.fragments: list[str] = []
        self.alias_count: dict[str, int] = {}
        self.neg_prefix = ""  # préfixe des variables à l'intérieur d'un FILTER NOT EXISTS (évite toute corrélation accidentelle)
        self.neg_count = 0

    # --------------------------------------------------------------- validation des valeurs injectées
    def iri(self, local: str) -> str:
        if not LOCAL_RE.match(local) or local not in self.gaz.individuals:
            raise Unsupported(f"Individu inconnu ou invalide : {local!r}.")
        return f"actors:{local}"

    def cls(self, local: str) -> str:
        if not LOCAL_RE.match(local) or (ACT[local], RDF.type, OWL.Class) not in self.g:
            raise Unsupported(f"Classe inconnue de l'ontologie : {local!r}.")
        return f"actors:{local}"

    # --------------------------------------------------------------- variables et chemins
    def _new_var(self, node: str, fresh: bool = False) -> str:
        if self.neg_prefix:
            return f"?{self.neg_prefix}{node}"
        if fresh:
            self.alias_count[node] = self.alias_count.get(node, 1) + 1
            return f"?{node}{self.alias_count[node]}"
        return f"?{node}"

    def ensure(self, node: str, out: list[str] | None = None, fresh: bool = False) -> str:
        """Garantit que le noeud est relié au focus ; retourne sa variable (en ajoutant les triplets du chemin)."""
        out = self.patterns if out is None else out
        if node in self.bound and not fresh:
            return self.bound[node]
        path = find_path(set(self.bound), node, require_edge=fresh and node in self.bound)
        if not path:  # fresh sur un noeud déjà lié : chemin vers lui-même impossible
            raise Unsupported(f"Impossible de dupliquer le noeud {node}.")
        for i, (a, prop, b, fwd) in enumerate(path):
            last = i == len(path) - 1
            if b in self.bound and not (last and fresh):
                bv = self.bound[b]
            else:
                bv = self._new_var(b, fresh=last and fresh)
                if not (last and fresh):
                    self.bound[b] = bv
            av = self.bound[a]
            out.append(f"{av} actors:{prop} {bv} ." if fwd else f"{bv} actors:{prop} {av} .")
            if last:
                result = bv
        return result

    # --------------------------------------------------------------- contraintes
    def apply(self, c) -> None:
        if getattr(c, "negated", False):
            self._apply_negated(c)
        else:
            self._apply_positive(c)

    def _apply_negated(self, c) -> None:
        """Négation sûre : le motif de la contrainte est construit seul (focus ?x uniquement lié) puis enveloppé dans
        FILTER NOT EXISTS { ... } avec des variables privées ; rien n'est inventé ni exécuté si le motif est vide."""
        saved = (self.patterns, self.bound, self.typed)
        self.neg_count += 1
        self.neg_prefix = f"n{self.neg_count}_"
        self.patterns, self.bound, self.typed = [], {self.focus: "?x"}, set()
        try:
            if c.kind == "exists":
                if c.node == self.focus:
                    raise Unsupported("Négation d'existence sur le résultat lui-même : non gérée.")
                self.ensure(c.node)
                self.fragments.append(f"négation:existence({c.node})")
            else:
                self._apply_positive(c)
                self.fragments[-1] = "négation:" + self.fragments[-1]
            inner = self.patterns
        finally:
            self.patterns, self.bound, self.typed = saved
            self.neg_prefix = ""
        if not inner:
            raise Unsupported("La négation ne correspond à aucun motif SPARQL sûr.")
        self.patterns.append("FILTER NOT EXISTS { " + " ".join(inner) + " }")

    def _apply_positive(self, c) -> None:
        kind = c.kind
        if kind == "exists":
            self.ensure(c.node)  # le chemin de relations impose l'existence ; Unsupported s'il n'existe aucune relation
            self.fragments.append(f"existence:{c.node}")
        elif kind == "entity":
            var = self.ensure(c.node)
            values = " ".join(self.iri(i) for i in c.data["ids"])
            self.patterns.append(f"VALUES {var} {{ {values} }}")
            self.fragments.append(f"entité:{c.node}")
        elif kind == "type":
            self._apply_type(c)
        elif kind == "status":
            if c.data["value"] not in STATUS_WHITELIST:
                raise Unsupported("Statut inconnu.")
            var = self.ensure(c.node)
            self.patterns.append(f"{var} actors:{STATUS_PROP[c.node]} {escape_literal(c.data['value'])} .")
            self.fragments.append(f"statut:{c.node}")
        elif kind == "amount":
            self._apply_amount(c)
        elif kind == "date":
            self._apply_date(c)
        elif kind == "place":
            var = self.ensure("claim")
            self.counter += 1
            lv = f"?lieu{self.counter}"
            self.patterns.append(f"{var} actors:lieuSinistre {lv} .")
            self.patterns.append(f"FILTER(LCASE(STR({lv})) = {escape_literal(str(c.data['value']).lower())})")
            self.fragments.append("filtre:lieu")
        else:
            raise Unsupported(f"Contrainte non gérée : {kind}")

    def _apply_type(self, c) -> None:
        alts = c.data["alternatives"]
        snapshot = dict(self.bound)
        blocks: list[list[str]] = []
        for alt in alts:
            node, klass = alt["node"], alt["class"]
            block: list[str] = []
            fresh = node in self.typed and node != self.focus
            if node == self.focus and node in self.typed:
                fresh = False
            var = "?x" if node == self.focus else self.ensure(node, out=block, fresh=fresh)
            block.append(f"{var} a/rdfs:subClassOf* {self.cls(klass)} .")
            blocks.append(block)
            if len(alts) > 1:
                self.bound = dict(snapshot)
        if len(blocks) == 1:
            self.patterns.extend(blocks[0])
            self.typed.add(alts[0]["node"])
        else:
            self.patterns.append(" UNION ".join("{ " + " ".join(b) + " }" for b in blocks))
        self.fragments.append(f"type:{'|'.join(a['class'] for a in alts)}")

    def _apply_amount(self, c) -> None:
        var = self.ensure(c.node)
        attr = c.data["attr"]
        if attr not in AMOUNT_PROP:
            raise Unsupported("Propriété de montant inconnue.")
        self.counter += 1
        av = f"?montant{self.counter}"
        self.patterns.append(f"{var} {AMOUNT_PROP[attr]} {av} .")
        op = c.data["op"]
        if op == "between":
            self.patterns.append(f"FILTER({av} >= {_num(c.data['value'])} && {av} <= {_num(c.data['value2'])})")
        else:
            self.patterns.append(f"FILTER({av} {OPS[op]} {_num(c.data['value'])})")
        self.fragments.append(f"filtre:montant({attr})")

    def _apply_date(self, c) -> None:
        node = c.node
        var = self.ensure(node)
        prop = DATE_PROP[node]
        self.counter += 1
        dv = f"?date{self.counter}"
        self.patterns.append(f"{var} actors:{prop} {dv} .")
        year, month, day, op = c.data.get("year"), c.data.get("month"), c.data.get("day"), c.data.get("op", "=")
        if year is None:  # mois seul
            if not month or not 1 <= int(month) <= 12:
                raise Unsupported("Date invalide.")
            self.patterns.append(f"FILTER(MONTH({dv}) = {int(month)})")
            self.fragments.append("filtre:mois")
            return
        year = int(year)
        if not 1900 <= year <= 2200:
            raise Unsupported("Année hors limites.")
        if day:
            start, end = date(year, int(month), int(day)), None
            end_d = date.fromordinal(start.toordinal() + 1)
        elif month:
            start = date(year, int(month), 1)
            end_d = date(year + (month == 12), (month % 12) + 1, 1)
        else:
            start, end_d = date(year, 1, 1), date(year + 1, 1, 1)
        s_lit = f'"{start.isoformat()}T00:00:00"^^xsd:dateTime'
        e_lit = f'"{end_d.isoformat()}T00:00:00"^^xsd:dateTime'
        cond = {
            "=": f"{dv} >= {s_lit} && {dv} < {e_lit}",
            "before": f"{dv} < {s_lit}",
            "after": f"{dv} >= {e_lit}",
            "since": f"{dv} >= {s_lit}",
        }[op]
        self.patterns.append(f"FILTER({cond})")
        self.fragments.append(f"filtre:date({op})")

    # --------------------------------------------------------------- assemblage
    def build(self, intent: str) -> tuple[str, str, list[str]]:
        f = self.frame
        if self.focus not in NODE_CLASS:
            raise Unsupported("Type de résultat non géré.")
        core = [f"?x a/rdfs:subClassOf* {self.cls(NODE_CLASS[self.focus])} ."]
        self.patterns = core + self.patterns  # le focus d'abord
        for c in f.constraints:
            self.apply(c)
        self.fragments.insert(0, f"base:{self.focus}")
        body = [p for p in self.patterns]

        if f.qtype == "COUNT":
            select = "SELECT (COUNT(DISTINCT ?x) AS ?nombre)"
            extras: list[str] = []
        else:
            cols = COLUMNS.get(self.focus, [])
            names = ["?x"] + [f"?{v}" for _, v in cols]
            extras = [f"OPTIONAL {{ ?x actors:{p} ?{v} }}" for p, v in cols]
            if self.focus in TYPE_COLUMN:
                tv = TYPE_COLUMN[self.focus]
                names.append(f"?{tv}")
                extras.append(f"OPTIONAL {{ ?x a ?{tv} . ?{tv} rdfs:subClassOf {self.cls(NODE_CLASS[self.focus])} }}")
            if self.focus == "expertise":
                names += ["?expert"]
                extras.append("OPTIONAL { ?x actors:realisePar ?e . ?e actors:prenom ?ep . ?e actors:nom ?en . BIND(CONCAT(?ep, \" \", ?en) AS ?expert) }")
            if self.focus == "indemnification":
                names.append("?beneficiaire")
                extras.append("OPTIONAL { ?x actors:verseeA ?b . ?b actors:prenom ?bp . ?b actors:nom ?bn . BIND(CONCAT(?bp, \" \", ?bn) AS ?beneficiaire) }")
            if self.focus == "contract":
                names.append("?prime")
                extras.append("OPTIONAL { ?x actors:aPourPrime/actors:montantPrime ?prime }")
            select = "SELECT DISTINCT " + " ".join(names)
        lines = [
            "PREFIX actors: <http://www.semanticweb.org/assurance/actors#>",
            "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>",
            "PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>",
            f"# Généré par le module NLP (règles + templates) — intention {intent}",
            select,
            "WHERE {",
        ]
        lines += [f"  {p}" for p in body]
        lines += [f"  {e}" for e in extras]
        lines.append("}")
        if f.qtype != "COUNT":
            lines.append("ORDER BY ?x")
        template_id = f"{intent}_{f.qtype}"
        return "\n".join(lines), template_id, self.fragments
