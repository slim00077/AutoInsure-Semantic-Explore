"""Orchestration NLP : question en français -> analyse -> SPARQL validé -> exécution -> explication en français.

Aucune API LLM : le module n'utilise que spaCy (modèle local), NLTK, RDFLib, un dictionnaire de synonymes,
des règles et des templates SPARQL contrôlés.
"""
from __future__ import annotations

import re
import time
from decimal import Decimal
from typing import Any

from rdflib.plugins.sparql import prepareQuery

from .. import config
from ..store import SparqlRejected, SparqlSyntaxError, Store, with_prefixes
from .analyzer import Analysis, Analyzer, Constraint
from .lexicon import INTENTS, lexicon_summary
from .templates import QueryBuilder, Unsupported

NLP_LIBRARIES = [
    {"name": "spaCy", "version": None, "role": "Tokenisation, lemmatisation, étiquetage morpho-syntaxique, dépendances, reconnaissance d'entités (modèle fr_core_news_md)"},
    {"name": "NLTK", "version": None, "role": "Distance d'édition (edit_distance) pour la tolérance aux fautes de frappe dans l'appariement des entités"},
    {"name": "RDFLib", "version": None, "role": "Lecture de l'ontologie OWL, gazetteer des individus, validation et exécution SPARQL"},
    {"name": "Règles + dictionnaire de synonymes + templates SPARQL", "version": None, "role": "Détection d'intention, mapping vers les concepts OWL, génération de requêtes contrôlées (développés par l'équipe)"},
]

SUGGESTIONS = [
    "Quels véhicules sont assurés par Ahmed ?",
    "Quels contrats couvrent le vol ?",
    "Quels sinistres concernent une Peugeot 208 ?",
    "Quel est le montant de l'indemnisation du sinistre 001 ?",
    "Quels assurés ont déclaré un accident en 2026 ?",
    "Quels sinistres ont une indemnisation supérieure à 3000 euros ?",
]

NODE_NAMES = {
    "vehicle": ("véhicule", "véhicules"), "insured": ("assuré", "assurés"), "driver": ("conducteur", "conducteurs"),
    "victim": ("victime", "victimes"), "expert": ("expert", "experts"), "expertise": ("expertise", "expertises"),
    "contract": ("contrat", "contrats"), "guarantee": ("garantie", "garanties"), "claim": ("sinistre", "sinistres"),
    "damage": ("dommage", "dommages"), "indemnification": ("indemnisation", "indemnisations"),
    "company": ("compagnie d'assurance", "compagnies d'assurance"), "garage": ("garage", "garages"),
}
NODE_OWL = {
    "vehicle": "Vehicule", "insured": "Assure", "driver": "Conducteur", "victim": "Victime", "expert": "Expert",
    "expertise": "Expertise", "contract": "ContratAssurance", "guarantee": "Garantie", "claim": "Sinistre",
    "damage": "Dommage", "indemnification": "Indemnisation", "company": "CompagnieAssurance", "garage": "Garage",
}


def _clean_number(value: str) -> str:
    return value[:-2] if re.fullmatch(r"-?\d+\.0", value) else value


def _lib_versions() -> list[dict[str, Any]]:
    import nltk, rdflib, spacy

    out = []
    for lib in NLP_LIBRARIES:
        d = dict(lib)
        d["version"] = {"spaCy": spacy.__version__, "NLTK": nltk.__version__, "RDFLib": rdflib.__version__}.get(lib["name"])
        out.append(d)
    return out


