"""Analyse linguistique d'une question : spaCy + NLTK + règles -> « frame » sémantique.

Étapes : prétraitement -> spaCy (tokens, lemmes, POS, dépendances, NER) -> entités (gazetteer + références codées)
-> nombres / montants / dates -> concepts du dictionnaire -> détermination du focus et des contraintes.
Aucun appel à une API LLM : tout est règle + dictionnaire + modèle statistique spaCy local.
"""
from __future__ import annotations

import re
import time
import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

import spacy

from .. import config
from ..store import Store
from .gazetteer import Candidate, EntityMention, Gazetteer, fuzzy_match, get_gazetteer, match_gazetteer
from .lexicon import (
    CLASS_CONCEPTS,
    CONCEPT_INDEX,
    COUNT_WORDS,
    CUE_ROLES,
    INTENTS,
    MAX_NGRAM,
    MONTHS,
    NEG_FIRST,
    NEG_RESTRICTIVE,
    NEG_SCOPE_STOP,
    NEG_SECOND,
    NEG_STANDALONE,
    TYPE_CONCEPTS,
    STRICT_VERB_ROLES,
    VERB_EXPECTED_ROLES,
    VERB_NEGATED_EXISTENCE,
    VERB_ROLE_LABEL,
    WHO_WORDS,
    WRITE_KEYWORDS,
    WRITE_VERBS,
    Concept,
    CONCEPTS_BY_ID,
    normalize,
    strip_accents,
)

_nlp = None


def get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load(config.SPACY_MODEL)
    return _nlp


# --------------------------------------------------------------------------- noeuds du graphe sémantique
FOCUS_NODE = {
    "VEHICLE": "vehicle", "INSURED": "insured", "DRIVER": "driver", "VICTIM": "victim", "EXPERT": "expert",
    "EXPERTISE": "expertise", "CONTRACT": "contract", "GUARANTEE": "guarantee", "CLAIM": "claim",
    "DAMAGE": "damage", "INDEMNIFICATION": "indemnification", "COMPANY": "company", "GARAGE": "garage",
}
CLASS_TO_NODE = [  # (classe OWL, noeud) — ordre = priorité
    ("Assure", "insured"), ("Conducteur", "driver"), ("Victime", "victim"), ("Expert", "expert"),
    ("CompagnieAssurance", "company"), ("Garage", "garage"), ("Vehicule", "vehicle"),
    ("ContratAssurance", "contract"), ("Sinistre", "claim"), ("Dommage", "damage"), ("Expertise", "expertise"),
    ("Indemnisation", "indemnification"), ("Garantie", "guarantee"),
]
ROLE_NODE = {"vehicle": "vehicle", "guarantee": "guarantee", "claim": "claim", "contract": "contract", "damage": "damage"}
CLASS_CONCEPT_ROLE = {"GUARANTEE": "guarantee", "CLAIM": "claim", "CONTRACT": "contract", "DAMAGE": "damage", "VEHICLE": "vehicle"}
STATUS_NODE = {"Actif": "contract", "Expire": "contract", "Resilie": "contract",
               "Acceptee": "indemnification", "Refusee": "indemnification", "EnCours": "indemnification", "Clos": "claim"}
NODE_LABELS = {"insured": "assuré", "driver": "conducteur", "victim": "victime", "expert": "expert", "company": "compagnie",
               "garage": "garage", "vehicle": "véhicule", "contract": "contrat", "claim": "sinistre", "damage": "dommage",
               "expertise": "expertise", "indemnification": "indemnisation", "guarantee": "garantie"}
CURRENCY = r"(?:€|euros?|eur\b|dinars?|dt\b|tnd\b)"

COMPARATORS = [
    (">=", r"(?:au\s+moins|minimum\s+(?:de\s+)?|>=|superieur\w*\s+ou\s+egal\w*\s+a)\s*$"),
    ("<=", r"(?:au\s+plus|maximum\s+(?:de\s+)?|<=|inferieur\w*\s+ou\s+egal\w*\s+a)\s*$"),
    (">", r"(?:superieur\w*\s+a|plus\s+(?:de|que|d')\s*|au[\s-]*dessus\s+(?:de|d')\s*|depass\w*|exced\w*|>)\s*$"),
    ("<", r"(?:inferieur\w*\s+a|moins\s+(?:de|que|d')\s*|en\s+dessous\s+(?:de|d')\s*|au[\s-]*dessous\s+(?:de|d')\s*|<)\s*$"),
    ("=", r"(?:egal\w*\s+a|exactement|de\s+exactement|d'un\s+montant\s+de)\s*$"),
]
NUM_RE = re.compile(r"(?<![\w.,/-])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?")
REF_RE = re.compile(
    r"\b(sinistre|dossier|contrat|police|expertise|indemnisation|dommage|garantie)\s*"
    r"(?:n°|no\b|num(?:ero)?\b)?\s*[:#]?\s*(?:[a-z][-_ ]?)?0*(\d{1,4})\b"
)
CODE_RE = re.compile(r"\b([sc])[-_]0*(\d{1,4})\b")
REF_CLASS = {
    "sinistre": ("Sinistre", "claim"), "dossier": ("Sinistre", "claim"), "contrat": ("Contrat", "contract"),
    "police": ("Contrat", "contract"), "expertise": ("Expertise", "expertise"),
    "indemnisation": ("Indemnisation", "indemnification"), "dommage": ("Dommage", "damage"),
    "garantie": ("Garantie", "guarantee"),
}
REF_OWL = {"Sinistre": "Sinistre", "Contrat": "ContratAssurance", "Expertise": "Expertise",
           "Indemnisation": "Indemnisation", "Dommage": "Dommage", "Garantie": "Garantie"}


# --------------------------------------------------------------------------- structures
@dataclass
class Mention:
    concept: Concept
    start: int
    end: int
    text: str
    via: str


