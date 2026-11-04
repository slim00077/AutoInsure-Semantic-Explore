import { loadGraph } from "../semantic/graph.js";
import { CONTRACT_STATUS, CONTRACT_TYPES, CONTRACT_TYPE_LABELS, FREQUENCIES } from "./contracts.js";
import { CLAIM_STATUS, CLAIM_TYPES, CLAIM_TYPE_LABELS, DAMAGE_TYPES, DAMAGE_TYPE_LABELS, SEVERITIES } from "./claims.js";
import { GUARANTEE_KEYS, GUARANTEE_TYPES, REQUIRED_GUARANTEES } from "./guarantees.js";
import { INDEM_STATUS } from "./indemnifications.js";
import { VEHICLE_TYPES } from "./vehicles.js";

/** Listes de référence pour les formulaires : individus de l'ontologie + énumérations validées côté API. */
export async function references() {
  const g = await loadGraph();
  const org = (cls: string) => g.ofClass(cls).map((o) => ({ id: o.id, label: g.label(o.id), ville: g.str(o.id, "ville") }));
  return {
    compagnies: org("CompagnieAssurance"),
    garages: org("Garage"),
    experts: g.ofClass("Expert").map((e) => ({ id: e.id, label: g.label(e.id), specialite: g.str(e.id, "specialite") })),
    assures: g.ofClass("Assure").map((a) => ({ id: a.id, label: g.label(a.id), conducteur: g.isA(a.id, "Conducteur") })),
    conducteurs: g.ofClass("Conducteur").map((a) => ({ id: a.id, label: g.label(a.id) })),
    personnes: g.ofClass("Personne").map((a) => ({ id: a.id, label: g.label(a.id), roles: a.types })),
    baremes: g.ofClass("BaremeIndemnisation").map((b) => ({
      id: b.id,
      tauxIndemnisation: g.num(b.id, "tauxIndemnisation"),
      plafondIndemnisation: g.num(b.id, "plafondIndemnisation"),
      regleCalcul: g.str(b.id, "regleCalcul"),
    })),
    franchises: g.ofClass("Franchise").map((f) => ({ id: f.id, montantFranchise: g.num(f.id, "montantFranchise") })),
    clauses: g.ofClass("Clause").map((c) => ({ id: c.id, texte: g.str(c.id, "texteClause") })),
    enums: {
      vehicleTypes: VEHICLE_TYPES,
      contractTypes: CONTRACT_TYPES.map((id) => ({ id, label: CONTRACT_TYPE_LABELS[id], required: REQUIRED_GUARANTEES[id] })),
      contractStatus: CONTRACT_STATUS,
      frequencies: FREQUENCIES,
      guaranteeTypes: GUARANTEE_KEYS.map((id) => ({ id, label: GUARANTEE_TYPES[id].label, plafond: GUARANTEE_TYPES[id].plafond })),
      claimTypes: CLAIM_TYPES.map((id) => ({ id, label: CLAIM_TYPE_LABELS[id] })),
      claimStatus: CLAIM_STATUS,
      damageTypes: DAMAGE_TYPES.map((id) => ({ id, label: DAMAGE_TYPE_LABELS[id] })),
      severities: SEVERITIES,
      indemnificationStatus: INDEM_STATUS,
    },
  };
}
