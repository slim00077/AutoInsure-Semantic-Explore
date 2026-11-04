package fr.autoinsure;

import org.semanticweb.HermiT.ReasonerFactory;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.TurtleDocumentFormat;
import org.semanticweb.owlapi.io.FileDocumentSource;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.reasoner.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Validation OWL de l'ontologie AutoInsure avec le raisonneur HermiT (via OWLAPI).
 *
 * Usage : HermitValidation <assurance_auto.xml> <assurance_auto_extensions.ttl> <rapport.txt>
 *
 * L'ontologie d'origine est ouverte en LECTURE SEULE (son SHA-256 est vérifié avant/après).
 * Les tests de contraintes sont réalisés sur des COPIES EN MÉMOIRE auxquelles on ajoute des axiomes de test.
 */
public class HermitValidation {
    static final String NS = "http://www.semanticweb.org/assurance/actors#";
    static OWLDataFactory df = OWLManager.getOWLDataFactory();
    static PrintStream out;
    static int passed = 0, failed = 0;

    static IRI iri(String local) { return IRI.create(NS + local); }
    static OWLClass cls(String l) { return df.getOWLClass(iri(l)); }
    static OWLNamedIndividual ind(String l) { return df.getOWLNamedIndividual(iri(l)); }
    static OWLObjectProperty op(String l) { return df.getOWLObjectProperty(iri(l)); }
    static OWLDataProperty dp(String l) { return df.getOWLDataProperty(iri(l)); }

    static String s(Object o) {
        return o.toString().replace("<" + NS, ":").replaceAll("(:[A-Za-z0-9_]+)>", "$1")
                .replace("<http://www.w3.org/2001/XMLSchema#", "xsd:").replace("<http://www.w3.org/2002/07/owl#", "owl:")
                .replace("<http://www.w3.org/2000/01/rdf-schema#", "rdfs:");
    }
    static String local(OWLEntity e) { String x = e.getIRI().toString(); return x.startsWith(NS) ? x.substring(NS.length()) : x; }

    static void p(String line) { out.println(line); }
    static void h(String title) { p(""); p("=== " + title + " ==="); }

    static void check(String name, boolean ok, String detail) {
        if (ok) passed++; else failed++;
        p((ok ? "[PASS] " : "[FAIL] ") + name + (detail.isEmpty() ? "" : " — " + detail));
    }

    static String sha256(Path f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        return String.format("%064x", new java.math.BigInteger(1, md.digest(Files.readAllBytes(f))));
    }

    /** Mode --check-export <fichier.rdf> : cohérence + classes définies d'un export de l'application (lignes CLE=valeur). */
    static void checkExport(Path file) throws Exception {
        OWLOntologyManager m = OWLManager.createOWLOntologyManager();
        OWLOntology o = m.loadOntologyFromOntologyDocument(file.toFile());
        OWLReasoner r = reasoner(o);
        boolean cons = r.isConsistent();
        System.out.println("CONSISTENT=" + cons);
        if (!cons) { r.dispose(); System.exit(3); }
        System.out.println("UNSATISFIABLE=" + String.join(",", names(r.getUnsatisfiableClasses().getEntitiesMinusBottom())));
        System.out.println("CONTRATACTIF=" + String.join(",", names(r.getInstances(cls("ContratActif"), false).getFlattened())));
        System.out.println("SINISTREEXPERTISE=" + String.join(",", names(r.getInstances(cls("SinistreExpertise"), false).getFlattened())));
        System.out.println("AXIOMS=" + o.getAxiomCount());
        r.dispose();
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 2 && args[0].equals("--check-export")) { checkExport(Paths.get(args[1])); return; }
        Path xml = Paths.get(args[0]), ttl = Paths.get(args[1]), report = Paths.get(args[2]);
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        out = new PrintStream(new TeeOutputStream(System.out, buf), true, "UTF-8");