@dataclass
class Constraint:
    kind: str  # entity | type | status | amount | date | place
    node: str
    data: dict[str, Any]
    source: str = ""
    description: str = ""
    negated: bool = False  # portée d'une négation détectée (voir Analyzer._apply_negation)
    span: tuple[int, int] | None = None  # indices de tokens spaCy (début inclus, fin exclue)


@dataclass
class Frame:
    focus: str | None = None
    focus_concept: str | None = None
    qtype: str = "LIST"  # LIST | COUNT
    answer_attr: str | None = None
    constraints: list[Constraint] = field(default_factory=list)


@dataclass
class Analysis:
    question: str
    normalized: str = ""
    tokens: list[dict[str, Any]] = field(default_factory=list)
    spacy_entities: list[dict[str, Any]] = field(default_factory=list)
    mentions: list[Mention] = field(default_factory=list)
    entities: list[dict[str, Any]] = field(default_factory=list)
    numbers: list[dict[str, Any]] = field(default_factory=list)
    frame: Frame = field(default_factory=Frame)
    intent: str | None = None
    modifiers: list[str] = field(default_factory=list)
    issues: list[dict[str, Any]] = field(default_factory=list)
    unrecognized: list[str] = field(default_factory=list)
    confidence: float = 0.0
    steps: list[dict[str, Any]] = field(default_factory=list)
    negations: list[dict[str, Any]] = field(default_factory=list)
    allcaps: bool = False  # question saisie en MAJUSCULES : l'information de casse (noms propres) est perdue


def _step(a: Analysis, name: str, t0: float, detail: str) -> float:
    now = time.perf_counter()
    a.steps.append({"name": name, "ms": round((now - t0) * 1000, 2), "detail": detail})
    return now


def preprocess(text: str) -> str:
    t = unicodedata.normalize("NFC", text or "")
    t = t.replace("’", "'").replace("`", "'").replace(" ", " ")
    t = re.sub(r"\s+", " ", t).strip()
    letters = [ch for ch in t if ch.isalpha()]
    if len(letters) >= 4 and sum(ch.isupper() for ch in letters) / len(letters) > 0.7:
        # question écrite EN MAJUSCULES : sans cela chaque mot ressemble à un nom propre inconnu (« COUVRENT »)
        t = t.lower()
        t = t[:1].upper() + t[1:]
    return t


def _consume_chars(consumed: list[tuple[int, int]], span: tuple[int, int]) -> None:
    consumed.append(span)


def _free(consumed: list[tuple[int, int]], s: int, e: int) -> bool:
    return not any(s < ce and cs < e for cs, ce in consumed)


def parse_number(raw: str, dec: str | None) -> Decimal | None:
    digits = re.sub(r"[   ]", "", raw)
    try:
        return Decimal(f"{digits}.{dec}") if dec else Decimal(digits)
    except InvalidOperation:
        return None


