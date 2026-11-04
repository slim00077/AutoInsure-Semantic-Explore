// Lance la validation HermiT (cohérence, classes insatisfiables, classes définies, restrictions, tests de contraintes)
// sur ontology/assurance_auto.xml + extensions. Prérequis : JDK 17+ et Maven (ou le dossier target/lib déjà généré).
//   node tools/hermit-validator/run.mjs            -> écrit docs/hermit/hermit_output.txt
//   node tools/hermit-validator/run.mjs --cross    -> en plus : recoupement application ↔ HermiT (crosscheck.mjs)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const isWin = process.platform === "win32";
const local = process.env.LOCALAPPDATA ?? "";

function findJava() {
  const candidates = [
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin", isWin ? "java.exe" : "java"),
    isWin && path.join(local, "Programs", "Java", "jdk-21.0.13+9", "bin", "java.exe"),
    "java",
  ].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  throw new Error("Java introuvable : installez un JDK 17+ (ex. winget install EclipseAdoptium.Temurin.21.JDK) et définissez JAVA_HOME.");
}
function findTool(names, extraDirs) {
  for (const n of names) if (spawnSync(n, ["-version"], { encoding: "utf8", shell: isWin }).status === 0) return n;
  for (const d of extraDirs) for (const n of names) {
    const p = path.join(d, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const java = findJava();
const javaBin = path.dirname(java);
const javaHome = path.isAbsolute(java) ? path.dirname(javaBin) : process.env.JAVA_HOME;
const javac = path.join(javaBin, isWin ? "javac.exe" : "javac");
const sep = isWin ? ";" : ":";
const libDir = path.join(here, "target", "lib");
const classes = path.join(here, "target", "classes");

if (!fs.existsSync(libDir) || !fs.readdirSync(libDir).some((f) => f.startsWith("org.semanticweb.hermit"))) {
  const mvnDirs = isWin ? [path.join(local, "Programs", "Maven", "apache-maven-3.9.9", "bin")] : [];
  const mvn = findTool(isWin ? ["mvn.cmd", "mvn"] : ["mvn"], mvnDirs);
  if (!mvn) throw new Error("Maven introuvable et target/lib absent : installez Maven (https://maven.apache.org) puis relancez.");
  console.log("Téléchargement de HermiT + OWLAPI (Maven Central)…");
  const r = spawnSync(mvn, ["-q", "-B", "dependency:copy-dependencies", "-DoutputDirectory=target/lib"], { cwd: here, stdio: "inherit", shell: isWin, env: { ...process.env, JAVA_HOME: javaHome } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
fs.mkdirSync(classes, { recursive: true });
const src = path.join(here, "src", "main", "java", "fr", "autoinsure", "HermitValidation.java");
const c = spawnSync(javac, ["-encoding", "UTF-8", "--release", "17", "-cp", path.join(libDir, "*"), "-d", classes, src], { stdio: "inherit" });
if (c.status !== 0) process.exit(c.status ?? 1);

fs.mkdirSync(path.join(root, "docs", "hermit"), { recursive: true });
const run = spawnSync(java, ["-Dfile.encoding=UTF-8", "-cp", [classes, path.join(libDir, "*")].join(sep), "fr.autoinsure.HermitValidation",
  path.join(root, "ontology", "assurance_auto.xml"), path.join(root, "ontology", "assurance_auto_extensions.ttl"), path.join(root, "docs", "hermit", "hermit_output.txt")], { stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
if (process.argv.includes("--cross")) {
  const x = spawnSync(process.execPath, [path.join(here, "crosscheck.mjs")], { stdio: "inherit", env: { ...process.env, JAVA_HOME: javaHome } });
  process.exit(x.status ?? 1);
}
