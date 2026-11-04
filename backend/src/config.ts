import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim()),
  semanticUrl: process.env.SEMANTIC_URL ?? "http://127.0.0.1:8001",
  dataDir: path.resolve(backendRoot, process.env.DATA_DIR ?? "../data"),
  logLevel: process.env.LOG_LEVEL ?? "info",
  isTest: process.env.NODE_ENV === "test" || process.env.VITEST === "true",
};
