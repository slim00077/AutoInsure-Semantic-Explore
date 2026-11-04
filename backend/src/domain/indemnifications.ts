import { z } from "zod";
import { HttpError, notFound } from "../errors.js";
import { loadGraph, type Graph } from "../semantic/graph.js";
import { UpdateBuilder, dateTime, dec, str, withWriteLock } from "../semantic/sparql.js";
import { Minter, assertIndividual, dateStr, idStr, listQuery, money, mustExist, paginate, ref, round2, textStr, today } from "../util/common.js";
import { logActivity } from "../util/jsonLog.js";

export const INDEM_STATUS = ["EnCours", "Acceptee", "Refusee"] as const;

export const indemnificationCreate = z.object({
  dommageId: idStr,
  statutIndemnisation: z.enum(INDEM_STATUS).default("EnCours"),
  dateIndemnisation: dateStr.optional(),
  motifDecision: textStr(400).optional(),
  baremeId: idStr.optional(),
  franchiseMontant: money.optional(),
  /** Si omis, le montant est calculé avec le barème : (coût estimé − franchise) × taux, plafonné. */
  montantIndemnisation: money.optional(),
  beneficiaireId: idStr.optional(),
  compagnieId: idStr.optional(),
});
export const indemnificationUpdate = z
  .object({
    statutIndemnisation: z.enum(INDEM_STATUS),
    dateIndemnisation: dateStr,
    motifDecision: textStr(400),
    baremeId: idStr,
    franchiseMontant: money,
    montantIndemnisation: money,
    recalculer: z.boolean(),
  })
  .partial();
export const indemnificationFilters = listQuery.extend({
  statut: z.enum(INDEM_STATUS).optional(),
  sinistreId: idStr.optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
});

export function indemnificationDto(g: Graph, id: string) {
  const dommage = g.referencedBy(id).find((r) => r.prop === "donneLieuA")?.from ?? null;
  const sinistre = dommage ? g.referencedBy(dommage).find((r) => r.prop === "provoque")?.from ?? null : null;
  const fr = g.link(id, "appliqueFranchise");
  const ba = g.link(id, "utiliseBareme");
  return {
    id,
    uri: `http://www.semanticweb.org/assurance/actors#${id}`,
    montantIndemnisation: g.num(id, "montantIndemnisation"),
    dateIndemnisation: g.date(id, "dateIndemnisation"),
    statutIndemnisation: g.str(id, "statutIndemnisation"),
    motifDecision: g.str(id, "motifDecision"),
    dommage: dommage ? { id: dommage, description: g.str(dommage, "description"), coutEstime: g.num(dommage, "coutEstime"), type: g.subtypeOf(dommage, "Dommage") } : null,
    sinistre: sinistre ? { id: sinistre, numero: g.str(sinistre, "numeroSinistre") } : null,
    franchise: fr ? { id: fr, montantFranchise: g.num(fr, "montantFranchise") } : null,
    bareme: ba ? { id: ba, tauxIndemnisation: g.num(ba, "tauxIndemnisation"), plafondIndemnisation: g.num(ba, "plafondIndemnisation"), regleCalcul: g.str(ba, "regleCalcul") } : null,
    beneficiaire: ref(g, g.link(id, "verseeA")),
    compagnie: ref(g, g.link(id, "verseePar")),
  };
}

export async function listIndemnifications(q: z.infer<typeof indemnificationFilters>) {
  const g = await loadGraph();
  let items = g.ofClass("Indemnisation").map((i) => indemnificationDto(g, i.id));
  if (q.statut) items = items.filter((i) => i.statutIndemnisation === q.statut);
  if (q.sinistreId) items = items.filter((i) => i.sinistre?.id === q.sinistreId);
  if (q.min !== undefined) items = items.filter((i) => (i.montantIndemnisation ?? 0) >= q.min!);
  if (q.max !== undefined) items = items.filter((i) => (i.montantIndemnisation ?? 0) <= q.max!);
  return paginate(items, q, (i) => `${i.id} ${i.motifDecision ?? ""} ${i.sinistre?.numero ?? ""} ${i.beneficiaire?.label ?? ""} ${i.dommage?.description ?? ""}`);
}

