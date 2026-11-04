import { z } from "zod";
import { HttpError, notFound } from "../errors.js";
import { loadGraph, type Graph } from "../semantic/graph.js";
import { UpdateBuilder, dateTime, dec, str, withWriteLock } from "../semantic/sparql.js";
import { Minter, assertIndividual, dateStr, idStr, listQuery, money, mustExist, nameStr, paginate, ref, textStr, today } from "../util/common.js";
import { logActivity } from "../util/jsonLog.js";
import { GUARANTEE_TYPES, type GuaranteeType } from "./guarantees.js";

export const CLAIM_TYPES = ["AccidentCirculation", "VolVehicule", "IncendieVehicule", "BrisDeGlace", "CatastropheNaturelle"] as const;
export const CLAIM_TYPE_LABELS: Record<string, string> = {
  AccidentCirculation: "Accident de la circulation",
  VolVehicule: "Vol de véhicule",
  IncendieVehicule: "Incendie de véhicule",
  BrisDeGlace: "Bris de glace",
  CatastropheNaturelle: "Catastrophe naturelle",
};
export const CLAIM_STATUS = ["Declare", "EnExpertise", "EnCours", "Indemnise", "Refuse", "Clos"] as const;
export const DAMAGE_TYPES = ["DommageMateriel", "DommageCorporel", "DommageMoral"] as const;
export const DAMAGE_TYPE_LABELS: Record<string, string> = {
  DommageMateriel: "Dommage matériel",
  DommageCorporel: "Dommage corporel",
  DommageMoral: "Dommage moral",
};
export const SEVERITIES = ["Legere", "Moyenne", "Grave"] as const;

export const damageInput = z.object({
  type: z.enum(DAMAGE_TYPES),
  description: textStr(300),
  gravite: z.enum(SEVERITIES),
  coutEstime: money,
  victimeId: idStr.optional(),
  victime: z.object({ prenom: nameStr, nom: nameStr }).optional(),
});

export const claimCreate = z.object({
  type: z.enum(CLAIM_TYPES),
  dateSinistre: dateStr,
  lieuSinistre: textStr(80),
  descriptionSinistre: textStr(500),
  statutSinistre: z.enum(CLAIM_STATUS).default("Declare"),
  vehiculeId: idStr,
  assureId: idStr,
  contratId: idStr,
  conducteurId: idStr.optional(),
  garantieIds: z.array(idStr).default([]),
  dommages: z.array(damageInput).min(1, "au moins un dommage (axiome OWL)"),
});
export const claimUpdate = claimCreate.omit({ dommages: true }).partial();
export const damageUpdate = damageInput.partial();

export const claimFilters = listQuery.extend({
  type: z.enum(CLAIM_TYPES).optional(),
  statut: z.enum(CLAIM_STATUS).optional(),
  vehiculeId: idStr.optional(),
  assureId: idStr.optional(),
  contratId: idStr.optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
});

export function damageDto(g: Graph, id: string) {
  const type = g.subtypeOf(id, "Dommage") ?? "Dommage";
  const indem = g.link(id, "donneLieuA");
  const claim = g.referencedBy(id).find((r) => r.prop === "provoque")?.from ?? null;
  return {
    id,
    type,
    typeLabel: DAMAGE_TYPE_LABELS[type] ?? type,
    description: g.str(id, "description"),
    gravite: g.str(id, "gravite"),
    coutEstime: g.num(id, "coutEstime"),
    victime: ref(g, g.link(id, "subiPar")),
    sinistre: claim ? { id: claim, numero: g.str(claim, "numeroSinistre") } : null,
    indemnisation: indem ? { id: indem, montant: g.num(indem, "montantIndemnisation"), statut: g.str(indem, "statutIndemnisation") } : null,
    expertises: g.referencedBy(id).filter((r) => r.prop === "evalue").map((r) => r.from),
  };
}

