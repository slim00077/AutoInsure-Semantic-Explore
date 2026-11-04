"""Génère docs/NLP_VALIDATION_REPORT.md en EXÉCUTANT réellement le module NLP sur un graphe temporaire (ontologie d'origine).

Pour chaque question : intention détectée, entités extraites, contraintes (mapping ontologie), SPARQL généré, exécution,
résultats, comparaison avec une VÉRITÉ TERRAIN calculée par une requête SPARQL écrite à la main (indépendante du module NLP).
Usage : semantic-service/.venv/Scripts/python tools/nlp_validation_report.py
"""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "semantic-service"))

from app import config  # noqa: E402

_tmp = Path(tempfile.mkdtemp())
config.DATA_DIR, config.LIVE_PATH, config.BACKUP_DIR = _tmp, _tmp / "live.ttl", _tmp / "backups"

from app.nlp.service import get_nlp_service  # noqa: E402
from app.store import Store  # noqa: E402

store = Store()
nlp = get_nlp_service()

P = "PREFIX actors: <http://www.semanticweb.org/assurance/actors#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> "
ALL_CONTRACTS = "?x a/rdfs:subClassOf* actors:ContratAssurance"


def truth(q: str) -> list[str]:
    return sorted({r["x"]["local"] for r in store.query(P + q)["rows"]})


