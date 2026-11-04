import { z } from "zod";
import { HttpError, notFound } from "../errors.js";
import { loadGraph, type Graph } from "../semantic/graph.js";
import { UpdateBuilder, dateTime, dec, str, withWriteLock } from "../semantic/sparql.js";
import { Minter, assertIndividual, dateStr, idStr, listQuery, money, mustExist, paginate, ref, today } from "../util/common.js";
import { logActivity } from "../util/jsonLog.js";
import { GUARANTEE_KEYS, GUARANTEE_TYPES, REQUIRED_GUARANTEES, guaranteeDto, type GuaranteeType } from "./guarantees.js";

export const CONTRACT_TYPES = ["AssuranceResponsabiliteCivile", "AssuranceIntermediaire", "AssuranceTousRisques"] as const;
export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  AssuranceResponsabiliteCivile: "Responsabilité civile (formule de base)",
  AssuranceIntermediaire: "Intermédiaire",
  AssuranceTousRisques: "Tous risques",
};
export const CONTRACT_STATUS = ["Actif", "Expire", "Resilie"] as const;
export const FREQUENCIES = ["Mensuelle", "Trimestrielle", "Semestrielle", "Annuelle"] as const;

const garantieInput = z.object({ type: z.enum(GUARANTEE_KEYS), plafondGarantie: money.optional() });

export const contractCreate = z
  .object({
    numeroContrat: z.string().trim().regex(/^C-\d{3,}$/, "format C-001 attendu").optional(),
    type: z.enum(CONTRACT_TYPES),
    dateDebut: dateStr,
    dateFin: dateStr,
    statutContrat: z.enum(CONTRACT_STATUS).default("Actif"),
    prime: z.object({ montantPrime: money, frequencePaiement: z.enum(FREQUENCIES).default("Annuelle") }),
    assureId: idStr,
    compagnieId: idStr.optional(),
    vehiculeIds: z.array(idStr).min(1, "au moins un véhicule (axiome OWL)"),
    garanties: z.array(garantieInput).default([]),
    clauseIds: z.array(idStr).default([]),
  })
  .refine((c) => c.dateFin > c.dateDebut, { message: "dateFin doit être postérieure à dateDebut", path: ["dateFin"] });

export const contractUpdate = z
  .object({
    numeroContrat: z.string().trim().regex(/^C-\d{3,}$/, "format C-001 attendu"),
    type: z.enum(CONTRACT_TYPES),
    dateDebut: dateStr,
    dateFin: dateStr,
    statutContrat: z.enum(CONTRACT_STATUS),
    prime: z.object({ montantPrime: money.optional(), frequencePaiement: z.enum(FREQUENCIES).optional() }),
    assureId: idStr,
    compagnieId: idStr,
    vehiculeIds: z.array(idStr).min(1, "au moins un véhicule (axiome OWL)"),
    clauseIds: z.array(idStr),
  })
  .partial();

export const contractFilters = listQuery.extend({
  statut: z.enum(CONTRACT_STATUS).optional(),
  type: z.enum(CONTRACT_TYPES).optional(),
  assureId: idStr.optional(),
  compagnieId: idStr.optional(),
  garantie: z.enum(GUARANTEE_KEYS).optional(),
});

export function contractDto(g: Graph, id: string) {
  const type = g.subtypeOf(id, "ContratAssurance") ?? "ContratAssurance";
  const prime = g.link(id, "aPourPrime");
  const assure = g.referencedBy(id).find((r) => r.prop === "possede")?.from ?? null;
  const compagnie = g.link(id, "estProposePar") ?? g.referencedBy(id).find((r) => r.prop === "propose")?.from ?? null;
  return {
    id,
    uri: `http://www.semanticweb.org/assurance/actors#${id}`,
    numeroContrat: g.str(id, "numeroContrat"),
    type,
    typeLabel: CONTRACT_TYPE_LABELS[type] ?? type,
    dateDebut: g.date(id, "dateDebut"),
    dateFin: g.date(id, "dateFin"),
    statutContrat: g.str(id, "statutContrat"),
    prime: prime ? { id: prime, montantPrime: g.num(prime, "montantPrime"), frequencePaiement: g.str(prime, "frequencePaiement") } : null,
    compagnie: ref(g, compagnie),
    assure: ref(g, assure),
    vehicules: g.links(id, "couvre").map((v) => ref(g, v)),
    garanties: g.links(id, "contient").map((x) => guaranteeDto(g, x)),
    clauses: g.links(id, "aPourClause").map((c) => ({ id: c, texte: g.str(c, "texteClause") })),
    documents: g.links(id, "aPourDocument").map((d) => ({ id: d, date: g.date(d, "dateDocument") })),
    sinistres: g.referencedBy(id).filter((r) => r.prop === "rattacheAContrat").map((r) => ({ id: r.from, numero: g.str(r.from, "numeroSinistre") })),
  };
}