export function claimDto(g: Graph, id: string) {
  const type = g.subtypeOf(id, "Sinistre") ?? "Sinistre";
  const contrat = g.link(id, "rattacheAContrat");
  const decl = g.link(id, "estDocumentePar");
  return {
    id,
    uri: `http://www.semanticweb.org/assurance/actors#${id}`,
    numeroSinistre: g.str(id, "numeroSinistre"),
    type,
    typeLabel: CLAIM_TYPE_LABELS[type] ?? type,
    dateSinistre: g.date(id, "dateSinistre"),
    lieuSinistre: g.str(id, "lieuSinistre"),
    descriptionSinistre: g.str(id, "descriptionSinistre"),
    statutSinistre: g.str(id, "statutSinistre") ?? "Declare",
    vehicule: ref(g, g.link(id, "concerne")),
    assure: ref(g, g.link(id, "estDeclarePar") ?? g.referencedBy(id).find((r) => r.prop === "declare")?.from),
    contrat: contrat ? { id: contrat, numero: g.str(contrat, "numeroContrat") } : null,
    conducteur: ref(g, g.link(id, "implique")),
    garanties: g.links(id, "mobiliseGarantie").map((x) => ({ id: x, type: g.subtypeOf(x, "Garantie"), plafondGarantie: g.num(x, "plafondGarantie") })),
    dommages: g.links(id, "provoque").map((d) => damageDto(g, d)),
    expertises: g.links(id, "faitObjetDe").map((e) => ({ id: e, date: g.date(e, "dateExpertise"), expert: ref(g, g.link(e, "realisePar")) })),
    declaration: decl ? { id: decl, date: g.date(decl, "dateDocument") } : null,
  };
}

export async function listClaims(q: z.infer<typeof claimFilters>) {
  const g = await loadGraph();
  let items = g.ofClass("Sinistre").map((s) => claimDto(g, s.id));
  if (q.type) items = items.filter((c) => c.type === q.type);
  if (q.statut) items = items.filter((c) => c.statutSinistre === q.statut);
  if (q.vehiculeId) items = items.filter((c) => c.vehicule?.id === q.vehiculeId);
  if (q.assureId) items = items.filter((c) => c.assure?.id === q.assureId);
  if (q.contratId) items = items.filter((c) => c.contrat?.id === q.contratId);
  if (q.year) items = items.filter((c) => c.dateSinistre?.startsWith(String(q.year)));
  return paginate(items, q, (c) => `${c.id} ${c.numeroSinistre} ${c.typeLabel} ${c.lieuSinistre} ${c.descriptionSinistre} ${c.assure?.label ?? ""} ${c.vehicule?.label ?? ""}`);
}

export async function getClaim(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "Sinistre", "Sinistre");
  return claimDto(g, id);
}

/** Cohérence métier : le véhicule est couvert par le contrat, l'assuré le possède, la date est dans la période. */
function checkClaimLinks(g: Graph, c: { vehiculeId: string; assureId: string; contratId: string; dateSinistre: string; conducteurId?: string | null; garantieIds?: string[] }) {
  assertIndividual(g, c.vehiculeId, "Vehicule", "Véhicule", "vehiculeId");
  assertIndividual(g, c.assureId, "Assure", "Assuré", "assureId");
  assertIndividual(g, c.contratId, "ContratAssurance", "Contrat", "contratId");
  if (c.conducteurId) assertIndividual(g, c.conducteurId, "Conducteur", "Conducteur", "conducteurId");
  if (!g.links(c.contratId, "couvre").includes(c.vehiculeId)) {
    throw new HttpError(422, "VALIDATION_ERROR", `Le contrat ${g.str(c.contratId, "numeroContrat")} ne couvre pas le véhicule ${g.label(c.vehiculeId)}.`);
  }
  if (!g.links(c.assureId, "possede").includes(c.contratId)) {
    throw new HttpError(422, "VALIDATION_ERROR", `${g.label(c.assureId)} ne possède pas le contrat ${g.str(c.contratId, "numeroContrat")}.`);
  }
  const debut = g.date(c.contratId, "dateDebut");
  const fin = g.date(c.contratId, "dateFin");
  if (debut && fin && (c.dateSinistre < debut || c.dateSinistre > fin)) {
    throw new HttpError(422, "VALIDATION_ERROR", `La date du sinistre (${c.dateSinistre}) est hors de la période du contrat (${debut} → ${fin}).`);
  }
  for (const gid of c.garantieIds ?? []) {
    if (!g.links(c.contratId, "contient").includes(gid)) {
      throw new HttpError(422, "VALIDATION_ERROR", `La garantie ${gid} n'appartient pas au contrat ${g.str(c.contratId, "numeroContrat")}.`);
    }
  }
}

