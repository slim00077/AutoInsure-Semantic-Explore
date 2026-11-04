import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./errors.js";
import { logger } from "./logger.js";
import { semantic } from "./semantic/client.js";
import { crudRouter } from "./routes/crud.js";
import { nlpRouter, ontologyRouter, sparqlRouter } from "./routes/semantic.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) => {
    const t = Date.now();
    res.on("finish", () => logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t} ms)`));
    next();
  });

  app.get("/api/health", async (_req, res) => {
    try {
      const s = await semantic.get<Record<string, unknown>>("/health");
      res.json({ status: "ok", api: "express", semantic: s });
    } catch {
      res.status(503).json({ status: "degraded", api: "express", semantic: "unreachable" });
    }
  });

  app.use("/api/ontology", ontologyRouter);
  app.use("/api/sparql", sparqlRouter);
  app.use("/api/nlp", nlpRouter);
  app.use("/api", crudRouter);

  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route inconnue." } }));
  app.use(errorHandler);
  return app;
}
