import axios, { AxiosError } from "axios";
import { config } from "../config.js";
import { HttpError } from "../errors.js";
import { logger } from "../logger.js";

const http = axios.create({ baseURL: config.semanticUrl, timeout: 30_000 });

export interface RdfTerm {
  type: "uri" | "literal" | "bnode";
  value: string;
  local?: string;
  datatype?: string;
  lang?: string;
}
export type Row = Record<string, RdfTerm>;
export interface SelectResult {
  queryType: "SELECT";
  variables: string[];
  rows: Row[];
  count: number;
  truncated: boolean;
  executionMs: number;
}
export type QueryResult = SelectResult | { queryType: "ASK"; boolean: boolean; executionMs: number } | { queryType: string; triples: unknown[]; count: number; executionMs: number };

function translate(err: unknown): never {
  if (err instanceof HttpError) throw err;
  const e = err as AxiosError<{ error?: { code: string; message: string }; detail?: unknown }>;
  if (e.response) {
    const body = e.response.data;
    if (body?.error) throw new HttpError(e.response.status === 403 ? 403 : 400, body.error.code, body.error.message);
    if (typeof body?.detail === "string" && e.response.status >= 400 && e.response.status < 500) {
      throw new HttpError(e.response.status, e.response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST", body.detail);
    }
    throw new HttpError(502, "SEMANTIC_SERVICE_ERROR", `Le service sémantique a répondu ${e.response.status}.`, body);
  }
  logger.error("Service sémantique injoignable", e.message);
  throw new HttpError(503, "SEMANTIC_SERVICE_UNAVAILABLE", "Le service sémantique (Python/RDFLib) est injoignable. Lancez-le avec « npm run dev:semantic ».");
}

export const semantic = {
  async query(query: string, limit?: number): Promise<QueryResult> {
    try {
      return (await http.post("/sparql/query", { query, limit })).data;
    } catch (e) {
      return translate(e);
    }
  },
  async select(query: string): Promise<SelectResult> {
    const r = await this.query(query);
    if (r.queryType !== "SELECT") throw new HttpError(400, "BAD_QUERY", "SELECT attendu.");
    return r as SelectResult;
  },
  async update(update: string): Promise<{ added: number; removed: number; totalTriples: number; executionMs: number }> {
    try {
      return (await http.post("/sparql/update", { update })).data;
    } catch (e) {
      return translate(e);
    }
  },
  async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    try {
      return (await http.get(path, { params })).data;
    } catch (e) {
      return translate(e);
    }
  },
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    try {
      return (await http.post(path, body)).data;
    } catch (e) {
      return translate(e);
    }
  },
  async raw(path: string, params?: Record<string, unknown>) {
    try {
      return await http.get(path, { params, responseType: "text", transformResponse: (d) => d });
    } catch (e) {
      return translate(e);
    }
  },
};
