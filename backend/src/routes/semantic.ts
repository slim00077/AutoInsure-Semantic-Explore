import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../errors.js";
import { semantic } from "../semantic/client.js";
import { invalidateGraph } from "../semantic/graph.js";
import { withWriteLock } from "../semantic/sparql.js";
import { activityLog, JsonLog, logActivity } from "../util/jsonLog.js";
import { SPARQL_EXAMPLES } from "../domain/sparqlExamples.js";

// ------------------------------------------------------------------ ontologie
export const ontologyRouter = Router();
const ident = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);

ontologyRouter.get("/classes", asyncHandler(async (_q, res) => res.json(await semantic.get("/ontology/classes"))));
ontologyRouter.get("/properties", asyncHandler(async (_q, res) => res.json(await semantic.get("/ontology/properties"))));
ontologyRouter.get("/individuals", asyncHandler(async (req, res) => {
  const type = z.object({ type: ident.optional() }).parse(req.query).type;
  res.json(await semantic.get("/ontology/individuals", type ? { type } : undefined));
}));
ontologyRouter.get("/individuals/:id", asyncHandler(async (req, res) => res.json(await semantic.get(`/ontology/individuals/${ident.parse(req.params.id)}`))));
ontologyRouter.get("/graph", asyncHandler(async (req, res) => {
  const { level } = z.object({ level: z.enum(["schema", "instances"]).default("schema") }).parse(req.query);
  res.json(await semantic.get("/ontology/graph", { level }));
}));
ontologyRouter.get("/statistics", asyncHandler(async (_q, res) => res.json(await semantic.get("/ontology/statistics"))));
ontologyRouter.get("/validate", asyncHandler(async (_q, res) => res.json(await semantic.get("/ontology/validate"))));
ontologyRouter.get("/export", asyncHandler(async (req, res) => {
  const { format } = z.object({ format: z.enum(["xml", "turtle", "nt", "jsonld"]).default("xml") }).parse(req.query);
  const r = await semantic.raw("/ontology/export", { format });
  const ext = { xml: "owl", turtle: "ttl", nt: "nt", jsonld: "jsonld" }[format];
  res.setHeader("Content-Type", String(r.headers["content-type"] ?? "text/plain"));
  res.setHeader("Content-Disposition", `attachment; filename="assurance_auto_export.${ext}"`);
  res.send(r.data);
}));
ontologyRouter.get("/activity", asyncHandler(async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(20) }).parse(req.query);
  res.json(activityLog.list(limit));
}));
ontologyRouter.post("/reset", asyncHandler(async (_q, res) => {
  const r = await withWriteLock(() => semantic.post("/store/reset"));
  invalidateGraph();
  logActivity("reset", "Ontologie", undefined, "Retour à l'ontologie d'origine");
  res.json(r);
}));

// ------------------------------------------------------------------ SPARQL
interface HistoryEntry { id: string; ts: string; kind: "query" | "update"; text: string; ok: boolean; count?: number; ms?: number; error?: string }
const history = new JsonLog<HistoryEntry>("sparql_history", 100);

export const sparqlRouter = Router();
const queryBody = z.object({ query: z.string().min(1, "requête vide").max(20000), limit: z.number().int().min(1).max(10000).optional() });
const updateBody = z.object({ update: z.string().min(1, "requête vide").max(100000) });

sparqlRouter.post("/query", asyncHandler(async (req, res) => {
  const b = queryBody.parse(req.body);
  try {
    const r = await semantic.query(b.query, b.limit);
    history.push({ ts: new Date().toISOString(), kind: "query", text: b.query, ok: true, count: "count" in r ? (r.count as number) : undefined, ms: r.executionMs });
    res.json(r);
  } catch (e) {
    history.push({ ts: new Date().toISOString(), kind: "query", text: b.query, ok: false, error: e instanceof HttpError ? e.message : String(e) });
    throw e;
  }
}));
sparqlRouter.post("/update", asyncHandler(async (req, res) => {
  const b = updateBody.parse(req.body);
  try {
    const r = await withWriteLock(() => semantic.update(b.update));
    invalidateGraph();
    history.push({ ts: new Date().toISOString(), kind: "update", text: b.update, ok: true, ms: r.executionMs, count: r.added + r.removed });
    logActivity("sparql", "SPARQL Update", undefined, `+${r.added} / −${r.removed} triplets`);
    res.json(r);
  } catch (e) {
    history.push({ ts: new Date().toISOString(), kind: "update", text: b.update, ok: false, error: e instanceof HttpError ? e.message : String(e) });
    throw e;
  }
}));
sparqlRouter.get("/history", (_req, res) => res.json(history.list(50)));
sparqlRouter.delete("/history", (_req, res) => {
  history.clear();
  res.status(204).end();
});
sparqlRouter.get("/examples", (_req, res) => res.json(SPARQL_EXAMPLES));

// ------------------------------------------------------------------ NLP
interface NlpHistory { id: string; ts: string; question: string; status: string; intent?: string | null; count?: number }
const nlpHistory = new JsonLog<NlpHistory>("nlp_history", 100);
const question = z.object({ question: z.string().trim().min(1, "question vide").max(500, "500 caractères maximum") });

export const nlpRouter = Router();
nlpRouter.post("/translate", asyncHandler(async (req, res) => {
  const { question: q } = question.parse(req.body);
  res.json(await semantic.post("/nlp/translate", { question: q }));
}));
nlpRouter.post("/search", asyncHandler(async (req, res) => {
  const { question: q } = question.parse(req.body);
  const r = await semantic.post<{ status: string; intent?: string; result?: { count?: number } }>("/nlp/search", { question: q });
  nlpHistory.push({ ts: new Date().toISOString(), question: q, status: r.status, intent: r.intent, count: r.result?.count });
  res.json(r);
}));
nlpRouter.get("/module", asyncHandler(async (_q, res) => res.json(await semantic.get("/nlp/module"))));
nlpRouter.get("/history", (_req, res) => res.json(nlpHistory.list(30)));
nlpRouter.delete("/history", (_req, res) => {
  nlpHistory.clear();
  res.status(204).end();
});
