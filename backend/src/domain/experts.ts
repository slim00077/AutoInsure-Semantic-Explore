import { z } from "zod";
import { notFound } from "../errors.js";
import { loadGraph, type Graph } from "../semantic/graph.js";
import { UpdateBuilder, str, withWriteLock } from "../semantic/sparql.js";
import { listQuery, mustExist, nameStr, paginate, personId, refuseIfReferenced, textStr } from "../util/common.js";
import { logActivity } from "../util/jsonLog.js";

export const expertCreate = z.object({ prenom: nameStr, nom: nameStr, specialite: textStr(120).optional().nullable() });
export const expertUpdate = expertCreate.partial();
export const expertFilters = listQuery;

export function expertDto(g: Graph, id: string) {
  return {
    id,
    label: g.label(id),
    prenom: g.str(id, "prenom"),
    nom: g.str(id, "nom"),
    specialite: g.str(id, "specialite"),
    expertises: g.referencedBy(id).filter((r) => r.prop === "realisePar").map((r) => r.from),
  };
}

export async function listExperts(q: z.infer<typeof expertFilters>) {
  const g = await loadGraph();
  return paginate(g.ofClass("Expert").map((e) => expertDto(g, e.id)), q, (e) => `${e.id} ${e.prenom} ${e.nom} ${e.specialite ?? ""}`);
}
export async function getExpert(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "Expert", "Expert");
  return expertDto(g, id);
}
export function createExpert(input: z.infer<typeof expertCreate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    const id = personId(g, input.prenom, input.nom);
    await new UpdateBuilder()
      .node(id, ["Expert"], [["nom", str(input.nom)], ["prenom", str(input.prenom)], ["specialite", input.specialite ? str(input.specialite) : null]])
      .run();
    logActivity("create", "Expert", id, `${input.prenom} ${input.nom}`);
    return expertDto(await loadGraph(), id);
  });
}
export function updateExpert(id: string, input: z.infer<typeof expertUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "Expert", "Expert");
    const u = new UpdateBuilder();
    for (const [p, v] of [["prenom", input.prenom], ["nom", input.nom], ["specialite", input.specialite]] as const) {
      if (v === undefined) continue;
      u.clear(id, p);
      if (v !== null) u.add(id, p, str(v));
    }
    await u.run();
    logActivity("update", "Expert", id, g.label(id));
    return expertDto(await loadGraph(), id);
  });
}
export function deleteExpert(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "Expert")) throw notFound("Expert");
    refuseIfReferenced(g, id, `L'expert ${g.label(id)}`);
    await new UpdateBuilder().drop(id).run();
    logActivity("delete", "Expert", id, g.label(id));
  });
}
