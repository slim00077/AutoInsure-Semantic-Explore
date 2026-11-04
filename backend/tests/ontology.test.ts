import { describe, expect, it } from "vitest";
import { api } from "./helpers.js";

describe("Chargement de l'ontologie officielle", () => {
  it("le service sémantique est joignable et a chargé l'ontologie", async () => {
    const r = await api.get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body.semantic.triples).toBeGreaterThan(800);
  });

  it("expose toutes les classes (45) avec sous-classes, restrictions et disjonctions", async () => {
    const r = await api.get("/api/ontology/classes");
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(45);
    const ids = r.body.map((c: { id: string }) => c.id);
    for (const c of ["Personne", "Assure", "Vehicule", "ContratAssurance", "Garantie", "Sinistre", "Dommage", "Expertise", "Indemnisation"]) {
      expect(ids).toContain(c);
    }
    const contrat = r.body.find((c: { id: string }) => c.id === "ContratAssurance");
    expect(contrat.children).toEqual(expect.arrayContaining(["AssuranceTousRisques", "AssuranceIntermediaire", "AssuranceResponsabiliteCivile"]));
    expect(contrat.restrictions.length).toBeGreaterThanOrEqual(4);
    expect(contrat.disjointWith).toContain("Garantie");
  });

  it("expose les ObjectProperties et DataProperties avec domaines/ranges", async () => {
    const r = await api.get("/api/ontology/properties");
    expect(r.status).toBe(200);
    const couvre = r.body.find((p: { id: string }) => p.id === "couvre");
    expect(couvre).toMatchObject({ kind: "object", domain: ["ContratAssurance"], range: ["Vehicule"] });
    expect(couvre.inverseOf).toContain("estCouvertPar");
    const immat = r.body.find((p: { id: string }) => p.id === "immatriculation");
    expect(immat).toMatchObject({ kind: "datatype", functional: true, range: ["string"] });
    expect(r.body.filter((p: { kind: string }) => p.kind === "object")).toHaveLength(29);
    expect(r.body.filter((p: { kind: string }) => p.kind === "datatype").length).toBeGreaterThanOrEqual(40);
  });

  it("liste les individus par classe (sous-classes incluses) et un individu précis", async () => {
    const v = await api.get("/api/ontology/individuals?type=Vehicule");
    expect(v.body.map((x: { id: string }) => x.id)).toEqual(["Moto_001", "Voiture_001", "Voiture_002"]);
    const one = await api.get("/api/ontology/individuals/AhmedBenAli");
    expect(one.status).toBe(200);
    expect(one.body.types).toEqual(expect.arrayContaining(["Assure", "Conducteur"]));
    expect(one.body.properties.find((p: { property: string }) => p.property === "possede").id).toBe("Contrat_001");
    expect((await api.get("/api/ontology/individuals/Inexistant")).status).toBe(404);
    expect((await api.get("/api/ontology/individuals?type=Bad;Type")).status).toBe(422);
  });

  it("calcule les statistiques à partir des données RDF réelles", async () => {
    const s = (await api.get("/api/ontology/statistics")).body;
    expect(s.ontology.classes).toBe(45);
    expect(s.entities).toMatchObject({ assures: 3, vehicules: 3, contrats: 4, sinistres: 3, indemnisations: 4, expertises: 2 });
    expect(s.byContractType.find((x: { name: string }) => x.name === "AssuranceResponsabiliteCivile").count).toBe(2);
    expect(s.byClaimType.find((x: { name: string }) => x.name === "VolVehicule").count).toBe(1);
    expect(s.finance.totalIndemnisationAcceptee).toBe(13410);
  });

  it("fournit le graphe (schéma et instances) pour l'ontographe", async () => {
    const schema = (await api.get("/api/ontology/graph?level=schema")).body;
    expect(schema.nodes).toHaveLength(45);
    expect(schema.edges.some((e: { label: string; source: string; target: string }) => e.label === "provoque" && e.source === "Sinistre" && e.target === "Dommage")).toBe(true);
    const inst = (await api.get("/api/ontology/graph?level=instances")).body;
    expect(inst.nodes.length).toBeGreaterThanOrEqual(56);
  });

  it("valide la cohérence structurelle de l'ontologie (domaines, cardinalités, disjonctions)", async () => {
    const v = (await api.get("/api/ontology/validate")).body;
    expect(v.errors).toEqual([]);
    expect(v.consistent).toBe(true);
    expect(v.checks.every((c: { passed: boolean }) => c.passed)).toBe(true);
  });

  it("exporte l'ontologie en RDF/XML compatible Protégé", async () => {
    const r = await api.get("/api/ontology/export?format=xml");
    expect(r.status).toBe(200);
    expect(r.text).toContain("owl:ObjectProperty");
    expect(r.text).toContain("AhmedBenAli");
    expect((await api.get("/api/ontology/export?format=exe")).status).toBe(422);
  });
});