export async function listContracts(q: z.infer<typeof contractFilters>) {
  const g = await loadGraph();
  let items = g.ofClass("ContratAssurance").map((c) => contractDto(g, c.id));
  if (q.statut) items = items.filter((c) => c.statutContrat === q.statut);
  if (q.type) items = items.filter((c) => c.type === q.type);
  if (q.assureId) items = items.filter((c) => c.assure?.id === q.assureId);
  if (q.compagnieId) items = items.filter((c) => c.compagnie?.id === q.compagnieId);
  if (q.garantie) items = items.filter((c) => c.garanties.some((x) => x.type === q.garantie));
  return paginate(items, q, (c) => `${c.id} ${c.numeroContrat} ${c.typeLabel} ${c.assure?.label ?? ""} ${c.vehicules.map((v) => v?.label).join(" ")} ${c.compagnie?.label ?? ""}`);
}

export async function getContract(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "ContratAssurance", "Contrat");
  return contractDto(g, id);
}

function nextContractNumber(g: Graph): string {
  let max = 0;
  for (const c of g.ofClass("ContratAssurance")) {
    const m = /^C-(\d+)$/.exec(g.str(c.id, "numeroContrat") ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `C-${String(max + 1).padStart(3, "0")}`;
}

function uniqueNumber(g: Graph, numero: string, except: string | null) {
  const clash = g.ofClass("ContratAssurance").find((c) => c.id !== except && g.str(c.id, "numeroContrat") === numero);
  if (clash) throw new HttpError(409, "CONFLICT", `Le numéro de contrat ${numero} existe déjà (${clash.id}).`);
}

function defaultCompany(g: Graph): string {
  const list = g.ofClass("CompagnieAssurance");
  if (!list.length) throw new HttpError(422, "VALIDATION_ERROR", "Aucune compagnie d'assurance dans l'ontologie.");
  return list[0].id;
}

export function createContract(input: z.infer<typeof contractCreate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    assertIndividual(g, input.assureId, "Assure", "Assuré", "assureId");
    const compagnie = input.compagnieId ?? defaultCompany(g);
    assertIndividual(g, compagnie, "CompagnieAssurance", "Compagnie", "compagnieId");
    for (const v of input.vehiculeIds) assertIndividual(g, v, "Vehicule", "Véhicule", "vehiculeIds");
    for (const c of input.clauseIds) assertIndividual(g, c, "Clause", "Clause", "clauseIds");
    const numero = input.numeroContrat ?? nextContractNumber(g);
    uniqueNumber(g, numero, null);

    // garanties : celles demandées + celles exigées par les axiomes du type de contrat
    const wanted = new Map<GuaranteeType, number | undefined>();
    for (const x of input.garanties) wanted.set(x.type, x.plafondGarantie);
    const autoAdded: string[] = [];
    for (const req of REQUIRED_GUARANTEES[input.type] ?? []) {
      if (!wanted.has(req)) {
        wanted.set(req, undefined);
        autoAdded.push(GUARANTEE_TYPES[req].label);
      }
    }

    const m = new Minter(g);
    const id = m.next("Contrat");
    const primeId = m.next("Prime");
    const docId = m.next("ContratDoc");
    const u = new UpdateBuilder();
    u.node(primeId, ["Prime"], [["montantPrime", dec(input.prime.montantPrime)], ["frequencePaiement", str(input.prime.frequencePaiement)]]);
    u.node(docId, ["ContratDocument"], [["dateDocument", dateTime(today())]]);
    u.node(id, [input.type], [
      ["numeroContrat", str(numero)],
      ["dateDebut", dateTime(input.dateDebut)],
      ["dateFin", dateTime(input.dateFin)],
      ["statutContrat", str(input.statutContrat)],
    ]);
    u.link(id, "aPourPrime", primeId).link(id, "aPourDocument", docId);
    for (const [type, plafond] of wanted) {
      const meta = GUARANTEE_TYPES[type];
      const gid = m.next(meta.prefix);
      u.node(gid, [type], [["plafondGarantie", dec(plafond ?? meta.plafond)]]).link(id, "contient", gid);
    }
    for (const c of new Set(input.clauseIds)) u.link(id, "aPourClause", c);
    for (const v of new Set(input.vehiculeIds)) u.link(id, "couvre", v, "estCouvertPar");
    u.link(input.assureId, "possede", id);
    u.link(compagnie, "propose", id, "estProposePar");
    await u.run();
    logActivity("create", "Contrat", id, numero);
    return { ...contractDto(await loadGraph(), id), autoAddedGuarantees: autoAdded };
  });
}