function addDamage(u: UpdateBuilder, g: Graph, m: Minter, claimId: string, d: z.infer<typeof damageInput>, defaultVictim: string) {
  const id = m.next("Dommage");
  let victim = d.victimeId ?? defaultVictim;
  if (d.victimeId) assertIndividual(g, d.victimeId, "Personne", "Victime", "victimeId");
  if (d.victime) {
    victim = m.person(d.victime.prenom, d.victime.nom);
    u.node(victim, ["Victime"], [["nom", str(d.victime.nom)], ["prenom", str(d.victime.prenom)]]);
  }
  u.node(id, [d.type], [
    ["description", str(d.description)],
    ["gravite", str(d.gravite)],
    ["coutEstime", dec(d.coutEstime)],
  ]);
  u.link(id, "subiPar", victim).link(claimId, "provoque", id);
  return id;
}

export function createClaim(input: z.infer<typeof claimCreate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    checkClaimLinks(g, input);
    const m = new Minter(g);
    const id = m.next("Sinistre");
    const declId = m.next("Declaration");
    let numero: string;
    {
      let max = 0;
      for (const s of g.ofClass("Sinistre")) {
        const mm = /^S-(\d+)$/.exec(g.str(s.id, "numeroSinistre") ?? "");
        if (mm) max = Math.max(max, Number(mm[1]));
      }
      numero = `S-${String(max + 1).padStart(3, "0")}`;
    }
    const u = new UpdateBuilder();
    const declDate = today() >= input.dateSinistre ? today() : input.dateSinistre;
    u.node(declId, ["DeclarationSinistre"], [["dateDocument", dateTime(declDate)]]);
    u.node(id, [input.type], [
      ["numeroSinistre", str(numero)],
      ["dateSinistre", dateTime(input.dateSinistre)],
      ["lieuSinistre", str(input.lieuSinistre)],
      ["descriptionSinistre", str(input.descriptionSinistre)],
      ["statutSinistre", str(input.statutSinistre)],
    ]);
    u.link(id, "concerne", input.vehiculeId)
      .link(id, "rattacheAContrat", input.contratId)
      .link(input.assureId, "declare", id, "estDeclarePar")
      .link(id, "estDocumentePar", declId);
    if (input.conducteurId) u.link(id, "implique", input.conducteurId);
    for (const gid of new Set(input.garantieIds)) u.link(id, "mobiliseGarantie", gid);
    for (const d of input.dommages) addDamage(u, g, m, id, d, input.assureId);
    await u.run();
    logActivity("create", "Sinistre", id, numero);
    return claimDto(await loadGraph(), id);
  });
}

export function updateClaim(id: string, input: z.infer<typeof claimUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "Sinistre", "Sinistre");
    const cur = claimDto(g, id);
    const merged = {
      vehiculeId: input.vehiculeId ?? cur.vehicule!.id,
      assureId: input.assureId ?? cur.assure!.id,
      contratId: input.contratId ?? cur.contrat!.id,
      dateSinistre: input.dateSinistre ?? cur.dateSinistre!,
      conducteurId: input.conducteurId ?? cur.conducteur?.id ?? null,
      garantieIds: input.garantieIds ?? cur.garanties.map((x) => x.id),
    };
    checkClaimLinks(g, merged);
    const u = new UpdateBuilder();
    const set = (p: string, v: string | undefined, enc: (s: string) => string) => {
      if (v !== undefined) u.clear(id, p).add(id, p, enc(v));
    };
    set("dateSinistre", input.dateSinistre, dateTime);
    set("lieuSinistre", input.lieuSinistre, str);
    set("descriptionSinistre", input.descriptionSinistre, str);
    set("statutSinistre", input.statutSinistre, str);
    if (input.type && input.type !== cur.type) u.removeType(id, cur.type).addType(id, input.type);
    if (input.vehiculeId) u.clear(id, "concerne").link(id, "concerne", input.vehiculeId);
    if (input.contratId) u.clear(id, "rattacheAContrat").link(id, "rattacheAContrat", input.contratId);
    if (input.assureId && input.assureId !== cur.assure?.id) {
      if (cur.assure) u.unlink(cur.assure.id, "declare", id, "estDeclarePar");
      u.link(input.assureId, "declare", id, "estDeclarePar");
    }
    if (input.conducteurId !== undefined) u.clear(id, "implique").link(id, "implique", input.conducteurId);
    if (input.garantieIds) {
      u.clear(id, "mobiliseGarantie");
      for (const gid of new Set(input.garantieIds)) u.link(id, "mobiliseGarantie", gid);
    }
    await u.run();
    logActivity("update", "Sinistre", id, cur.numeroSinistre ?? id);
    return claimDto(await loadGraph(), id);
  });
}

