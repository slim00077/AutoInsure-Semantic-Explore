import { z } from "zod";
import { HttpError, notFound } from "../errors.js";
import { loadGraph, type Graph } from "../semantic/graph.js";
import { UpdateBuilder, dec, int, str, withWriteLock } from "../semantic/sparql.js";
import { Minter, assertIndividual, ensureUnique, idStr, listQuery, money, mustExist, paginate, refuseIfReferenced, ref, textStr } from "../util/common.js";
import { logActivity } from "../util/jsonLog.js";

export const VEHICLE_TYPES = ["Voiture", "Moto", "Camion"] as const;
const year = new Date().getFullYear() + 1;

export const vehicleCreate = z.object({
  marque: textStr(40),
  modele: textStr(40),
  anneeFabrication: z.coerce.number().int().min(1950, "≥ 1950").max(year, `≤ ${year}`),
  immatriculation: z.string().trim().regex(/^[A-Za-z0-9 -]{3,15}$/, "3 à 15 caractères (lettres, chiffres, tiret, espace)"),
  valeurVehicule: money,
  type: z.enum(VEHICLE_TYPES).default("Voiture"),
  conducteurId: idStr.optional().nullable(),
  contratIds: z.array(idStr).default([]),
});
export const vehicleUpdate = vehicleCreate.partial();
export const vehicleFilters = listQuery.extend({
  type: z.enum(VEHICLE_TYPES).optional(),
  marque: z.string().max(40).optional(),
  assureId: idStr.optional(),
  contratId: idStr.optional(),
});

export function vehicleDto(g: Graph, id: string) {
  const contrats = g.referencedBy(id).filter((r) => r.prop === "couvre").map((r) => r.from);
  const owners = [...new Set(contrats.flatMap((c) => g.referencedBy(c).filter((r) => r.prop === "possede").map((r) => r.from)))];
  const type = g.subtypeOf(id, "Vehicule") ?? "Vehicule";
  return {
    id,
    uri: `http://www.semanticweb.org/assurance/actors#${id}`,
    label: g.label(id),
    marque: g.str(id, "marque"),
    modele: g.str(id, "modele"),
    anneeFabrication: g.num(id, "anneeFabrication"),
    immatriculation: g.str(id, "immatriculation"),
    valeurVehicule: g.num(id, "valeurVehicule"),
    type,
    conducteur: ref(g, g.link(id, "estConduitPar")),
    assures: owners.map((o) => ref(g, o)),
    contrats: contrats.sort().map((c) => ({ id: c, numero: g.str(c, "numeroContrat"), statut: g.str(c, "statutContrat") })),
    sinistres: g.referencedBy(id).filter((r) => r.prop === "concerne").map((r) => ({ id: r.from, numero: g.str(r.from, "numeroSinistre") })),
    garages: g.referencedBy(id).filter((r) => r.prop === "repare").map((r) => ref(g, r.from)),
  };
}

export async function listVehicles(q: z.infer<typeof vehicleFilters>) {
  const g = await loadGraph();
  let items = g.ofClass("Vehicule").map((v) => vehicleDto(g, v.id));
  if (q.type) items = items.filter((v) => v.type === q.type);
  if (q.marque) items = items.filter((v) => v.marque?.toLowerCase() === q.marque!.toLowerCase());
  if (q.assureId) items = items.filter((v) => v.assures.some((a) => a?.id === q.assureId));
  if (q.contratId) items = items.filter((v) => v.contrats.some((c) => c.id === q.contratId));
  return paginate(items, q, (v) => `${v.id} ${v.marque} ${v.modele} ${v.immatriculation} ${v.assures.map((a) => a?.label).join(" ")}`);
}

export async function getVehicle(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "Vehicule", "Véhicule");
  return vehicleDto(g, id);
}

function checkLinks(g: Graph, input: { conducteurId?: string | null; contratIds?: string[] }) {
  if (input.conducteurId) assertIndividual(g, input.conducteurId, "Conducteur", "Conducteur", "conducteurId");
  for (const c of input.contratIds ?? []) assertIndividual(g, c, "ContratAssurance", "Contrat", "contratIds");
}

export function createVehicle(input: z.infer<typeof vehicleCreate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    checkLinks(g, input);
    ensureUnique(g, "Vehicule", "immatriculation", input.immatriculation, null, "Immatriculation");
    const id = new Minter(g).next(input.type);
    const u = new UpdateBuilder().node(id, [input.type], [
      ["marque", str(input.marque)],
      ["modele", str(input.modele)],
      ["anneeFabrication", int(input.anneeFabrication)],
      ["immatriculation", str(input.immatriculation)],
      ["valeurVehicule", dec(input.valeurVehicule)],
    ]);
    if (input.conducteurId) u.link(id, "estConduitPar", input.conducteurId);
    for (const c of new Set(input.contratIds)) u.link(c, "couvre", id, "estCouvertPar");
    await u.run();
    logActivity("create", "Véhicule", id, `${input.marque} ${input.modele}`);
    return vehicleDto(await loadGraph(), id);
  });
}

export function updateVehicle(id: string, input: z.infer<typeof vehicleUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "Vehicule", "Véhicule");
    checkLinks(g, input);
    if (input.immatriculation) ensureUnique(g, "Vehicule", "immatriculation", input.immatriculation, id, "Immatriculation");
    const u = new UpdateBuilder();
    const set = (p: string, v: unknown, enc: (x: never) => string) => {
      if (v === undefined) return;
      u.clear(id, p).add(id, p, enc(v as never));
    };
    set("marque", input.marque, str);
    set("modele", input.modele, str);
    set("anneeFabrication", input.anneeFabrication, int);
    set("immatriculation", input.immatriculation, str);
    set("valeurVehicule", input.valeurVehicule, dec);
    if (input.type && input.type !== g.subtypeOf(id, "Vehicule")) {
      const old = g.subtypeOf(id, "Vehicule");
      if (old && old !== "Vehicule") u.removeType(id, old);
      u.addType(id, input.type);
    }
    if (input.conducteurId !== undefined) {
      u.clear(id, "estConduitPar");
      if (input.conducteurId) u.link(id, "estConduitPar", input.conducteurId);
    }
    if (input.contratIds !== undefined) {
      const wanted = new Set(input.contratIds);
      const current = g.referencedBy(id).filter((r) => r.prop === "couvre").map((r) => r.from);
      for (const c of current) {
        if (wanted.has(c)) continue;
        if (g.links(c, "couvre").length <= 1) {
          throw new HttpError(422, "VALIDATION_ERROR", `Le contrat ${g.str(c, "numeroContrat")} doit couvrir au moins un véhicule (axiome OWL) : impossible de retirer ${g.label(id)}.`);
        }
        u.unlink(c, "couvre", id, "estCouvertPar");
      }
      for (const c of wanted) if (!current.includes(c)) u.link(c, "couvre", id, "estCouvertPar");
    }
    await u.run();
    logActivity("update", "Véhicule", id, g.label(id));
    return vehicleDto(await loadGraph(), id);
  });
}

export function deleteVehicle(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "Vehicule")) throw notFound("Véhicule");
    refuseIfReferenced(g, id, `Le véhicule ${g.label(id)}`, ["repare", "estCouvertPar"]);
    await new UpdateBuilder().drop(id).run();
    logActivity("delete", "Véhicule", id, g.label(id));
  });
}
