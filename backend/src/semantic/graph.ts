/**
 * Index en mémoire des individus RDF (lu par SPARQL depuis le triple store).
 * Il est reconstruit dès que la version du store change : la source de vérité reste le graphe RDF/OWL.
 */
import { semantic } from "./client.js";

export interface Lit {
  value: string;
  datatype?: string;
}
export interface Individual {
  id: string;
  types: string[];
  data: Record<string, Lit[]>;
  links: Record<string, string[]>;
}

export class Graph {
  inds = new Map<string, Individual>();
  ancestors = new Map<string, Set<string>>();
  incoming = new Map<string, Array<{ from: string; prop: string }>>();

  get(id: string) {
    return this.inds.get(id);
  }
  has(id: string) {
    return this.inds.has(id);
  }
  /** Vrai si l'individu appartient à `cls` (classe directe ou ancêtre rdfs:subClassOf*). */
  isA(id: string, cls: string): boolean {
    const ind = this.inds.get(id);
    if (!ind) return false;
    return ind.types.some((t) => t === cls || this.ancestors.get(t)?.has(cls));
  }
  ofClass(cls: string): Individual[] {
    return [...this.inds.values()].filter((i) => this.isA(i.id, cls)).sort((a, b) => a.id.localeCompare(b.id));
  }
  /** Classe directe la plus spécifique parmi les sous-classes de `root` (ex. type de contrat). */
  subtypeOf(id: string, root: string): string | null {
    const ind = this.inds.get(id);
    return ind?.types.find((t) => t !== root && this.ancestors.get(t)?.has(root)) ?? ind?.types.find((t) => t === root) ?? null;
  }
  str(id: string, p: string): string | null {
    return this.inds.get(id)?.data[p]?.[0]?.value ?? null;
  }
  num(id: string, p: string): number | null {
    const v = this.str(id, p);
    return v === null ? null : Number(v);
  }
  date(id: string, p: string): string | null {
    return this.str(id, p)?.slice(0, 10) ?? null;
  }
  links(id: string, p: string): string[] {
    return [...(this.inds.get(id)?.links[p] ?? [])].sort();
  }
  link(id: string, p: string): string | null {
    return this.links(id, p)[0] ?? null;
  }
  referencedBy(id: string): Array<{ from: string; prop: string }> {
    return this.incoming.get(id) ?? [];
  }
  /** Identifiant suivant d'une série `Prefix_001`, `Prefix_002`... */
  nextId(prefix: string): string {
    const re = new RegExp(`^${prefix}_(\\d+)$`);
    let max = 0;
    for (const id of this.inds.keys()) {
      const m = re.exec(id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}_${String(max + 1).padStart(3, "0")}`;
  }
  /** Libellé lisible, identique à celui du service Python. */
  label(id: string): string {
    const s = (p: string) => this.str(id, p);
    if (s("prenom") || s("nom")) return [s("prenom"), s("nom")].filter(Boolean).join(" ");
    if (s("marque")) {
      const base = [s("marque"), s("modele")].filter(Boolean).join(" ");
      return s("immatriculation") ? `${base} (${s("immatriculation")})` : base;
    }
    return s("numeroContrat") ?? s("numeroSinistre") ?? s("raisonSociale") ?? id;
  }
}

const IND_QUERY = `SELECT ?s ?p ?o WHERE { ?s a owl:NamedIndividual . ?s ?p ?o }`;
const ANC_QUERY = `SELECT ?c ?a WHERE { ?c rdfs:subClassOf+ ?a . FILTER(isIRI(?a) && isIRI(?c)) }`;

let cache: { version: number; graph: Graph } | null = null;

export async function loadGraph(force = false): Promise<Graph> {
  const health = await semantic.get<{ version: number }>("/health");
  if (!force && cache && cache.version === health.version) return cache.graph;

  const [inds, anc] = await Promise.all([semantic.select(IND_QUERY), semantic.select(ANC_QUERY)]);
  const g = new Graph();
  for (const r of anc.rows) {
    const c = r.c.local!;
    if (!g.ancestors.has(c)) g.ancestors.set(c, new Set());
    g.ancestors.get(c)!.add(r.a.local!);
  }
  for (const r of inds.rows) {
    const id = r.s.local!;
    const p = r.p.local!;
    let ind = g.inds.get(id);
    if (!ind) g.inds.set(id, (ind = { id, types: [], data: {}, links: {} }));
    if (p === "type") {
      if (r.o.local !== "NamedIndividual") ind.types.push(r.o.local!);
    } else if (r.o.type === "uri") {
      (ind.links[p] ??= []).push(r.o.local!);
      const list = g.incoming.get(r.o.local!) ?? [];
      list.push({ from: id, prop: p });
      g.incoming.set(r.o.local!, list);
    } else {
      (ind.data[p] ??= []).push({ value: r.o.value, datatype: r.o.datatype?.split("#").pop() });
    }
  }
  cache = { version: health.version, graph: g };
  return g;
}

export function invalidateGraph() {
  cache = null;
}
