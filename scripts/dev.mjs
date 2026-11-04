// Démarre les 3 processus (service sémantique, API Express, front React) avec des logs préfixés.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const procs = [
  ["semantic", "\x1b[35m", process.execPath, ["scripts/run-semantic.mjs"]],
  ["backend ", "\x1b[34m", npm, ["--prefix", "backend", "run", "dev"]],
  ["frontend", "\x1b[32m", npm, ["--prefix", "frontend", "run", "dev"]],
];
const children = procs.map(([name, color, cmd, args]) => {
  const c = spawn(cmd, args, { cwd: root, shell: process.platform === "win32", env: process.env });
  const out = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`${color}[${name}]\x1b[0m ${l}`));
  c.stdout.on("data", out);
  c.stderr.on("data", out);
  c.on("exit", (code) => console.log(`[${name}] arrêté (code ${code})`));
  return c;
});
const stop = () => children.forEach((c) => { try { c.kill(); } catch {} });
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("exit", stop);
console.log("→ Front : http://localhost:5173   API : http://localhost:4000/api   Service sémantique : http://127.0.0.1:8001/docs");
