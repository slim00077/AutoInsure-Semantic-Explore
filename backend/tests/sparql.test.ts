import { describe, expect, it } from "vitest";
import { api, stats } from "./helpers.js";

describe("SPARQL query / update", () => {
  it("exécute un SELECT sur les données de l'ontologie", async () => {
    const r = await api.post("/api/sparql/query").send({
      query: "SELECT ?v ?m WHERE { ?c actors:couvre ?v . ?v actors:marque ?m } ORDER BY ?m",
    });
    expect(r.status).toBe(200);
    expect(r.body.variables).toEqual(["v", "m"]);
    expect(r.body.rows.map((x: { m: { value: string } }) => x.m.value)).toEqual(expect.arrayContaining(["Peugeot", "Renault", "Yamaha"]));
    expect(typeof r.body.executionMs).toBe("number");
  });

  it("supporte ASK et les propriétés inverses matérialisées", async () => {
    const ask = await api.post("/api/sparql/query").send({ query: "ASK { ?c actors:contient ?g . ?g a actors:GarantieVol }" });
    expect(ask.body).toMatchObject({ queryType: "ASK", boolean: true });
    const inv = await api.post("/api/sparql/query").send({ query: "SELECT ?v WHERE { ?v actors:estCouvertPar ?c }" });
    expect(inv.body.count).toBeGreaterThanOrEqual(3);
  });

  it("filtre avec FILTER et agrège avec GROUP BY", async () => {
    const f = await api.post("/api/sparql/query").send({
      query: "SELECT ?i ?m WHERE { ?i actors:montantIndemnisation ?m FILTER(?m > 3000) }",
    });
    expect(f.body.count).toBe(2);
    const g = await api.post("/api/sparql/query").send({
      query: "SELECT ?t (COUNT(?s) AS ?n) WHERE { ?s a ?t . ?t rdfs:subClassOf actors:Sinistre } GROUP BY ?t",
    });
    expect(g.body.count).toBe(3);
  });

  it("renvoie une erreur 400 explicite pour une syntaxe invalide", async () => {
    const r = await api.post("/api/sparql/query").send({ query: "SELEC ?x WHERE {" });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("SPARQL_ERROR");
    expect(r.body.error.message).toMatch(/syntaxe/i);
  });

  it("refuse SERVICE (SSRF) et les opérations destructrices (CLEAR/DROP/LOAD)", async () => {
    const s = await api.post("/api/sparql/query").send({ query: "SELECT * WHERE { SERVICE <http://example.org/sparql> { ?a ?b ?c } }" });
    expect(s.status).toBe(403);
    for (const bad of ["CLEAR ALL", "DROP ALL", "LOAD <http://example.org/data.ttl>"]) {
      const r = await api.post("/api/sparql/update").send({ update: bad });
      expect(r.status).toBe(403);
    }
  });

  it("interdit FROM / USING / WITH / GRAPH : aucun accès fichier ni réseau, un seul graphe (403)", async () => {
    const queries = [
      "SELECT * FROM <file:///etc/passwd> WHERE { ?s ?p ?o }",
      "SELECT * FROM <http://127.0.0.1:9/x> WHERE { ?s ?p ?o }",
      "SELECT * WHERE { GRAPH <urn:x> { ?s ?p ?o } }",
    ];
    for (const query of queries) expect((await api.post("/api/sparql/query").send({ query })).status).toBe(403);
    const updates = [
      "INSERT { ?s ?p ?o } USING <file:///etc/passwd> WHERE { ?s ?p ?o }",
      "WITH <urn:g> INSERT { actors:Z a actors:Assure } WHERE { }",
      "INSERT DATA { GRAPH <urn:g> { actors:Z a actors:Assure } }",
    ];
    const before = (await stats()).ontology.triples;
    for (const update of updates) expect((await api.post("/api/sparql/update").send({ update })).status).toBe(403);
    expect((await stats()).ontology.triples).toBe(before);
  });

  it("refuse l'effacement massif (DELETE WHERE { ?s ?p ?o }) et laisse le graphe intact (403)", async () => {
    const before = (await stats()).ontology.triples;
    const r = await api.post("/api/sparql/update").send({ update: "DELETE WHERE { ?s ?p ?o }" });
    expect(r.status).toBe(403);
    expect(r.body.error.message).toMatch(/supprimerait/);
    expect((await stats()).ontology.triples).toBe(before);
  });

  it("une erreur d'évaluation SPARQL renvoie 400/403 et jamais 500", async () => {
    const r = await api.post("/api/sparql/query").send({ query: "SELECT * WHERE { GRAPH ?g { ?s ?p ?o } }" });
    expect([400, 403]).toContain(r.status);
  });

  it("valide le corps de la requête", async () => {
    expect((await api.post("/api/sparql/query").send({})).status).toBe(422);
    expect((await api.post("/api/sparql/query").send({ query: "" })).status).toBe(422);
  });

  it("INSERT puis DELETE modifient réellement le graphe et conservent un historique", async () => {
    const before = (await stats()).ontology.triples;
    const ins = await api.post("/api/sparql/update").send({
      update: 'INSERT DATA { actors:Clause_900 a owl:NamedIndividual , actors:Clause ; actors:texteClause "test" . }',
    });
    expect(ins.status).toBe(200);
    expect(ins.body.added).toBe(3);
    expect((await stats()).ontology.triples).toBe(before + 3);
    const found = await api.post("/api/sparql/query").send({ query: 'ASK { actors:Clause_900 actors:texteClause "test" }' });
    expect(found.body.boolean).toBe(true);
    const del = await api.post("/api/sparql/update").send({ update: "DELETE WHERE { actors:Clause_900 ?p ?o }" });
    expect(del.body.removed).toBe(3);
    expect((await stats()).ontology.triples).toBe(before);
    const hist = await api.get("/api/sparql/history");
    expect(hist.body.length).toBeGreaterThanOrEqual(2);
    expect((await api.get("/api/sparql/examples")).body.length).toBeGreaterThanOrEqual(10);
  });

  it("toutes les requêtes d'exemple s'exécutent sans erreur", async () => {
    const ex = (await api.get("/api/sparql/examples")).body as Array<{ kind: string; query: string; id: string }>;
    for (const e of ex.filter((x) => x.kind === "query")) {
      const r = await api.post("/api/sparql/query").send({ query: e.query });
      expect(r.status, e.id).toBe(200);
    }
  });
});
