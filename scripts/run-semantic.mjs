// Lance le service sémantique (FastAPI + RDFLib + spaCy) ou ses tests (--test).
import { spawn } from "node:child_process";
import { hasVenv, serviceDir, venvPython } from "./python.mjs";

if (!hasVenv()) {
  console.error("Environnement Python introuvable. Exécutez d'abord : npm run setup");
  process.exit(1);
}
const test = process.argv.includes("--test");
const args = test ? ["-m", "pytest", "-q"] : ["-m", "uvicorn", "app.main:app", "--port", process.env.SEMANTIC_PORT ?? "8001", "--host", "127.0.0.1"];
const child = spawn(venvPython, args, { cwd: serviceDir, stdio: "inherit", env: { ...process.env, PYTHONUTF8: "1" } });
child.on("exit", (code) => process.exit(code ?? 0));
