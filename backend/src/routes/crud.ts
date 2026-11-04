import { Router } from "express";
import { asyncHandler, badRequest } from "../errors.js";
import * as insured from "../domain/insured.js";
import * as vehicles from "../domain/vehicles.js";
import * as contracts from "../domain/contracts.js";
import * as guarantees from "../domain/guarantees.js";
import * as claims from "../domain/claims.js";
import * as expertises from "../domain/expertises.js";
import * as indemnifications from "../domain/indemnifications.js";
import * as experts from "../domain/experts.js";
import { references } from "../domain/references.js";
import { z } from "zod";
import { listQuery } from "../util/common.js";

const id = (req: { params: Record<string, string> }) => {
  const v = req.params.id;
  if (!/^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(v)) throw badRequest("Identifiant invalide.");
  return v;
};

/** Monte les 5 routes REST classiques d'une ressource. */
function resource<TQ, TC, TU>(
  router: Router,
  path: string,
  h: {
    filters: z.ZodType<TQ, z.ZodTypeDef, unknown>;
    create: z.ZodType<TC, z.ZodTypeDef, unknown>;
    update: z.ZodType<TU, z.ZodTypeDef, unknown>;
    list: (q: TQ) => Promise<unknown>;
    get: (id: string) => Promise<unknown>;
    doCreate: (b: TC) => Promise<unknown>;
    doUpdate: (id: string, b: TU) => Promise<unknown>;
    doDelete: (id: string) => Promise<void>;
  },
) {
  router.get(path, asyncHandler(async (req, res) => res.json(await h.list(h.filters.parse(req.query)))));
  router.get(`${path}/:id`, asyncHandler(async (req, res) => res.json(await h.get(id(req)))));
  router.post(path, asyncHandler(async (req, res) => res.status(201).json(await h.doCreate(h.create.parse(req.body)))));
  router.put(`${path}/:id`, asyncHandler(async (req, res) => res.json(await h.doUpdate(id(req), h.update.parse(req.body)))));
  router.patch(`${path}/:id`, asyncHandler(async (req, res) => res.json(await h.doUpdate(id(req), h.update.parse(req.body)))));
  router.delete(`${path}/:id`, asyncHandler(async (req, res) => {
    await h.doDelete(id(req));
    res.status(204).end();
  }));
}

export const crudRouter = Router();

resource(crudRouter, "/insured", {
  filters: insured.insuredFilters, create: insured.insuredCreate, update: insured.insuredUpdate,
  list: insured.listInsured, get: insured.getInsured, doCreate: insured.createInsured, doUpdate: insured.updateInsured, doDelete: insured.deleteInsured,
});
resource(crudRouter, "/vehicles", {
  filters: vehicles.vehicleFilters, create: vehicles.vehicleCreate, update: vehicles.vehicleUpdate,
  list: vehicles.listVehicles, get: vehicles.getVehicle, doCreate: vehicles.createVehicle, doUpdate: vehicles.updateVehicle, doDelete: vehicles.deleteVehicle,
});
resource(crudRouter, "/contracts", {
  filters: contracts.contractFilters, create: contracts.contractCreate, update: contracts.contractUpdate,
  list: contracts.listContracts, get: contracts.getContract, doCreate: contracts.createContract, doUpdate: contracts.updateContract, doDelete: contracts.deleteContract,
});
resource(crudRouter, "/guarantees", {
  filters: guarantees.guaranteeFilters, create: guarantees.guaranteeCreate, update: guarantees.guaranteeUpdate,
  list: guarantees.listGuarantees, get: guarantees.getGuarantee, doCreate: guarantees.createGuarantee, doUpdate: guarantees.updateGuarantee, doDelete: guarantees.deleteGuarantee,
});
resource(crudRouter, "/claims", {
  filters: claims.claimFilters, create: claims.claimCreate, update: claims.claimUpdate,
  list: claims.listClaims, get: claims.getClaim, doCreate: claims.createClaim, doUpdate: claims.updateClaim, doDelete: claims.deleteClaim,
});
resource(crudRouter, "/expertises", {
  filters: expertises.expertiseFilters, create: expertises.expertiseCreate, update: expertises.expertiseUpdate,
  list: expertises.listExpertises, get: expertises.getExpertise, doCreate: expertises.createExpertise, doUpdate: expertises.updateExpertise, doDelete: expertises.deleteExpertise,
});
resource(crudRouter, "/indemnifications", {
  filters: indemnifications.indemnificationFilters, create: indemnifications.indemnificationCreate, update: indemnifications.indemnificationUpdate,
  list: indemnifications.listIndemnifications, get: indemnifications.getIndemnification, doCreate: indemnifications.createIndemnification,
  doUpdate: indemnifications.updateIndemnification, doDelete: indemnifications.deleteIndemnification,
});
resource(crudRouter, "/experts", {
  filters: experts.expertFilters, create: experts.expertCreate, update: experts.expertUpdate,
  list: experts.listExperts, get: experts.getExpert, doCreate: experts.createExpert, doUpdate: experts.updateExpert, doDelete: experts.deleteExpert,
});

// ---- routes spécifiques
crudRouter.get("/guarantee-types", asyncHandler(async (_req, res) => res.json(await guarantees.guaranteeTypes())));
crudRouter.get("/references", asyncHandler(async (_req, res) => res.json(await references())));

const damageFilters = listQuery.extend({ sinistreId: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(), type: z.enum(claims.DAMAGE_TYPES).optional() });
crudRouter.get("/damages", asyncHandler(async (req, res) => res.json(await claims.listDamages(damageFilters.parse(req.query)))));
crudRouter.get("/damages/:id", asyncHandler(async (req, res) => res.json(await claims.getDamage(id(req)))));
crudRouter.post("/claims/:id/damages", asyncHandler(async (req, res) => res.status(201).json(await claims.createDamage(id(req), claims.damageInput.parse(req.body)))));
crudRouter.put("/damages/:id", asyncHandler(async (req, res) => res.json(await claims.updateDamage(id(req), claims.damageUpdate.parse(req.body)))));
crudRouter.delete("/damages/:id", asyncHandler(async (req, res) => {
  await claims.deleteDamage(id(req));
  res.status(204).end();
}));

const simulate = z.object({ coutEstime: z.coerce.number().min(0), franchise: z.coerce.number().min(0).default(0), baremeId: z.string() });
crudRouter.post("/indemnifications-simulate", asyncHandler(async (req, res) => {
  const b = simulate.parse(req.body);
  const ref = (await references()).baremes.find((x) => x.id === b.baremeId);
  if (!ref) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Barème introuvable." } });
  res.json({ montant: indemnifications.computeAmount(b.coutEstime, b.franchise, ref.tauxIndemnisation ?? 1, ref.plafondIndemnisation), bareme: ref });
}));
