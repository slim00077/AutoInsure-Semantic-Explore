import { z } from "zod";
import { HttpError, notFound } from "../errors.js";
import { loadGraph, type Graph } from "../semantic/graph.js";
import { UpdateBuilder, dateTime, str, withWriteLock } from "../semantic/sparql.js";
import { Minter, assertIndividual, dateStr, idStr, listQuery, mustExist, paginate, ref, textStr, today } from "../util/common.js";
import { logActivity } from "../util/jsonLog.js";
import { damageDto } from "./claims.js";

export const expertiseCreate = z.object({
  sinistreId: idStr,
  expertId: idStr,
  dateExpertise: dateStr.optional(),
  conclusion: textStr(800),
  dommageIds: z.array(idStr).optional(),
  rapport: z.object({ contenuDocument: textStr(2000), dateDocument: dateStr.optional() }).optional(),
});
export const expertiseUpdate = z
  .object({
    expertId: idStr,
    dateExpertise: dateStr,
    conclusion: textStr(800),
    dommageIds: z.array(idStr).min(1),
    rapport: z.object({ contenuDocument: textStr(2000), dateDocument: dateStr.optional() }),
  })
  .partial();
export const expertiseFilters = listQuery.extend({ sinistreId: idStr.optional(), expertId: idStr.optional() });

export function expertiseDto(g: Graph, id: string) {
  const sinistre = g.referencedBy(id).find((r) => r.prop === "faitObjetDe")?.from ?? null;
  const rapport = g.link(id, "produit");
  const expert = g.link(id, "realisePar");
  return {
    id,
    uri: `http://www.semanticweb.org/assurance/actors#${id}`,
    dateExpertise: g.date(id, "dateExpertise"),
    conclusion: g.str(id, "conclusion"),
    expert: expert ? { id: expert, label: g.label(expert), specialite: g.str(expert, "specialite") } : null,
    sinistre: sinistre ? { id: sinistre, numero: g.str(sinistre, "numeroSinistre") } : null,
    dommages: g.links(id, "evalue").map((d) => damageDto(g, d)),
    rapport: rapport ? { id: rapport, dateDocument: g.date(rapport, "dateDocument"), contenuDocument: g.str(rapport, "contenuDocument") } : null,
  };
}

export async function listExpertises(q: z.infer<typeof expertiseFilters>) {
  const g = await loadGraph();
  let items = g.ofClass("Expertise").map((e) => expertiseDto(g, e.id));
  if (q.sinistreId) items = items.filter((e) => e.sinistre?.id === q.sinistreId);
  if (q.expertId) items = items.filter((e) => e.expert?.id === q.expertId);
  return paginate(items, q, (e) => `${e.id} ${e.conclusion} ${e.expert?.label ?? ""} ${e.sinistre?.numero ?? ""}`);
}

export async function getExpertise(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "Expertise", "Expertise");
  return expertiseDto(g, id);
}

function checkDamages(g: Graph, sinistreId: string, ids: string[]) {
  const own = g.links(sinistreId, "provoque");
  for (const d of ids) {
    assertIndividual(g, d, "Dommage", "Dommage", "dommageIds");
    if (!own.includes(d)) throw new HttpError(422, "VALIDATION_ERROR", `Le dommage ${d} n'est pas provoqué par ${g.str(sinistreId, "numeroSinistre")}.`);
  }
}

export function createExpertise(input: z.infer<typeof expertiseCreate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    assertIndividual(g, input.sinistreId, "Sinistre", "Sinistre", "sinistreId");
    assertIndividual(g, input.expertId, "Expert", "Expert", "expertId");
    const dommages = input.dommageIds ?? g.links(input.sinistreId, "provoque");
    checkDamages(g, input.sinistreId, dommages);
    if (!dommages.length) throw new HttpError(422, "VALIDATION_ERROR", "Aucun dommage à évaluer.");
    const m = new Minter(g);
    const id = m.next("Expertise");
    const u = new UpdateBuilder();
    u.node(id, ["Expertise"], [
      ["dateExpertise", dateTime(input.dateExpertise ?? today())],
      ["conclusion", str(input.conclusion)],
    ]);
    u.link(id, "realisePar", input.expertId).link(input.sinistreId, "faitObjetDe", id);
    for (const d of new Set(dommages)) u.link(id, "evalue", d);
    if (input.rapport) {
      const rid = m.next("Rapport");
      u.node(rid, ["RapportExpertise"], [
        ["dateDocument", dateTime(input.rapport.dateDocument ?? input.dateExpertise ?? today())],
        ["contenuDocument", str(input.rapport.contenuDocument)],
      ]).link(id, "produit", rid);
    }
    // workflow léger : un sinistre « Declare » passe « EnExpertise »
    if ((g.str(input.sinistreId, "statutSinistre") ?? "Declare") === "Declare") {
      u.clear(input.sinistreId, "statutSinistre").add(input.sinistreId, "statutSinistre", str("EnExpertise"));
    }
    await u.run();
    logActivity("create", "Expertise", id, g.str(input.sinistreId, "numeroSinistre") ?? input.sinistreId);
    return expertiseDto(await loadGraph(), id);
  });
}

export function updateExpertise(id: string, input: z.infer<typeof expertiseUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "Expertise", "Expertise");
    const cur = expertiseDto(g, id);
    const u = new UpdateBuilder();
    if (input.dateExpertise) u.clear(id, "dateExpertise").add(id, "dateExpertise", dateTime(input.dateExpertise));
    if (input.conclusion) u.clear(id, "conclusion").add(id, "conclusion", str(input.conclusion));
    if (input.expertId) {
      assertIndividual(g, input.expertId, "Expert", "Expert", "expertId");
      u.clear(id, "realisePar").link(id, "realisePar", input.expertId);
    }
    if (input.dommageIds) {
      if (cur.sinistre) checkDamages(g, cur.sinistre.id, input.dommageIds);
      u.clear(id, "evalue");
      for (const d of new Set(input.dommageIds)) u.link(id, "evalue", d);
    }
    if (input.rapport) {
      if (cur.rapport) {
        u.clear(cur.rapport.id, "contenuDocument").add(cur.rapport.id, "contenuDocument", str(input.rapport.contenuDocument));
        if (input.rapport.dateDocument) u.clear(cur.rapport.id, "dateDocument").add(cur.rapport.id, "dateDocument", dateTime(input.rapport.dateDocument));
      } else {
        const rid = new Minter(g).next("Rapport");
        u.node(rid, ["RapportExpertise"], [
          ["dateDocument", dateTime(input.rapport.dateDocument ?? today())],
          ["contenuDocument", str(input.rapport.contenuDocument)],
        ]).link(id, "produit", rid);
      }
    }
    await u.run();
    logActivity("update", "Expertise", id, cur.sinistre?.numero ?? id);
    return expertiseDto(await loadGraph(), id);
  });
}

export function deleteExpertise(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "Expertise")) throw notFound("Expertise");
    const cur = expertiseDto(g, id);
    const u = new UpdateBuilder();
    if (cur.rapport) u.drop(cur.rapport.id);
    u.drop(id);
    await u.run();
    logActivity("delete", "Expertise", id, cur.sinistre?.numero ?? id);
  });
}

export { ref };
