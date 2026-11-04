import { test, expect, type Page } from "@playwright/test";

/** SPARQL Explorer et recherche NLP : parcours de la démonstration, dans un vrai navigateur, sur la pile isolée. */
test.describe.configure({ mode: "serial" });
const SHOT = "screenshots/explorers";

async function runSparql(page: Page, text: string) {
  const ta = page.getByLabel("Requête SPARQL");
  await ta.fill(text);
  await page.getByRole("button", { name: "Exécuter", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Exécuter l'Update" });
  if (/(INSERT|DELETE|CLEAR|DROP|LOAD|WITH|CREATE|COPY|MOVE|ADD)/i.test(text) && !/^\s*(ASK|SELECT|CONSTRUCT|DESCRIBE)/i.test(text)) {
    await confirm.click(); // l'interface demande une confirmation avant toute mise à jour
  }
}

test.describe("SPARQL Explorer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/sparql");
    await expect(page.getByLabel("Requête SPARQL")).toBeVisible();
  });

  test("SELECT + FILTER + OPTIONAL + ORDER BY + LIMIT : résultats affichés", async ({ page }) => {
    await runSparql(page, `SELECT ?contrat ?numero ?prime WHERE {
  ?contrat a/rdfs:subClassOf* actors:ContratAssurance ; actors:numeroContrat ?numero .
  OPTIONAL { ?contrat actors:aPourPrime/actors:montantPrime ?prime }
  FILTER(?prime > 100)
} ORDER BY DESC(?prime) LIMIT 3`);
    await expect(page.getByText("Contrat_001").first()).toBeVisible();
    await expect(page.getByText(/ligne\(s\)|résultat/i).first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/01-select.png`, fullPage: true });
  });

  test("ASK, CONSTRUCT et DESCRIBE sont acceptés", async ({ page }) => {
    await runSparql(page, "ASK { actors:AhmedBenAli a actors:Assure }");
    await expect(page.getByText(/true|vrai|Oui/i).first()).toBeVisible();
  });

  test("requête invalide : message d'erreur expliqué (400)", async ({ page }) => {
    await runSparql(page, "SELEC * WHERE { ?s ?p ?o }");
    await expect(page.getByRole("alert")).toContainText(/syntaxe|SPARQL/i);
    await page.screenshot({ path: `${SHOT}/02-syntax-error.png` });
  });

  test("requête vide : exécution refusée sans plantage", async ({ page }) => {
    await page.getByLabel("Requête SPARQL").fill("");
    await page.getByRole("button", { name: "Exécuter", exact: true }).click();
    await expect(page.getByLabel("Requête SPARQL")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(/vide/i);
  });

  for (const [name, q, re] of [
    ["SERVICE (SSRF)", "SELECT * WHERE { SERVICE <http://127.0.0.1:9/x> { ?s ?p ?o } }", /SERVICE/],
    ["FROM <file://…> (lecture de fichier)", "SELECT * FROM <file:///etc/passwd> WHERE { ?s ?p ?o }", /FROM|interdit/i],
    ["USING <file://…> (lecture de fichier via Update)", "INSERT { ?s ?p ?o } USING <file:///etc/passwd> WHERE { ?s ?p ?o }", /USING|interdit/i],
    ["CLEAR ALL", "CLEAR ALL", /interdit|CLEAR/i],
    ["DROP ALL", "DROP ALL", /interdit|DROP/i],
    ["LOAD", "LOAD <http://127.0.0.1:9/x>", /interdit|LOAD/i],
    ["effacement massif DELETE WHERE { ?s ?p ?o }", "DELETE WHERE { ?s ?p ?o }", /supprimerait|refusée/i],
  ] as const) {
    test(`opération dangereuse refusée : ${name}`, async ({ page }) => {
      await runSparql(page, q);
      await expect(page.getByRole("alert")).toContainText(re);
    });
  }

  test("INSERT DATA puis DELETE DATA : modification réelle et réversible", async ({ page, request }) => {
    const triples = async () => (await (await request.get("http://localhost:4100/api/health")).json()).semantic.triples as number;
    const before = await triples();
    await runSparql(page, 'INSERT DATA { actors:PwSparqlTest a owl:NamedIndividual, actors:Clause ; actors:texteClause "test explorateur" . }');
    await expect(page.getByText(/ajouté|added|\+3|3 triplet/i).first()).toBeVisible();
    expect(await triples()).toBe(before + 3);
    await runSparql(page, 'ASK { actors:PwSparqlTest actors:texteClause "test explorateur" }');
    await expect(page.getByText(/true|vrai|Oui/i).first()).toBeVisible();
    await runSparql(page, 'DELETE DATA { actors:PwSparqlTest a owl:NamedIndividual, actors:Clause ; actors:texteClause "test explorateur" . }');
    await expect.poll(triples).toBe(before);
    await page.screenshot({ path: `${SHOT}/03-update.png`, fullPage: true });
  });
});

test.describe("Recherche NLP (démonstration)", () => {
  // le modèle spaCy est chargé à la première question (≈ 10 s) : on le réchauffe pour ne mesurer que l'interface
  test.beforeAll(async ({ request }) => {
    const r = await request.post("http://localhost:4100/api/nlp/translate", { data: { question: "Quels véhicules ?" }, timeout: 120_000 });
    expect(r.ok()).toBeTruthy();
  });

  async function ask(page: Page, q: string) {
    await page.goto("/app/search");
    await page.getByLabel("Question en langage naturel").fill(q);
    await page.getByRole("button", { name: "Rechercher" }).click();
  }

  test("« Quels véhicules sont assurés par Ahmed ? » : pipeline complet visible", async ({ page }) => {
    await ask(page, "Quels véhicules sont assurés par Ahmed ?");
    await expect(page.getByText("Question comprise et traduite")).toBeVisible();
    for (const t of ["Votre question", "Analyse linguistique (spaCy)", "Intention détectée", "Entités, concepts OWL et synonymes", "Requête SPARQL générée", "Résultats de l'exécution"]) {
      await expect(page.getByRole("heading", { name: t })).toBeVisible();
    }
    await expect(page.getByText("SEARCH_VEHICLE").first()).toBeVisible();
    await expect(page.getByText("AhmedBenAli").first()).toBeVisible();
    await expect(page.getByText("PREFIX actors:").first()).toBeVisible();
    await expect(page.getByText("Voiture_001").first()).toBeVisible();
    await expect(page.getByText(/aucune API LLM/i).first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/04-nlp-ahmed.png`, fullPage: true });
  });

  test("négation : « Quels contrats ne couvrent pas le vol ? » → analyse de la portée + NOT EXISTS", async ({ page }) => {
    await ask(page, "Quels contrats ne couvrent pas le vol ?");
    await expect(page.getByText("Question comprise et traduite")).toBeVisible();
    const neg = page.getByTestId("negation-analysis");
    await expect(neg).toContainText("ne … pas");
    await expect(neg).toContainText("vol");
    await expect(page.getByText("FILTER NOT EXISTS").first()).toBeVisible();
    await expect(page.getByText("Contrat_002").first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/05-nlp-negation.png`, fullPage: true });
  });

  test("rôle incompatible : aucune requête exécutée, message clair", async ({ page }) => {
    await ask(page, "Quels sinistres ont été évalués par l'expert Ahmed ?");
    await expect(page.getByText("Entité introuvable dans l'ontologie")).toBeVisible();
    await expect(page.getByText(/Aucun expert nommé/).first()).toBeVisible();
    await expect(page.getByText("PREFIX actors:")).toHaveCount(0);
    await page.screenshot({ path: `${SHOT}/06-nlp-role-mismatch.png` });
  });

  test("demande d'écriture : refusée (lecture seule)", async ({ page }) => {
    await ask(page, "Supprime tous les contrats");
    await expect(page.getByText("Question non prise en charge")).toBeVisible();
    await expect(page.getByText(/lecture seule/).first()).toBeVisible();
  });

  test("hors domaine : « Je n'ai pas compris », aucune requête", async ({ page }) => {
    await ask(page, "Quel temps fait-il à Paris ?");
    await expect(page.getByText("Clarification nécessaire")).toBeVisible();
    await expect(page.getByText("PREFIX actors:")).toHaveCount(0);
  });

  test("entité ambiguë : clarification demandée", async ({ page }) => {
    await ask(page, "Quels sinistres concernent Trabelsi ?");
    await expect(page.getByText("Clarification nécessaire")).toBeVisible();
    await expect(page.getByText(/ambigu/).first()).toBeVisible();
  });

  test("question 8 de l'énoncé : l'expert Karim est trouvé", async ({ page }) => {
    await ask(page, "Quels sinistres ont été évalués par l'expert Karim ?");
    await expect(page.getByText("Question comprise et traduite")).toBeVisible();
    await expect(page.getByText("Sinistre_001").first()).toBeVisible();
  });

  test("Dictionnaire & intentions : synonymes et intentions consultables", async ({ page }) => {
    await page.goto("/app/search");
    await page.getByRole("button", { name: "Dictionnaire & intentions" }).click();
    await expect(page.getByText("SEARCH_INDEMNIFICATION").first()).toBeVisible();
  });
});

test.describe("Ontology Explorer et dashboard", () => {
  test("le dashboard affiche des KPI calculés et l'état de cohérence", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("Triple store connecté")).toBeVisible();
    await expect(page.getByText(/Cohérente|cohérente/).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOT}/07-dashboard.png`, fullPage: true });
  });

  test("Ontology Explorer : hiérarchie des classes et ontographe", async ({ page }) => {
    await page.goto("/app/ontology");
    await expect(page.getByText("ContratAssurance").first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOT}/08-ontology.png`, fullPage: true });
  });
});
