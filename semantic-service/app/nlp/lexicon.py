"""Dictionnaire de synonymes français et règles linguistiques (écrits à la main, sans LLM).

Chaque concept relie des termes français (synonymes) à un concept de l'ontologie OWL.
Les clés de correspondance sont normalisées (minuscules, sans accents, singulier) : voir normalize().
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def singular(word: str) -> str:
    """Singularisation grossière mais déterministe (assurés → assure, risques → risque, eaux ignoré)."""
    if len(word) > 3 and word.endswith(("s", "x")) and not word.endswith(("ss", "us")):
        return word[:-1]
    return word


def normalize(word: str) -> str:
    w = strip_accents(word.lower().replace("’", "'"))
    w = re.sub(r"^(l|d|j|qu|n|s|c)'", "", w)  # élision : l'assuré → assure
    return singular(w)


def normalize_phrase(phrase: str) -> tuple[str, ...]:
    toks = re.findall(r"[a-z0-9]+", strip_accents(phrase.lower().replace("’", "'")).replace("'", " "))
    return tuple(singular(t) for t in toks)


@dataclass
class Concept:
    id: str
    kind: str  # class | type | attribute | status | verb
    label: str  # libellé français affiché
    terms: list[str]
    owl: str | None = None  # classe OWL (kind=class)
    focus: str | None = None  # kind=type|class : concept "focus" impliqué
    variants: dict[str, str] = field(default_factory=dict)  # kind=type : rôle -> classe OWL
    value: str | None = None  # kind=status : valeur littérale de l'ontologie
    noun_only: bool = False  # ne pas utiliser si spaCy étiquette le mot VERB (ex. « assurés par »)
    intent: str | None = None  # intention déclenchée si ce concept est le focus
    prop: str | None = None  # kind=attribute|verb : propriété OWL principale


# ---------------------------------------------------------------------------- concepts "classe"
CLASS_CONCEPTS = [
    Concept("VEHICLE", "class", "véhicule", ["véhicule", "voiture", "automobile", "auto", "engin", "bagnole", "voitures"],
            owl="Vehicule", intent="SEARCH_VEHICLE", noun_only=True),
    Concept("INSURED", "class", "assuré", ["assuré", "client", "souscripteur", "titulaire", "adhérent", "preneur d'assurance"],
            owl="Assure", intent="SEARCH_INSURED", noun_only=True),
    Concept("DRIVER", "class", "conducteur", ["conducteur", "chauffeur", "pilote"], owl="Conducteur", intent="SEARCH_INSURED"),
    Concept("VICTIM", "class", "victime", ["victime", "tiers", "blessé"], owl="Victime", intent="SEARCH_INSURED"),
    Concept("EXPERT", "class", "expert", ["expert", "experts", "évaluateur"], owl="Expert", intent="SEARCH_EXPERTISE"),
    Concept("EXPERTISE", "class", "expertise", ["expertise", "évaluation", "estimation", "rapport d'expertise", "rapport"],
            owl="Expertise", intent="SEARCH_EXPERTISE", noun_only=True),
    Concept("CONTRACT", "class", "contrat", ["contrat", "police", "police d'assurance", "contrat d'assurance", "assurance", "formule"],
            owl="ContratAssurance", intent="SEARCH_CONTRACT", noun_only=True),
    Concept("GUARANTEE", "class", "garantie", ["garantie", "couverture", "protection"], owl="Garantie",
            intent="SEARCH_GUARANTEE", noun_only=True),
    Concept("CLAIM", "class", "sinistre", ["sinistre", "dossier", "déclaration de sinistre", "sinistre automobile", "incident"],
            owl="Sinistre", intent="SEARCH_CLAIM", noun_only=True),
    Concept("DAMAGE", "class", "dommage", ["dommage", "dégât", "préjudice", "dégat", "dégâts"], owl="Dommage",
            intent="SEARCH_DAMAGE", noun_only=True),
    Concept("INDEMNIFICATION", "class", "indemnisation",
            ["indemnisation", "remboursement", "indemnité", "dédommagement", "compensation", "règlement"],
            owl="Indemnisation", intent="SEARCH_INDEMNIFICATION", noun_only=True),
    Concept("COMPANY", "class", "compagnie d'assurance", ["compagnie d'assurance", "compagnie", "assureur", "société d'assurance"],
            owl="CompagnieAssurance", intent="SEARCH_COMPANY"),
    Concept("GARAGE", "class", "garage", ["garage", "garagiste", "atelier", "réparateur"], owl="Garage", intent="SEARCH_GARAGE"),
]

# ---------------------------------------------------------------------------- concepts "type" (sous-classes OWL)
TYPE_CONCEPTS = [
    # véhicule
    Concept("T_MOTO", "type", "moto", ["moto", "motocyclette", "scooter", "deux-roues", "deux roues"],
            variants={"vehicle": "Moto"}, focus="VEHICLE"),
    Concept("T_TRUCK", "type", "camion", ["camion", "poids lourd", "utilitaire"], variants={"vehicle": "Camion"}, focus="VEHICLE"),
    # sinistre / garantie / contrat (ambigus : plusieurs rôles possibles)
    Concept("T_THEFT", "type", "vol", ["vol", "voler", "cambriolage", "volé"],
            variants={"guarantee": "GarantieVol", "claim": "VolVehicule"}, focus="CLAIM"),
    Concept("T_FIRE", "type", "incendie", ["incendie", "feu", "brûler", "incendier"],
            variants={"guarantee": "GarantieIncendie", "claim": "IncendieVehicule"}, focus="CLAIM"),
    Concept("T_GLASS", "type", "bris de glace", ["bris de glace", "pare-brise", "pare brise", "vitre", "vitrage"],
            variants={"guarantee": "GarantieBrisDeGlace", "claim": "BrisDeGlace"}, focus="CLAIM"),
    Concept("T_NATURAL", "type", "catastrophe naturelle",
            ["catastrophe naturelle", "catastrophes naturelles", "cat nat", "inondation", "tempête", "grêle", "séisme"],
            variants={"guarantee": "GarantieCatastrophesNaturelles", "claim": "CatastropheNaturelle"}, focus="CLAIM"),
    Concept("T_RC", "type", "responsabilité civile", ["responsabilité civile", "rc", "assurance au tiers", "formule de base"],
            variants={"guarantee": "GarantieResponsabiliteCivile", "contract": "AssuranceResponsabiliteCivile"}, focus="GUARANTEE"),
    Concept("T_ALLRISKS", "type", "tous risques", ["tous risques", "tout risque", "dommages tous accidents", "tous accidents", "tout accident"],
            variants={"guarantee": "GarantieDommagesTousAccidents", "contract": "AssuranceTousRisques"}, focus="GUARANTEE"),
    Concept("T_INTERMEDIATE", "type", "formule intermédiaire", ["intermédiaire", "formule intermédiaire", "assurance intermédiaire"],
            variants={"contract": "AssuranceIntermediaire"}, focus="CONTRACT"),
    # sinistre : l'ontologie distingue AccidentCirculation de Sinistre (voir docs/NLP_PIPELINE.md)
    Concept("T_ACCIDENT", "type", "accident de la circulation", ["accident", "collision", "accrochage", "carambolage", "choc"],
            variants={"claim": "AccidentCirculation"}, focus="CLAIM"),
    # dommage
    Concept("T_MATERIAL", "type", "dommage matériel", ["dommage matériel", "dégât matériel", "dommage materiel", "dégâts matériels"],
            variants={"damage": "DommageMateriel"}, focus="DAMAGE"),
    Concept("T_BODILY", "type", "dommage corporel", ["dommage corporel", "blessure", "préjudice corporel", "dégât corporel", "corporel"],
            variants={"damage": "DommageCorporel"}, focus="DAMAGE"),
    Concept("T_MORAL", "type", "dommage moral", ["dommage moral", "préjudice moral", "moral"], variants={"damage": "DommageMoral"}, focus="DAMAGE"),
]

# ---------------------------------------------------------------------------- statuts
STATUS_CONCEPTS = [
    Concept("S_ACCEPTED", "status", "acceptée", ["accepté", "acceptée", "validé", "approuvé", "accordé"], value="Acceptee"),
    Concept("S_REFUSED", "status", "refusée", ["refusé", "refusée", "rejeté", "décliné", "refus"], value="Refusee"),
    Concept("S_PENDING", "status", "en cours", ["en cours", "en attente", "non réglé"], value="EnCours"),
    Concept("S_ACTIVE", "status", "actif", ["actif", "active", "en vigueur"], value="Actif"),
    Concept("S_EXPIRED", "status", "expiré", ["expiré", "échu", "arrivé à échéance", "périmé"], value="Expire"),
    Concept("S_CANCELLED", "status", "résilié", ["résilié", "annulé"], value="Resilie"),
    Concept("S_CLOSED", "status", "clos", ["clos", "clôturé", "fermé", "terminé"], value="Clos"),
]

# ---------------------------------------------------------------------------- attributs
ATTRIBUTE_CONCEPTS = [
    Concept("A_AMOUNT", "attribute", "montant", ["montant", "somme", "total"], prop="montant"),
    Concept("A_COST", "attribute", "coût", ["coût", "cout", "prix", "frais"], prop="coutEstime"),
    Concept("A_VALUE", "attribute", "valeur", ["valeur", "cote"], prop="valeurVehicule"),
    Concept("A_PREMIUM", "attribute", "prime", ["prime", "cotisation"], prop="montantPrime"),
    Concept("A_CEILING", "attribute", "plafond", ["plafond", "limite"], prop="plafondGarantie"),
    Concept("A_DEDUCTIBLE", "attribute", "franchise", ["franchise"], prop="montantFranchise"),
    Concept("A_DATE", "attribute", "date", ["date"], prop="date"),
]

# ---------------------------------------------------------------------------- verbes (lemmes) -> relation / rôle attendu
VERB_CONCEPTS = [
    Concept("V_DECLARE", "verb", "déclarer", ["déclarer", "signaler", "annoncer"], prop="declare"),
    Concept("V_INSURE", "verb", "assurer", ["assurer"], prop="possede"),
    Concept("V_COVER", "verb", "couvrir", ["couvrir", "garantir", "inclure", "comprendre", "contenir", "protéger", "prévoir", "offrir"], prop="contient"),
    Concept("V_OWN", "verb", "posséder", ["posséder", "souscrire", "détenir", "avoir"], prop="possede"),
    Concept("V_DRIVE", "verb", "conduire", ["conduire"], prop="estConduitPar"),
    Concept("V_EVALUATE", "verb", "évaluer", ["évaluer", "expertiser", "estimer", "examiner", "inspecter"], prop="realisePar"),
    Concept("V_REPAIR", "verb", "réparer", ["réparer"], prop="repare"),
    Concept("V_INDEMNIFY", "verb", "indemniser", ["indemniser", "rembourser", "dédommager", "verser"], prop="verseeA"),
    Concept("V_CONCERN", "verb", "concerner", ["concerner", "toucher", "viser"], prop="concerne"),
    Concept("V_SUFFER", "verb", "subir", ["subir", "connaître", "avoir eu", "essuyer"], prop="concerne"),
    Concept("V_CAUSE", "verb", "provoquer", ["provoquer", "causer", "entraîner"], prop="provoque"),
]

# rôle d'entité (classes OWL) attendu après un verbe / une préposition
VERB_EXPECTED_ROLES = {
    "V_DECLARE": {"Assure", "Conducteur"},
    "V_INSURE": {"Assure", "CompagnieAssurance"},
    "V_OWN": {"Assure"},
    "V_COVER": {"CompagnieAssurance", "Assure"},
    "V_DRIVE": {"Conducteur"},
    "V_EVALUATE": {"Expert"},
    "V_REPAIR": {"Garage"},
    "V_INDEMNIFY": {"CompagnieAssurance", "Assure", "Victime"},
}

# verbes dont le sujet/agent a un rôle impératif : une personne d'un autre rôle est refusée (pas de requête exécutée)
STRICT_VERB_ROLES = {
    "V_EVALUATE": {"Expert"},
    "V_DRIVE": {"Conducteur"},
    "V_DECLARE": {"Assure", "Conducteur"},
}
VERB_ROLE_LABEL = {"Expert": "expert", "Conducteur": "conducteur", "Assure": "assuré"}

# concept "classe" explicite devant une entité (« l'expert Ahmed ») -> classes OWL de la personne
CUE_ROLES = {
    "EXPERT": {"Expert"},
    "INSURED": {"Assure"},
    "DRIVER": {"Conducteur"},
    "VICTIM": {"Victime"},
    "COMPANY": {"CompagnieAssurance"},
    "GARAGE": {"Garage"},
}

# mots interrogatifs / demandes
COUNT_WORDS = {"combien", "nombre"}
LIST_WORDS = {"quel", "quelle", "lister", "liste", "afficher", "montrer", "donner", "trouver", "chercher", "rechercher",
              "recenser", "retourner", "voir", "existe", "y", "quels", "quelles"}
WHO_WORDS = {"qui"}

# intentions reconnues (documentées dans docs/NLP_PIPELINE.md)
INTENTS = {
    "SEARCH_VEHICLE": "Rechercher des véhicules",
    "SEARCH_INSURED": "Rechercher des assurés / conducteurs / victimes",
    "SEARCH_CONTRACT": "Rechercher des contrats d'assurance",
    "SEARCH_GUARANTEE": "Rechercher des garanties",
    "SEARCH_CLAIM": "Rechercher des sinistres",
    "SEARCH_DAMAGE": "Rechercher des dommages",
    "SEARCH_EXPERTISE": "Rechercher des expertises / experts",
    "SEARCH_INDEMNIFICATION": "Rechercher des indemnisations",
    "FILTER_BY_AMOUNT": "Filtrer par montant (supérieur / inférieur / égal)",
    "FILTER_BY_DATE": "Filtrer par date ou année",
    "FILTER_BY_TYPE": "Filtrer par type (sous-classe OWL)",
}

MONTHS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
    "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}

# comparateurs (appliqués au texte sans accents, minuscule)
COMPARATORS = [
    (r"(?:superieur(?:e|es|s)?|plus)\s*(?:a|de|que)|au[\s-]?dessus\s*(?:de|d')|depasse(?:nt)?|excede(?:nt)?|>\s*", ">"),
    (r"au\s+moins|minimum|>=", ">="),
    (r"(?:inferieur(?:e|es|s)?|moins)\s*(?:a|de|que)|en\s+dessous\s*(?:de|d')|au[\s-]?dessous\s*(?:de|d')|<\s*", "<"),
    (r"au\s+plus|maximum|<=", "<="),
    (r"egal(?:e|es)?\s*a|exactement|de\s+exactement", "="),
]


def _build_index() -> dict[tuple[str, ...], list[Concept]]:
    index: dict[tuple[str, ...], list[Concept]] = {}
    for c in CLASS_CONCEPTS + TYPE_CONCEPTS + STATUS_CONCEPTS + ATTRIBUTE_CONCEPTS + VERB_CONCEPTS:
        for term in c.terms:
            index.setdefault(normalize_phrase(term), []).append(c)
    return index


CONCEPT_INDEX = _build_index()
MAX_NGRAM = max(len(k) for k in CONCEPT_INDEX)
CONCEPTS_BY_ID = {c.id: c for c in CLASS_CONCEPTS + TYPE_CONCEPTS + STATUS_CONCEPTS + ATTRIBUTE_CONCEPTS + VERB_CONCEPTS}


def lexicon_summary() -> list[dict]:
    """Version sérialisable du dictionnaire (affichée dans l'interface « Dictionnaire de synonymes »)."""
    out = []
    for c in CLASS_CONCEPTS + TYPE_CONCEPTS + STATUS_CONCEPTS + ATTRIBUTE_CONCEPTS + VERB_CONCEPTS:
        out.append(
            {
                "id": c.id, "kind": c.kind, "label": c.label, "terms": c.terms, "owl": c.owl,
                "variants": c.variants, "value": c.value, "intent": c.intent, "property": c.prop,
            }
        )
    return out


# ---------------------------------------------------------------------------- négation (analyse linguistique explicite)
# Particule initiale du « ne ... X » et seconds termes ; marqueurs prépositionnels ; limites de portée.
NEG_FIRST = {"ne", "n'", "n’"}
NEG_SECOND = {"pas", "jamais", "plus", "aucun", "aucune", "guere", "point", "nullement"}
NEG_STANDALONE = {"sans", "pas", "jamais", "aucun", "aucune", "sauf", "hors", "excepte", "non"}
NEG_SCOPE_STOP = {"mais", "alors", "tandis", "puis", "cependant", "toutefois"}
# « ne ... que » = restriction (pas une négation) : refusé plutôt que mal interprété
NEG_RESTRICTIVE = {"que", "qu'", "qu’"}

# Verbes niés qui équivalent à « n'a pas de X » : (concept verbe, noeud focus) -> noeud dont l'existence est niée
VERB_NEGATED_EXISTENCE = {
    ("V_INDEMNIFY", "claim"): "indemnification",
    ("V_INDEMNIFY", "damage"): "indemnification",
    ("V_EVALUATE", "claim"): "expertise",
    ("V_EVALUATE", "damage"): "expertise",
    ("V_INSURE", "vehicle"): "contract",
    ("V_DECLARE", "insured"): "claim",
    ("V_OWN", "insured"): "contract",
    ("V_COVER", "contract"): "guarantee",
}

# Demandes d'écriture / mots-clés SQL-SPARQL : le NLP est en lecture seule, on refuse explicitement.
WRITE_VERBS = {
    "supprime", "supprimer", "supprimez", "efface", "effacer", "effacez", "detruis", "detruire", "detruisez",
    "modifie", "modifier", "modifiez", "ajoute", "ajouter", "ajoutez", "cree", "creer", "creez", "insere", "inserer",
    "inserez", "vide", "vider", "videz", "retire", "retirer", "retirez", "mets", "mettre", "mettez", "change",
    "changer", "changez", "remplace", "remplacer", "renomme", "renommer", "enleve", "enlever", "resilie", "resilier",
}
WRITE_KEYWORDS = {"drop", "delete", "insert", "truncate", "alter", "update", "clear"}