# --------------------------------------------------------------------------- analyseur
class Analyzer:
    def analyze(self, question: str, store: Store) -> Analysis:
        a = Analysis(question=question)
        t = time.perf_counter()
        text = preprocess(question)
        a.allcaps = text != re.sub(r"\s+", " ", unicodedata.normalize("NFC", question or "").replace("’", "'").replace("`", "'")).strip()             and any(ch.isalpha() for ch in question)
        a.normalized = text
        plain = strip_accents(text.lower())
        if len(plain) != len(text):  # sécurité : alignement caractères
            plain = text.lower()
        t = _step(a, "Prétraitement", t, "normalisation Unicode, apostrophes, espaces")

        doc = get_nlp()(text)
        for tok in doc:
            a.tokens.append(
                {"i": tok.i, "text": tok.text, "lemma": tok.lemma_, "pos": tok.pos_, "dep": tok.dep_,
                 "stop": tok.is_stop, "used": None}
            )
        a.spacy_entities = [{"text": e.text, "label": e.label_} for e in doc.ents]
        t = _step(a, "spaCy (tokenisation, lemmatisation, POS, dépendances, NER)", t,
                  f"{len(doc)} tokens, modèle {config.SPACY_MODEL}")

        toks: list[tuple[int, str, str]] = []
        texts = [tk.text for tk in doc]
        for tk in doc:
            if tk.is_punct or tk.is_space:
                continue
            n = normalize(tk.text)
            if n:
                toks.append((tk.i, n, normalize(tk.lemma_)))
        consumed_tok: set[int] = set()
        consumed_chars: list[tuple[int, int]] = []

        gaz = get_gazetteer(store)
        entity_mentions = self._extract_references(a, plain, doc, gaz, consumed_tok, consumed_chars)
        entity_mentions += match_gazetteer(toks, gaz, consumed_tok, texts)
        for m in entity_mentions:
            if m.end > m.start:
                _consume_chars(consumed_chars, (doc[m.start].idx, doc[m.end - 1].idx + len(doc[m.end - 1])))
        t = _step(a, "Extraction des entités (gazetteer ontologie + références codées)", t,
                  f"{len(entity_mentions)} mention(s) liée(s) aux individus OWL")

        self._extract_numbers(a, plain, consumed_chars)
        for tk in doc:
            if not _free(consumed_chars, tk.idx, tk.idx + len(tk)):
                consumed_tok.add(tk.i)
        t = _step(a, "Nombres, montants, comparateurs et dates", t,
                  f"{len(a.numbers)} expression(s) numérique(s)")

        self._match_concepts(a, doc, toks, consumed_tok)
        t = _step(a, "Concepts OWL et synonymes (dictionnaire français)", t,
                  f"{len(a.mentions)} concept(s) reconnu(s)")

        self._resolve_entities(a, doc, entity_mentions, gaz)
        self._build_frame(a, doc)
        self._detect_write_request(a, doc)
        self._apply_negation(a, doc)
        self._add_positive_existence(a)
        self._finalize(a, doc, consumed_tok)
        _step(a, "Intention, focus et contraintes", t, f"intention={a.intent or '—'}")
        return a

    # ------------------------------------------------------------------ références codées (sinistre 001, S-001...)
    def _extract_references(self, a, plain, doc, gaz: Gazetteer, consumed_tok, consumed_chars):
        out: list[EntityMention] = []
        seen: set[tuple[int, int]] = set()  # intervalles de caractères déjà reconnus

        def add(s, e, word, number):
            if any(s < pe and ps < e for ps, pe in seen):
                return
            prefix, node = REF_CLASS.get(word, ("Sinistre", "claim"))
            ident = f"{prefix}_{int(number):03d}"
            tok_idx = [t.i for t in doc if t.idx < e and t.idx + len(t) > s]
            span_text = doc.text[s:e]
            if not tok_idx:
                return
            seen.add((s, e))
            cand = gaz.individuals.get(ident)
            owl = REF_OWL[prefix]
            if cand is not None and owl in cand.classes:
                out.append(EntityMention(span_text, tok_idx[0], tok_idx[-1] + 1, node, [cand], source="référence codée"))
            else:
                a.issues.append({"code": "unknown_entity", "ref": True, "message": f"Aucun individu « {span_text} » n'existe dans l'ontologie ({ident}).", "text": span_text})
                out.append(EntityMention(span_text, tok_idx[0], tok_idx[-1] + 1, node, [], source="référence codée"))
            consumed_tok.update(tok_idx)

        for m in REF_RE.finditer(plain):
            add(m.start(), m.end(), m.group(1), m.group(2))
        for m in CODE_RE.finditer(plain):
            word = "sinistre" if m.group(1) == "s" else "contrat"
            add(m.start(), m.end(), word, m.group(2))
        return out

    # ------------------------------------------------------------------ nombres / montants / dates
    def _extract_numbers(self, a: Analysis, plain: str, consumed: list[tuple[int, int]]) -> None:
        months_re = "|".join(MONTHS)
        # date complète
        for m in re.finditer(r"\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})/(\d{1,2})/(\d{4})\b", plain):
            if not _free(consumed, m.start(), m.end()):
                continue
            if m.group(1):
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            else:
                d, mo, y = int(m.group(4)), int(m.group(5)), int(m.group(6))
            if 1 <= mo <= 12 and 1 <= d <= 31:
                a.numbers.append({"type": "date", "op": "=", "year": y, "month": mo, "day": d, "text": m.group(0), "span": (m.start(), m.end())})
                consumed.append((m.start(), m.end()))
        # « entre X et Y »
        for m in re.finditer(rf"entre\s+({NUM_RE.pattern})\s*(?:{CURRENCY})?\s+et\s+({NUM_RE.pattern})(?:\s*{CURRENCY})?", plain):
            nums = NUM_RE.findall(m.group(0))
            if len(nums) >= 2 and _free(consumed, m.start(), m.end()):
                v1, v2 = parse_number(*nums[0]), parse_number(*nums[1])
                if v1 is not None and v2 is not None:
                    lo, hi = sorted((v1, v2))
                    a.numbers.append({"type": "amount", "op": "between", "value": lo, "value2": hi, "text": m.group(0), "pos": m.start(), "span": (m.start(), m.end())})
                    consumed.append((m.start(), m.end()))
        # nombres isolés
        for m in NUM_RE.finditer(plain):
            if not _free(consumed, m.start(), m.end()):
                continue
            raw, dec = m.group(1), m.group(2)
            if dec and len(dec) == 3 and raw.isdigit() and len(raw) <= 3:  # 3.000 -> 3000
                raw, dec = raw + dec, None
            value = parse_number(raw, dec)
            if value is None:
                continue
            prefix = plain[max(0, m.start() - 40): m.start()]
            after = plain[m.end(): m.end() + 12]
            op, comp_start = None, None
            for o, pat in COMPARATORS:
                mc = re.search(pat, prefix)
                if mc:
                    op, comp_start = o, m.start() - len(prefix) + mc.start()
                    break
            has_currency = bool(re.match(rf"\s*{CURRENCY}", after))
            is_year = dec is None and raw.isdigit() and len(raw) == 4 and 1990 <= int(raw) <= 2100
            if op or has_currency:
                end = m.end() + (re.match(rf"\s*{CURRENCY}", after).end() if has_currency else 0)  # type: ignore[union-attr]
                if op is None:  # comparateur postposé : « 3000 euros au plus », « 500 € ou plus »
                    tail = re.match(r"\s*(au\s+plus|maximum|ou\s+moins|et\s+moins|au\s+moins|minimum|ou\s+plus|et\s+plus)\b", plain[end:])
                    if tail:
                        op = "<=" if re.match(r"au\s+plus|maximum|ou\s+moins|et\s+moins", tail.group(1)) else ">="
                        end += tail.end()
                span_start = comp_start if comp_start is not None else m.start()
                a.numbers.append({"type": "amount", "op": op or "=", "value": value, "text": plain[span_start:end], "pos": m.start(), "span": (span_start, end)})
                consumed.append((span_start, end))
            elif is_year:
                before = plain[max(0, m.start() - 30): m.start()]
                month, span_from = None, m.start()
                mm = re.search(rf"({months_re})\s*$", before)
                if mm:
                    month = MONTHS[mm.group(1)]
                    span_from = m.start() - len(before) + mm.start()
                dop = "="
                if re.search(r"\bavant\s+(?:le\s+|l'annee\s+|fin\s+)?(?:\w+\s+)?$", before):
                    dop = "before"
                elif re.search(r"\bapres\s+(?:le\s+|l'annee\s+)?(?:\w+\s+)?$", before):
                    dop = "after"
                elif re.search(r"\b(?:depuis|a\s+partir\s+de|des)\s+(?:le\s+|l'annee\s+)?(?:\w+\s+)?$", before):
                    dop = "since"
                a.numbers.append({"type": "date", "op": dop, "year": int(raw), "month": month, "text": m.group(0), "span": (span_from, m.end())})
                consumed.append((span_from, m.end()))
        # mois sans année (« en octobre »)
        for m in re.finditer(rf"\b(?:en|durant|pendant|au\s+mois\s+de|mois\s+d')\s*({months_re})\b(?!\s+\d{{4}})", plain):
            if _free(consumed, m.start(1), m.end(1)):
                a.numbers.append({"type": "date", "op": "=", "year": None, "month": MONTHS[m.group(1)], "text": m.group(0), "span": (m.start(), m.end())})
                consumed.append((m.start(), m.end()))
        a.numbers.sort(key=lambda n: n["span"][0])

    # ------------------------------------------------------------------ concepts du dictionnaire
    def _match_concepts(self, a: Analysis, doc, toks, consumed_tok: set[int]) -> None:
        pos = {t.i: t.pos_ for t in doc}
        i, n = 0, len(toks)
        while i < n:
            if toks[i][0] in consumed_tok:
                i += 1
                continue
            hit = None
            for size in range(min(MAX_NGRAM, n - i), 0, -1):
                span = toks[i : i + size]
                if any(t[0] in consumed_tok for t in span):
                    continue
                for via, key in (("forme", tuple(t[1] for t in span)), ("lemme", tuple(t[2] for t in span))):
                    concepts = CONCEPT_INDEX.get(key)
                    if not concepts:
                        continue
                    ok = []
                    for c in concepts:
                        p = pos.get(span[0][0])
                        if c.kind == "verb":
                            if via == "lemme" and p == "VERB":
                                ok.append(c)
                        elif c.noun_only and size == 1 and p == "VERB":
                            continue
                        elif c.kind == "class" and size == 1 and p in {"AUX"}:
                            continue
                        else:
                            ok.append(c)
                    if ok:
                        hit = (size, ok[0], via)
                        break
                if hit:
                    break
            if hit:
                size, concept, via = hit
                span = toks[i : i + size]
                a.mentions.append(Mention(concept, span[0][0], span[-1][0] + 1, " ".join(doc[t[0]].text for t in span), via))
                i += size
            else:
                i += 1
        a.mentions.sort(key=lambda m: m.start)


    # ------------------------------------------------------------------ demandes d'écriture
    @staticmethod
    def _detect_write_request(a: Analysis, doc) -> None:
        """Le module NLP est en lecture seule : « Supprime tous les contrats » ne doit pas devenir une liste."""
        for tk in doc:
            n = strip_accents(tk.lower_)
            part = "Part" in tk.morph.get("VerbForm")
            if n in WRITE_KEYWORDS or (n in WRITE_VERBS and not part):
                a.issues.append({
                    "code": "write_request",
                    "message": (f"« {tk.text} » est une demande de modification. La recherche en langage naturel est en lecture seule : "
                                "utilisez les formulaires de gestion ou SPARQL Update pour modifier les données."),
                    "text": tk.text,
                })
                return

    # ------------------------------------------------------------------ négation
    @staticmethod
    def _char_to_tokens(doc, span: tuple[int, int]) -> tuple[int, int]:
        s, e = span
        idx = [t.i for t in doc if t.idx < e and t.idx + len(t) > s]
        return (idx[0], idx[-1] + 1) if idx else (0, 0)

    @staticmethod
    def _find_negations(a: Analysis, doc) -> list[dict[str, Any]]:
        """Repère les marqueurs de négation (ne…pas/jamais/plus/aucun, sans, pas de, aucun, non, sauf, hors) et leur portée.

        Portée = du marqueur jusqu'à la ponctuation ou une conjonction d'opposition (mais, alors…). « et/ou/ni » prolongent la portée
        (« ne couvrent pas le vol ni l'incendie » = ni l'un ni l'autre).
        """
        in_mention = set()
        for m in a.mentions:
            in_mention.update(range(m.start, m.end))
        toks = list(doc)
        n = len(toks)
        events: list[dict[str, Any]] = []
        used: set[int] = set()
        for i, tk in enumerate(toks):
            low = strip_accents(tk.lower_)
            if i in used or i in in_mention:
                continue
            if tk.lower_ in NEG_FIRST or low in NEG_FIRST:
                second = None
                for j in range(i + 1, min(n, i + 7)):
                    lj = strip_accents(toks[j].lower_)
                    if lj in NEG_RESTRICTIVE:
                        second = ("restrictive", j)
                        break
                    if lj in NEG_SECOND:
                        second = ("ne_" + lj, j)
                        break
                if second:
                    events.append({"kind": second[0], "cues": [i, second[1]], "start": i})
                    used.update({i, second[1]})
                else:
                    events.append({"kind": "ne_alone", "cues": [i], "start": i})
                    used.add(i)
            elif low in NEG_STANDALONE and not (low == "non" and i + 1 < n and toks[i + 1].pos_ == "PUNCT"):
                events.append({"kind": low, "cues": [i], "start": i})
                used.add(i)
        events.sort(key=lambda e: e["start"])
        for k, ev in enumerate(events):
            end = max(ev["cues"]) + 1
            limit = events[k + 1]["start"] if k + 1 < len(events) else n
            scope_end = limit
            for j in range(end, limit):
                low = strip_accents(toks[j].lower_)
                if toks[j].is_punct and toks[j].text in {",", ";", ".", "?", "!", ":"}:
                    scope_end = j
                    break
                if low in NEG_SCOPE_STOP:
                    scope_end = j
                    break
            ev["scope"] = (ev["start"], scope_end)
        return events

    def _apply_negation(self, a: Analysis, doc) -> None:
        events = self._find_negations(a, doc)
        if not events:
            return
        f = a.frame
        toks = list(doc)
        for ev in events:
            s0, s1 = ev["scope"]
            cue_text = " … ".join(toks[c].text for c in ev["cues"])
            info: dict[str, Any] = {
                "cue": cue_text, "kind": ev["kind"], "scope": " ".join(t.text for t in toks[s0:s1]),
                "scopeTokens": [s0, s1], "head": toks[ev["cues"][-1]].head.text,
                "dep": [toks[c].dep_ for c in ev["cues"]], "negated": [], "status": "ok",
            }
            a.negations.append(info)
            if ev["kind"] == "restrictive":
                a.issues.append({"code": "unsupported_negation", "message": (
                    f"La structure restrictive « {cue_text} » n'est pas une négation et n'est pas prise en charge (reformulez sans « ne … que »)."), "text": cue_text})
                info["status"] = "unsupported"
                continue
            negated: list[Constraint] = []
            blocked = None
            for c in f.constraints:
                if c.span is None or not (s0 <= c.span[0] < s1):
                    continue
                if c.kind in {"entity", "type", "status"}:
                    c.negated = True
                    c.description = ("pas " if c.kind == "status" else "pas de ") + c.description
                    negated.append(c)
                    info["negated"].append({"kind": c.kind, "text": c.source})
                else:
                    blocked = c
            if blocked is not None:
                a.issues.append({"code": "unsupported_negation", "message": (
                    f"La négation de « {blocked.description} » n'est pas prise en charge : "
                    "reformulez avec le comparateur contraire (ex. « inférieur à » au lieu de « pas supérieur à »)."), "text": blocked.source})
                info["status"] = "unsupported"
                continue
            nodes_done = {c.node for c in negated}
            for m in a.mentions:
                if not (s0 <= m.start < s1) or m.concept.kind != "class":
                    continue
                node = FOCUS_NODE.get(m.concept.id)
                if node is None or node == f.focus or node in nodes_done:
                    continue
                ex = Constraint("exists", node, {"label": m.concept.label}, m.text, f"sans {m.concept.label}",
                                negated=True, span=(m.start, m.end))
                f.constraints.append(ex)
                nodes_done.add(node)
                negated.append(ex)
                info["negated"].append({"kind": "exists", "text": m.text})
            if not negated:
                for m in a.mentions:
                    if m.concept.kind != "verb" or not (s0 <= m.start < s1):
                        continue
                    node = VERB_NEGATED_EXISTENCE.get((m.concept.id, f.focus or ""))
                    if node and node not in nodes_done:
                        ex = Constraint("exists", node, {"label": NODE_LABELS[node]}, m.text,
                                        f"sans {NODE_LABELS[node]} (« {m.text} » nié)", negated=True, span=(m.start, m.end))
                        f.constraints.append(ex)
                        nodes_done.add(node)
                        negated.append(ex)
                        info["negated"].append({"kind": "exists", "text": m.text})
            if not negated:
                a.issues.append({"code": "unsupported_negation", "message": (
                    f"Une négation (« {cue_text} ») est détectée mais je ne sais pas à quel critère l'appliquer de façon sûre "
                    "(types, statuts, entités et existence de relations sont pris en charge). Je n'exécute pas de requête qui ignorerait la négation."),
                    "text": cue_text})
                info["status"] = "unsupported"


    @staticmethod
    def _add_positive_existence(a: Analysis) -> None:
        """« Quels assurés ont un sinistre ? » : un concept de classe non-focus, sans autre contrainte sur son noeud
        et hors de toute portée de négation, devient une contrainte d'existence (EXISTS via le chemin de relations)."""
        f = a.frame
        if not f.focus:
            return
        scopes = [tuple(n["scopeTokens"]) for n in a.negations]
        constrained = {c.node for c in f.constraints}
        for m in a.mentions:
            if m.concept.kind != "class" or any(s0 <= m.start < s1 for s0, s1 in scopes):
                continue
            node = FOCUS_NODE.get(m.concept.id)
            if node is None or node == f.focus or node in constrained:
                continue
            f.constraints.append(Constraint("exists", node, {"label": m.concept.label}, m.text,
                                            f"avec {m.concept.label}", negated=False, span=(m.start, m.end)))
            constrained.add(node)

    # ------------------------------------------------------------------ entités : rôle, ambiguïté
    def _resolve_entities(self, a: Analysis, doc, mentions: list[EntityMention], gaz: Gazetteer) -> None:
        lemma_norm = {t.i: normalize(t.lemma_) for t in doc}
        # entités floues (fautes de frappe) et inconnues
        known = set()
        for m in a.mentions:
            known.update(range(m.start, m.end))
        covered = set()
        for m in mentions:
            covered.update(range(m.start, m.end))
        pos = {t.i: t.pos_ for t in doc}
        ents_spacy = {tok.i for e in doc.ents for tok in e}
        for tk in doc:
            if tk.i in covered or tk.i in known or tk.i == 0 or tk.is_punct:
                continue
            capitalized = tk.text[:1].isupper()
            norm = normalize(tk.text)
            # en MAJUSCULES la casse n'est plus un indice : on se fie uniquement à l'étiquette spaCy / aux entités nommées
            named = (capitalized or a.allcaps) and (pos[tk.i] in {"PROPN", "X"} or tk.i in ents_spacy)
            typo_candidate = pos[tk.i] in {"PROPN", "X", "NOUN", "ADJ"} and not tk.is_stop and len(norm) >= 5
            if not named and not typo_candidate:
                continue
            if any(not _free([(m.start, m.end)], tk.i, tk.i + 1) for m in a.mentions):
                continue
            fz = fuzzy_match(norm, gaz)
            if fz:
                mentions.append(EntityMention(tk.text, tk.i, tk.i + 1, fz[0].kind, fz, fuzzy=True, source="correspondance approchée (NLTK edit_distance)"))
                covered.add(tk.i)
            elif named:
                a.issues.append({"code": "unknown_entity", "message": f"« {tk.text} » ne correspond à aucun individu de l'ontologie.", "text": tk.text})
                a.unrecognized.append(tk.text)

        verb_mentions = [m for m in a.mentions if m.concept.kind == "verb"]
        for em in sorted(mentions, key=lambda m: m.start):
            info: dict[str, Any] = {
                "text": em.text, "kind": em.kind, "source": em.source, "fuzzy": em.fuzzy, "resolved": [], "start": em.start, "end": em.end,
            }
            if em.kind == "place":
                info.update(resolved=[{"id": None, "label": em.place, "classes": ["Lieu"]}])
                a.entities.append(info)
                a.frame.constraints.append(Constraint("place", "claim", {"value": em.place}, em.text, f"lieu « {em.place} »", span=(em.start, em.end)))
                continue
            if not em.candidates:
                a.entities.append(info)
                continue
            # indices de rôle : concept classe juste avant (« l'expert Ahmed »), puis verbe gouverneur
            cue: set[str] = set()
            cue_label = None
            for m in a.mentions:
                if m.concept.id in CUE_ROLES and em.start - 3 <= m.end <= em.start:
                    cue = set(CUE_ROLES[m.concept.id])
                    cue_label = m.concept.label
            verb = None
            for m in verb_mentions:
                if m.end <= em.start and em.start - m.end <= 7:
                    verb = m
            expected = set(VERB_EXPECTED_ROLES.get(verb.concept.id, set())) if verb else set()
            cands = list(em.candidates)
            strict = STRICT_VERB_ROLES.get(verb.concept.id) if verb else None
            if em.kind == "person" and strict:
                compatible = bool(cue & strict) if cue else any(c.classes & strict for c in cands)
                if not compatible:
                    wanted = " ou ".join(sorted(VERB_ROLE_LABEL[r] for r in strict))
                    a.issues.append({
                        "code": "role_mismatch",
                        "message": (f"Le verbe « {verb.concept.label} » attend un {wanted}, mais « {em.text} » désigne : "
                                    + ", ".join(f"{c.label} ({'/'.join(sorted(k for k in c.classes if k in {'Assure','Conducteur','Victime','Expert'}))})" for c in cands)
                                    + "."),
                        "text": em.text,
                        "candidates": [{"id": c.id, "label": c.label} for c in cands],
                    })
                    info["resolved"] = []
                    a.entities.append(info)
                    continue
            chosen = cands
            if em.kind == "person" or em.kind == "org":
                if cue:
                    chosen = [c for c in cands if c.classes & cue]
                    if not chosen:
                        a.issues.append({
                            "code": "role_mismatch",
                            "message": (f"Aucun {cue_label} nommé « {em.text} » dans l'ontologie. "
                                        + "Individus portant ce nom : "
                                        + ", ".join(f"{c.label} ({'/'.join(sorted(k for k in c.classes if k in {'Assure','Conducteur','Victime','Expert','CompagnieAssurance','Garage'}))})" for c in cands)
                                        + "."),
                            "text": em.text,
                            "candidates": [{"id": c.id, "label": c.label} for c in cands],
                        })
                        info["resolved"] = []
                        a.entities.append(info)
                        continue
                elif expected:
                    narrowed = [c for c in cands if c.classes & expected]
                    if narrowed:
                        chosen = narrowed
                ids = {c.id for c in chosen}
                if len(ids) > 1 and em.kind == "person":
                    a.issues.append({
                        "code": "ambiguous_entity",
                        "message": f"« {em.text} » est ambigu : " + " ; ".join(f"{c.label} ({c.id})" for c in chosen) + ". Précisez le prénom ou le rôle (assuré, expert...).",
                        "text": em.text,
                        "candidates": [{"id": c.id, "label": c.label} for c in chosen],
                    })
                    info["resolved"] = [{"id": c.id, "label": c.label, "classes": sorted(c.classes)} for c in chosen]
                    a.entities.append(info)
                    continue
            info["resolved"] = [{"id": c.id, "label": c.label, "classes": sorted(c.classes)} for c in chosen]
            info["cue"] = cue_label
            info["expectedByVerb"] = verb.concept.label if verb and expected else None
            a.entities.append(info)

            node = self._node_for(chosen, cue or expected, verb)
            if node is None:
                continue
            a.frame.constraints.append(Constraint(
                "entity", node, {"ids": [c.id for c in chosen], "labels": [c.label for c in chosen], "via": verb.concept.id if verb else None},
                em.text, f"{self._node_label(node)} {', '.join(c.label for c in chosen)}", span=(em.start, em.end)))

    @staticmethod
    def _node_label(node: str) -> str:
        return {"insured": "assuré", "driver": "conducteur", "victim": "victime", "expert": "expert", "company": "compagnie",
                "garage": "garage", "vehicle": "véhicule", "contract": "contrat", "claim": "sinistre", "damage": "dommage",
                "expertise": "expertise", "indemnification": "indemnisation", "guarantee": "garantie"}[node]

    @staticmethod
    def _node_for(cands: list[Candidate], roles: set[str], verb) -> str | None:
        classes = set().union(*(c.classes for c in cands))
        if verb is not None and verb.concept.id == "V_DRIVE" and "Conducteur" in classes:
            return "driver"
        for cls, node in CLASS_TO_NODE:
            if roles and cls in roles and cls in classes:
                return node
        for cls, node in CLASS_TO_NODE:
            if cls in classes:
                return node
        return None

    # ------------------------------------------------------------------ frame : focus + contraintes
    def _build_frame(self, a: Analysis, doc) -> None:
        f = a.frame
        words = {normalize(t.text) for t in doc}
        f.qtype = "COUNT" if words & COUNT_WORDS else "LIST"
        mentions = a.mentions
        class_mentions = [m for m in mentions if m.concept.kind == "class"]
        type_mentions = [m for m in mentions if m.concept.kind == "type"]
        first_class = class_mentions[0] if class_mentions else None
        first_type = type_mentions[0] if type_mentions else None

        focus_concept: str | None = None
        type_is_focus: Mention | None = None
        who = bool(words & WHO_WORDS)
        if first_type and not who and (first_class is None or first_type.start < first_class.start) and first_type.concept.focus:
            focus_concept = first_type.concept.focus
            type_is_focus = first_type
            if focus_concept == "GUARANTEE" and first_class is not None:  # « tous risques ... contrat »
                focus_concept, type_is_focus = first_class.concept.id, None
        elif first_class:
            focus_concept = first_class.concept.id
            if who:  # « Qui a déclaré un sinistre ? » : « qui » désigne une personne, pas la classe nommée
                verb = next((m for m in mentions if m.concept.kind == "verb"), None)
                whom = {"V_DECLARE": "INSURED", "V_EVALUATE": "EXPERT", "V_REPAIR": "GARAGE", "V_DRIVE": "DRIVER",
                        "V_OWN": "INSURED", "V_INSURE": "INSURED"}.get(verb.concept.id if verb else "")
                if whom:
                    focus_concept = whom
        elif who:
            verb = next((m for m in mentions if m.concept.kind == "verb"), None)
            focus_concept = {"V_EVALUATE": "EXPERT", "V_REPAIR": "GARAGE"}.get(verb.concept.id if verb else "", "INSURED")
        if focus_concept is None:
            # « Montre le contrat C-001 » : sans mot interrogatif, on retourne l'entité désignée elle-même
            ent = next((c for c in f.constraints if c.kind == "entity"), None)
            if ent is not None:
                node_to_concept = {v: k for k, v in FOCUS_NODE.items()}
                focus_concept = node_to_concept.get(ent.node)
        f.focus_concept = focus_concept
        f.focus = FOCUS_NODE.get(focus_concept) if focus_concept else None
        focus_mention = first_class if (first_class and focus_concept == first_class.concept.id and type_is_focus is None) else None

        # attribut demandé (« le montant de l'indemnisation »)
        for m in mentions:
            if m.concept.kind == "attribute" and (focus_mention is None or m.start < focus_mention.start):
                f.answer_attr = m.concept.label
                break

        # contraintes de type
        for m in type_mentions:
            if not f.focus:
                break
            roles = self._type_roles(m, mentions, f.focus, type_is_focus is m)
            variants = [(r, m.concept.variants[r]) for r in roles if r in m.concept.variants]
            if not variants:
                continue
            nodes = [(ROLE_NODE[r], cls) for r, cls in variants]
            a.frame.constraints.append(Constraint(
                "type", nodes[0][0], {"alternatives": [{"node": n, "class": c} for n, c in nodes], "label": m.concept.label},
                m.text, f"type « {m.concept.label} » ({' ou '.join(c for _, c in nodes)})", span=(m.start, m.end)))

        # statuts
        for m in mentions:
            if m.concept.kind == "status":
                val = m.concept.value or ""
                node = STATUS_NODE[val]
                if f.focus == "claim" and val in {"Acceptee", "Refusee", "EnCours"}:
                    node = "indemnification"  # statut de l'indemnisation du sinistre
                if f.focus == "contract" and val == "Clos":
                    continue
                a.frame.constraints.append(Constraint("status", node, {"value": val}, m.text, f"statut « {m.concept.label} »", span=(m.start, m.end)))

        # montants et dates
        attr_mentions = [m for m in mentions if m.concept.kind in {"attribute", "class"}]
        for num in a.numbers:
            if num["type"] == "amount":
                target = self._amount_target(num, attr_mentions, a, doc, f)
                a.frame.constraints.append(Constraint("amount", target["node"], {**{k: num[k] for k in ("op", "value") if k in num}, **({"value2": num["value2"]} if "value2" in num else {}), "attr": target["attr"], "label": target["label"]},
                                                      num["text"], self._amount_text(target["label"], num), span=self._char_to_tokens(doc, num["span"])))
            elif num["type"] == "date":
                node = {"vehicle": "claim", "insured": "claim", "driver": "claim", "victim": "claim", "company": "claim", "garage": "claim",
                        "contract": "contract", "guarantee": "contract", "claim": "claim", "damage": "claim", "expertise": "expertise",
                        "expert": "expertise", "indemnification": "indemnification"}.get(f.focus or "claim", "claim")
                a.frame.constraints.append(Constraint("date", node, {k: num.get(k) for k in ("op", "year", "month", "day")}, num["text"],
                                                      self._date_text(num), span=self._char_to_tokens(doc, num["span"])))

    @staticmethod
    def _fmt(d: Decimal) -> str:
        t = format(d, "f")
        return t[:-2] if t.endswith(".0") else t

    def _amount_text(self, label: str, num: dict) -> str:
        words = {">": "supérieur à", ">=": "au moins", "<": "inférieur à", "<=": "au plus", "=": "égal à"}
        if num["op"] == "between":
            return f"{label} entre {self._fmt(num['value'])} et {self._fmt(num['value2'])}"
        return f"{label} {words[num['op']]} {self._fmt(num['value'])}"

    @staticmethod
    def _date_text(num: dict) -> str:
        months = {v: k for k, v in MONTHS.items()}
        when = (months[num["month"]] + " " if num.get("month") else "") + (str(num["year"]) if num.get("year") else "")
        if num.get("day"):
            when = f"{num['day']:02d} {when}"
        prefix = {"=": "en", "before": "avant", "after": "après", "since": "depuis"}.get(num.get("op", "="), "en")
        return f"{prefix} {when.strip()}"

    def _type_roles(self, m: Mention, mentions: list[Mention], focus: str, is_focus: bool) -> list[str]:
        avail = list(m.concept.variants)
        if len(avail) == 1:
            return avail
        if is_focus:
            return [r for r in avail if ROLE_NODE[r] == focus] or avail[:1]
        # 1) classe explicite juste avant : « garantie vol », « sinistre vol »
        prev = [x for x in mentions if x.concept.kind == "class" and 0 <= m.start - x.end <= 2]
        if prev:
            role = CLASS_CONCEPT_ROLE.get(prev[-1].concept.id)
            if role in avail:
                return [role]
        # 2) tous risques : le contrat de type ou la garantie
        if m.concept.id == "T_ALLRISKS" and focus == "contract":
            return [r for r in ("contract", "guarantee") if r in avail]
        # 3) verbe gouverneur
        verbs = [x for x in mentions if x.concept.kind == "verb" and x.end <= m.start and m.start - x.end <= 5]
        if verbs:
            vid = verbs[-1].concept.id
            if vid in {"V_COVER"} and "guarantee" in avail:
                return ["guarantee"]
            if vid in {"V_SUFFER", "V_DECLARE", "V_CONCERN", "V_CAUSE"} and "claim" in avail:
                return ["claim"]
        # 4) défaut selon le focus
        if focus in {"contract", "guarantee", "insured"} and "guarantee" in avail and focus != "insured":
            return ["guarantee"]
        if "claim" in avail:
            return ["claim"]
        return avail[:1]

    def _amount_target(self, num, attr_mentions, a: Analysis, doc, f: Frame) -> dict[str, Any]:
        # concept (attribut ou classe) le plus proche à gauche du comparateur
        char_pos = num.get("pos", num["span"][0])
        tok_before = [t for t in doc if t.idx < char_pos]
        last_tok = tok_before[-1].i if tok_before else 0
        left = [m for m in attr_mentions if m.end <= last_tok + 1 and last_tok - m.end <= 5]
        cid = left[-1].concept.id if left else None
        table = {
            "INDEMNIFICATION": ("indemnification", "montantIndemnisation", "montant d'indemnisation"),
            "A_AMOUNT": None, "A_COST": ("damage", "coutEstime", "coût estimé du dommage"),
            "DAMAGE": ("damage", "coutEstime", "coût estimé du dommage"),
            "A_VALUE": ("vehicle", "valeurVehicule", "valeur du véhicule"),
            "A_PREMIUM": ("contract", "prime", "prime du contrat"),
            "A_CEILING": ("guarantee", "plafondGarantie", "plafond de garantie"),
            "A_DEDUCTIBLE": ("indemnification", "franchise", "franchise"),
            "VEHICLE": ("vehicle", "valeurVehicule", "valeur du véhicule"),
            "CONTRACT": ("contract", "prime", "prime du contrat"),
            "GUARANTEE": ("guarantee", "plafondGarantie", "plafond de garantie"),
        }
        hit = table.get(cid) if cid else None
        if hit is None:
            default = {
                "indemnification": table["INDEMNIFICATION"], "damage": table["DAMAGE"], "vehicle": table["A_VALUE"],
                "contract": table["A_PREMIUM"], "guarantee": table["A_CEILING"], "claim": table["INDEMNIFICATION"],
                "insured": table["INDEMNIFICATION"], "expertise": table["DAMAGE"],
            }
            hit = default.get(f.focus or "", table["INDEMNIFICATION"])
        return {"node": hit[0], "attr": hit[1], "label": hit[2]}

    # ------------------------------------------------------------------ intention, modificateurs, confiance
    def _finalize(self, a: Analysis, doc, consumed_tok: set[int]) -> None:
        f = a.frame
        if f.focus_concept:
            concept = CONCEPTS_BY_ID[f.focus_concept]
            a.intent = concept.intent
        types = [c for c in f.constraints if c.kind == "type"]
        if types:
            a.modifiers.append("FILTER_BY_TYPE")
        if any(c.kind == "amount" for c in f.constraints):
            a.modifiers.append("FILTER_BY_AMOUNT")
        if any(c.kind == "date" for c in f.constraints):
            a.modifiers.append("FILTER_BY_DATE")

        used = set(consumed_tok)
        for m in a.mentions:
            used.update(range(m.start, m.end))
        for e in a.entities:
            used.update(range(e.get("start", 0), e.get("end", 0)))
        ignorable = {"avoir", "etre", "faire", "aller", "pouvoir", "lieu", "y", "il", "quel", "tout", "tous", "meme", "donner",
                     "afficher", "montrer", "lister", "trouver", "chercher", "voir", "existe", "exister", "cas", "concernant",
                     "donne", "valoir", "couter", "euro", "dinar", "mois", "annee", "moi", "liste"}
        for t in doc:
            if t.i in used or t.is_stop or t.is_punct or t.pos_ not in {"NOUN", "VERB", "ADJ", "PROPN"}:
                continue
            n = normalize(t.lemma_)
            if n in ignorable or normalize(t.text) in ignorable:
                continue
            if t.text not in a.unrecognized:
                a.unrecognized.append(t.text)
        content = [t for t in doc if not t.is_stop and not t.is_punct and t.pos_ in {"NOUN", "VERB", "ADJ", "PROPN", "NUM"}]
        covered = [t for t in content if t.i in used or normalize(t.lemma_) in ignorable or normalize(t.text) in ignorable]
        ratio = len(covered) / len(content) if content else 0.0
        score = 0.0
        if f.focus:
            score += 0.45
        score += 0.4 * ratio
        if f.constraints or f.qtype == "COUNT":
            score += 0.15
        if any(i["code"] in {"unknown_entity", "role_mismatch", "ambiguous_entity"} for i in a.issues):
            score *= 0.5
        a.confidence = round(min(score, 1.0), 2)
