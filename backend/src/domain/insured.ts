import { z } from "zod";
import { HttpError, notFound } from "../errors.js";
import { loadGraph, type Graph } from "../semantic/graph.js";
import { UpdateBuilder, dateTime, str, withWriteLock } from "../semantic/sparql.js";
import {
  boolParam, dateStr, ensureUnique, listQuery, mustExist, nameStr, paginate, personId, refuseIfReferenced, ref,
} from "../util/common.js";
import { logActivity } from "../util/jsonLog.js";

const permis = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{5,12}$/, "5 à 12 caractères alphanumériques");

export const insuredCreate = z.object({
  prenom: nameStr,
  nom: nameStr,
  dateNaissance: dateStr.optional().nullable(),
  numeroPermis: permis.optional().nullable(),
  conducteur: z.boolean().default(true),
});
export const insuredUpdate = insuredCreate.partial();

export const insuredFilters = listQuery.extend({
  conducteur: boolParam,
  hasContrat: boolParam,
  hasSinistre: boolParam,
});

export function insuredDto(g: Graph, id: string) {
  const contrats = g.links(id, "possede");
  const vehicules = [...new Set(contrats.flatMap((c) => g.links(c, "couvre")))];
  return {
    id,
    uri: `http://www.semanticweb.org/assurance/actors#${id}`,
    label: g.label(id),
    prenom: g.str(id, "prenom"),
    nom: g.str(id, "nom"),
    dateNaissance: g.date(id, "dateNaissance"),
    numeroPermis: g.str(id, "numeroPermis"),
    conducteur: g.isA(id, "Conducteur"),
    contrats: contrats.map((c) => ({ id: c, numero: g.str(c, "numeroContrat"), statut: g.str(c, "statutContrat") })),
    vehicules: vehicules.map((v) => ref(g, v)),
    sinistres: g.links(id, "declare").map((s) => ({ id: s, numero: g.str(s, "numeroSinistre") })),
  };
}

export async function listInsured(q: z.infer<typeof insuredFilters>) {
  const g = await loadGraph();
  let items = g.ofClass("Assure").map((i) => insuredDto(g, i.id));
  if (q.conducteur !== undefined) items = items.filter((i) => i.conducteur === q.conducteur);
  if (q.hasContrat !== undefined) items = items.filter((i) => (i.contrats.length > 0) === q.hasContrat);
  if (q.hasSinistre !== undefined) items = items.filter((i) => (i.sinistres.length > 0) === q.hasSinistre);
  return paginate(items, q, (i) => `${i.id} ${i.prenom} ${i.nom} ${i.numeroPermis ?? ""}`);
}

export async function getInsured(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "Assure", "Assuré");
  return insuredDto(g, id);
}

export function createInsured(input: z.infer<typeof insuredCreate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (input.numeroPermis) ensureUnique(g, "Personne", "numeroPermis", input.numeroPermis, null, "Numéro de permis");
    const twin = g.ofClass("Assure").find(
      (i) =>
        g.str(i.id, "prenom")?.toLowerCase() === input.prenom.toLowerCase() &&
        g.str(i.id, "nom")?.toLowerCase() === input.nom.toLowerCase() &&
        (g.date(i.id, "dateNaissance") ?? "") === (input.dateNaissance ?? ""),
    );
    if (twin) throw new HttpError(409, "CONFLICT", `Un assuré identique existe déjà (${twin.id}).`);
    const id = personId(g, input.prenom, input.nom);
    await new UpdateBuilder()
      .node(id, ["Assure", ...(input.conducteur ? ["Conducteur"] : [])], [
        ["nom", str(input.nom)],
        ["prenom", str(input.prenom)],
        ["dateNaissance", input.dateNaissance ? dateTime(input.dateNaissance) : null],
        ["numeroPermis", input.numeroPermis ? str(input.numeroPermis) : null],
      ])
      .run();
    logActivity("create", "Assuré", id, `${input.prenom} ${input.nom}`);
    return insuredDto(await loadGraph(), id);
  });
}

export function updateInsured(id: string, input: z.infer<typeof insuredUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "Assure", "Assuré");
    if (input.numeroPermis) ensureUnique(g, "Personne", "numeroPermis", input.numeroPermis, id, "Numéro de permis");
    const u = new UpdateBuilder();
    const set = (p: string, v: string | null | undefined, enc: (s: string) => string) => {
      if (v === undefined) return;
      u.clear(id, p);
      if (v !== null) u.add(id, p, enc(v));
    };
    set("prenom", input.prenom, str);
    set("nom", input.nom, str);
    set("dateNaissance", input.dateNaissance, dateTime);
    set("numeroPermis", input.numeroPermis, str);
    if (input.conducteur !== undefined) {
      const isDriver = g.isA(id, "Conducteur");
      if (input.conducteur && !isDriver) u.addType(id, "Conducteur");
      if (!input.conducteur && isDriver) {
        if (g.referencedBy(id).some((r) => r.prop === "estConduitPar")) {
          throw new HttpError(409, "CONFLICT", "Cet assuré conduit encore des véhicules : retirez-le d'abord comme conducteur.");
        }
        u.removeType(id, "Conducteur").clear(id, "numeroPermis");
      }
    }
    await u.run();
    logActivity("update", "Assuré", id, g.label(id));
    return insuredDto(await loadGraph(), id);
  });
}

export function deleteInsured(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "Assure")) throw notFound("Assuré");
    refuseIfReferenced(g, id, `L'assuré ${g.label(id)}`, ["estConduitPar"]);
    if (g.links(id, "possede").length || g.links(id, "declare").length) {
      throw new HttpError(409, "CONFLICT", `L'assuré ${g.label(id)} possède des contrats ou des sinistres : suppression refusée.`);
    }
    await new UpdateBuilder().drop(id).run();
    logActivity("delete", "Assuré", id, g.label(id));
  });
}