# (catégorie, question, statut attendu, intention attendue ou None, vérité terrain : liste | requête SPARQL ?x | None)
OK = "ok"
CASES: list[tuple[str, str, str, str | None, object]] = [
    # ---------------------------------------------------------------- 1. les 10 questions de l'énoncé
    ("Questions de l'énoncé", "Quels véhicules sont assurés par Ahmed ?", OK, "SEARCH_VEHICLE", "SELECT ?x WHERE { actors:AhmedBenAli actors:possede ?c . ?c actors:couvre ?x }"),
    ("Questions de l'énoncé", "Quels contrats couvrent le vol ?", OK, "SEARCH_CONTRACT", f"SELECT ?x WHERE {{ {ALL_CONTRACTS} ; actors:contient ?g . ?g a/rdfs:subClassOf* actors:GarantieVol }}"),
    ("Questions de l'énoncé", "Quels sinistres concernent une Peugeot 208 ?", OK, "SEARCH_CLAIM", "SELECT ?x WHERE { ?x actors:concerne ?v . ?v actors:marque 'Peugeot' ; actors:modele '208' }"),
    ("Questions de l'énoncé", "Quel est le montant de l'indemnisation du sinistre 001 ?", OK, "SEARCH_INDEMNIFICATION", "SELECT ?x WHERE { actors:Sinistre_001 actors:provoque ?d . ?d actors:donneLieuA ?x }"),
    ("Questions de l'énoncé", "Quels assurés ont déclaré un accident en 2026 ?", OK, "SEARCH_INSURED", "SELECT ?x WHERE { ?x actors:declare ?s . ?s a/rdfs:subClassOf* actors:AccidentCirculation ; actors:dateSinistre ?d FILTER(YEAR(?d)=2026) }"),
    ("Questions de l'énoncé", "Quels contrats couvrent les dommages matériels ?", OK, "SEARCH_CONTRACT", f"SELECT DISTINCT ?x WHERE {{ {ALL_CONTRACTS} . ?s actors:rattacheAContrat ?x ; actors:provoque ?d . ?d a/rdfs:subClassOf* actors:DommageMateriel }}"),
    ("Questions de l'énoncé", "Quels véhicules ont subi un accident ?", OK, "SEARCH_VEHICLE", "SELECT ?x WHERE { ?s a/rdfs:subClassOf* actors:AccidentCirculation ; actors:concerne ?x }"),
    ("Questions de l'énoncé", "Quels sinistres ont été évalués par l'expert Karim ?", OK, "SEARCH_CLAIM", "SELECT ?x WHERE { ?x actors:faitObjetDe ?e . ?e actors:realisePar ?ex . ?ex actors:prenom 'Karim' }"),
    ("Questions de l'énoncé", "Quels contrats possèdent une garantie tous risques ?", OK, "SEARCH_CONTRACT", f"SELECT ?x WHERE {{ {ALL_CONTRACTS} ; actors:contient ?g . ?g a/rdfs:subClassOf* actors:GarantieDommagesTousAccidents }}"),
    ("Questions de l'énoncé", "Quels sinistres ont une indemnisation supérieure à 3000 euros ?", OK, "SEARCH_CLAIM", "SELECT DISTINCT ?x WHERE { ?x actors:provoque ?d . ?d actors:donneLieuA ?i . ?i actors:montantIndemnisation ?m FILTER(?m > 3000) }"),
    # ---------------------------------------------------------------- 2. synonymes
    ("Synonymes", "Quelles voitures sont assurées par Fatma ?", OK, "SEARCH_VEHICLE", ["Voiture_002"]),
    ("Synonymes", "Quelles automobiles ont subi un accident ?", OK, "SEARCH_VEHICLE", ["Voiture_001"]),
    ("Synonymes", "Quels clients ont déclaré un sinistre ?", OK, "SEARCH_INSURED", ["AhmedBenAli", "FatmaTrabelsi", "YoussefHamdi"]),
    ("Synonymes", "Quels souscripteurs ont un contrat actif ?", OK, "SEARCH_INSURED", ["AhmedBenAli", "FatmaTrabelsi", "YoussefHamdi"]),
    ("Synonymes", "Montre les remboursements refusés", OK, "SEARCH_INDEMNIFICATION", ["Indemnisation_002"]),
    ("Synonymes", "Quelles couvertures incendie existent ?", OK, "SEARCH_GUARANTEE", "SELECT ?x WHERE { ?x a/rdfs:subClassOf* actors:GarantieIncendie }"),
    ("Synonymes", "Quelles polices sont actives ?", OK, "SEARCH_CONTRACT", ["Contrat_001", "Contrat_002", "Contrat_003"]),
    ("Synonymes", "Quels dégâts matériels ?", OK, "SEARCH_DAMAGE", "SELECT ?x WHERE { ?x a/rdfs:subClassOf* actors:DommageMateriel }"),
    # ---------------------------------------------------------------- 3. accents / casse / fautes
    ("Accents, casse, fautes", "Quels vehicules sont assures par Ahmed", OK, "SEARCH_VEHICLE", ["Voiture_001"]),
    ("Accents, casse, fautes", "QUELS CONTRATS COUVRENT LE VOL", OK, "SEARCH_CONTRACT", ["Contrat_001"]),
    ("Accents, casse, fautes", "quelles voitures sont couvertes par un contrat tous risque", OK, "SEARCH_VEHICLE", ["Voiture_001"]),
    ("Accents, casse, fautes", "Quelles voitures peugot ont subi un accident ?", OK, "SEARCH_VEHICLE", ["Voiture_001"]),
    ("Accents, casse, fautes", "Quels sinistres ont été expertisés par l'expert Karim", OK, "SEARCH_CLAIM", ["Sinistre_001"]),
    # ---------------------------------------------------------------- 4. structures de phrase
    ("Structures de phrase", "Donne-moi la liste des contrats qui incluent la garantie vol", OK, "SEARCH_CONTRACT", ["Contrat_001"]),
    ("Structures de phrase", "Je voudrais savoir quelles voitures sont protégées contre le vol", OK, "SEARCH_VEHICLE", ["Voiture_001"]),
    ("Structures de phrase", "Liste des véhicules", OK, "SEARCH_VEHICLE", ["Moto_001", "Voiture_001", "Voiture_002"]),
    ("Structures de phrase", "Montant indemnisation sinistre 001", OK, "SEARCH_INDEMNIFICATION", ["Indemnisation_001", "Indemnisation_004"]),
    ("Structures de phrase", "Qui a déclaré un sinistre ?", OK, "SEARCH_INSURED", ["AhmedBenAli", "FatmaTrabelsi", "YoussefHamdi"]),
    ("Structures de phrase", "Y a-t-il des sinistres liés à un incendie ?", OK, "SEARCH_CLAIM", ["Sinistre_003"]),
    ("Structures de phrase", "Quelles sont les garanties du contrat C-001 ?", OK, "SEARCH_GUARANTEE", "SELECT ?x WHERE { actors:Contrat_001 actors:contient ?x }"),
    ("Structures de phrase", "Quelles garanties couvre le contrat C-003 ?", OK, "SEARCH_GUARANTEE", "SELECT ?x WHERE { actors:Contrat_003 actors:contient ?x }"),
    ("Structures de phrase", "Quels véhicules sont réparés par un garage ?", OK, "SEARCH_VEHICLE", "SELECT ?x WHERE { ?g actors:repare ?x }"),
    ("Structures de phrase", "Quels assurés ont une moto ?", OK, "SEARCH_INSURED", ["YoussefHamdi"]),
    ("Structures de phrase", "Quels experts ont évalué un dommage corporel ?", OK, "SEARCH_EXPERTISE", ["Expert_001"]),
    # ---------------------------------------------------------------- 5. comptage, montants, dates
    ("Comptage, montants, dates", "Combien de contrats couvrent le vol ?", OK, "SEARCH_CONTRACT", None),
    ("Comptage, montants, dates", "Combien de sinistres a déclaré Fatma Trabelsi ?", OK, "SEARCH_CLAIM", None),
    ("Comptage, montants, dates", "Quelles indemnisations dépassent 4000 euros ?", OK, "SEARCH_INDEMNIFICATION", "SELECT ?x WHERE { ?x actors:montantIndemnisation ?m FILTER(?m > 4000) }"),
    ("Comptage, montants, dates", "Quelles indemnisations sont comprises entre 2000 et 5000 euros ?", OK, "SEARCH_INDEMNIFICATION", "SELECT ?x WHERE { ?x actors:montantIndemnisation ?m FILTER(?m >= 2000 && ?m <= 5000) }"),
    ("Comptage, montants, dates", "Quels sinistres en octobre 2026 ?", OK, "SEARCH_CLAIM", ["Sinistre_001"]),
    ("Comptage, montants, dates", "Quels sinistres avant 2026 ?", OK, "SEARCH_CLAIM", []),
    ("Comptage, montants, dates", "Quels sinistres ont eu lieu à Sfax ?", OK, "SEARCH_CLAIM", ["Sinistre_003"]),
    ("Comptage, montants, dates", "Quels contrats ont une prime supérieure à 500 ?", OK, "SEARCH_CONTRACT", "SELECT ?x WHERE { ?x actors:aPourPrime ?p . ?p actors:montantPrime ?m FILTER(?m > 500) }"),
    # ---------------------------------------------------------------- 6. négation
    ("Négation", "Quels contrats ne couvrent pas le vol ?", OK, "SEARCH_CONTRACT", f"SELECT ?x WHERE {{ {ALL_CONTRACTS} FILTER NOT EXISTS {{ ?x actors:contient ?g . ?g a/rdfs:subClassOf* actors:GarantieVol }} }}"),
    ("Négation", "Quels contrats ne possèdent pas de garantie incendie ?", OK, "SEARCH_CONTRACT", f"SELECT ?x WHERE {{ {ALL_CONTRACTS} FILTER NOT EXISTS {{ ?x actors:contient ?g . ?g a/rdfs:subClassOf* actors:GarantieIncendie }} }}"),
    ("Négation", "Quels contrats sont sans garantie vol ?", OK, "SEARCH_CONTRACT", f"SELECT ?x WHERE {{ {ALL_CONTRACTS} FILTER NOT EXISTS {{ ?x actors:contient ?g . ?g a/rdfs:subClassOf* actors:GarantieVol }} }}"),
    ("Négation", "Quels contrats n'ont jamais couvert le vol ?", OK, "SEARCH_CONTRACT", f"SELECT ?x WHERE {{ {ALL_CONTRACTS} FILTER NOT EXISTS {{ ?x actors:contient ?g . ?g a/rdfs:subClassOf* actors:GarantieVol }} }}"),
    ("Négation", "Quels contrats ne couvrent pas le vol et l'incendie ?", OK, "SEARCH_CONTRACT", ["Contrat_002", "Contrat_004"]),
    ("Négation", "Quels contrats couvrent le vol mais pas l'incendie ?", OK, "SEARCH_CONTRACT", ["Contrat_001"]),
    ("Négation", "Quels contrats ne sont pas actifs ?", OK, "SEARCH_CONTRACT", ["Contrat_004"]),
    ("Négation", "Combien de contrats ne couvrent pas le vol ?", OK, "SEARCH_CONTRACT", None),
    ("Négation", "Quels véhicules ne sont pas assurés par Ahmed ?", OK, "SEARCH_VEHICLE", ["Moto_001", "Voiture_002"]),
    ("Négation", "Quels assurés n'ont pas déclaré d'accident ?", OK, "SEARCH_INSURED", ["FatmaTrabelsi", "YoussefHamdi"]),
    ("Négation", "Quels sinistres ne sont pas des accidents ?", OK, "SEARCH_CLAIM", ["Sinistre_002", "Sinistre_003"]),
    ("Négation", "Quelles indemnisations ne sont pas refusées ?", OK, "SEARCH_INDEMNIFICATION", ["Indemnisation_001", "Indemnisation_003", "Indemnisation_004"]),
    ("Négation", "Quels sinistres ne concernent pas une Peugeot 208 ?", OK, "SEARCH_CLAIM", ["Sinistre_002", "Sinistre_003"]),
    ("Négation", "Quels assurés n'ont pas de sinistre ?", OK, "SEARCH_INSURED", []),
    ("Négation", "Quels sinistres n'ont pas d'indemnisation ?", OK, "SEARCH_CLAIM", []),
    ("Négation (refus voulu)", "Quels contrats ne couvrent que le vol ?", "unsupported", None, None),
    ("Négation (refus voulu)", "Quels sinistres n'ont pas une indemnisation supérieure à 3000 euros ?", "unsupported", None, None),
    ("Négation (refus voulu)", "Quels contrats ne sont pas ?", "unsupported", None, None),
    ("Négation (refus voulu)", "sans", "unsupported", None, None),
    # ---------------------------------------------------------------- 7. entités inconnues / ambiguës / rôle incompatible
    ("Entités inconnues", "Quels véhicules sont assurés par Zorglub ?", "entity_not_found", None, None),
    ("Entités inconnues", "Quel est le sinistre 007 ?", "entity_not_found", None, None),
    ("Entités inconnues", "Quel est le montant de l'indemnisation du sinistre 99 ?", "entity_not_found", None, None),
    ("Entités inconnues", "Quelles voitures Mercedes ont subi un accident ?", "entity_not_found", None, None),
    ("Entités ambiguës", "Quels sinistres concernent Trabelsi ?", "clarification_needed", None, None),
    ("Rôle incompatible", "Quels sinistres ont été évalués par l'expert Ahmed ?", "entity_not_found", None, None),
    ("Rôle incompatible", "Quels sinistres ont été évalués par Ahmed ?", "entity_not_found", None, None),
    ("Rôle incompatible", "Quels véhicules sont conduits par l'expert Karim ?", "entity_not_found", None, None),
    ("Rôle incompatible", "Quels sinistres ont été déclarés par l'expert Karim ?", "entity_not_found", None, None),
    ("Rôle compatible (contrôle)", "Quels véhicules sont conduits par Ahmed ?", OK, "SEARCH_VEHICLE", ["Voiture_001"]),
    ("Rôle compatible (contrôle)", "Quels sinistres ont été évalués par l'expert Trabelsi ?", OK, "SEARCH_CLAIM", ["Sinistre_001"]),
    # ---------------------------------------------------------------- 8. questions vides / hors domaine / non supportées
    ("Vide / hors domaine", "", "empty", None, None),
    ("Vide / hors domaine", "   ", "empty", None, None),
    ("Vide / hors domaine", "?", "clarification_needed", None, None),
    ("Vide / hors domaine", "Quel temps fait-il à Paris ?", "clarification_needed", None, None),
    ("Vide / hors domaine", "Bonjour", "clarification_needed", None, None),
    ("Vide / hors domaine", "Raconte-moi une blague", "clarification_needed", None, None),
    ("Vide / hors domaine", "azerty uiop", "clarification_needed", None, None),
    ("Vide / hors domaine", "Mercedes", "clarification_needed", None, None),
    ("Structures non supportées / écriture", "Supprime tous les contrats", "unsupported", None, None),
    ("Structures non supportées / écriture", "Efface le sinistre 001", "unsupported", None, None),
    ("Structures non supportées / écriture", "Ajoute un véhicule Peugeot", "unsupported", None, None),
    ("Structures non supportées / écriture", "Drop all contracts", "unsupported", None, None),
    ("Injection", 'Quels véhicules sont assurés par Ahmed" } ; DROP ALL ; SELECT * WHERE { ?s ?p ?o', "unsupported", None, None),
    ("Injection", "Quels sinistres concernent <http://evil.example/x> ?", None, None, None),
]


