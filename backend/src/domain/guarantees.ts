import { z } from "zod";
import { HttpError, notFound } from "../errors.js";
import { loadGraph, type Graph } from "../semantic/graph.js";
import { UpdateBuilder, dec, withWriteLock } from "../semantic/sparql.js";
import { Minter, assertIndividual, idStr, listQuery, money, mustExist, paginate, ref } from "../util/common.js";
import { logActivity } from "../util/jsonLog.js";

/** Les 6 garanties de l'ontologie (sous-classes de Garantie) + préfixe d'URI stable et plafond par défaut. */
export const GUARANTEE_TYPES = {
  GarantieResponsabiliteCivile: { prefix: "GarantieRC", label: "Responsabilité civile", plafond: 1_000_000, description: "Dommages causés aux tiers (obligatoire pour tout contrat)." },
  GarantieVol: { prefix: "GarantieVol", label: "Vol", plafond: 30_000, description: "Vol ou tentative de vol du véhicule." },
  GarantieIncendie: { prefix: "GarantieIncendie", label: "Incendie", plafond: 25_000, description: "Incendie, explosion, court-circuit." },
  GarantieBrisDeGlace: { prefix: "GarantieBrisDeGlace", label: "Bris de glace", plafond: 2_000, description: "Pare-brise, vitres, phares." },
  GarantieDommagesTousAccidents: { prefix: "GarantieTousAccidents", label: "Dommages tous accidents", plafond: 45_000, description: "Dommages au véhicule assuré, quelle que soit la responsabilité." },
  GarantieCatastrophesNaturelles: { prefix: "GarantieCatNat", label: "Catastrophes naturelles", plafond: 20_000, description: "Inondation, tempête, grêle, séisme." },
} as const;
export type GuaranteeType = keyof typeof GUARANTEE_TYPES;
export const GUARANTEE_KEYS = Object.keys(GUARANTEE_TYPES) as [GuaranteeType, ...GuaranteeType[]];

/** Axiomes de l'ontologie : garanties obligatoires selon le type de contrat (restrictions someValuesFrom). */
export const REQUIRED_GUARANTEES: Record<string, GuaranteeType[]> = {
  AssuranceResponsabiliteCivile: ["GarantieResponsabiliteCivile"],
  AssuranceIntermediaire: ["GarantieResponsabiliteCivile", "GarantieIncendie"],
  AssuranceTousRisques: ["GarantieResponsabiliteCivile", "GarantieDommagesTousAccidents"],
};

export const guaranteeCreate = z.object({
  contratId: idStr,
  type: z.enum(GUARANTEE_KEYS),
  plafondGarantie: money.optional(),
});
export const guaranteeUpdate = z.object({ plafondGarantie: money });
export const guaranteeFilters = listQuery.extend({ type: z.enum(GUARANTEE_KEYS).optional(), contratId: idStr.optional() });

export function guaranteeDto(g: Graph, id: string) {
  const type = g.subtypeOf(id, "Garantie") as GuaranteeType;
  const contrat = g.referencedBy(id).find((r) => r.prop === "contient")?.from ?? null;
  return {
    id,
    type,
    typeLabel: GUARANTEE_TYPES[type]?.label ?? type,
    plafondGarantie: g.num(id, "plafondGarantie"),
    contrat: contrat ? { id: contrat, numero: g.str(contrat, "numeroContrat"), statut: g.str(contrat, "statutContrat") } : null,
    sinistres: g.referencedBy(id).filter((r) => r.prop === "mobiliseGarantie").map((r) => ({ id: r.from, numero: g.str(r.from, "numeroSinistre") })),
  };
}

export async function listGuarantees(q: z.infer<typeof guaranteeFilters>) {
  const g = await loadGraph();
  let items = g.ofClass("Garantie").map((x) => guaranteeDto(g, x.id));
  if (q.type) items = items.filter((i) => i.type === q.type);
  if (q.contratId) items = items.filter((i) => i.contrat?.id === q.contratId);
  return paginate(items, q, (i) => `${i.id} ${i.typeLabel} ${i.contrat?.numero ?? ""}`);
}

export async function getGuarantee(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "Garantie", "Garantie");
  return guaranteeDto(g, id);
}

/** Catalogue des types de garanties tel que défini par l'ontologie + statistiques réelles. */
export async function guaranteeTypes() {
  const g = await loadGraph();
  return GUARANTEE_KEYS.map((t) => {
    const inst = g.ofClass(t);
    const plafonds = inst.map((i) => g.num(i.id, "plafondGarantie")).filter((n): n is number => n !== null);
    return {
      id: t,
      ...GUARANTEE_TYPES[t],
      count: inst.length,
      averagePlafond: plafonds.length ? Math.round(plafonds.reduce((a, b) => a + b, 0) / plafonds.length) : null,
      requiredBy: Object.entries(REQUIRED_GUARANTEES).filter(([, r]) => r.includes(t)).map(([c]) => c),
      contrats: [...new Set(inst.map((i) => guaranteeDto(g, i.id).contrat?.id).filter(Boolean))],
    };
  });
}

export function createGuarantee(input: z.infer<typeof guaranteeCreate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    assertIndividual(g, input.contratId, "ContratAssurance", "Contrat", "contratId");
    const existing = g.links(input.contratId, "contient").find((x) => g.isA(x, input.type));
    if (existing) throw new HttpError(409, "CONFLICT", `Le contrat ${g.str(input.contratId, "numeroContrat")} contient déjà une garantie « ${GUARANTEE_TYPES[input.type].label} » (${existing}).`);
    const meta = GUARANTEE_TYPES[input.type];
    const id = new Minter(g).next(meta.prefix);
    await new UpdateBuilder()
      .node(id, [input.type], [["plafondGarantie", dec(input.plafondGarantie ?? meta.plafond)]])
      .link(input.contratId, "contient", id)
      .run();
    logActivity("create", "Garantie", id, meta.label);
    return guaranteeDto(await loadGraph(), id);
  });
}

export function updateGuarantee(id: string, input: z.infer<typeof guaranteeUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "Garantie", "Garantie");
    await new UpdateBuilder().clear(id, "plafondGarantie").add(id, "plafondGarantie", dec(input.plafondGarantie)).run();
    logActivity("update", "Garantie", id, g.label(id));
    return guaranteeDto(await loadGraph(), id);
  });
}

export function deleteGuarantee(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "Garantie")) throw notFound("Garantie");
    const dto = guaranteeDto(g, id);
    if (dto.sinistres.length) throw new HttpError(409, "CONFLICT", `Garantie mobilisée par ${dto.sinistres.map((s) => s.numero).join(", ")} : suppression refusée.`);
    if (dto.contrat) {
      const contratType = g.subtypeOf(dto.contrat.id, "ContratAssurance") ?? "";
      const required = REQUIRED_GUARANTEES[contratType] ?? [];
      if (required.includes(dto.type)) {
        throw new HttpError(409, "CONFLICT", `La garantie « ${dto.typeLabel} » est exigée par l'axiome OWL du type de contrat ${contratType} : suppression refusée.`);
      }
      if (g.links(dto.contrat.id, "contient").length <= 1) {
        throw new HttpError(409, "CONFLICT", "Un contrat doit contenir au moins une garantie (axiome OWL).");
      }
    }
    await new UpdateBuilder().drop(id).run();
    logActivity("delete", "Garantie", id, dto.typeLabel);
  });
}

export { ref };