export async function getIndemnification(id: string) {
  const g = await loadGraph();
  mustExist(g, id, "Indemnisation", "Indemnisation");
  return indemnificationDto(g, id);
}

/** Formule du barème de l'ontologie : (coût − franchise) × taux, dans la limite du plafond. */
export function computeAmount(cout: number, franchise: number, taux: number, plafond: number | null): number {
  const base = Math.max(cout - franchise, 0) * taux;
  return round2(plafond !== null ? Math.min(base, plafond) : base);
}

/** Trouve une franchise existante de même montant, sinon prépare sa création. */
function franchiseFor(g: Graph, m: Minter, u: UpdateBuilder, montant: number): string {
  const found = g.ofClass("Franchise").find((f) => g.num(f.id, "montantFranchise") === montant);
  if (found) return found.id;
  const id = m.next("Franchise");
  u.node(id, ["Franchise"], [["montantFranchise", dec(montant)]]);
  return id;
}

function syncClaimStatus(g: Graph, u: UpdateBuilder, sinistre: string | null, statut: string) {
  if (!sinistre) return;
  const cur = g.str(sinistre, "statutSinistre") ?? "Declare";
  if (cur === "Clos") return;
  const next = statut === "Acceptee" ? "Indemnise" : statut === "Refusee" ? "Refuse" : null;
  if (next && next !== cur) u.clear(sinistre, "statutSinistre").add(sinistre, "statutSinistre", str(next));
}

export function createIndemnification(input: z.infer<typeof indemnificationCreate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    assertIndividual(g, input.dommageId, "Dommage", "Dommage", "dommageId");
    if (g.links(input.dommageId, "donneLieuA").length) {
      throw new HttpError(409, "CONFLICT", `Le dommage ${input.dommageId} a déjà une indemnisation.`);
    }
    const sinistre = g.referencedBy(input.dommageId).find((r) => r.prop === "provoque")?.from ?? null;
    const contrat = sinistre ? g.link(sinistre, "rattacheAContrat") : null;
    const beneficiaire = input.beneficiaireId ?? g.link(input.dommageId, "subiPar");
    if (!beneficiaire) throw new HttpError(422, "VALIDATION_ERROR", "Bénéficiaire introuvable (le dommage n'a pas de victime).");
    assertIndividual(g, beneficiaire, "Personne", "Bénéficiaire", "beneficiaireId");
    const compagnie = input.compagnieId ?? (contrat ? g.link(contrat, "estProposePar") ?? g.referencedBy(contrat).find((r) => r.prop === "propose")?.from : null) ?? g.ofClass("CompagnieAssurance")[0]?.id;
    if (!compagnie) throw new HttpError(422, "VALIDATION_ERROR", "Compagnie payeuse introuvable.");
    assertIndividual(g, compagnie, "CompagnieAssurance", "Compagnie", "compagnieId");
    if (input.baremeId) assertIndividual(g, input.baremeId, "BaremeIndemnisation", "Barème", "baremeId");

    const cout = g.num(input.dommageId, "coutEstime") ?? 0;
    const franchise = input.franchiseMontant ?? 0;
    let montant = input.montantIndemnisation;
    if (input.statutIndemnisation === "Refusee" && montant === undefined) montant = 0;
    if (montant === undefined) {
      if (!input.baremeId) throw new HttpError(422, "VALIDATION_ERROR", "Fournissez un montant ou un barème pour calculer l'indemnisation.");
      montant = computeAmount(cout, franchise, g.num(input.baremeId, "tauxIndemnisation") ?? 1, g.num(input.baremeId, "plafondIndemnisation"));
    }
    const date = input.dateIndemnisation ?? (input.statutIndemnisation === "EnCours" ? undefined : today());
    const m = new Minter(g);
    const id = m.next("Indemnisation");
    const u = new UpdateBuilder();
    const franchiseId = input.franchiseMontant !== undefined && input.franchiseMontant > 0 ? franchiseFor(g, m, u, input.franchiseMontant) : null;
    u.node(id, ["Indemnisation"], [
      ["montantIndemnisation", dec(montant)],
      ["dateIndemnisation", date ? dateTime(date) : null],
      ["statutIndemnisation", str(input.statutIndemnisation)],
      ["motifDecision", input.motifDecision ? str(input.motifDecision) : null],
    ]);
    u.link(id, "verseeA", beneficiaire).link(id, "verseePar", compagnie).link(input.dommageId, "donneLieuA", id);
    if (input.baremeId) u.link(id, "utiliseBareme", input.baremeId);
    if (franchiseId) u.link(id, "appliqueFranchise", franchiseId);
    syncClaimStatus(g, u, sinistre, input.statutIndemnisation);
    await u.run();
    logActivity("create", "Indemnisation", id, `${montant}`);
    return indemnificationDto(await loadGraph(), id);
  });
}