        String hashBefore = sha256(xml);
        p("HermiT validation — AutoInsure");
        p("Java " + System.getProperty("java.version") + " / " + System.getProperty("java.vendor"));
        p("Ontologie : " + xml.toAbsolutePath());
        p("SHA-256 avant : " + hashBefore);

        // ---------------------------------------------------------------- A. ontologie d'ORIGINE seule
        OWLOntologyManager mgr = OWLManager.createOWLOntologyManager();
        long t0 = System.currentTimeMillis();
        OWLOntology original = mgr.loadOntologyFromOntologyDocument(xml.toFile());
        p("Chargement RDF/XML (DOCTYPE à entités &owl; &xsd;) : OK en " + (System.currentTimeMillis() - t0) + " ms");
        validate("A. ONTOLOGIE D'ORIGINE (assurance_auto.xml seul)", original, false);

        // ---------------------------------------------------------------- B. original + extensions (comme dans le service RDFLib)
        OWLOntologyManager mgr2 = OWLManager.createOWLOntologyManager();
        OWLOntology base = mgr2.loadOntologyFromOntologyDocument(xml.toFile());
        OWLOntology ext = mgr2.loadOntologyFromOntologyDocument(new FileDocumentSource(ttl.toFile(), new TurtleDocumentFormat()));
        OWLOntology merged = mgr2.createOntology(IRI.create("urn:autoinsure:merged"));
        merged.addAxioms(base.axioms().collect(Collectors.toList()));
        merged.addAxioms(ext.axioms().collect(Collectors.toList()));
        p("");
        p("Extensions TTL chargées : " + ext.getAxiomCount() + " axiomes (" + ext.getLogicalAxiomCount() + " logiques)");
        validate("B. ORIGINE + EXTENSIONS (assurance_auto_extensions.ttl)", merged, true);
        extensionTests(merged);

        String hashAfter = sha256(xml);
        h("Intégrité de l'ontologie d'origine");
        check("assurance_auto.xml inchangé (SHA-256 identique avant/après)", hashBefore.equals(hashAfter), hashAfter);

