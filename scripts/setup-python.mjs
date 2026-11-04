// Crée le venv Python, installe les dépendances et télécharge le modèle spaCy français.
import { spawnSync } from "node:child_process";
import { hasVenv, serviceDir, venvPython } from "./python.mjs";

const run = (cmd, args, opts = {}) => {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: serviceDir, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!hasVenv()) {
  // Python 3.10 à 3.12 recommandé (roues spaCy). Sous Windows : py -3.11
  const candidates = process.platform === "win32" ? [["py", ["-3.11", "-m", "venv", ".venv"]], ["python", ["-m", "venv", ".venv"]]] : [["python3", ["-m", "venv", ".venv"]]];
  let ok = false;
  for (const [c, a] of candidates) {
    const r = spawnSync(c, a, { stdio: "inherit", cwd: serviceDir });
    if (r.status === 0) { ok = true; break; }
  }
  if (!ok) { console.error("Impossible de créer le venv (Python 3.10–3.12 requis)."); process.exit(1); }
}
run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"]);
run(venvPython, ["-m", "spacy", "download", "fr_core_news_md"]);
console.log("Python prêt.");
