import { describe, expect, it } from "vitest";
import { api } from "./helpers.js";

interface Case {
  question: string;
  intent: string;
  modifiers: string[];
  entities: string[]; // identifiants d'individus liés attendus
  ids: string[]; // résultats attendus (nom local des individus focus)
}

/** Les 10 questions de l'énoncé (la 8 est traitée à part : aucun expert « Ahmed » n'existe dans l'ontologie). */
const CASES: Case[] = [
  { question: "Quels véhicules sont assurés par Ahmed ?", intent: "SEARCH_VEHICLE", modifiers: [], entities: ["AhmedBenAli"], ids: ["Voiture_001"] },
  { question: "Quels contrats couvrent le vol ?", intent: "SEARCH_CONTRACT", modifiers: ["FILTER_BY_TYPE"], entities: [], ids: ["Contrat_001"] },
  { question: "Quels sinistres concernent une Peugeot 208 ?", intent: "SEARCH_CLAIM", modifiers: [], entities: ["Voiture_001"], ids: ["Sinistre_001"] },
  { question: "Quel est le montant de l'indemnisation du sinistre 001 ?", intent: "SEARCH_INDEMNIFICATION", modifiers: [], entities: ["Sinistre_001"], ids: ["Indemnisation_001", "Indemnisation_004"] },
  { question: "Quels assurés ont déclaré un accident en 2026 ?", intent: "SEARCH_INSURED", modifiers: ["FILTER_BY_TYPE", "FILTER_BY_DATE"], entities: [], ids: ["AhmedBenAli"] },
  { question: "Quels contrats couvrent les dommages matériels ?", intent: "SEARCH_CONTRACT", modifiers: ["FILTER_BY_TYPE"], entities: [], ids: ["Contrat_001", "Contrat_002", "Contrat_003"] },
  { question: "Quels véhicules ont subi un accident ?", intent: "SEARCH_VEHICLE", modifiers: ["FILTER_BY_TYPE"], entities: [], ids: ["Voiture_001"] },
  { question: "Quels contrats possèdent une garantie tous risques ?", intent: "SEARCH_CONTRACT", modifiers: ["FILTER_BY_TYPE"], entities: [], ids: ["Contrat_001"] },
  { question: "Quels sinistres ont une indemnisation supérieure à 3000 euros ?", intent: "SEARCH_CLAIM", modifiers: ["FILTER_BY_AMOUNT"], entities: [], ids: ["Sinistre_001", "Sinistre_003"] },
];

