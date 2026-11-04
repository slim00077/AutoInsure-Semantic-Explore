import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(here, "../../semantic-service");
const PORT = 8101;
let child: ChildProcess | undefined;
let dataDir = "";

async function waitHealthy(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Le service sémantique de test n'a pas démarré.");
}

export async function setup() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "autoinsure-test-"));
  const python =
    process.platform === "win32"
      ? path.join(serviceDir, ".venv", "Scripts", "python.exe")
      : path.join(serviceDir, ".venv", "bin", "python");
  child = spawn(python, ["-m", "uvicorn", "app.main:app", "--port", String(PORT), "--log-level", "warning"], {
    cwd: serviceDir,
    env: { ...process.env, DATA_DIR: dataDir, PYTHONUTF8: "1" },
    stdio: "ignore",
  });
  await waitHealthy();
}

export async function teardown() {
  child?.kill();
  if (process.platform === "win32" && child?.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* ignoré */
  }
}
