// Localise l'interpréteur Python du venv du service sémantique (Windows / Linux / macOS).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const serviceDir = path.join(root, "semantic-service");
export const venvPython = process.platform === "win32"
  ? path.join(serviceDir, ".venv", "Scripts", "python.exe")
  : path.join(serviceDir, ".venv", "bin", "python");
export const hasVenv = () => fs.existsSync(venvPython);