def run() -> list[dict]:
    rows = []
    for cat, q, want_status, want_intent, tr in CASES:
        t = nlp.search(q, store)
        status = t["status"]
        got_ids = None
        if t.get("executed") and t["result"].get("queryType") == "SELECT" and "x" in t["result"].get("variables", []):
            got_ids = sorted({r["x"]["local"] for r in t["result"]["rows"] if "x" in r})
        count = None
        if t.get("executed") and t["result"].get("rows") and "nombre" in t["result"]["rows"][0]:
            count = t["result"]["rows"][0]["nombre"]["value"]
        expected_ids = truth(tr) if isinstance(tr, str) else tr
        ok = (want_status is None or status == want_status) and (want_intent is None or t.get("intent") == want_intent)
        if expected_ids is not None and want_status == OK:
            ok = ok and got_ids == sorted(expected_ids)
        if want_status in {None, "unsupported", "entity_not_found", "clarification_needed", "empty"}:
            ok = ok and not t.get("executed") and t.get("sparql") is None if want_status is not None else ok and "evil.example" not in (t.get("sparql") or "")
        rows.append({
            "category": cat, "question": q, "ok": ok, "status": status, "wantStatus": want_status, "intent": t.get("intent"),
            "modifiers": t.get("modifiers", []), "wantIntent": want_intent, "entities": [(e["text"], [str(x["id"] or x.get("label")) for x in e["resolved"]]) for e in t.get("entities", [])],
            "constraints": [c["description"] for c in t.get("constraints", [])], "negations": [(n["cue"], n["scope"], n["status"]) for n in t.get("negations", [])],
            "sparql": t.get("sparql"), "executed": bool(t.get("executed")), "ids": got_ids, "count": count, "expectedIds": expected_ids,
            "message": t.get("message"), "explanation": t.get("explanation"), "confidence": t.get("confidence"),
            "ms": (t.get("translationMs") or 0) + (t.get("executionMs") or 0),
        })
    return rows


