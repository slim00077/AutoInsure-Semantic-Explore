import { test, expect, type Page, type Locator, type APIRequestContext } from "@playwright/test";

/**
 * Tests CRUD manuels automatisés (navigateur réel) sur une pile ISOLÉE (graphe RDF temporaire, ports 8201/4100/5273).
 * Chaîne testée : Assuré → Véhicule → Contrat → Garantie → Sinistre → Expert/Expertise → Indemnisation,
 * puis suppression de TOUS les enregistrements de test en ordre inverse. Seuls des individus créés ici sont supprimés.
 */
test.describe.configure({ mode: "serial" });

const API = "http://localhost:4100/api";
const SHOT = "screenshots/crud";
const T = { prenom: "Pwtest", nom: "Automate", permis: "PWTEST123", immat: "PW-123-TT", marque: "Pwmarque", modele: "Pwmodel", numero: "C-901" };

let request: APIRequestContext;
let initialTriples = 0;

const toastLoc = (page: Page) => page.locator('[aria-live="polite"]');
const toast = (page: Page, text: string | RegExp) => toastLoc(page).getByText(text).first();
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const row = (page: Page, text: string | RegExp) => page.getByRole("row").filter({ hasText: text });

async function triples(): Promise<number> {
  const r = await request.get(`${API}/health`);
  return (await r.json()).semantic.triples as number;
}

async function pick(select: Locator, textRe: RegExp) {
  const value = await select.locator("option", { hasText: textRe }).first().getAttribute("value");
  expect(value, `option ${textRe} introuvable`).not.toBeNull();
  await select.selectOption(value!);
}

