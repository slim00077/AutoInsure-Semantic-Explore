import { describe, expect, it } from "vitest";
import { api, stats } from "./helpers.js";

/**
 * Cycle de vie complet : chaque entité est créée, relue, modifiée, interrogée en SPARQL puis supprimée,
 * et le graphe RDF doit revenir exactement à son état initial (comptage de triplets).
 */
describe("CRUD sur les données RDF/OWL", () => {
  const state: Record<string, string> = {};
  let initialTriples = 0;

  it("état initial", async () => {
    initialTriples = (await stats()).ontology.triples;
    expect(initialTriples).toBeGreaterThan(800);
  });

  describe("Assurés", () => {
    it("crée un assuré (URI stable, rôle Conducteur) et le retrouve", async () => {
      const r = await api.post("/api/insured").send({ prenom: "Sonia", nom: "Mansour", dateNaissance: "1992-03-09", numeroPermis: "B9988776", conducteur: true });
      expect(r.status).toBe(201);
      expect(r.body.id).toBe("SoniaMansour");
      expect(r.body).toMatchObject({ prenom: "Sonia", nom: "Mansour", dateNaissance: "1992-03-09", conducteur: true });
      state.insured = r.body.id;
      const g = await api.get(`/api/insured/${state.insured}`);
      expect(g.status).toBe(200);
      const ask = await api.post("/api/sparql/query").send({ query: "ASK { actors:SoniaMansour a actors:Assure, actors:Conducteur ; actors:nom 'Mansour' }" });
      expect(ask.body.boolean).toBe(true);
    });

    it("refuse les doublons (identité, numéro de permis) et les données invalides", async () => {
      const dup = await api.post("/api/insured").send({ prenom: "Sonia", nom: "Mansour", dateNaissance: "1992-03-09" });
      expect(dup.status).toBe(409);
      const permis = await api.post("/api/insured").send({ prenom: "Autre", nom: "Personne", numeroPermis: "B9988776" });
      expect(permis.status).toBe(409);
      const bad = await api.post("/api/insured").send({ prenom: "", nom: "X1", dateNaissance: "2025-13-45" });
      expect(bad.status).toBe(422);
      expect(bad.body.error.code).toBe("VALIDATION_ERROR");
      expect(bad.body.error.details.length).toBeGreaterThanOrEqual(2);
    });

    it("recherche et filtre", async () => {
      const q = await api.get("/api/insured?q=mansour");
      expect(q.body.total).toBe(1);
      const f = await api.get("/api/insured?hasContrat=false");
      expect(f.body.items.map((i: { id: string }) => i.id)).toContain("SoniaMansour");
      const none = await api.get("/api/insured?q=zzzz");
      expect(none.body.total).toBe(0);
    });

    it("modifie un assuré sans changer son URI", async () => {
      const r = await api.put(`/api/insured/${state.insured}`).send({ nom: "Mansouri", numeroPermis: "B9988777" });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ id: "SoniaMansour", nom: "Mansouri", numeroPermis: "B9988777" });
    });
  });

  describe("Véhicules", () => {
    it("crée un véhicule lié à son conducteur", async () => {
      const r = await api.post("/api/vehicles").send({ marque: "Kia", modele: "Picanto", anneeFabrication: 2021, immatriculation: "190TN1234", valeurVehicule: 26000, type: "Voiture", conducteurId: state.insured });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ id: "Voiture_003", marque: "Kia", type: "Voiture" });
      expect(r.body.conducteur.id).toBe("SoniaMansour");
      state.vehicle = r.body.id;
    });

    it("refuse une immatriculation dupliquée, un conducteur invalide et un type inconnu", async () => {
      const base = { marque: "A", modele: "B", anneeFabrication: 2020, valeurVehicule: 1000 };
      expect((await api.post("/api/vehicles").send({ ...base, immatriculation: "190TN1234" })).status).toBe(409);
      const wrongRange = await api.post("/api/vehicles").send({ ...base, immatriculation: "777TN1", conducteurId: "Contrat_001" });
      expect(wrongRange.status).toBe(422);
      expect(wrongRange.body.error.message).toMatch(/domaine\/range|Conducteur/);
      expect((await api.post("/api/vehicles").send({ ...base, immatriculation: "888TN1", type: "Avion" })).status).toBe(422);
    });

    it("modifie le véhicule et le filtre par type/marque", async () => {
      const r = await api.put(`/api/vehicles/${state.vehicle}`).send({ valeurVehicule: 24500, anneeFabrication: 2022 });
      expect(r.body.valeurVehicule).toBe(24500);
      const list = await api.get("/api/vehicles?type=Voiture&marque=Kia");
      expect(list.body.items).toHaveLength(1);
    });
  });

  describe("Contrats et garanties", () => {
    it("crée un contrat Tous risques : prime, garanties exigées par les axiomes ajoutées, liens inverses", async () => {
      const r = await api.post("/api/contracts").send({
        type: "AssuranceTousRisques", dateDebut: "2026-10-01", dateFin: "2027-10-01",
        prime: { montantPrime: 1100, frequencePaiement: "Annuelle" },
        assureId: state.insured, vehiculeIds: [state.vehicle],
        garanties: [{ type: "GarantieVol", plafondGarantie: 20000 }],
      });
      expect(r.status).toBe(201);
      state.contract = r.body.id;
      expect(r.body.numeroContrat).toBe("C-005");
      const types = r.body.garanties.map((g: { type: string }) => g.type).sort();
      expect(types).toEqual(["GarantieDommagesTousAccidents", "GarantieResponsabiliteCivile", "GarantieVol"]);
      expect(r.body.autoAddedGuarantees.length).toBe(2);
      expect(r.body.assure.id).toBe(state.insured);
      expect(r.body.compagnie.id).toBe("AssurancePlus");
      const inv = await api.post("/api/sparql/query").send({ query: `ASK { actors:${state.vehicle} actors:estCouvertPar actors:${state.contract} . actors:AssurancePlus actors:propose actors:${state.contract} }` });
      expect(inv.body.boolean).toBe(true);
    });

    it("refuse un contrat sans véhicule, avec dates incohérentes ou références mal typées", async () => {
      const base = { type: "AssuranceResponsabiliteCivile", dateDebut: "2026-10-01", dateFin: "2027-10-01", prime: { montantPrime: 400 }, assureId: state.insured };
      expect((await api.post("/api/contracts").send({ ...base, vehiculeIds: [] })).status).toBe(422);
      expect((await api.post("/api/contracts").send({ ...base, vehiculeIds: [state.vehicle], dateFin: "2025-01-01" })).status).toBe(422);
      const badType = await api.post("/api/contracts").send({ ...base, vehiculeIds: ["AhmedBenAli"] });
      expect(badType.status).toBe(422);
      expect(badType.body.error.message).toMatch(/Vehicule/);
      expect((await api.post("/api/contracts").send({ ...base, vehiculeIds: [state.vehicle], assureId: "Voiture_001" })).status).toBe(422);
    });

    it("liste, filtre et lit le contrat avec garanties et véhicules couverts", async () => {
      const list = await api.get("/api/contracts?garantie=GarantieVol&statut=Actif");
      expect(list.body.items.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining(["Contrat_001", state.contract]));
      const one = await api.get(`/api/contracts/${state.contract}`);
      expect(one.body.vehicules[0].id).toBe(state.vehicle);
    });

    it("gère les garanties : ajout, doublon refusé, exigence d'axiome protégée", async () => {
      const add = await api.post("/api/guarantees").send({ contratId: state.contract, type: "GarantieBrisDeGlace" });
      expect(add.status).toBe(201);
      expect(add.body.plafondGarantie).toBe(2000);
      state.glass = add.body.id;
      expect((await api.post("/api/guarantees").send({ contratId: state.contract, type: "GarantieBrisDeGlace" })).status).toBe(409);
      const upd = await api.put(`/api/guarantees/${state.glass}`).send({ plafondGarantie: 2500 });
      expect(upd.body.plafondGarantie).toBe(2500);
      const rc = (await api.get(`/api/contracts/${state.contract}`)).body.garanties.find((g: { type: string }) => g.type === "GarantieDommagesTousAccidents");
      const del = await api.delete(`/api/guarantees/${rc.id}`);
      expect(del.status).toBe(409);
      expect(del.body.error.message).toMatch(/axiome/);
      expect((await api.delete(`/api/guarantees/${state.glass}`)).status).toBe(204);
      const types = (await api.get("/api/guarantee-types")).body;
      expect(types).toHaveLength(6);
    });

    it("modifie le contrat (statut, prime)", async () => {
      const r = await api.put(`/api/contracts/${state.contract}`).send({ statutContrat: "Resilie", prime: { montantPrime: 1200 } });
      expect(r.body.statutContrat).toBe("Resilie");
      expect(r.body.prime.montantPrime).toBe(1200);
      await api.put(`/api/contracts/${state.contract}`).send({ statutContrat: "Actif" });
    });
  });

  describe("Sinistres, dommages, expertises, indemnisations", () => {
    it("déclare un sinistre relié au véhicule, à l'assuré, au contrat et aux dommages", async () => {
      const r = await api.post("/api/claims").send({
        type: "AccidentCirculation", dateSinistre: "2026-10-20", lieuSinistre: "Bizerte", descriptionSinistre: "Collision à un rond-point.",
        vehiculeId: state.vehicle, assureId: state.insured, contratId: state.contract,
        dommages: [{ type: "DommageMateriel", description: "Aile avant gauche", gravite: "Moyenne", coutEstime: 3000 }],
      });
      expect(r.status).toBe(201);
      state.claim = r.body.id;
      expect(r.body).toMatchObject({ numeroSinistre: "S-004", statutSinistre: "Declare" });
      expect(r.body.vehicule.id).toBe(state.vehicle);
      expect(r.body.assure.id).toBe(state.insured);
      expect(r.body.dommages).toHaveLength(1);
      state.damage = r.body.dommages[0].id;
      const ins = await api.get(`/api/insured/${state.insured}`);
      expect(ins.body.sinistres.map((s: { id: string }) => s.id)).toContain(state.claim);
    });

    it("applique les règles métier : véhicule non couvert, hors période, dommage manquant", async () => {
      const base = { type: "VolVehicule", dateSinistre: "2026-10-20", lieuSinistre: "Tunis", descriptionSinistre: "Vol", vehiculeId: "Voiture_001", assureId: state.insured, contratId: state.contract, dommages: [{ type: "DommageMateriel", description: "x", gravite: "Grave", coutEstime: 1 }] };
      expect((await api.post("/api/claims").send(base)).status).toBe(422); // contrat ne couvre pas Voiture_001
      const late = await api.post("/api/claims").send({ ...base, vehiculeId: state.vehicle, dateSinistre: "2030-01-01" });
      expect(late.status).toBe(422);
      expect(late.body.error.message).toMatch(/période/);
      expect((await api.post("/api/claims").send({ ...base, vehiculeId: state.vehicle, dommages: [] })).status).toBe(422);
    });

    it("ajoute un dommage corporel avec une nouvelle victime", async () => {
      const r = await api.post(`/api/claims/${state.claim}/damages`).send({ type: "DommageCorporel", description: "Contusion", gravite: "Legere", coutEstime: 800, victime: { prenom: "Hedi", nom: "Zouari" } });
      expect(r.status).toBe(201);
      expect(r.body.victime.id).toBe("HediZouari");
      state.damage2 = r.body.id;
      const ask = await api.post("/api/sparql/query").send({ query: "ASK { actors:HediZouari a actors:Victime }" });
      expect(ask.body.boolean).toBe(true);
    });

    it("crée un expert et une expertise avec rapport, associée au sinistre", async () => {
      const ex = await api.post("/api/experts").send({ prenom: "Ahmed", nom: "Kefi", specialite: "Carrosserie" });
      expect(ex.status).toBe(201);
      state.expert = ex.body.id;
      const r = await api.post("/api/expertises").send({ sinistreId: state.claim, expertId: state.expert, dateExpertise: "2026-10-25", conclusion: "Remplacement de l'aile.", rapport: { contenuDocument: "Rapport détaillé" } });
      expect(r.status).toBe(201);
      state.expertise = r.body.id;
      expect(r.body.dommages).toHaveLength(2);
      expect(r.body.rapport.contenuDocument).toBe("Rapport détaillé");
      const claim = await api.get(`/api/claims/${state.claim}`);
      expect(claim.body.statutSinistre).toBe("EnExpertise");
      expect(claim.body.expertises[0].id).toBe(state.expertise);
      const upd = await api.put(`/api/expertises/${state.expertise}`).send({ conclusion: "Aile et phare à remplacer." });
      expect(upd.body.conclusion).toMatch(/phare/);
    });

    it("calcule l'indemnisation avec le barème : (coût − franchise) × taux", async () => {
      const sim = await api.post("/api/indemnifications-simulate").send({ coutEstime: 3000, franchise: 500, baremeId: "Bareme_001" });
      expect(sim.body.montant).toBe(2250);
      const r = await api.post("/api/indemnifications").send({ dommageId: state.damage, baremeId: "Bareme_001", franchiseMontant: 500, statutIndemnisation: "Acceptee", motifDecision: "Couvert par la garantie dommages tous accidents." });
      expect(r.status).toBe(201);
      expect(r.body.montantIndemnisation).toBe(2250);
      expect(r.body.franchise.montantFranchise).toBe(500);
      expect(r.body.franchise.id).toBe("Franchise_001"); // franchise existante réutilisée
      expect(r.body.beneficiaire.id).toBe(state.insured);
      expect(r.body.compagnie.id).toBe("AssurancePlus");
      state.indem = r.body.id;
      expect((await api.get(`/api/claims/${state.claim}`)).body.statutSinistre).toBe("Indemnise");
      expect((await api.post("/api/indemnifications").send({ dommageId: state.damage, montantIndemnisation: 1 })).status).toBe(409);
      const noAmount = await api.post("/api/indemnifications").send({ dommageId: state.damage2 });
      expect(noAmount.status).toBe(422);
    });

    it("met à jour le dashboard immédiatement (statistiques recalculées)", async () => {
      const s = await stats();
      expect(s.entities).toMatchObject({ assures: 4, vehicules: 4, contrats: 5, sinistres: 4, indemnisations: 5, expertises: 3 });
      expect(s.byClaimType.find((x: { name: string }) => x.name === "AccidentCirculation").count).toBe(2);
      expect(s.finance.totalIndemnisationAcceptee).toBe(15660);
    });

    it("modifie une indemnisation et filtre par montant/statut", async () => {
      const r = await api.put(`/api/indemnifications/${state.indem}`).send({ statutIndemnisation: "EnCours", montantIndemnisation: 2300 });
      expect(r.body.montantIndemnisation).toBe(2300);
      const f = await api.get("/api/indemnifications?statut=EnCours&min=2100");
      expect(f.body.items.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining([state.indem]));
    });
  });

  describe("Intégrité référentielle et suppressions", () => {
    it("refuse de supprimer ce qui est encore référencé", async () => {
      for (const url of [`/api/insured/${state.insured}`, `/api/vehicles/${state.vehicle}`, `/api/contracts/${state.contract}`, `/api/experts/${state.expert}`]) {
        const r = await api.delete(url);
        expect(r.status, url).toBe(409);
        expect(r.body.error.code).toBe("CONFLICT");
      }
    });

    it("supprime un sinistre en cascade (dommages, indemnisation, expertise, rapport, déclaration)", async () => {
      expect((await api.delete(`/api/claims/${state.claim}`)).status).toBe(204);
      expect((await api.get(`/api/claims/${state.claim}`)).status).toBe(404);
      expect((await api.get(`/api/expertises/${state.expertise}`)).status).toBe(404);
      expect((await api.get(`/api/indemnifications/${state.indem}`)).status).toBe(404);
      expect((await api.get(`/api/damages/${state.damage}`)).status).toBe(404);
    });

    it("supprime contrat, véhicule, expert, victime puis assuré", async () => {
      expect((await api.delete(`/api/contracts/${state.contract}`)).status).toBe(204);
      expect((await api.delete(`/api/vehicles/${state.vehicle}`)).status).toBe(204);
      expect((await api.delete(`/api/experts/${state.expert}`)).status).toBe(204);
      expect((await api.delete(`/api/insured/${state.insured}`)).status).toBe(204);
      expect((await api.delete(`/api/insured/${state.insured}`)).status).toBe(404);
      await api.post("/api/sparql/update").send({ update: "DELETE WHERE { actors:HediZouari ?p ?o } ; DELETE WHERE { ?s ?p actors:HediZouari }" });
    });

    it("ramène le graphe RDF à son état initial et reste cohérent", async () => {
      const finalTriples = (await stats()).ontology.triples;
      // la franchise réutilisée et les individus de référence n'ont pas été dupliqués
      expect(finalTriples).toBe(initialTriples);
      const v = (await api.get("/api/ontology/validate")).body;
      expect(v.errors).toEqual([]);
    });

    it("renvoie 404 / 400 pour les ressources ou identifiants invalides", async () => {
      expect((await api.get("/api/vehicles/Nope_999")).status).toBe(404);
      expect((await api.get("/api/vehicles/bad id!")).status).toBe(400);
      expect((await api.get("/api/route-inconnue")).status).toBe(404);
      const bad = await api.post("/api/insured").set("Content-Type", "application/json").send("{oops");
      expect(bad.status).toBe(400);
    });
  });

  describe("Injection SPARQL", () => {
    it("neutralise les guillemets et accolades dans les valeurs (littéraux échappés)", async () => {
      const evil = 'Ali" . } ; DROP ALL ; INSERT DATA { actors:Pirate a actors:Assure';
      const r = await api.post("/api/experts").send({ prenom: "Jean", nom: "Dupont", specialite: evil });
      expect(r.status).toBe(201);
      expect(r.body.specialite).toBe(evil);
      const pirate = await api.post("/api/sparql/query").send({ query: "ASK { actors:Pirate ?p ?o }" });
      expect(pirate.body.boolean).toBe(false);
      await api.delete(`/api/experts/${r.body.id}`);
      const nameInj = await api.post("/api/insured").send({ prenom: 'X" ; DROP', nom: "Test" });
      expect(nameInj.status).toBe(422);
    });
  });
});