export function deleteClaim(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "Sinistre")) throw notFound("Sinistre");
    const cur = claimDto(g, id);
    const u = new UpdateBuilder();
    // suppression en cascade des objets propres au sinistre
    for (const d of cur.dommages) {
      if (d.indemnisation) u.drop(d.indemnisation.id);
      u.drop(d.id);
    }
    for (const e of cur.expertises) {
      for (const r of g.links(e.id, "produit")) u.drop(r);
      u.drop(e.id);
    }
    if (cur.declaration) u.drop(cur.declaration.id);
    u.drop(id);
    await u.run();
    logActivity("delete", "Sinistre", id, cur.numeroSinistre ?? id);
  });
}

// ---------------------------------------------------------------- dommages
export async function listDamages(q: z.infer<typeof listQuery> & { sinistreId?: string; type?: string }) {
  const g = await loadGraph();
  let items = g.ofClass("Dommage").map((d) => damageDto(g, d.id));
  if (q.sinistreId) items = items.filter((d) => d.sinistre?.id === q.sinistreId);
  if (q.type) items = items.filter((d) => d.type === q.type);
  return paginate(items, q, (d) => `${d.id} ${d.typeLabel} ${d.description} ${d.sinistre?.numero ?? ""}`);
}

export async function getDamage(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "Dommage", "Dommage");
  return damageDto(g, id);
}

export function createDamage(claimId: string, input: z.infer<typeof damageInput>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, claimId, "Sinistre", "Sinistre");
    const assure = claimDto(g, claimId).assure!.id;
    const m = new Minter(g);
    const u = new UpdateBuilder();
    const id = addDamage(u, g, m, claimId, input, assure);
    await u.run();
    logActivity("create", "Dommage", id, input.description);
    return damageDto(await loadGraph(), id);
  });
}

export function updateDamage(id: string, input: z.infer<typeof damageUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "Dommage", "Dommage");
    const u = new UpdateBuilder();
    if (input.description !== undefined) u.clear(id, "description").add(id, "description", str(input.description));
    if (input.gravite !== undefined) u.clear(id, "gravite").add(id, "gravite", str(input.gravite));
    if (input.coutEstime !== undefined) u.clear(id, "coutEstime").add(id, "coutEstime", dec(input.coutEstime));
    if (input.type) {
      const old = g.subtypeOf(id, "Dommage");
      if (old && old !== input.type) u.removeType(id, old).addType(id, input.type);
    }
    if (input.victimeId) {
      assertIndividual(g, input.victimeId, "Personne", "Victime", "victimeId");
      u.clear(id, "subiPar").link(id, "subiPar", input.victimeId);
    }
    await u.run();
    logActivity("update", "Dommage", id, g.str(id, "description") ?? id);
    return damageDto(await loadGraph(), id);
  });
}

export function deleteDamage(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "Dommage")) throw notFound("Dommage");
    const dto = damageDto(g, id);
    if (dto.sinistre && g.links(dto.sinistre.id, "provoque").length <= 1) {
      throw new HttpError(409, "CONFLICT", "Un sinistre doit provoquer au moins un dommage (axiome OWL) : supprimez plutôt le sinistre.");
    }
    const u = new UpdateBuilder();
    if (dto.indemnisation) u.drop(dto.indemnisation.id);
    u.drop(id);
    await u.run();
    logActivity("delete", "Dommage", id, dto.description ?? id);
  });
}

export { GUARANTEE_TYPES };
export type { GuaranteeType };