export function updateContract(id: string, input: z.infer<typeof contractUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "ContratAssurance", "Contrat");
    const cur = contractDto(g, id);
    const debut = input.dateDebut ?? cur.dateDebut!;
    const fin = input.dateFin ?? cur.dateFin!;
    if (fin <= debut) throw new HttpError(422, "VALIDATION_ERROR", "dateFin doit être postérieure à dateDebut.");
    const u = new UpdateBuilder();
    if (input.numeroContrat && input.numeroContrat !== cur.numeroContrat) {
      uniqueNumber(g, input.numeroContrat, id);
      u.clear(id, "numeroContrat").add(id, "numeroContrat", str(input.numeroContrat));
    }
    if (input.dateDebut) u.clear(id, "dateDebut").add(id, "dateDebut", dateTime(input.dateDebut));
    if (input.dateFin) u.clear(id, "dateFin").add(id, "dateFin", dateTime(input.dateFin));
    if (input.statutContrat) u.clear(id, "statutContrat").add(id, "statutContrat", str(input.statutContrat));

    if (input.type && input.type !== cur.type) {
      const have = new Set(cur.garanties.map((x) => x.type));
      const missing = (REQUIRED_GUARANTEES[input.type] ?? []).filter((r) => !have.has(r));
      if (missing.length) {
        throw new HttpError(422, "VALIDATION_ERROR", `Le type ${input.type} exige les garanties : ${missing.map((m) => GUARANTEE_TYPES[m].label).join(", ")}. Ajoutez-les d'abord (page Garanties).`);
      }
      u.removeType(id, cur.type).addType(id, input.type);
    }
    if (input.prime) {
      const p = cur.prime?.id;
      if (!p) throw new HttpError(422, "VALIDATION_ERROR", "Le contrat n'a pas de prime.");
      if (input.prime.montantPrime !== undefined) u.clear(p, "montantPrime").add(p, "montantPrime", dec(input.prime.montantPrime));
      if (input.prime.frequencePaiement) u.clear(p, "frequencePaiement").add(p, "frequencePaiement", str(input.prime.frequencePaiement));
    }
    if (input.compagnieId && input.compagnieId !== cur.compagnie?.id) {
      assertIndividual(g, input.compagnieId, "CompagnieAssurance", "Compagnie", "compagnieId");
      if (cur.compagnie) u.unlink(cur.compagnie.id, "propose", id, "estProposePar");
      u.link(input.compagnieId, "propose", id, "estProposePar");
    }
    if (input.assureId && input.assureId !== cur.assure?.id) {
      assertIndividual(g, input.assureId, "Assure", "Assuré", "assureId");
      if (cur.assure) u.unlink(cur.assure.id, "possede", id);
      u.link(input.assureId, "possede", id);
    }
    if (input.vehiculeIds) {
      for (const v of input.vehiculeIds) assertIndividual(g, v, "Vehicule", "Véhicule", "vehiculeIds");
      const wanted = new Set(input.vehiculeIds);
      const have = new Set(cur.vehicules.map((v) => v!.id));
      for (const v of have) if (!wanted.has(v)) u.unlink(id, "couvre", v, "estCouvertPar");
      for (const v of wanted) if (!have.has(v)) u.link(id, "couvre", v, "estCouvertPar");
    }
    if (input.clauseIds) {
      for (const c of input.clauseIds) assertIndividual(g, c, "Clause", "Clause", "clauseIds");
      u.clear(id, "aPourClause");
      for (const c of new Set(input.clauseIds)) u.link(id, "aPourClause", c);
    }
    await u.run();
    logActivity("update", "Contrat", id, cur.numeroContrat ?? id);
    return contractDto(await loadGraph(), id);
  });
}

export function deleteContract(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "ContratAssurance")) throw notFound("Contrat");
    const cur = contractDto(g, id);
    if (cur.sinistres.length) {
      throw new HttpError(409, "CONFLICT", `Le contrat ${cur.numeroContrat} est rattaché aux sinistres ${cur.sinistres.map((s) => s.numero).join(", ")} : suppression refusée.`);
    }
    const u = new UpdateBuilder();
    if (cur.prime) u.drop(cur.prime.id);
    for (const d of cur.documents) u.drop(d.id);
    for (const x of cur.garanties) u.drop(x.id);
    u.drop(id); // supprime aussi possede / propose / couvre / estCouvertPar / estProposePar entrants
    await u.run();
    logActivity("delete", "Contrat", id, cur.numeroContrat ?? id);
  });
}