        h("BILAN");
        p("Vérifications réussies : " + passed + " — échecs : " + failed);
        Files.write(report, buf.toByteArray());
        System.exit(failed == 0 ? 0 : 2);
    }

    // ---------------------------------------------------------------------------------------------------------------
    static OWLReasoner reasoner(OWLOntology o) {
        return new ReasonerFactory().createReasoner(o);
    }

    static boolean consistent(OWLOntology o) {
        OWLReasoner r = reasoner(o);
        try { return r.isConsistent(); } finally { r.dispose(); }
    }

    static OWLOntology copyWith(OWLOntology o, Collection<OWLAxiom> extra) throws Exception {
        OWLOntologyManager m = OWLManager.createOWLOntologyManager();
        OWLOntology c = m.createOntology(IRI.create("urn:autoinsure:test:" + UUID.randomUUID()));
        c.addAxioms(o.axioms().collect(Collectors.toList()));
        c.addAxioms(extra);
        return c;
    }

    static void validate(String title, OWLOntology o, boolean withExt) throws Exception {
        h(title);
        p("Axiomes : " + o.getAxiomCount() + " (logiques : " + o.getLogicalAxiomCount() + ")");
        p("Classes nommées : " + o.classesInSignature().filter(c -> !c.isOWLThing() && !c.isOWLNothing()).count()
                + " · ObjectProperties : " + o.objectPropertiesInSignature().count()
                + " · DataProperties : " + o.dataPropertiesInSignature().count()
                + " · Individus nommés : " + o.individualsInSignature().count());

        long t = System.currentTimeMillis();
        OWLReasoner r = reasoner(o);
        p("Raisonneur : " + r.getReasonerName() + " " + r.getReasonerVersion() + " — initialisé en " + (System.currentTimeMillis() - t) + " ms");
        t = System.currentTimeMillis();
        boolean cons = r.isConsistent();
        check("L'ontologie est COHÉRENTE (isConsistent)", cons, "vérifié en " + (System.currentTimeMillis() - t) + " ms");
        if (!cons) { explainInconsistency(o); r.dispose(); return; }

        t = System.currentTimeMillis();
        r.precomputeInferences(InferenceType.CLASS_HIERARCHY, InferenceType.CLASS_ASSERTIONS, InferenceType.OBJECT_PROPERTY_ASSERTIONS,
                InferenceType.OBJECT_PROPERTY_HIERARCHY, InferenceType.SAME_INDIVIDUAL, InferenceType.DIFFERENT_INDIVIDUALS);
        p("precomputeInferences (hiérarchie de classes, assertions de classes et de propriétés) : " + (System.currentTimeMillis() - t) + " ms");

        Set<OWLClass> unsat = r.getUnsatisfiableClasses().getEntitiesMinusBottom();
        check("Aucune classe insatisfiable", unsat.isEmpty(), unsat.isEmpty() ? "0 classe équivalente à owl:Nothing" : unsat.toString());

        // ------------------------------------------------------------ restrictions
        h(title.charAt(0) + ". Restrictions et axiomes de classes (SubClassOf / Disjoint / Equivalent)");
        List<String> restr = new ArrayList<>();
        o.axioms(AxiomType.SUBCLASS_OF).forEach(ax -> {
            OWLClassExpression sup = ax.getSuperClass();
            if (!sup.isAnonymous()) return;
            sup.asConjunctSet().forEach(c -> restr.add(s(ax.getSubClass()) + "  ⊑  " + s(c)));
        });
        Collections.sort(restr);
        restr.forEach(x -> p("  " + x));
        p("  → " + restr.size() + " restrictions de classe");
        long disj = o.axioms(AxiomType.DISJOINT_CLASSES).count();
        p("  → " + disj + " axiome(s) DisjointClasses (" + o.axioms(AxiomType.DISJOINT_CLASSES).mapToInt(a -> a.classExpressions().collect(Collectors.toList()).size()).sum() + " classes engagées)");
        o.axioms(AxiomType.EQUIVALENT_CLASSES).forEach(a -> p("  ≡ " + s(a)));

        // ------------------------------------------------------------ classes définies
        h(title.charAt(0) + ". Classes définies : ContratActif et SinistreExpertise");
        OWLClass contratActif = cls("ContratActif"), sinExp = cls("SinistreExpertise");
        Set<String> actifInfere = names(r.getInstances(contratActif, false).getFlattened());
        Set<String> actifAttendu = new TreeSet<>();
        for (OWLNamedIndividual c : r.getInstances(cls("ContratAssurance"), false).getFlattened()) {
            boolean actif = o.dataPropertyAssertionAxioms(c).anyMatch(a -> a.getProperty().equals(dp("statutContrat")) && a.getObject().getLiteral().equals("Actif"));
            if (actif) actifAttendu.add(local(c));
        }
        p("ContratActif — instances inférées par HermiT : " + actifInfere);
        p("ContratActif — attendu (ContratAssurance avec statutContrat \"Actif\" asserté) : " + actifAttendu);
        check("ContratActif inféré = contrats au statut Actif", actifInfere.equals(actifAttendu) && !actifInfere.isEmpty(), "");
        Set<String> contratsTous = names(r.getInstances(cls("ContratAssurance"), false).getFlattened());
        p("Tous les contrats : " + new TreeSet<>(contratsTous));
        Set<String> nonActifs = new TreeSet<>(contratsTous); nonActifs.removeAll(actifInfere);
        p("Contrats NON inférés Actif (statut Expire/Resilie…) : " + nonActifs);

        Set<String> expInfere = names(r.getInstances(sinExp, false).getFlattened());
        Set<String> expAttendu = new TreeSet<>();
        for (OWLNamedIndividual sn : r.getInstances(cls("Sinistre"), false).getFlattened()) {
            boolean ok = o.objectPropertyAssertionAxioms(sn).anyMatch(a -> a.getProperty().equals(op("faitObjetDe"))
                    && !a.getObject().isAnonymous() && r.getTypes(a.getObject().asOWLNamedIndividual(), false).containsEntity(cls("Expertise")));
            if (ok) expAttendu.add(local(sn));
        }
        p("SinistreExpertise — instances inférées par HermiT : " + expInfere);
        p("SinistreExpertise — attendu (Sinistre ayant faitObjetDe une Expertise) : " + expAttendu);
        check("SinistreExpertise inféré = sinistres liés à une expertise", expInfere.equals(expAttendu) && !expInfere.isEmpty(), "");
        Set<String> sinTous = new TreeSet<>(names(r.getInstances(cls("Sinistre"), false).getFlattened()));
        sinTous.removeAll(expInfere);
        p("Sinistres NON inférés SinistreExpertise : " + sinTous);

        // ------------------------------------------------------------ types inférés
        h(title.charAt(0) + ". Appartenances de classe inférées (types directs, individus clés)");
        for (String id : new String[]{"Contrat_001", "Contrat_002", "Contrat_003", "Contrat_004", "Sinistre_001", "Sinistre_002", "Sinistre_003", "Expertise_001", "Indemnisation_001", "AhmedBenAli"}) {
            OWLNamedIndividual i = ind(id);
            if (!o.containsEntityInSignature(i)) continue;
            Set<String> asserted = o.classAssertionAxioms(i).filter(a -> !a.getClassExpression().isAnonymous()).map(a -> local(a.getClassExpression().asOWLClass())).collect(Collectors.toCollection(TreeSet::new));
            Set<String> inferred = names(r.getTypes(i, false).getFlattened());
            inferred.remove("Thing");
            Set<String> onlyInferred = new TreeSet<>(inferred); onlyInferred.removeAll(asserted);
            p("  " + id + " : asserté " + asserted + "  |  inféré en plus : " + onlyInferred);
        }

        // ------------------------------------------------------------ inverses
        h(title.charAt(0) + ". owl:inverseOf — assertions inverses manquantes mais inférées par HermiT");
        long total = 0, missing = 0, inferredOk = 0;
        for (OWLInverseObjectPropertiesAxiom ax : (Iterable<OWLInverseObjectPropertiesAxiom>) o.axioms(AxiomType.INVERSE_OBJECT_PROPERTIES)::iterator) {
            OWLObjectProperty a = ax.getFirstProperty().asOWLObjectProperty(), b = ax.getSecondProperty().asOWLObjectProperty();
            for (OWLObjectPropertyAssertionAxiom pa : (Iterable<OWLObjectPropertyAssertionAxiom>) o.axioms(AxiomType.OBJECT_PROPERTY_ASSERTION).filter(x -> x.getProperty().equals(a))::iterator) {
                total++;
                if (pa.getObject().isAnonymous() || pa.getSubject().isAnonymous()) continue;
                OWLObjectPropertyAssertionAxiom inv = df.getOWLObjectPropertyAssertionAxiom(b, pa.getObject(), pa.getSubject());
                if (!o.containsAxiom(inv)) {
                    missing++;
                    if (r.isEntailed(inv)) inferredOk++;
                }
            }
        }
        p("  Assertions de la 1re propriété de chaque paire inverse : " + total + " ; inverse absente du fichier : " + missing + " ; inférée par HermiT : " + inferredOk);
        check("Toute inverse absente du fichier est bien inférée (owl:inverseOf)", missing == inferredOk, "");
        p("  (RDFLib/le service matérialise ces triplets au chargement ; HermiT les déduit sans les écrire.)");

        // ------------------------------------------------------------ domaines / ranges / disjonctions sur copies
        h(title.charAt(0) + ". Tests de contraintes sur COPIES EN MÉMOIRE (l'ontologie d'origine n'est pas modifiée)");
        constraintTests(o);
        r.dispose();
    }

    static Set<String> names(Collection<? extends OWLEntity> c) {
        return c.stream().map(HermitValidation::local).collect(Collectors.toCollection(TreeSet::new));
    }

    static void expectInconsistent(OWLOntology o, String name, OWLAxiom... axioms) throws Exception {
        OWLOntology c = copyWith(o, Arrays.asList(axioms));
        boolean cons = consistent(c);
        check(name, !cons, cons ? "ATTENDU : incohérence — HermiT a accepté" : "incohérence détectée par HermiT, comme attendu");
    }

    static void expectConsistent(OWLOntology o, String name, OWLAxiom... axioms) throws Exception {
        OWLOntology c = copyWith(o, Arrays.asList(axioms));
        boolean cons = consistent(c);
        check(name, cons, cons ? "cohérent (monde ouvert OWL : l'information manquante est simplement inconnue)" : "ATTENDU : cohérent — HermiT a déclaré une incohérence");
    }

    static void constraintTests(OWLOntology o) throws Exception {
        OWLNamedIndividual x = ind("TestX_HermiT"), y = ind("TestY_HermiT");
        // disjonction de sous-classes de garanties
        expectInconsistent(o, "Disjonction : un individu GarantieVol ET GarantieIncendie est incohérent",
                df.getOWLClassAssertionAxiom(cls("GarantieVol"), x), df.getOWLClassAssertionAxiom(cls("GarantieIncendie"), x));
        // disjonction de sous-classes de véhicules
        expectInconsistent(o, "Disjonction : Moto_001 typé aussi Voiture est incohérent",
                df.getOWLClassAssertionAxiom(cls("Voiture"), ind("Moto_001")));
        // grandes classes disjointes : Assure ET Vehicule
        expectInconsistent(o, "Disjonction des grandes classes : Voiture_001 typé aussi Assure est incohérent",
                df.getOWLClassAssertionAxiom(cls("Assure"), ind("Voiture_001")));
        // domaine : possede a pour domaine Assure ; un véhicule qui « possède » un contrat devient Assure -> disjoint de Vehicule
        expectInconsistent(o, "Domaine : Voiture_001 possede Contrat_001 (domaine Assure) est incohérent (Voiture ⊓ Assure disjoints)",
                df.getOWLObjectPropertyAssertionAxiom(op("possede"), ind("Voiture_001"), ind("Contrat_001")));
        // range : possede a pour range ContratAssurance ; un assuré possède un véhicule -> véhicule devient ContratAssurance (disjoint)
        expectInconsistent(o, "Range : AhmedBenAli possede Voiture_002 (range ContratAssurance) est incohérent",
                df.getOWLObjectPropertyAssertionAxiom(op("possede"), ind("AhmedBenAli"), ind("Voiture_002")));
        // propriété fonctionnelle concerne + individus distincts
        expectInconsistent(o, "Fonctionnelle : Sinistre_001 concerne un 2e véhicule DISTINCT est incohérent",
                df.getOWLObjectPropertyAssertionAxiom(op("concerne"), ind("Sinistre_001"), ind("Voiture_002")),
                df.getOWLDifferentIndividualsAxiom(ind("Voiture_001"), ind("Voiture_002")));
        // cardinalité exacte realisePar
        expectInconsistent(o, "Cardinalité =1 : Expertise_001 réalisée par 2 experts DISTINCTS est incohérent",
                df.getOWLObjectPropertyAssertionAxiom(op("realisePar"), ind("Expertise_001"), ind("Expert_002")),
                df.getOWLObjectPropertyAssertionAxiom(op("realisePar"), ind("Expertise_001"), ind("Expert_001")),
                df.getOWLDifferentIndividualsAxiom(ind("Expert_001"), ind("Expert_002")));
        // cardinalité max appliqueFranchise
        expectInconsistent(o, "Cardinalité ≤1 : Indemnisation_001 avec 2 franchises DISTINCTES est incohérent",
                df.getOWLObjectPropertyAssertionAxiom(op("appliqueFranchise"), ind("Indemnisation_001"), ind("Franchise_001")),
                df.getOWLObjectPropertyAssertionAxiom(op("appliqueFranchise"), ind("Indemnisation_001"), ind("Franchise_002")),
                df.getOWLDifferentIndividualsAxiom(ind("Franchise_001"), ind("Franchise_002")));
        // monde ouvert
        expectConsistent(o, "Monde OUVERT : un Sinistre sans dommage ni véhicule reste cohérent (≥1 provoque = existence implicite)",
                df.getOWLClassAssertionAxiom(cls("Sinistre"), x));
        expectConsistent(o, "Monde OUVERT : un ContratAssurance sans prime ni garantie reste cohérent",
                df.getOWLClassAssertionAxiom(cls("ContratAssurance"), y));
        // classes définies : inférence sur de nouveaux individus
        OWLOntology c1 = copyWith(o, Arrays.asList(df.getOWLClassAssertionAxiom(cls("ContratAssurance"), x),
                df.getOWLDataPropertyAssertionAxiom(dp("statutContrat"), x, "Actif")));
        OWLReasoner r1 = reasoner(c1);
        check("Définition : un nouveau contrat au statutContrat \"Actif\" est inféré ContratActif", r1.getTypes(x, false).containsEntity(cls("ContratActif")), "");
        r1.dispose();
        OWLOntology c2 = copyWith(o, Arrays.asList(df.getOWLClassAssertionAxiom(cls("Sinistre"), y),
                df.getOWLObjectPropertyAssertionAxiom(op("faitObjetDe"), y, ind("Expertise_001"))));
        OWLReasoner r2 = reasoner(c2);
        check("Définition : un sinistre lié à une Expertise est inféré SinistreExpertise", r2.getTypes(y, false).containsEntity(cls("SinistreExpertise")), "");
        r2.dispose();
        OWLOntology c3 = copyWith(o, Arrays.asList(df.getOWLClassAssertionAxiom(cls("ContratAssurance"), x),
                df.getOWLDataPropertyAssertionAxiom(dp("statutContrat"), x, "Expire")));
        OWLReasoner r3 = reasoner(c3);
        check("Définition (négatif) : un contrat \"Expire\" n'est PAS inféré ContratActif (monde ouvert : non-appartenance non prouvée mais aucune inférence positive)",
                !r3.getTypes(x, false).containsEntity(cls("ContratActif")), "");
        r3.dispose();
        // sous-classe : un tous risques contient forcément une garantie dommages tous accidents (existentielle) — inférence de type via range/domain
        OWLReasoner r4 = reasoner(copyWith(o, Collections.emptyList()));
        check("Hiérarchie : AssuranceTousRisques ⊑ ContratAssurance inférée",
                r4.getSuperClasses(cls("AssuranceTousRisques"), false).containsEntity(cls("ContratAssurance")), "");
        check("Hiérarchie : ContratActif ⊑ ContratAssurance inférée (classe définie classée sous la classe primitive)",
                r4.getSuperClasses(cls("ContratActif"), false).containsEntity(cls("ContratAssurance")), "");
        r4.dispose();
    }

    static void extensionTests(OWLOntology merged) throws Exception {
        h("B. Extensions : statutSinistre (fonctionnelle, domaine Sinistre) et contenuDocument (domaine Document)");
        OWLReasoner r = reasoner(merged);
        check("statutSinistre : valeur asserté pour Sinistre_001..003, ontologie cohérente", r.isConsistent(), "");
        for (String id : new String[]{"Sinistre_001", "Sinistre_002", "Sinistre_003"}) {
            Set<String> v = merged.dataPropertyAssertionAxioms(ind(id)).filter(a -> a.getProperty().equals(dp("statutSinistre"))).map(a -> a.getObject().getLiteral()).collect(Collectors.toSet());
            p("  " + id + " statutSinistre = " + v);
        }
        check("contenuDocument : Rapport_001 est inféré/typé Document", r.getTypes(ind("Rapport_001"), false).containsEntity(cls("Document")), "");
        check("Rapport_001 est un RapportExpertise (type de l'ontologie d'origine)", r.getTypes(ind("Rapport_001"), false).containsEntity(cls("RapportExpertise")), "");
        r.dispose();

        expectInconsistent(merged, "statutSinistre FONCTIONNELLE : deux valeurs différentes pour Sinistre_001 sont incohérentes",
                df.getOWLDataPropertyAssertionAxiom(dp("statutSinistre"), ind("Sinistre_001"), "Clos"));
        OWLNamedIndividual z = ind("TestZ_HermiT");
        OWLOntology c = copyWith(merged, Collections.singletonList(df.getOWLDataPropertyAssertionAxiom(dp("statutSinistre"), z, "Declare")));
        OWLReasoner rz = reasoner(c);
        check("Domaine de statutSinistre : un individu portant statutSinistre est inféré Sinistre", rz.getTypes(z, false).containsEntity(cls("Sinistre")), "");
        rz.dispose();
        expectInconsistent(merged, "Domaine de statutSinistre + disjonction : Voiture_001 avec statutSinistre est incohérent",
                df.getOWLDataPropertyAssertionAxiom(dp("statutSinistre"), ind("Voiture_001"), "Declare"));
        OWLOntology c2 = copyWith(merged, Collections.singletonList(df.getOWLDataPropertyAssertionAxiom(dp("contenuDocument"), z, "texte")));
        OWLReasoner rz2 = reasoner(c2);
        check("Domaine de contenuDocument : un individu portant contenuDocument est inféré Document", rz2.getTypes(z, false).containsEntity(cls("Document")), "");
        rz2.dispose();
        expectInconsistent(merged, "Domaine de contenuDocument + disjonction : AhmedBenAli avec contenuDocument est incohérent (Personne ⊓ Document)",
                df.getOWLDataPropertyAssertionAxiom(dp("contenuDocument"), ind("AhmedBenAli"), "x"));
    }

    /** Si l'ontologie est incohérente : retire les axiomes d'assertion un par un pour isoler une cause minimale. */
    static void explainInconsistency(OWLOntology o) {
        p("L'ontologie est INCOHÉRENTE. Recherche d'une cause par retrait successif d'assertions d'individus…");
        List<OWLAxiom> assertions = o.axioms().filter(a -> a.isOfType(AxiomType.CLASS_ASSERTION, AxiomType.OBJECT_PROPERTY_ASSERTION,
                AxiomType.DATA_PROPERTY_ASSERTION, AxiomType.DIFFERENT_INDIVIDUALS, AxiomType.SAME_INDIVIDUAL)).collect(Collectors.toList());
        try {
            for (OWLAxiom a : assertions) {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                OWLOntology c = m.createOntology();
                c.addAxioms(o.axioms().filter(x -> !x.equals(a)).collect(Collectors.toList()));
                if (consistent(c)) p("  Cause probable : le retrait de  " + s(a) + "  rend l'ontologie cohérente.");
            }
        } catch (Exception e) { p("  (analyse interrompue : " + e + ")"); }
    }

    static class TeeOutputStream extends OutputStream {
        final OutputStream a, b;
        TeeOutputStream(OutputStream a, OutputStream b) { this.a = a; this.b = b; }
        public void write(int c) throws IOException { a.write(c); b.write(c); }
        public void write(byte[] x, int o, int l) throws IOException { a.write(x, o, l); b.write(x, o, l); }
        public void flush() throws IOException { a.flush(); b.flush(); }
    }
}
