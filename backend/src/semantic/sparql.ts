/**
 * Construction sûre de requêtes SPARQL Update.
 * Aucune valeur utilisateur n'est concaténée sans passer par iri() / str() / dec() / int() / dateTime().
 */
import { HttpError } from "../errors.js";
import { semantic } from "./client.js";

const LOCAL_RE = /^[A-Za-z][A-Za-z0-9_]{0,80}$/;
const PROP_RE = /^[A-Za-z][A-Za-z0-9]{0,60}$/;

/** IRI d'un individu ou d'une classe de l'ontologie (nom local validé). */
export function iri(local: string): string {
  if (!LOCAL_RE.test(local)) throw new HttpError(400, "BAD_IDENTIFIER", `Identifiant invalide : ${JSON.stringify(local)}`);
  return `actors:${local}`;
}
export function prop(local: string): string {
  if (!PROP_RE.test(local)) throw new HttpError(500, "BAD_PROPERTY", `Propriété invalide : ${local}`);
  return `actors:${local}`;
}
/** Littéral chaîne échappé (plain literal, comme dans l'ontologie Protégé). */
export function str(value: string): string {
  const v = String(value).slice(0, 2000);
  return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n").replace(/\t/g, " ") + '"';
}
export function dec(n: number): string {
  if (!Number.isFinite(n)) throw new HttpError(400, "BAD_NUMBER", "Nombre invalide.");
  return `"${n}"^^xsd:decimal`;
}
export function int(n: number): string {
  if (!Number.isInteger(n)) throw new HttpError(400, "BAD_NUMBER", "Entier invalide.");
  return `"${n}"^^xsd:integer`;
}
/** date ISO yyyy-mm-dd -> xsd:dateTime (comme dans l'ontologie : minuit). */
export function dateTime(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, "BAD_DATE", "Date invalide (AAAA-MM-JJ attendu).");
  return `"${d}T00:00:00"^^xsd:dateTime`;
}

type Obj = string; // terme SPARQL déjà sérialisé (iri(), str(), dec()...)

/** Accumulateur d'opérations exécutées dans UNE requête Update (atomique côté service : rollback si erreur). */
export class UpdateBuilder {
  private ops: string[] = [];
  private triples: string[] = [];

  private flush() {
    if (this.triples.length) {
      this.ops.push(`INSERT DATA {\n  ${this.triples.join("\n  ")}\n}`);
      this.triples = [];
    }
  }
  /** Déclare un individu nommé avec ses classes et propriétés (data + object). */
  node(id: string, types: string[], props: Array<[string, Obj | undefined | null]> = []) {
    const s = iri(id);
    this.triples.push(`${s} a owl:NamedIndividual .`);
    for (const t of types) this.triples.push(`${s} a ${iri(t)} .`);
    for (const [p, o] of props) if (o !== undefined && o !== null) this.triples.push(`${s} ${prop(p)} ${o} .`);
    return this;
  }
  add(subject: string, p: string, object: Obj) {
    this.triples.push(`${iri(subject)} ${prop(p)} ${object} .`);
    return this;
  }
  /** Lien objet + son inverse (owl:inverseOf non raisonné côté RDFLib). */
  link(subject: string, p: string, object: string, inverse?: string) {
    this.add(subject, p, iri(object));
    if (inverse) this.add(object, inverse, iri(subject));
    return this;
  }
  addType(id: string, cls: string) {
    this.triples.push(`${iri(id)} a ${iri(cls)} .`);
    return this;
  }
  unlink(subject: string, p: string, object: string, inverse?: string) {
    this.flush();
    this.ops.push(`DELETE DATA { ${iri(subject)} ${prop(p)} ${iri(object)} . }`);
    if (inverse) this.ops.push(`DELETE DATA { ${iri(object)} ${prop(inverse)} ${iri(subject)} . }`);
    return this;
  }
  /** Supprime toutes les valeurs d'une propriété d'un individu. */
  clear(id: string, p: string) {
    this.flush();
    this.ops.push(`DELETE WHERE { ${iri(id)} ${prop(p)} ?o }`);
    return this;
  }
  removeType(id: string, cls: string) {
    this.flush();
    this.ops.push(`DELETE DATA { ${iri(id)} a ${iri(cls)} . }`);
    return this;
  }
  /** Supprime un individu et toutes les références vers lui. */
  drop(id: string) {
    this.flush();
    this.ops.push(`DELETE WHERE { ${iri(id)} ?p ?o }`);
    this.ops.push(`DELETE WHERE { ?s ?p ${iri(id)} }`);
    return this;
  }
  get isEmpty() {
    return this.ops.length === 0 && this.triples.length === 0;
  }
  build(): string {
    this.flush();
    return this.ops.join(" ;\n");
  }
  async run() {
    if (this.isEmpty) return { added: 0, removed: 0, totalTriples: 0, executionMs: 0 };
    return semantic.update(this.build());
  }
}

/** Verrou d'écriture : sérialise les opérations CRUD du processus (évite deux identifiants identiques). */
let chain: Promise<unknown> = Promise.resolve();
export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