describe("Module NLP : question en français -> SPARQL -> résultats", () => {
  for (const c of CASES) {
    it(`« ${c.question} »`, async () => {
      const r = await api.post("/api/nlp/search").send({ question: c.question });
      expect(r.status).toBe(200);
      const b = r.body;
      // intention et modificateurs
      expect(b.status).toBe("ok");
      expect(b.intent).toBe(c.intent);
      expect([...b.modifiers].sort()).toEqual([...c.modifiers].sort());
      // entités liées aux individus de l'ontologie
      const linked = b.entities.flatMap((e: { resolved: Array<{ id: string }> }) => e.resolved.map((x) => x.id));
      for (const id of c.entities) expect(linked).toContain(id);
      // SPARQL généré valide et exécuté
      expect(b.valid).toBe(true);
      expect(b.sparql).toMatch(/^PREFIX actors:/);
      expect(b.sparql).toMatch(/SELECT/);
      expect(b.executed).toBe(true);
      // résultats
      const got = [...new Set(b.result.rows.map((row: { x: { local: string } }) => row.x.local))].sort();
      expect(got).toEqual([...c.ids].sort());
      // explication en français + temps d'exécution
      expect(b.explanation).toMatch(/\S/);
      expect(typeof b.executionMs).toBe("number");
      expect(b.method).toMatch(/aucune API LLM/);
      expect(b.steps.length).toBeGreaterThanOrEqual(6);
    });
  }

  it("la requête générée est rejouable à l'identique dans le SPARQL Query Explorer", async () => {
    const t = await api.post("/api/nlp/translate").send({ question: "Quels contrats couvrent le vol ?" });
    expect(t.body.sparql).toBeTruthy();
    const q = await api.post("/api/sparql/query").send({ query: t.body.sparql });
    expect(q.status).toBe(200);
    expect(q.body.count).toBe(1);
  });

  it("traduit sans exécuter (translate) et expose tokens, lemmes, POS, concepts, template", async () => {
    const t = (await api.post("/api/nlp/translate").send({ question: "Quels véhicules sont assurés par Ahmed ?" })).body;
    expect(t.executed).toBeUndefined();
    expect(t.tokens.find((x: { text: string }) => x.text === "véhicules")).toMatchObject({ lemma: "véhicule", pos: "NOUN" });
    expect(t.tokens.find((x: { text: string }) => x.text === "assurés")).toMatchObject({ lemma: "assurer", pos: "VERB" });
    expect(t.concepts.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining(["VEHICLE", "V_INSURE"]));
    expect(t.template).toBe("SEARCH_VEHICLE_LIST");
    expect(t.libraries.map((l: { name: string }) => l.name)).toEqual(expect.arrayContaining(["spaCy", "NLTK", "RDFLib"]));
  });

  it("gère les synonymes français (voiture = véhicule, client = assuré, remboursement = indemnisation, couverture = garantie)", async () => {
    const intents = async (q: string) => (await api.post("/api/nlp/translate").send({ question: q })).body.intent;
    expect(await intents("Quelles voitures sont couvertes ?")).toBe("SEARCH_VEHICLE");
    expect(await intents("Quels clients ont déclaré un sinistre ?")).toBe("SEARCH_INSURED");
    expect(await intents("Montre les remboursements refusés")).toBe("SEARCH_INDEMNIFICATION");
    expect(await intents("Quelles couvertures incendie existent ?")).toBe("SEARCH_GUARANTEE");
    expect(await intents("Quels souscripteurs ont un contrat actif ?")).toBe("SEARCH_INSURED");
  });

  it("question 8 : n'invente pas d'expert « Ahmed » et l'explique, sans exécuter de requête", async () => {
    const r = (await api.post("/api/nlp/search").send({ question: "Quels sinistres ont été évalués par l'expert Ahmed ?" })).body;
    expect(r.status).toBe("entity_not_found");
    expect(r.executed).toBe(false);
    expect(r.sparql).toBeNull();
    expect(r.message).toMatch(/Aucun expert nommé « Ahmed »/);
    expect(r.message).toMatch(/Ahmed Ben Ali/);
  });

  it("question 8 devient exécutable dès qu'un expert Ahmed est créé (gazetteer dynamique)", async () => {
    const ex = await api.post("/api/experts").send({ prenom: "Ahmed", nom: "Kefi", specialite: "Carrosserie" });
    expect(ex.status).toBe(201);
    const claim = (await api.get("/api/claims/Sinistre_001")).body;
    const exp = await api.post("/api/expertises").send({ sinistreId: claim.id, expertId: ex.body.id, conclusion: "Contre-expertise.", dateExpertise: "2026-10-10" });
    expect(exp.status).toBe(201);
    const r = (await api.post("/api/nlp/search").send({ question: "Quels sinistres ont été évalués par l'expert Ahmed ?" })).body;
    expect(r.status).toBe("ok");
    expect(r.intent).toBe("SEARCH_CLAIM");
    expect(r.result.rows.map((x: { x: { local: string } }) => x.x.local)).toEqual(["Sinistre_001"]);
    await api.delete(`/api/expertises/${exp.body.id}`);
    await api.delete(`/api/experts/${ex.body.id}`);
  });

  it("distingue deux homonymes selon le rôle (expert Trabelsi vs assurée Trabelsi) et demande une clarification si ambigu", async () => {
    const expert = (await api.post("/api/nlp/search").send({ question: "Quels sinistres ont été évalués par l'expert Trabelsi ?" })).body;
    expect(expert.status).toBe("ok");
    expect(expert.entities[0].resolved[0].id).toBe("Expert_001");
    const insured = (await api.post("/api/nlp/search").send({ question: "Combien de sinistres a déclaré Trabelsi ?" })).body;
    expect(insured.status).toBe("ok");
    expect(insured.entities[0].resolved[0].id).toBe("FatmaTrabelsi");
    const ambiguous = (await api.post("/api/nlp/search").send({ question: "Quels sinistres concernent Trabelsi ?" })).body;
    expect(ambiguous.status).toBe("clarification_needed");
    expect(ambiguous.executed).toBe(false);
    expect(ambiguous.message).toMatch(/ambigu/);
  });

  it("répond aux filtres de type, de statut, de lieu, de date et de montant", async () => {
    const ask = async (q: string) => (await api.post("/api/nlp/search").send({ question: q })).body;
    expect((await ask("Quels contrats sont expirés ?")).result.rows.map((r: { x: { local: string } }) => r.x.local)).toEqual(["Contrat_004"]);
    expect((await ask("Quels sinistres ont eu lieu à Sfax ?")).result.count).toBe(1);
    expect((await ask("Quelles motos sont assurées ?")).result.rows[0].x.local).toBe("Moto_001");
    expect((await ask("Quels sinistres en octobre 2026 ?")).result.rows[0].x.local).toBe("Sinistre_001");
    expect((await ask("Quels sinistres avant 2026 ?")).result.count).toBe(0);
    expect((await ask("Quelles indemnisations entre 1000 et 5000 euros ?")).result.count).toBe(2);
    expect((await ask("Combien de sinistres ?")).result.rows[0].nombre.value).toBe("3");
  });

  it("tolère une faute de frappe sur un nom propre (distance d'édition NLTK)", async () => {
    const r = (await api.post("/api/nlp/search").send({ question: "Quelles voitures peugot ont subi un accident ?" })).body;
    expect(r.status).toBe("ok");
    expect(r.entities.some((e: { fuzzy: boolean }) => e.fuzzy)).toBe(true);
    expect(r.result.rows[0].x.local).toBe("Voiture_001");
  });

  it("refuse de prétendre comprendre : hors domaine, entité inconnue, référence inexistante", async () => {
    const ood = (await api.post("/api/nlp/search").send({ question: "Quel temps fait-il à Paris ?" })).body;
    expect(ood.status).toBe("clarification_needed");
    expect(ood.sparql).toBeNull();
    expect(ood.executed).toBe(false);
    const unknown = (await api.post("/api/nlp/search").send({ question: "Quels véhicules sont assurés par Mohamed ?" })).body;
    expect(unknown.status).toBe("entity_not_found");
    expect(unknown.message).toMatch(/Mohamed/);
    const missing = (await api.post("/api/nlp/search").send({ question: "Quel est le sinistre 007 ?" })).body;
    expect(missing.status).toBe("entity_not_found");
    const hello = (await api.post("/api/nlp/search").send({ question: "Bonjour" })).body;
    expect(hello.status).toBe("clarification_needed");
  });

  it("valide l'entrée (question vide ou trop longue) et résiste aux tentatives d'injection", async () => {
    expect((await api.post("/api/nlp/search").send({ question: "" })).status).toBe(422);
    expect((await api.post("/api/nlp/search").send({ question: "a".repeat(501) })).status).toBe(422);
    expect((await api.post("/api/nlp/search").send({})).status).toBe(422);
    const inj = (await api.post("/api/nlp/translate").send({ question: 'Quels véhicules sont assurés par Ahmed" } ; DROP ALL ; SELECT * WHERE { ?s ?p ?o' })).body;
    expect(inj.sparql ?? "").not.toMatch(/DROP|DELETE|INSERT/i);
    const inj2 = (await api.post("/api/nlp/search").send({ question: "Quels sinistres ont une indemnisation supérieure à 1; DROP ALL euros ?" })).body;
    expect(JSON.stringify(inj2.sparql ?? "")).not.toMatch(/DROP/i);
  });

  it("expose le module (bibliothèques, intentions, dictionnaire de synonymes) sans LLM", async () => {
    const m = (await api.get("/api/nlp/module")).body;
    expect(m.llm).toBe(false);
    expect(m.intents.map((i: { id: string }) => i.id)).toEqual(
      expect.arrayContaining(["SEARCH_VEHICLE", "SEARCH_INSURED", "SEARCH_CONTRACT", "SEARCH_GUARANTEE", "SEARCH_CLAIM", "SEARCH_DAMAGE", "SEARCH_EXPERTISE", "SEARCH_INDEMNIFICATION", "FILTER_BY_AMOUNT", "FILTER_BY_DATE", "FILTER_BY_TYPE"]),
    );
    const vehicle = m.lexicon.find((c: { id: string }) => c.id === "VEHICLE");
    expect(vehicle.terms).toEqual(expect.arrayContaining(["voiture", "véhicule", "automobile"]));
    const insured = m.lexicon.find((c: { id: string }) => c.id === "INSURED");
    expect(insured.terms).toEqual(expect.arrayContaining(["client", "souscripteur"]));
    expect(m.libraries.find((l: { name: string }) => l.name === "spaCy").version).toMatch(/^3\./);
  });

  it("historise les recherches", async () => {
    const h = (await api.get("/api/nlp/history")).body;
    expect(h.length).toBeGreaterThan(5);
    expect(h[0]).toHaveProperty("question");
  });
});