class NlpService:
    def __init__(self) -> None:
        self.analyzer = Analyzer()

    # ------------------------------------------------------------------ sérialisation de l'analyse
    @staticmethod
    def _serialize(a: Analysis) -> dict[str, Any]:
        used: dict[int, str] = {}
        for m in a.mentions:
            for i in range(m.start, m.end):
                used[i] = f"concept:{m.concept.id}"
        for e in a.entities:
            for i in range(e.get("start", 0), e.get("end", 0)):
                used[i] = f"entité:{e['kind']}"
        tokens = [{**t, "used": used.get(t["i"])} for t in a.tokens]
        return {
            "normalizedQuestion": a.normalized,
            "tokens": tokens,
            "spacyEntities": a.spacy_entities,
            "concepts": [
                {"id": m.concept.id, "kind": m.concept.kind, "label": m.concept.label, "matched": m.text, "via": m.via,
                 "owl": m.concept.owl or ", ".join(m.concept.variants.values()) or m.concept.value or m.concept.prop}
                for m in a.mentions
            ],
            "entities": [
                {"text": e["text"], "kind": e["kind"], "source": e["source"], "fuzzy": e["fuzzy"], "resolved": e["resolved"],
                 "cue": e.get("cue"), "expectedByVerb": e.get("expectedByVerb")}
                for e in a.entities
            ],
            "numbers": [
                {k: (str(v) if isinstance(v, Decimal) else v) for k, v in n.items() if k != "span"} for n in a.numbers
            ],
            "constraints": [{"kind": c.kind, "node": c.node, "description": c.description, "source": c.source} for c in a.frame.constraints],
            "unrecognized": a.unrecognized,
            "issues": a.issues,
        }

    # ------------------------------------------------------------------ traduction
    def translate(self, question: str, store: Store) -> dict[str, Any]:
        started = time.perf_counter()
        question = (question or "").strip()
        base: dict[str, Any] = {
            "question": question, "method": "spaCy + NLTK + RDFLib + règles + templates SPARQL (aucune API LLM)",
            "libraries": _lib_versions(), "sparql": None, "valid": False, "suggestions": SUGGESTIONS,
        }
        if not question:
            return {**base, "status": "empty", "message": "Posez une question en français (ex. « Quels véhicules sont assurés par Ahmed ? »).", "steps": []}
        if len(question) > 500:
            return {**base, "status": "too_long", "message": "La question dépasse 500 caractères.", "steps": []}

        a = self.analyzer.analyze(question, store)
        base.update(self._serialize(a))
        base.update(
            intent=a.intent, intentLabel=INTENTS.get(a.intent or "", None), modifiers=a.modifiers,
            modifierLabels=[INTENTS[m] for m in a.modifiers], questionType=a.frame.qtype,
            focus=a.frame.focus, focusClass=NODE_OWL.get(a.frame.focus or ""), answerAttribute=a.frame.answer_attr,
            confidence=a.confidence,
        )
        steps = list(a.steps)

        def finish(status: str, message: str, **extra: Any) -> dict[str, Any]:
            base.update(status=status, message=message, steps=steps,
                        translationMs=round((time.perf_counter() - started) * 1000, 2), **extra)
            return base

        codes = {i["code"] for i in a.issues}
        if not a.frame.focus:
            if any(i.get("ref") for i in a.issues):
                return finish("entity_not_found", " ".join(i["message"] for i in a.issues if i.get("ref"))
                              + " Je n'exécute pas de requête sur une entité introuvable.")
            unk =f" Termes non reconnus : {', '.join(a.unrecognized)}." if a.unrecognized else ""
            return finish("clarification_needed",
                          "Je n'ai pas compris ce que vous cherchez (véhicules, assurés, contrats, garanties, sinistres, dommages, "
                          "expertises, indemnisations...)." + unk + " Pouvez-vous reformuler ?")
        if codes & {"role_mismatch", "unknown_entity"}:
            msgs = [i["message"] for i in a.issues if i["code"] in {"role_mismatch", "unknown_entity"}]
            return finish("entity_not_found", " ".join(msgs) + " Je n'exécute pas de requête sur une entité introuvable.")
        if "ambiguous_entity" in codes:
            return finish("clarification_needed", " ".join(i["message"] for i in a.issues if i["code"] == "ambiguous_entity"))
        if a.confidence < 0.5:
            return finish("clarification_needed",
                          f"Ma compréhension de la question est trop incertaine (confiance {a.confidence:.0%}). "
                          f"Termes non reconnus : {', '.join(a.unrecognized) or '—'}. Reformulez avec les termes du domaine.")

        t = time.perf_counter()
        try:
            sparql, template_id, fragments = QueryBuilder(store, a.frame).build(a.intent or "")
        except Unsupported as exc:
            return finish("unsupported", f"J'ai compris la question mais je ne peux pas la traduire en SPARQL : {exc}")
        steps.append({"name": "Sélection du template et génération SPARQL", "ms": round((time.perf_counter() - t) * 1000, 2),
                      "detail": f"template {template_id} ; fragments : {', '.join(fragments)}"})

        t = time.perf_counter()
        try:
            prepareQuery(with_prefixes(sparql))
            valid, error = True, None
        except Exception as exc:  # pragma: no cover - défense en profondeur
            valid, error = False, str(exc)
        steps.append({"name": "Validation SPARQL (analyse syntaxique RDFLib)", "ms": round((time.perf_counter() - t) * 1000, 2),
                      "detail": "requête valide" if valid else f"erreur : {error}"})
        if not valid:
            return finish("unsupported", f"La requête générée n'est pas valide : {error}", sparql=sparql, valid=False)
        return finish("ok", "Question traduite en SPARQL.", sparql=sparql, valid=True, template=template_id, fragments=fragments,
                      description=self._describe(a))

    # ------------------------------------------------------------------ description française de l'interprétation
    @staticmethod
    def _describe(a: Analysis) -> str:
        f = a.frame
        sing, plur = NODE_NAMES.get(f.focus or "", ("résultat", "résultats"))
        head = f"Nombre de {plur}" if f.qtype == "COUNT" else f"Liste des {plur}"
        if f.answer_attr:
            head = f"{f.answer_attr.capitalize()} — {sing}"
        conds = [c.description for c in f.constraints]
        return head + (" avec : " + " ; ".join(conds) if conds else "") + f" (classe OWL {NODE_OWL.get(f.focus or '', '?')})."

    # ------------------------------------------------------------------ exécution + explication
    def search(self, question: str, store: Store) -> dict[str, Any]:
        tr = self.translate(question, store)
        if tr["status"] != "ok":
            tr["executed"] = False
            tr["explanation"] = tr["message"]
            return tr
        t = time.perf_counter()
        try:
            result = store.query(tr["sparql"])
        except (SparqlSyntaxError, SparqlRejected) as exc:
            tr.update(status="error", executed=False, message=str(exc), explanation=f"La requête générée a échoué : {exc}")
            return tr
        tr["executed"] = True
        tr["result"] = result
        tr["executionMs"] = result.get("executionMs", round((time.perf_counter() - t) * 1000, 2))
        tr["steps"].append({"name": "Exécution SPARQL sur le graphe RDF", "ms": tr["executionMs"], "detail": f"{result.get('count', 0)} ligne(s)"})
        tr["explanation"] = self._explain(tr, result)
        return tr

    @staticmethod
    def _row_label(focus: str, row: dict[str, Any]) -> str:
        def g(k: str) -> str:
            if k not in row:
                return ""
            return _clean_number(row[k].get("local") or row[k]["value"])

        ident = row["x"]["local"] if "x" in row else ""
        if focus == "vehicle":
            return f"{g('marque')} {g('modele')} ({g('immatriculation')})".replace("  ", " ")
        if focus in {"insured", "driver", "victim", "expert"}:
            return f"{g('prenom')} {g('nom')}".strip() or ident
        if focus == "contract":
            return f"{g('numero')} ({g('typeContrat') or 'contrat'}, {g('statut')})"
        if focus == "guarantee":
            return f"{ident} ({g('typeGarantie')}, plafond {g('plafond')})"
        if focus == "claim":
            return f"{g('numero')} ({g('typeSinistre')}, {g('lieu')})"
        if focus == "damage":
            return f"{ident} : {g('description')} (coût {g('cout')})"
        if focus == "expertise":
            return f"{ident} par {g('expert') or '?'}"
        if focus == "indemnification":
            return f"{ident} : {g('montant')} ({g('statut')})"
        return g("raisonSociale") or ident

    def _explain(self, tr: dict[str, Any], result: dict[str, Any]) -> str:
        focus = tr["focus"] or ""
        sing, plur = NODE_NAMES.get(focus, ("résultat", "résultats"))
        cond = "; ".join(c["description"] for c in tr["constraints"])
        cond_txt = f" ({cond})" if cond else ""
        if tr["questionType"] == "COUNT":
            n = int(result["rows"][0]["nombre"]["value"]) if result.get("rows") else 0
            return f"Il y a {n} {sing if n <= 1 else plur}{cond_txt}."
        rows = result.get("rows", [])
        if not rows:
            return (f"Aucun {sing} ne correspond à la question{cond_txt}. "
                    "Aucune donnée de l'ontologie ne satisfait ces conditions.")
        labels = list(dict.fromkeys(self._row_label(focus, r) for r in rows))
        if tr.get("answerAttribute") and focus == "indemnification" and "montant" in rows[0]:
            montants = ", ".join(
                _clean_number(r["montant"]["value"]) + (f" (versé à {r['beneficiaire']['value']})" if "beneficiaire" in r else "")
                for r in rows if "montant" in r
            )
            return f"Montant d'indemnisation{cond_txt} : {montants}."
        shown = labels[:8]
        more = f" … (+{len(labels) - 8})" if len(labels) > 8 else ""
        n = len(labels)
        fem = "e" if focus in {"guarantee", "indemnification", "expertise", "victim", "company"} else ""
        return f"{n} {sing if n == 1 else plur} trouvé{fem}{'s' if n > 1 else ''}{cond_txt} : {'; '.join(shown)}{more}."


_service: NlpService | None = None


def get_nlp_service() -> NlpService:
    global _service
    if _service is None:
        _service = NlpService()
    return _service


def describe_module() -> dict[str, Any]:
    return {
        "libraries": _lib_versions(),
        "intents": [{"id": k, "label": v} for k, v in INTENTS.items()],
        "lexicon": lexicon_summary(),
        "pipeline": [
            "Question utilisateur", "Prétraitement linguistique", "spaCy : tokenisation / lemmatisation / POS / dépendances / NER",
            "Extraction des entités (gazetteer lié aux individus OWL)", "Détection de l'intention", "Mapping vers les concepts OWL (synonymes)",
            "Sélection du template SPARQL", "Génération de la requête", "Validation", "Exécution SPARQL", "Résultats + explication en français",
        ],
        "llm": False,
    }