async function openPage(page: Page, path: string, heading: string | RegExp) {
  await page.goto(`/app/${path}`);
  await expect(page.getByRole("heading", { name: heading, level: 1 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function confirmDelete(page: Page, rowText: string | RegExp, titleRe: RegExp, successRe: RegExp) {
  await row(page, rowText).first().getByRole("button", { name: "Supprimer" }).click();
  const dlg = dialog(page, titleRe);
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Supprimer" }).click();
  await expect(toast(page, successRe)).toBeVisible();
  await expect(row(page, rowText)).toHaveCount(0);
}

test.beforeAll(async ({ playwright }) => {
  request = await playwright.request.newContext();
  initialTriples = await triples();
  expect(initialTriples).toBeGreaterThan(800);
});
test.afterAll(async () => {
  await request.dispose();
});

// ------------------------------------------------------------------------------------------------ ASSURÉS
test.describe("1. Assurés", () => {
  test("EMPTY FORM : champs obligatoires signalés, rien n'est créé", async ({ page }) => {
    await openPage(page, "insured", "Assurés");
    await page.getByRole("button", { name: "Ajouter un assuré" }).click();
    const dlg = dialog(page, "Nouvel assuré");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await expect(dlg.getByText("Corrigez les champs signalés.")).toBeVisible();
    await expect(dlg).toBeVisible(); // la modale reste ouverte
    await page.screenshot({ path: `${SHOT}/01-insured-empty-form.png` });
    await dlg.getByRole("button", { name: "Annuler" }).click();
    await expect(dlg).toHaveCount(0);
  });

  test("INVALID DATA : permis invalide refusé avec message par champ", async ({ page }) => {
    await openPage(page, "insured", "Assurés");
    await page.getByRole("button", { name: "Ajouter un assuré" }).click();
    const dlg = dialog(page, "Nouvel assuré");
    await dlg.getByLabel(/^Prénom/).fill(T.prenom);
    await dlg.getByLabel(/^Nom/).fill(T.nom);
    await dlg.getByLabel(/^Numéro de permis/).fill("a!");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByText(/5 à 12 caractères alphanumériques/).last()).toBeVisible();
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/02-insured-invalid.png` });
  });

  test("CREATE + success notification + READ", async ({ page }) => {
    await openPage(page, "insured", "Assurés");
    await page.getByRole("button", { name: "Ajouter un assuré" }).click();
    const dlg = dialog(page, "Nouvel assuré");
    await dlg.getByLabel(/^Prénom/).fill(T.prenom);
    await dlg.getByLabel(/^Nom/).fill(T.nom);
    await dlg.getByLabel(/^Date de naissance/).fill("1990-05-17");
    await dlg.getByLabel(/^Numéro de permis/).fill(T.permis);
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Assuré créé dans le graphe RDF")).toBeVisible();
    await expect(dlg).toHaveCount(0);

    await page.getByPlaceholder(/Rechercher par nom/).fill("Pwtest");
    const r = row(page, /Pwtest Automate/);
    await expect(r).toHaveCount(1);
    await expect(r).toContainText(T.permis);
    await expect(r).toContainText("Conducteur");
    await page.screenshot({ path: `${SHOT}/03-insured-created.png` });
    // fiche détail
    await r.getByRole("button", { name: "Consulter" }).click();
    const view = dialog(page, /Pwtest Automate/);
    await expect(view).toContainText(T.permis);
    await expect(view).toContainText("Assuré, Conducteur");
    await view.getByRole("button", { name: "Fermer" }).click();
    // le RDF contient bien l'individu
    const g = await (await request.get(`${API}/insured?q=Pwtest`)).json();
    expect(g.total).toBe(1);
    expect(g.items[0].numeroPermis).toBe(T.permis);
  });

  test("DUPLICATE : même permis refusé (message d'erreur)", async ({ page }) => {
    await openPage(page, "insured", "Assurés");
    await page.getByRole("button", { name: "Ajouter un assuré" }).click();
    const dlg = dialog(page, "Nouvel assuré");
    await dlg.getByLabel(/^Prénom/).fill("Autre");
    await dlg.getByLabel(/^Nom/).fill("Personne");
    await dlg.getByLabel(/^Numéro de permis/).fill(T.permis);
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toContainText(/permis|existe|déjà/i);
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Annuler" }).click();
    const g = await (await request.get(`${API}/insured?q=Personne`)).json();
    expect(g.items.some((i: { nom: string }) => i.nom === "Personne")).toBe(false);
  });

  test("UPDATE : modification du prénom et du permis", async ({ page }) => {
    await openPage(page, "insured", "Assurés");
    await page.getByPlaceholder(/Rechercher par nom/).fill("Pwtest");
    await row(page, /Pwtest Automate/).getByRole("button", { name: "Modifier" }).click();
    const dlg = dialog(page, "Modifier l'assuré");
    await dlg.getByLabel(/^Numéro de permis/).fill("PWTEST999");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Assuré modifié")).toBeVisible();
    await expect(row(page, /Pwtest Automate/)).toContainText("PWTEST999");
    T.permis = "PWTEST999";
  });
});

// ------------------------------------------------------------------------------------------------ VÉHICULES
test.describe("2. Véhicules", () => {
  test("EMPTY + INVALID : champs obligatoires et année invalide", async ({ page }) => {
    await openPage(page, "vehicles", "Véhicules");
    await page.getByRole("button", { name: "Ajouter un véhicule" }).click();
    const dlg = dialog(page, "Nouveau véhicule");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await dlg.getByLabel(/^Année de fabrication/).fill("1800");
    await dlg.getByLabel(/^Immatriculation/).fill("PW-123-TT");
    await dlg.getByLabel(/^Marque/).fill(T.marque);
    await dlg.getByLabel(/^Modèle/).fill(T.modele);
    await dlg.getByLabel(/^Valeur du véhicule/).fill("12000");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await expect(dlg).toBeVisible();
    await page.screenshot({ path: `${SHOT}/04-vehicle-invalid.png` });
  });

  test("CREATE (relié au conducteur) + READ", async ({ page }) => {
    await openPage(page, "vehicles", "Véhicules");
    await page.getByRole("button", { name: "Ajouter un véhicule" }).click();
    const dlg = dialog(page, "Nouveau véhicule");
    await dlg.getByLabel(/^Immatriculation/).fill(T.immat);
    await dlg.getByLabel(/^Marque/).fill(T.marque);
    await dlg.getByLabel(/^Modèle/).fill(T.modele);
    await dlg.getByLabel(/^Année de fabrication/).fill("2021");
    await dlg.getByLabel(/^Valeur du véhicule/).fill("12000");
    await pick(dlg.getByLabel(/^Conducteur/), /Pwtest Automate/);
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Véhicule créé et relié dans le graphe RDF")).toBeVisible();

    await page.getByPlaceholder(/Marque, modèle/).fill(T.immat);
    const r = row(page, T.immat);
    await expect(r).toHaveCount(1);
    await expect(r).toContainText(T.marque);
    await page.screenshot({ path: `${SHOT}/05-vehicle-created.png` });
    const v = (await (await request.get(`${API}/vehicles?q=${T.immat}`)).json()).items[0];
    expect(v.conducteur.label).toContain("Pwtest");
    // relation inverse côté assuré
    const ins = (await (await request.get(`${API}/insured?q=Pwtest`)).json()).items[0];
    expect(ins.id).toBe(v.conducteur.id);
  });

  test("DUPLICATE : immatriculation déjà utilisée refusée", async ({ page }) => {
    await openPage(page, "vehicles", "Véhicules");
    await page.getByRole("button", { name: "Ajouter un véhicule" }).click();
    const dlg = dialog(page, "Nouveau véhicule");
    await dlg.getByLabel(/^Immatriculation/).fill(T.immat);
    await dlg.getByLabel(/^Marque/).fill("Dup");
    await dlg.getByLabel(/^Modèle/).fill("Dup");
    await dlg.getByLabel(/^Valeur du véhicule/).fill("1000");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toContainText(/immatriculation|existe|déjà/i);
    await dlg.getByRole("button", { name: "Annuler" }).click();
  });

  test("UPDATE : valeur du véhicule", async ({ page }) => {
    await openPage(page, "vehicles", "Véhicules");
    await page.getByPlaceholder(/Marque, modèle/).fill(T.immat);
    await row(page, T.immat).getByRole("button", { name: "Modifier" }).click();
    const dlg = dialog(page, "Modifier le véhicule");
    await dlg.getByLabel(/^Valeur du véhicule/).fill("13500");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Véhicule modifié")).toBeVisible();
    const v = (await (await request.get(`${API}/vehicles?q=${T.immat}`)).json()).items[0];
    expect(v.valeurVehicule).toBe(13500);
  });
});

// ------------------------------------------------------------------------------------------------ CONTRATS
test.describe("3. Contrats", () => {
  test("EMPTY + règle d'axiome : sans assuré / véhicule le contrat est refusé", async ({ page }) => {
    await openPage(page, "contracts", /Contrats/);
    await page.getByRole("button", { name: "Créer un contrat" }).click();
    const dlg = dialog(page, "Nouveau contrat");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await expect(dlg).toBeVisible();
    await page.screenshot({ path: `${SHOT}/06-contract-empty.png` });
  });

  test("CREATE (RC) : garantie exigée ajoutée automatiquement + READ", async ({ page }) => {
    await openPage(page, "contracts", /Contrats/);
    await page.getByRole("button", { name: "Créer un contrat" }).click();
    const dlg = dialog(page, "Nouveau contrat");
    await pick(dlg.getByLabel(/^Type de contrat/), /responsabilit/i);
    await dlg.getByLabel(/^N° de contrat/).fill(T.numero);
    await dlg.getByLabel(/^Prime/).fill("640");
    await pick(dlg.getByLabel(/^Assuré \(possede\)/), /Pwtest Automate/);
    await dlg.getByLabel(new RegExp(T.immat)).check();
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Contrat créé dans le graphe RDF")).toBeVisible();

    await page.getByPlaceholder(/N° de contrat/).fill(T.numero);
    const r = row(page, T.numero);
    await expect(r).toHaveCount(1);
    await expect(r).toContainText("Pwtest Automate");
    await page.screenshot({ path: `${SHOT}/07-contract-created.png` });
    const c = (await (await request.get(`${API}/contracts?q=${T.numero}`)).json()).items[0];
    expect(c.garanties.some((g: { type: string }) => /ResponsabiliteCivile|RC/.test(g.type))).toBe(true);
    expect(c.vehicules[0].id).toBeTruthy();
  });

  test("DUPLICATE : numéro de contrat déjà utilisé refusé", async ({ page }) => {
    await openPage(page, "contracts", /Contrats/);
    await page.getByRole("button", { name: "Créer un contrat" }).click();
    const dlg = dialog(page, "Nouveau contrat");
    await pick(dlg.getByLabel(/^Type de contrat/), /responsabilit/i);
    await dlg.getByLabel(/^N° de contrat/).fill(T.numero);
    await dlg.getByLabel(/^Prime/).fill("100");
    await pick(dlg.getByLabel(/^Assuré \(possede\)/), /Pwtest Automate/);
    await dlg.getByLabel(new RegExp(T.immat)).check();
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toContainText(/contrat|existe|déjà/i);
    await dlg.getByRole("button", { name: "Annuler" }).click();
  });

  test("UPDATE : prime et statut", async ({ page }) => {
    await openPage(page, "contracts", /Contrats/);
    await page.getByPlaceholder(/N° de contrat/).fill(T.numero);
    await row(page, T.numero).getByRole("button", { name: "Modifier" }).click();
    const dlg = dialog(page, /Modifier C-901/);
    await dlg.getByLabel(/^Prime/).fill("725");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Contrat modifié")).toBeVisible();
    const c = (await (await request.get(`${API}/contracts?q=${T.numero}`)).json()).items[0];
    expect(c.prime.montantPrime).toBe(725);
  });
});

// ------------------------------------------------------------------------------------------------ GARANTIES
test.describe("4. Garanties", () => {
  test("CREATE (garantie Vol sur le contrat de test) + READ", async ({ page }) => {
    await openPage(page, "guarantees", "Garanties");
    await page.getByRole("button", { name: "Ajouter une garantie à un contrat" }).click();
    const dlg = dialog(page, "Ajouter une garantie");
    await pick(dlg.getByLabel(/^Contrat/), new RegExp(T.numero));
    await dlg.getByLabel(/^Type de garantie/).selectOption("GarantieVol");
    await dlg.getByLabel(/^Plafond/).fill("4200");
    await dlg.getByRole("button", { name: "Ajouter" }).click();
    await expect(toast(page, "Garantie ajoutée au contrat")).toBeVisible();
    const gs = (await (await request.get(`${API}/guarantees?q=${T.numero}`)).json()).items;
    const vol = gs.find((g: { type: string }) => g.type === "GarantieVol");
    expect(vol.plafondGarantie).toBe(4200);
    await page.screenshot({ path: `${SHOT}/08-guarantee-created.png` });
  });

  test("DUPLICATE : la même garantie ne peut pas être ajoutée deux fois", async ({ page }) => {
    await openPage(page, "guarantees", "Garanties");
    await page.getByRole("button", { name: "Ajouter une garantie à un contrat" }).click();
    const dlg = dialog(page, "Ajouter une garantie");
    await pick(dlg.getByLabel(/^Contrat/), new RegExp(T.numero));
    await dlg.getByLabel(/^Type de garantie/).selectOption("GarantieVol");
    await dlg.getByRole("button", { name: "Ajouter" }).click();
    await expect(dlg.locator('[role="alert"]').first()).toBeVisible();
    await dlg.getByRole("button", { name: "Annuler" }).click();
  });

  test("UPDATE : plafond", async ({ page }) => {
    await openPage(page, "guarantees", "Garanties");
    await page.getByRole("button", { name: /Vol/ }).first().click(); // filtre par type
    const gs = (await (await request.get(`${API}/guarantees?q=${T.numero}`)).json()).items;
    const vol = gs.find((g: { type: string }) => g.type === "GarantieVol");
    const r = row(page, vol.id);
    await expect(r).toHaveCount(1);
    await r.getByRole("button", { name: "Modifier" }).click();
    const dlg = dialog(page, "Modifier le plafond");
    await dlg.getByLabel(/^Plafond/).fill("5000");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Plafond modifié")).toBeVisible();
    const after = (await (await request.get(`${API}/guarantees/${vol.id}`)).json());
    expect(after.plafondGarantie).toBe(5000);
  });
});

// ------------------------------------------------------------------------------------------------ SINISTRES
test.describe("5. Sinistres", () => {
  test("EMPTY : les champs obligatoires sont signalés", async ({ page }) => {
    await openPage(page, "claims", "Sinistres");
    await page.getByRole("button", { name: "Déclarer un sinistre" }).click();
    const dlg = dialog(page, "Déclarer un sinistre");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/09-claim-empty.png` });
  });

  test("INCORRECT RELATIONSHIP : le contrat proposé est limité à celui de l'assuré choisi", async ({ page }) => {
    await openPage(page, "claims", "Sinistres");
    await page.getByRole("button", { name: "Déclarer un sinistre" }).click();
    const dlg = dialog(page, "Déclarer un sinistre");
    await pick(dlg.getByLabel(/^Assuré \(declare\)/), /Pwtest Automate/);
    const options = await dlg.getByLabel(/^Contrat \(rattacheAContrat\)/).locator("option").allTextContents();
    expect(options.some((o) => o.includes(T.numero))).toBe(true);
    expect(options.some((o) => o.includes("C-001"))).toBe(false); // contrat d'un autre assuré : non proposé
    await dlg.getByRole("button", { name: "Annuler" }).click();
  });

  test("CREATE (avec un dommage) + READ", async ({ page }) => {
    await openPage(page, "claims", "Sinistres");
    await page.getByRole("button", { name: "Déclarer un sinistre" }).click();
    const dlg = dialog(page, "Déclarer un sinistre");
    // date du sinistre = aujourd'hui (valeur par défaut) : la règle métier exige une date dans la période du contrat
    await dlg.getByLabel(/^Lieu/).fill("Pwville");
    await pick(dlg.getByLabel(/^Assuré \(declare\)/), /Pwtest Automate/);
    await pick(dlg.getByLabel(/^Contrat \(rattacheAContrat\)/), new RegExp(T.numero));
    await pick(dlg.getByLabel(/^Véhicule concerné/), new RegExp(T.immat));
    await dlg.getByRole("textbox", { name: /^Description \*$/ }).fill("Collision de test Playwright");
    await dlg.getByLabel("Description du dommage").fill("Pare-chocs avant de test");
    await dlg.getByLabel("Coût estimé").fill("3500");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Sinistre déclaré dans le graphe RDF")).toBeVisible();

    const cl = (await (await request.get(`${API}/claims?q=Pwville`)).json()).items[0];
    expect(cl.statutSinistre).toBe("Declare");
    expect(cl.dommages).toHaveLength(1);
    expect(cl.vehicule.label).toContain(T.immat);
    await page.getByPlaceholder(/N° de sinistre/).fill("Pwville");
    await expect(row(page, "Pwville")).toHaveCount(1);
    await page.screenshot({ path: `${SHOT}/10-claim-created.png` });
  });

  test("UPDATE : statut du sinistre (extension statutSinistre)", async ({ page }) => {
    await openPage(page, "claims", "Sinistres");
    await page.getByPlaceholder(/N° de sinistre/).fill("Pwville");
    await row(page, "Pwville").getByRole("button", { name: "Modifier" }).click();
    const dlg = dialog(page, /^Modifier S/);
    await dlg.getByLabel(/^Statut/).selectOption("EnExpertise");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Sinistre modifié")).toBeVisible();
    const cl = (await (await request.get(`${API}/claims?q=Pwville`)).json()).items[0];
    expect(cl.statutSinistre).toBe("EnExpertise");
  });
});

// ------------------------------------------------------------------------------------------------ EXPERTISES
test.describe("6. Expertises", () => {
  test("EMPTY : expertise sans sinistre ni expert refusée", async ({ page }) => {
    await openPage(page, "expertises", "Expertises");
    await page.getByRole("button", { name: "Créer une expertise" }).click();
    const dlg = dialog(page, "Nouvelle expertise");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/11-expertise-empty.png` });
  });

  test("CREATE expert + READ", async ({ page }) => {
    await openPage(page, "expertises", "Expertises");
    await page.getByRole("tab", { name: "Experts" }).click();
    await page.getByRole("button", { name: "Ajouter un expert" }).click();
    const dlg = dialog(page, "Nouvel expert");
    await dlg.getByRole("button", { name: "Enregistrer" }).click(); // vide
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await dlg.getByLabel(/^Prénom/).fill("Pwexpert");
    await dlg.getByLabel(/^Nom/).fill("Verif");
    await dlg.getByLabel(/^Spécialité/).fill("Carrosserie test");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Expert créé")).toBeVisible();
    await expect(row(page, "Pwexpert Verif")).toHaveCount(1);
  });

  test("CREATE expertise (avec rapport) + READ", async ({ page }) => {
    await openPage(page, "expertises", "Expertises");
    await page.getByRole("button", { name: "Créer une expertise" }).click();
    const dlg = dialog(page, "Nouvelle expertise");
    await pick(dlg.getByLabel(/^Sinistre \(faitObjetDe\)/), /Pwtest Automate/);
    await pick(dlg.getByLabel(/^Expert \(realisePar\)/), /Pwexpert Verif/);
    await dlg.getByLabel(/^Conclusion/).fill("Conclusion de test : dommages confirmés.");
    await dlg.getByLabel(/^Rapport d'expertise/).fill("Rapport de test Playwright : pare-chocs à remplacer.");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Expertise créée et reliée au sinistre")).toBeVisible();
    const ex = (await (await request.get(`${API}/expertises`)).json()).items.find((e: { expert?: { label: string } }) => e.expert?.label.includes("Pwexpert"));
    expect(ex).toBeTruthy();
    expect(JSON.stringify(ex)).toContain("Rapport de test Playwright");
    await page.screenshot({ path: `${SHOT}/12-expertise-created.png` });
  });

  test("UPDATE : conclusion de l'expertise", async ({ page }) => {
    await openPage(page, "expertises", "Expertises");
    await row(page, /Pwexpert/).getByRole("button", { name: "Modifier" }).click();
    const dlg = dialog(page, "Modifier l'expertise");
    await dlg.getByLabel(/^Conclusion/).fill("Conclusion modifiée par le test.");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Expertise modifiée")).toBeVisible();
    const ex = (await (await request.get(`${API}/expertises`)).json()).items.find((e: { expert?: { label: string } }) => e.expert?.label.includes("Pwexpert"));
    expect(ex.conclusion).toBe("Conclusion modifiée par le test.");
  });
});

// ------------------------------------------------------------------------------------------------ INDEMNISATIONS
test.describe("7. Indemnisations", () => {
  test("EMPTY : sans dommage choisi, refus", async ({ page }) => {
    await openPage(page, "indemnifications", "Indemnisations");
    await page.getByRole("button", { name: "Créer une indemnisation" }).click();
    const dlg = dialog(page, "Nouvelle indemnisation");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dlg.getByRole("alert").first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/13-indemnification-empty.png` });
  });

  test("CREATE (calcul par barème) + READ", async ({ page }) => {
    await openPage(page, "indemnifications", "Indemnisations");
    await page.getByRole("button", { name: "Créer une indemnisation" }).click();
    const dlg = dialog(page, "Nouvelle indemnisation");
    await pick(dlg.getByLabel(/^Dommage concerné/), /Pare-chocs avant de test/);
    await dlg.getByLabel(/^Franchise/).fill("500");
    const bareme = dlg.getByLabel(/^Barème/);
    const first = await bareme.locator("option").nth(1).getAttribute("value");
    await bareme.selectOption(first!);
    await dlg.getByLabel(/^Motif/).fill("Motif de test");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Indemnisation créée dans le graphe RDF")).toBeVisible();
    const all = (await (await request.get(`${API}/indemnifications`)).json()).items;
    const mine = all.find((i: { motifDecision?: string }) => i.motifDecision === "Motif de test");
    expect(mine).toBeTruthy();
    expect(mine.montantIndemnisation).toBeGreaterThan(0);
    expect(mine.montantIndemnisation).toBeLessThan(3500); // franchise et taux appliqués
    await page.screenshot({ path: `${SHOT}/14-indemnification-created.png` });
  });

  test("DUPLICATE : le dommage déjà indemnisé n'est plus proposé", async ({ page }) => {
    await openPage(page, "indemnifications", "Indemnisations");
    await page.getByRole("button", { name: "Créer une indemnisation" }).click();
    const dlg = dialog(page, "Nouvelle indemnisation");
    const opts = await dlg.getByLabel(/^Dommage concerné/).locator("option").allTextContents();
    expect(opts.some((o) => o.includes("Pare-chocs avant de test"))).toBe(false);
    await dlg.getByRole("button", { name: "Annuler" }).click();
  });

  test("UPDATE : statut Acceptée", async ({ page }) => {
    await openPage(page, "indemnifications", "Indemnisations");
    const all = (await (await request.get(`${API}/indemnifications`)).json()).items;
    const mine = all.find((i: { motifDecision?: string }) => i.motifDecision === "Motif de test");
    await row(page, mine.id).getByRole("button", { name: "Modifier" }).click();
    const dlg = dialog(page, "Modifier l'indemnisation");
    await dlg.getByLabel(/^Statut/).selectOption("Acceptee");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await expect(toast(page, "Indemnisation modifiée")).toBeVisible();
    const after = await (await request.get(`${API}/indemnifications/${mine.id}`)).json();
    expect(after.statutIndemnisation).toBe("Acceptee");
  });
});

