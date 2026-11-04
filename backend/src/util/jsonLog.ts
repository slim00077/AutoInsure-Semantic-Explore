/**
 * Petit journal JSON (données SECONDAIRES : activité, historiques de requêtes).
 * L'ontologie RDF/OWL reste l'unique source de vérité métier.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

export class JsonLog<T extends { id: string }> {
  private items: T[] = [];
  private file: string;
  constructor(
    name: string,
    private max = 200,
  ) {
    this.file = path.join(config.dataDir, `${name}.json`);
    try {
      this.items = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.items = [];
    }
  }
  private persist() {
    if (config.isTest) return;
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.items, null, 1));
    } catch (e) {
      logger.warn("Écriture du journal impossible", String(e));
    }
  }
  push(item: Omit<T, "id">): T {
    const full = { ...item, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` } as T;
    this.items.unshift(full);
    this.items = this.items.slice(0, this.max);
    this.persist();
    return full;
  }
  list(limit = 50): T[] {
    return this.items.slice(0, limit);
  }
  clear() {
    this.items = [];
    this.persist();
  }
}

export interface ActivityEntry {
  id: string;
  ts: string;
  action: "create" | "update" | "delete" | "sparql" | "reset";
  entity: string;
  entityId?: string;
  label?: string;
}
export const activityLog = new JsonLog<ActivityEntry>("activity_log", 300);

export function logActivity(action: ActivityEntry["action"], entity: string, entityId?: string, label?: string) {
  activityLog.push({ ts: new Date().toISOString(), action, entity, entityId, label });
}