export function updateIndemnification(id: string, input: z.infer<typeof indemnificationUpdate>) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    mustExist(g, id, "Indemnisation", "Indemnisation");
    const cur = indemnificationDto(g, id);
    const u = new UpdateBuilder();
    const m = new Minter(g);
    if (input.baremeId) {
      assertIndividual(g, input.baremeId, "BaremeIndemnisation", "Barème", "baremeId");
      u.clear(id, "utiliseBareme").link(id, "utiliseBareme", input.baremeId);
    }
    if (input.franchiseMontant !== undefined) {
      u.clear(id, "appliqueFranchise");
      if (input.franchiseMontant > 0) u.link(id, "appliqueFranchise", franchiseFor(g, m, u, input.franchiseMontant));
    }
    if (input.statutIndemnisation) {
      u.clear(id, "statutIndemnisation").add(id, "statutIndemnisation", str(input.statutIndemnisation));
      syncClaimStatus(g, u, cur.sinistre?.id ?? null, input.statutIndemnisation);
      if (input.statutIndemnisation !== "EnCours" && !cur.dateIndemnisation && !input.dateIndemnisation) {
        u.clear(id, "dateIndemnisation").add(id, "dateIndemnisation", dateTime(today()));
      }
    }
    if (input.dateIndemnisation) u.clear(id, "dateIndemnisation").add(id, "dateIndemnisation", dateTime(input.dateIndemnisation));
    if (input.motifDecision) u.clear(id, "motifDecision").add(id, "motifDecision", str(input.motifDecision));
    let montant = input.montantIndemnisation;
    if (montant === undefined && input.recalculer) {
      const baremeId = input.baremeId ?? cur.bareme?.id;
      if (!baremeId || !cur.dommage) throw new HttpError(422, "VALIDATION_ERROR", "Un barème est nécessaire pour recalculer.");
      const f = input.franchiseMontant ?? cur.franchise?.montantFranchise ?? 0;
      montant = computeAmount(cur.dommage.coutEstime ?? 0, f, g.num(baremeId, "tauxIndemnisation") ?? 1, g.num(baremeId, "plafondIndemnisation"));
    }
    if (montant !== undefined) u.clear(id, "montantIndemnisation").add(id, "montantIndemnisation", dec(montant));
    await u.run();
    logActivity("update", "Indemnisation", id, cur.sinistre?.numero ?? id);
    return indemnificationDto(await loadGraph(), id);
  });
}

export function deleteIndemnification(id: string) {
  return withWriteLock(async () => {
    const g = await loadGraph();
    if (!g.has(id) || !g.isA(id, "Indemnisation")) throw notFound("Indemnisation");
    const cur = indemnificationDto(g, id);
    await new UpdateBuilder().drop(id).run();
    logActivity("delete", "Indemnisation", id, cur.sinistre?.numero ?? id);
  });
}