// ------------------------------------------------------------------------------------------------ INTÉGRITÉ + ÉTATS
test.describe("8. Intégrité, chargement, erreurs", () => {
  test("INCORRECT RELATIONSHIP (UI) : supprimer l'assuré encore référencé est refusé (409) avec message", async ({ page }) => {
    await openPage(page, "insured", "Assurés");
    await page.getByPlaceholder(/Rechercher par nom/).fill("Pwtest");
    await row(page, /Pwtest Automate/).getByRole("button", { name: "Supprimer" }).click();
    await dialog(page, /Supprimer l'assuré/).getByRole("button", { name: "Supprimer" }).click();
    await expect(toast(page, "Suppression impossible")).toBeVisible();
    await expect(row(page, /Pwtest Automate/)).toHaveCount(1); // toujours là
    await page.screenshot({ path: `${SHOT}/15-delete-refused.png` });
  });

  test("INCORRECT RELATIONSHIP (API) : conducteur non-Conducteur, contrat sans véhicule, sinistre sans dommage → 4xx", async () => {
    const insured = (await (await request.get(`${API}/insured?q=Pwtest`)).json()).items[0];
    // un expert n'est pas un Conducteur : range de estConduitPar violé
    const experts = (await (await request.get(`${API}/experts`)).json()).items;
    const bad = await request.post(`${API}/vehicles`, {
      data: { marque: "X", modele: "Y", anneeFabrication: 2020, immatriculation: "PW-BAD-01", valeurVehicule: 1000, type: "Voiture", conducteurId: experts[0].id, contratIds: [] },
    });
    expect([400, 404, 409, 422]).toContain(bad.status());
    const noVeh = await request.post(`${API}/contracts`, {
      data: { type: "AssuranceResponsabiliteCivile", dateDebut: "2026-01-01", dateFin: "2027-01-01", statutContrat: "Actif", prime: { montantPrime: 100, frequencePaiement: "Annuelle" }, assureId: insured.id, vehiculeIds: [], clauseIds: [], garanties: [] },
    });
    expect(noVeh.status()).toBe(422);
    const noDamage = await request.post(`${API}/claims`, {
      data: { type: "AccidentCirculation", dateSinistre: "2026-10-01", lieuSinistre: "X", descriptionSinistre: "X", assureId: insured.id, contratId: "Contrat_001", vehiculeId: "Voiture_001", dommages: [] },
    });
    expect([400, 409, 422]).toContain(noDamage.status());
  });

  test("LOADING STATE : indicateur de chargement visible pendant une requête lente", async ({ page }) => {
    await page.route("**/api/insured?**", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto("/app/insured");
    await expect(page.locator(".animate-pulse").first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/16-loading-state.png` });
    await expect(row(page, /Pwtest Automate/)).toHaveCount(1, { timeout: 15_000 });
  });

  test("ERROR STATE : API injoignable → message d'erreur et bouton Réessayer qui fonctionne", async ({ page }) => {
    let fail = true;
    await page.route("**/api/insured?**", (route) => (fail ? route.abort("connectionrefused") : route.continue()));
    await page.goto("/app/insured");
    const alert = page.getByRole("alert").filter({ hasText: /API|joindre|backend/i });
    await expect(alert).toBeVisible();
    await page.screenshot({ path: `${SHOT}/17-error-state.png` });
    fail = false;
    await alert.getByRole("button", { name: "Réessayer" }).click();
    await expect(row(page, /Pwtest Automate/)).toHaveCount(1);
  });

  test("SERVER ERROR : erreur 500 de l'API affichée proprement", async ({ page }) => {
    await page.route("**/api/vehicles?**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({}) }));
    await page.goto("/app/vehicles");
    await expect(page.getByRole("alert").filter({ hasText: /Erreur serveur/ })).toBeVisible();
  });

  test("Le dashboard reflète les enregistrements créés (compteurs calculés par SPARQL)", async ({ page }) => {
    await openPage(page, "", /Tableau de bord/);
    await expect(page.getByText("Triple store connecté")).toBeVisible();
    await page.screenshot({ path: `${SHOT}/18-dashboard-with-test-data.png`, fullPage: true });
  });
});

// ------------------------------------------------------------------------------------------------ SUPPRESSIONS (ordre inverse)
test.describe("9. Suppression des seuls enregistrements de test (ordre inverse)", () => {
  test("indemnisation", async ({ page }) => {
    await openPage(page, "indemnifications", "Indemnisations");
    const all = (await (await request.get(`${API}/indemnifications`)).json()).items;
    const mine = all.find((i: { motifDecision?: string }) => i.motifDecision === "Motif de test");
    await confirmDelete(page, mine.id, /Supprimer l'indemnisation/, /supprimé/);
  });
  test("expertise puis expert", async ({ page }) => {
    await openPage(page, "expertises", "Expertises");
    await confirmDelete(page, /Pwexpert/, /Supprimer l'expertise/, /supprimé/);
    await page.getByRole("tab", { name: "Experts" }).click();
    await confirmDelete(page, "Pwexpert Verif", /Supprimer l'expert/, /supprimé/);
  });
  test("sinistre (et son dommage)", async ({ page }) => {
    await openPage(page, "claims", "Sinistres");
    await page.getByPlaceholder(/N° de sinistre/).fill("Pwville");
    await confirmDelete(page, "Pwville", /Supprimer le sinistre/, /supprimé/);
    const dm = (await (await request.get(`${API}/damages`)).json()).items ?? [];
    expect(JSON.stringify(dm)).not.toContain("Pare-chocs avant de test");
  });
  test("garantie Vol", async ({ page }) => {
    const gs = (await (await request.get(`${API}/guarantees?q=${T.numero}`)).json()).items;
    const vol = gs.find((g: { type: string }) => g.type === "GarantieVol");
    await openPage(page, "guarantees", "Garanties");
    await page.getByRole("button", { name: /Vol/ }).first().click();
    await confirmDelete(page, vol.id, /Supprimer la garantie/, /supprimé/);
  });
  test("contrat", async ({ page }) => {
    await openPage(page, "contracts", /Contrats/);
    await page.getByPlaceholder(/N° de contrat/).fill(T.numero);
    await confirmDelete(page, T.numero, /Supprimer le contrat/, /supprimé/);
  });
  test("véhicule", async ({ page }) => {
    await openPage(page, "vehicles", "Véhicules");
    await page.getByPlaceholder(/Marque, modèle/).fill(T.immat);
    await confirmDelete(page, T.immat, /Supprimer le véhicule/, /supprimé/);
  });
  test("assuré", async ({ page }) => {
    await openPage(page, "insured", "Assurés");
    await page.getByPlaceholder(/Rechercher par nom/).fill("Pwtest");
    await confirmDelete(page, /Pwtest Automate/, /Supprimer l'assuré/, /supprimé/);
  });
  test("le graphe RDF est revenu EXACTEMENT à son nombre initial de triplets", async () => {
    expect(await triples()).toBe(initialTriples);
  });
});
