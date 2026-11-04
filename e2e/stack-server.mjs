// Démarre la pile isolée pour Playwright (webServer) et reste actif jusqu'à l'arrêt par Playwright.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Stack } from "./lib/stack.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stack = new Stack();
// Les tests lisent ce fichier pour connaître le dossier de données temporaire (vérification du fichier RDF persistant).
fs.writeFileSync(path.join(here, ".stack.json"), JSON.stringify({ dataDir: stack.dataDir, urls: stack.urls }));

const shutdown = () => {
  stack.cleanup();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => stack.stopAll());

try {
  await stack.startAll();
  console.log(`STACK PRÊTE — données temporaires : ${stack.dataDir}`);
  setInterval(() => {}, 1 << 30);
} catch (e) {
  console.error(e);
  stack.cleanup();
  process.exit(1);
}