def md_escape(s: str) -> str:
    return (s or "").replace("|", "\\|").replace("\n", " ")


def render(rows: list[dict]) -> str:
    total, good = len(rows), sum(r["ok"] for r in rows)
    cats: dict[str, list[dict]] = {}
    for r in rows:
        cats.setdefault(r["category"], []).append(r)
    out = [
        "# Rapport de validation NLP → SPARQL",
        "",
        f"> Généré automatiquement le {datetime.now():%Y-%m-%d %H:%M} par `semantic-service/tools/nlp_validation_report.py` — "
        "chaque ligne a été **réellement exécutée** par le module (spaCy + NLTK + RDFLib + règles + templates). **Aucune API LLM.**",
        "",
        f"**Résultat global : {good} / {total} cas conformes** à l'attendu (statut, intention, et résultats comparés à une requête SPARQL de référence écrite à la main, indépendante du module NLP).",
        "",
        "Graphe utilisé : ontologie d'origine `assurance_auto.xml` + extensions (copie temporaire, aucune donnée du projet modifiée).",
        "",
        "## Légende",
        "- **Statut** : `ok` (requête générée et exécutée) · `clarification_needed` (rien exécuté, on demande de reformuler) · `entity_not_found` (entité inexistante ou rôle incompatible, rien exécuté) · `unsupported` (compris mais non traduisible / écriture / négation non sûre, rien exécuté) · `empty`.",
        "- **Résultats** : identifiants OWL renvoyés ; ✅ = identique à la vérité terrain SPARQL, ❌ = écart.",
        "",
        "## Synthèse par catégorie",
        "",
        "| Catégorie | Conformes | Total |",
        "|---|---|---|",
    ]
    for c, rs in cats.items():
        out.append(f"| {c} | {sum(r['ok'] for r in rs)} | {len(rs)} |")
    for c, rs in cats.items():
        out += ["", f"## {c}", "", "| | Question | Statut | Intention (+ modificateurs) | Entités liées | Contraintes / négation | Résultats |", "|---|---|---|---|---|---|---|"]
        for r in rs:
            ents = "; ".join(f"{t} → {', '.join(i) or '∅'}" for t, i in r["entities"]) or "—"
            cons = "; ".join(r["constraints"]) or "—"
            if r["negations"]:
                cons += " · négation : " + "; ".join(f"« {c_} » ({s_})" for c_, _, s_ in r["negations"])
            if r["count"] is not None:
                res = f"nombre = {r['count']}"
            elif r["ids"] is not None:
                res = ", ".join(r["ids"]) or "(aucun résultat)"
            elif r["executed"]:
                res = "exécuté"
            else:
                res = "non exécuté : " + md_escape((r["message"] or "")[:150])
            intent = (r["intent"] or "—") + (f" + {', '.join(r['modifiers'])}" if r["modifiers"] else "")
            out.append(f"| {'✅' if r['ok'] else '❌'} | {md_escape(r['question']) or '*(vide)*'} | `{r['status']}` | {intent} | {md_escape(ents)} | {md_escape(cons)} | {md_escape(res)} |")
    # SPARQL détaillé pour les 10 questions + négations clés
    out += ["", "## SPARQL généré — questions de l'énoncé et négations", ""]
    keep = [r for r in rows if r["category"] in {"Questions de l'énoncé"} or r["question"] in {"Quels contrats ne couvrent pas le vol ?", "Quels contrats couvrent le vol mais pas l'incendie ?", "Quels véhicules ne sont pas assurés par Ahmed ?"}]
    for r in keep:
        out += [f"### {r['question']}", "", f"- Intention : `{r['intent']}` {r['modifiers']} — confiance {r['confidence']}", f"- Entités : {r['entities']}", f"- Explication : {r['explanation']}", "", "```sparql", r["sparql"] or "", "```", ""]
    out += [
        "## Limites connues (honnêtes)",
        "",
        "- **Français uniquement**, domaine fermé : le vocabulaire vient du dictionnaire `lexicon.py` et des individus du graphe. Un terme absent du dictionnaire n'est pas deviné : la question est refusée (`clarification_needed`).",
        "- **Négation** : prise en charge pour les **types, statuts, entités et existences de relation** (`ne … pas`, `ne … jamais`, `n'… aucun`, `sans`, `pas de`, `mais pas`, `ni`). Elle est **refusée** (jamais ignorée) pour les **montants et dates** (« pas supérieur à 3000 »), les structures restrictives « ne … que » et toute négation dont la portée n'est pas identifiable.",
        "- **Hypothèse de portée** : la portée d'une négation va du marqueur jusqu'à la ponctuation ou à « mais/alors/puis ». « ne couvrent pas le vol et l'incendie » est lu comme « ni l'un ni l'autre ».",
        "- **Une seule question à la fois** : pas de dialogue, pas d'anaphore (« et leurs montants ? »), pas de raisonnement multi-étapes, pas de comparaison entre entités.",
        "- **« accident »** = sous-classe `AccidentCirculation` ; « sinistre » = classe `Sinistre`. « Contrats couvrant les dommages matériels » est interprété via Contrat ← Sinistre → Dommage (l'ontologie n'a pas de lien Garantie ↔ type de dommage).",
        "- **Lecture seule** : toute demande de modification (supprimer, ajouter, créer, modifier…) est refusée ; les ordres SQL/SPARQL (DROP, DELETE, INSERT…) dans la question aussi.",
        "- Les **résultats sont ceux du graphe RDF courant** (RDFLib) ; ce n'est pas un raisonneur OWL : `ContratActif` / `SinistreExpertise` sont répondus par des filtres équivalents (validés contre HermiT, voir `HERMIT_VALIDATION.md`).",
        "- Aucune requête n'est exécutée si l'entité est inconnue, ambiguë, ou si son rôle est incompatible avec le verbe (ex. « évalués par Ahmed » alors qu'Ahmed est un assuré).",
        "",
    ]
    return "\n".join(out)


if __name__ == "__main__":
    rows = run()
    md = render(rows)
    (ROOT / "docs" / "NLP_VALIDATION_REPORT.md").write_text(md, encoding="utf-8")
    (ROOT / "docs" / "nlp_validation_results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    bad = [r for r in rows if not r["ok"]]
    print(f"{len(rows) - len(bad)}/{len(rows)} cas conformes")
    for r in bad:
        print("ÉCART :", r["category"], "|", r["question"], "| statut", r["status"], "(attendu", r["wantStatus"], ") intention", r["intent"], "(attendu", r["wantIntent"], ") ids", r["ids"], "attendu", r["expectedIds"], "|", (r["message"] or "")[:120])
    sys.exit(1 if bad else 0)
