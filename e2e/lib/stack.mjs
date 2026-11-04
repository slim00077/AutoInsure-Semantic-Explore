// Pile AutoInsure ISOLÉE pour les tests : service Python (RDFLib+spaCy), API Express et front Vite,
// sur des ports dédiés et avec un dossier de données TEMPORAIRE. Aucun fichier de data/ du projet n'est touché.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
const isWin = process.platform === "win32";
const venvPython = isWin
  ? path.join(ROOT, "semantic-service", ".venv", "Scripts", "python.exe")
  : path.join(ROOT, "semantic-service", ".venv", "bin", "python");

export const DEFAULT_PORTS = { semantic: 8201, api: 4100, web: 5273 };

async function waitFor(url, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${label} n'a pas démarré (${url}) dans les ${timeoutMs} ms.`);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWin) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

export class Stack {
  constructor({ dataDir, ports = DEFAULT_PORTS, quiet = true } = {}) {
    this.dataDir = dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "autoinsure-e2e-"));
    this.ports = ports;
    this.quiet = quiet;
    this.children = {};
    this.logs = {};
  }

  get urls() {
    return {
      semantic: `http://127.0.0.1:${this.ports.semantic}`,
      api: `http://localhost:${this.ports.api}/api`,
      web: `http://localhost:${this.ports.web}`,
    };
  }

  get livePath() {
    return path.join(this.dataDir, "assurance_live.ttl");
  }

  _spawn(name, cmd, args, opts) {
    const log = fs.createWriteStream(path.join(this.dataDir, `${name}.log`), { flags: "a" });
    const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    this.children[name] = child;
    return child;
  }

  async startPython() {
    this._spawn("python", venvPython, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(this.ports.semantic), "--log-level", "warning"], {
      cwd: path.join(ROOT, "semantic-service"),
      env: { ...process.env, DATA_DIR: this.dataDir, PYTHONUTF8: "1" },
    });
    await waitFor(`${this.urls.semantic}/health`, 120_000, "Service Python");
  }

  async startExpress() {
    const tsx = path.join(ROOT, "backend", "node_modules", "tsx", "dist", "cli.mjs");
    this._spawn("express", process.execPath, [tsx, "src/index.ts"], {
      cwd: path.join(ROOT, "backend"),
      env: {
        ...process.env,
        PORT: String(this.ports.api),
        CORS_ORIGIN: this.urls.web,
        SEMANTIC_URL: this.urls.semantic,
        DATA_DIR: this.dataDir,
        LOG_LEVEL: "warn",
      },
    });
    await waitFor(`${this.urls.api}/health`, 60_000, "API Express");
  }

  async startWeb() {
    const vite = path.join(ROOT, "frontend", "node_modules", "vite", "bin", "vite.js");
    this._spawn("vite", process.execPath, [vite, "--port", String(this.ports.web), "--strictPort", "--host", "localhost"], {
      cwd: path.join(ROOT, "frontend"),
      env: { ...process.env, VITE_API_URL: `http://localhost:${this.ports.api}` },
    });
    await waitFor(this.urls.web, 60_000, "Front Vite");
  }

  stop(name) {
    killTree(this.children[name]);
    delete this.children[name];
  }

  async waitDown(url, timeoutMs = 15_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await fetch(url);
      } catch {
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`${url} répond encore après l'arrêt.`);
  }

  async startAll() {
    await this.startPython();
    await this.startExpress();
    await this.startWeb();
  }

  stopAll() {
    for (const n of Object.keys(this.children)) this.stop(n);
  }

  cleanup() {
    this.stopAll();
    try {
      fs.rmSync(this.dataDir, { recursive: true, force: true });
    } catch {
      /* fichiers encore verrouillés : sans conséquence, dossier temporaire */
    }
  }
}
