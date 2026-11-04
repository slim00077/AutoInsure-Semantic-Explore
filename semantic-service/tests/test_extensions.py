"""Extensions de l'ontologie (ontology/assurance_auto_extensions.ttl) : intégrité, absence de conflit, chargement, domaines/ranges."""
import hashlib
import re
from pathlib import Path

from rdflib import Graph, Literal, URIRef
from rdflib.namespace import OWL, RDF, RDFS, XSD

from app import config
from app.store import ACT

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / "ontology" / "assurance_auto_extensions.ttl"
ORIGINAL = ROOT / "ontology" / "assurance_auto.xml"
RESOURCE = ROOT / "resources" / "assurance_auto.xml"


def _graphs():
    orig = Graph().parse(str(ORIGINAL), format="xml")
    ext = Graph().parse(str(EXT), format="turtle")
    return orig, ext


def test_original_xml_is_byte_identical_to_the_provided_resource():
    assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest() == hashlib.sha256(RESOURCE.read_bytes()).hexdigest()


def test_extension_declares_exactly_two_new_properties_without_clash():
    orig, ext = _graphs()
    declared = {s for t in (OWL.DatatypeProperty, OWL.ObjectProperty, OWL.Class) for s in ext.subjects(RDF.type, t)}
    assert declared == {ACT.statutSinistre, ACT.contenuDocument}
    for iri in declared:
        assert (iri, None, None) not in orig, f"{iri} existe déjà dans l'ontologie d'origine (conflit d'identifiant)"
    # aucun libellé identique à un libellé existant
    labels_orig = {str(o).lower() for o in orig.objects(None, RDFS.label)}
    for iri in declared:
        for lab in ext.objects(iri, RDFS.label):
            assert str(lab).lower() not in labels_orig


def test_extension_does_not_redefine_or_alter_any_original_entity():
    orig, ext = _graphs()
    # les seuls sujets d'extension déjà présents dans l'original sont les individus Sinistre_00x et Rapport_00x (assertions de données ajoutées)
    shared = {s for s in set(ext.subjects()) if (s, None, None) in orig}
    assert {str(s).split("#")[1] for s in shared} == {"Sinistre_001", "Sinistre_002", "Sinistre_003", "Rapport_001", "Rapport_002"}
    for s in shared:
        for p, o in ext.predicate_objects(s):
            assert p in {ACT.statutSinistre, ACT.contenuDocument}, f"extension : prédicat inattendu {p} sur {s}"


def test_domains_and_ranges_are_appropriate():
    orig, ext = _graphs()
    assert (ACT.statutSinistre, RDFS.domain, ACT.Sinistre) in ext and (ACT.Sinistre, RDF.type, OWL.Class) in orig
    assert (ACT.statutSinistre, RDFS.range, XSD.string) in ext
    assert (ACT.statutSinistre, RDF.type, OWL.FunctionalProperty) in ext  # un sinistre = un seul statut
    assert (ACT.contenuDocument, RDFS.domain, ACT.Document) in ext and (ACT.Document, RDF.type, OWL.Class) in orig
    assert (ACT.contenuDocument, RDFS.range, XSD.string) in ext
    assert (ACT.contenuDocument, RDF.type, OWL.FunctionalProperty) not in ext  # un document peut avoir plusieurs contenus (choix assumé)


def test_status_vocabulary_matches_the_api_enum():
    comment = str(next(iter(Graph().parse(str(EXT), format="turtle").objects(ACT.statutSinistre, RDFS.comment))))
    in_ttl = set(re.findall(r"Declare|EnExpertise|EnCours|Indemnise|Refuse|Clos", comment))
    claims_ts = (ROOT / "backend" / "src" / "domain" / "claims.ts").read_text(encoding="utf-8")
    enum = set(re.findall(r'"(\w+)"', re.search(r"CLAIM_STATUS = \[(.*?)\]", claims_ts, re.S).group(1)))
    assert in_ttl == enum == {"Declare", "EnExpertise", "EnCours", "Indemnise", "Refuse", "Clos"}


def test_store_loads_original_plus_extensions(store):
    g = store.graph
    assert (ACT.statutSinistre, RDF.type, OWL.DatatypeProperty) in g
    assert (ACT.contenuDocument, RDF.type, OWL.DatatypeProperty) in g
    assert sorted(str(o) for o in g.objects(ACT.Sinistre_001, ACT.statutSinistre)) == ["EnCours"]
    assert str(g.value(ACT.Sinistre_002, ACT.statutSinistre)) == "Refuse"
    assert str(g.value(ACT.Sinistre_003, ACT.statutSinistre)) == "Clos"
    assert "pare-choc" in str(g.value(ACT.Rapport_001, ACT.contenuDocument)).lower()
    # triplets d'origine toujours là
    assert (ACT.AhmedBenAli, RDF.type, ACT.Assure) in g and (ACT.Voiture_001, ACT.marque, Literal("Peugeot")) in g


def test_statut_sinistre_works_through_sparql(store):
    rows = store.query("SELECT ?s ?st WHERE { ?s actors:statutSinistre ?st } ORDER BY ?s")["rows"]
    assert [(r["s"]["local"], r["st"]["value"]) for r in rows] == [("Sinistre_001", "EnCours"), ("Sinistre_002", "Refuse"), ("Sinistre_003", "Clos")]
    store.update('DELETE { actors:Sinistre_001 actors:statutSinistre ?o } INSERT { actors:Sinistre_001 actors:statutSinistre "Indemnise" } WHERE { actors:Sinistre_001 actors:statutSinistre ?o }')
    assert store.query('ASK { actors:Sinistre_001 actors:statutSinistre "Indemnise" }')["boolean"] is True


def test_contenu_document_works_through_sparql(store):
    rows = store.query("SELECT ?d ?c WHERE { ?d actors:contenuDocument ?c }")["rows"]
    assert {r["d"]["local"] for r in rows} == {"Rapport_001", "Rapport_002"}
    # chaque sujet est bien un Document (RapportExpertise ⊑ Document) : domaine respecté
    assert store.query("ASK { ?d actors:contenuDocument ?c . FILTER NOT EXISTS { ?d a/rdfs:subClassOf* actors:Document } }")["boolean"] is False


def test_validator_accepts_original_plus_extensions(store):
    from app import ontology_info

    report = ontology_info.validate(store)
    assert report["errors"] == []


def test_extension_survives_export_roundtrip(store):
    """Exports Turtle et RDF/XML ré-analysables (ce que Protégé / OWLAPI ouvre) et contenant les extensions."""
    for fmt, rdflib_fmt in (("turtle", "turtle"), ("xml", "xml")):
        body, _ = store.export(fmt)
        g = Graph().parse(data=body, format=rdflib_fmt)
        assert (ACT.statutSinistre, RDF.type, OWL.DatatypeProperty) in g
        assert (ACT.Sinistre_001, ACT.statutSinistre, Literal("EnCours")) in g
        assert len(g) == len(store.graph)


def test_extension_individual_values_are_plain_strings(store):
    for _, _, o in store.graph.triples((None, ACT.statutSinistre, None)):
        assert isinstance(o, Literal) and (o.datatype in (None, XSD.string))
    assert all(isinstance(s, URIRef) for s in store.graph.subjects(ACT.statutSinistre, None))
