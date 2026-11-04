import { config } from "./config.js";

const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;

function log(level: Level, msg: string, meta?: unknown) {
  if (levels[level] < (levels[config.logLevel as Level] ?? 20)) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`;
  const out = meta === undefined ? line : `${line} ${typeof meta === "string" ? meta : JSON.stringify(meta)}`;
  (level === "error" ? console.error : console.log)(out);
}

export const logger = {
  debug: (m: string, meta?: unknown) => log("debug", m, meta),
  info: (m: string, meta?: unknown) => log("info", m, meta),
  warn: (m: string, meta?: unknown) => log("warn", m, meta),
  error: (m: string, meta?: unknown) => log("error", m, meta),
};
