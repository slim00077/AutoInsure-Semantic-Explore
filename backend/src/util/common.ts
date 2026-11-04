import { z } from "zod";
import { HttpError } from "../errors.js";
import type { Graph } from "../semantic/graph.js";

// ----------------------------------------------------------------- validations réutilisables
export const nameStr = z
  .string({ required_error: "requis" })
  .trim()
  .min(1, "requis")
  .max(60, "60 caractères maximum")
  .regex(/^[\p{L}][\p{L}\s'.-]*$/u, "lettres, espaces, apostrophes et tirets uniquement");

export const textStr = (max = 500) => z.string().trim().min(1, "requis").max(max, `${max} caractères maximum`);

export const dateStr = z
  .string({ required_error: "requis" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "format AAAA-MM-JJ attendu")
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 2200;
  }, "date invalide");

export const money = z.coerce.number({ invalid_type_error: "nombre attendu" }).finite().min(0, "doit être positif ou nul").max(1e9, "trop élevé");

export const idStr = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,80}$/, "identifiant invalide");

export const today = () => new Date().toISOString().slice(0, 10);

/** Convertit un identifiant en PascalCase ASCII stable pour une personne (« Ahmed » + « Ben Ali » -> AhmedBenAli). */
export function personId(g: Graph, prenom: string, nom: string): string {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  const base = slug(prenom) + slug(nom) || "Personne";
  let id = base;
  let n = 2;
  while (g.has(id)) id = `${base}${n++}`;
  return id;
}

// ----------------------------------------------------------------- vérifications de modèle
export function assertIndividual(g: Graph, id: string, cls: string, what: string, field = "id") {
  if (!g.has(id)) throw new HttpError(422, "VALIDATION_ERROR", `${what} « ${id} » introuvable (${field}).`);
  if (!g.isA(id, cls)) throw new HttpError(422, "VALIDATION_ERROR", `« ${id} » n'est pas de type ${cls} (${field}) : domaine/range de l'ontologie non respecté.`);
}

export function mustExist(g: Graph, id: string, cls: string, what: string) {
  if (!g.has(id) || !g.isA(id, cls)) throw new HttpError(404, "NOT_FOUND", `${what} introuvable.`);
}

export function ensureUnique(g: Graph, cls: string, prop: string, value: string, exceptId: string | null, what: string) {
  const clash = g.ofClass(cls).find((i) => i.id !== exceptId && (g.str(i.id, prop) ?? "").toLowerCase() === value.toLowerCase());
  if (clash) throw new HttpError(409, "CONFLICT", `${what} « ${value} » déjà utilisé(e) par ${clash.id}.`);
}

// ----------------------------------------------------------------- liste, recherche, pagination
export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  sort: z.string().regex(/^[A-Za-z]+$/).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export function paginate<T extends Record<string, unknown>>(items: T[], q: z.infer<typeof listQuery>, searchable: (item: T) => string) {
  let out = items;
  if (q.q) {
    const needle = q.q.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    out = out.filter((i) =>
      searchable(i).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(needle),
    );
  }
  if (q.sort) {
    const key = q.sort;
    out = [...out].sort((a, b) => {
      const x = a[key] as string | number | null | undefined;
      const y = b[key] as string | number | null | undefined;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return q.order === "desc" ? -cmp : cmp;
    });
  }
  const total = out.length;
  const start = (q.page - 1) * q.pageSize;
  return { items: out.slice(start, start + q.pageSize), total, page: q.page, pageSize: q.pageSize };
}

export const boolParam = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// ----------------------------------------------------------------- identifiants & références
/** Génère des identifiants `Prefix_001...` sans collision, y compris plusieurs dans la même opération. */
export class Minter {
  private reserved = new Set<string>();
  constructor(private g: Graph) {}
  next(prefix: string): string {
    const re = new RegExp(`^${prefix}_(\\d+)$`);
    let max = 0;
    for (const id of [...this.g.inds.keys(), ...this.reserved]) {
      const m = re.exec(id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const id = `${prefix}_${String(max + 1).padStart(3, "0")}`;
    this.reserved.add(id);
    return id;
  }
  /** Identifiant unique pour une personne (suffixe numérique si le nom est déjà pris). */
  person(prenom: string, nom: string): string {
    const base = personId(this.g, prenom, nom).replace(/\d+$/, "");
    let id = base;
    let n = 2;
    while (this.g.has(id) || this.reserved.has(id)) id = `${base}${n++}`;
    this.reserved.add(id);
    return id;
  }
}

export const ref = (g: Graph, id: string | null | undefined) => (id ? { id, label: g.label(id) } : null);

/** Refuse la suppression si l'individu est encore référencé (hors propriétés `allowed` nettoyées automatiquement). */
export function refuseIfReferenced(g: Graph, id: string, what: string, allowed: string[] = []) {
  const refs = g.referencedBy(id).filter((r) => !allowed.includes(r.prop));
  if (refs.length) {
    throw new HttpError(409, "CONFLICT", `${what} est référencé(e) par ${[...new Set(refs.map((r) => r.from))].join(", ")} : suppression refusée pour préserver l'intégrité des relations.`, {
      references: refs,
    });
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