describe("Module NLP : négation, rôles incompatibles et écriture (via l'API)", () => {
  const ids = (b: { result: { rows: { x: { local: string } }[] } }) => [...new Set(b.result.rows.map((r) => r.x.local))].sort();

  it("« Quels contrats ne couvrent pas le vol ? » renvoie le COMPLÉMENT de la version affirmative", async () => {
    const yes = (await api.post("/api/nlp/search").send({ question: "Quels contrats couvrent le vol ?" })).body;
    const no = (await api.post("/api/nlp/search").send({ question: "Quels contrats ne couvrent pas le vol ?" })).body;
    expect(no.status).toBe("ok");
    expect(no.sparql).toContain("NOT EXISTS");
    expect(no.negations[0].cue).toBe("ne … pas");
    expect(ids(yes)).toEqual(["Contrat_001"]);
    expect(ids(no)).toEqual(["Contrat_002", "Contrat_003", "Contrat_004"]);
  });

  it("refuse plutôt qu'ignorer une négation non sûre (montant, ne … que)", async () => {
    for (const question of ["Quels contrats ne couvrent que le vol ?", "Quels sinistres n'ont pas une indemnisation supérieure à 3000 euros ?"]) {
      const r = (await api.post("/api/nlp/search").send({ question })).body;
      expect(r.status).toBe("unsupported");
      expect(r.executed).toBe(false);
      expect(r.sparql).toBeNull();
    }
  });

  it("refuse les demandes d'écriture et les rôles incompatibles sans exécuter de requête", async () => {
    for (const [question, status] of [
      ["Supprime tous les contrats", "unsupported"],
      ["Quels sinistres ont été évalués par Ahmed ?", "entity_not_found"],
      ["Quels véhicules sont conduits par l'expert Karim ?", "entity_not_found"],
    ]) {
      const r = (await api.post("/api/nlp/search").send({ question })).body;
      expect(r.status).toBe(status);
      expect(r.executed).toBe(false);
    }
  });

  it("« Qui a déclaré un sinistre ? » renvoie des personnes, et l'expert Karim existe (question 8 de l'énoncé)", async () => {
    const who = (await api.post("/api/nlp/search").send({ question: "Qui a déclaré un sinistre ?" })).body;
    expect(who.intent).toBe("SEARCH_INSURED");
    const karim = (await api.post("/api/nlp/search").send({ question: "Quels sinistres ont été évalués par l'expert Karim ?" })).body;
    expect(karim.status).toBe("ok");
    expect(ids(karim)).toEqual(["Sinistre_001"]);
  });
});

