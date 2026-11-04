// Test de persistance et de redémarrage de TOUTE l'application, sur une pile isolée (ports 8221/4120/5221, dossier temporaire).
// Scénario : créer un individu → vérifier le RDF → arrêter/relancer Python → vérifier → arrêter/relancer Express → vérifier l'API
// → vérifier que l'interface React lit toujours le même individu → sauvegardes, réinitialisation, fichier corrompu.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Stack } from "./lib/stack.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const stack = new Stack({ ports: { semantic: 8221, api: 4120, web: 5221 } });
const API = stack.urls.api;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? " — " + detail : ""}`);
};
const jget = async (url) => (await fetch(url)).json();
const post = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ask = async (iri) => (await post(`${API}/sparql/query`, { query: `ASK { actors:${iri} a actors:Assure }` })).body?.boolean === true;
const liveText = () => fs.readFileSync(stack.livePath, "utf8");

let browser;
try {
  console.log(`Dossier de données TEMPORAIRE : ${stack.dataDir}`);
  await stack.startAll();
  const base = await jget(`${stack.urls.semantic}/health`);
  check("Démarrage : graphe chargé depuis l'ontologie d'origine puis persisté", base.source === "original" && fs.existsSync(stack.livePath), `${base.triples} triplets, source=${base.source}`);

  // 1. créer un individu de test via l'API Express
  const created = await post(`${API}/insured`, { prenom: "Persist", nom: "Redemarrage", numeroPermis: "PERSIST01", conducteur: true });
  check("1. Création d'un assuré de test (HTTP 201)", created.status === 201, created.body?.id);
  const id = created.body.id;
  // 2. présent dans le RDF (requête SPARQL) et dans le fichier persistant
  check("2. L'individu existe dans le graphe RDF (ASK SPARQL)", await ask(id));
  check("2. L'individu est écrit dans data/assurance_live.ttl", liveText().includes(id) && liveText().includes("PERSIST01"));
  const triplesBefore = (await jget(`${stack.urls.semantic}/health`)).triples;

  // 3. arrêt du service Python : l'API le signale proprement, l'interface affiche une erreur gérée
  stack.stop("python");
  await stack.waitDown(`${stack.urls.semantic}/health`);
  const h503 = await fetch(`${API}/health`);
  check("3. Python arrêté : l'API Express répond 503 « degraded » (pas de plantage)", h503.status === 503, (await h503.json()).status);
  const r503 = await fetch(`${API}/insured`);
  const e503 = await r503.json();
  check("3. Python arrêté : une route métier renvoie une erreur JSON structurée (503)", r503.status === 503 && !!e503.error?.code, e503.error?.code);

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await page.goto(`${stack.urls.web}/app/insured`);
  const alert = page.getByRole("alert").first();
  await alert.waitFor({ timeout: 20_000 });
  check("3. Python arrêté : l'interface React affiche un message d'erreur et un bouton Réessayer", (await alert.innerText()).length > 10 && (await alert.getByRole("button", { name: "Réessayer" }).count()) === 1, (await alert.innerText()).replace(/\s+/g, " ").slice(0, 100));
  fs.mkdirSync(path.join(here, "screenshots"), { recursive: true });
  await page.screenshot({ path: path.join(here, "screenshots", "persistence-1-python-down.png") });

  // 4. redémarrage de Python : les données sont toujours là
  await stack.startPython();
  const h = await jget(`${stack.urls.semantic}/health`);
  check("4. Python relancé : le graphe est rechargé depuis le fichier persistant (source=live)", h.source === "live", `source=${h.source}`);
  check("4. Python relancé : même nombre de triplets", h.triples === triplesBefore, `${h.triples} = ${triplesBefore}`);
  check("4. Python relancé : l'individu existe toujours", await ask(id));

  // 5. arrêt / redémarrage d'Express
  stack.stop("express");
  await stack.waitDown(`${API}/health`);
  check("5. Express arrêté : le port de l'API ne répond plus", true);
  await stack.startExpress();
  const apiH = await jget(`${API}/health`);
  check("5. Express relancé : /api/health ok et service sémantique joignable", apiH.status === "ok" && apiH.semantic.triples === triplesBefore, `triples=${apiH.semantic.triples}`);
  const found = await jget(`${API}/insured?q=Persist`);
  check("6. API : GET /api/insured retrouve le même individu après les deux redémarrages", found.total === 1 && found.items[0].id === id && found.items[0].numeroPermis === "PERSIST01");

  // 7. l'interface React lit le même individu
  await page.goto(`${stack.urls.web}/app/insured`);
  await page.getByPlaceholder(/Rechercher par nom/).fill("Persist");
  const row = page.getByRole("row").filter({ hasText: "Persist Redemarrage" });
  await row.waitFor({ timeout: 20_000 });
  check("7. Interface React : la ligne « Persist Redemarrage » s'affiche avec son permis", (await row.innerText()).includes("PERSIST01"));
  await page.screenshot({ path: path.join(here, "screenshots", "persistence-2-ui-after-restarts.png") });

  // 8. chemins, permissions, fichiers temporaires, sauvegardes
  check("8. Fichier persistant lisible et inscriptible", (() => { try { fs.accessSync(stack.livePath, fs.constants.R_OK | fs.constants.W_OK); return true; } catch { return false; } })());
  check("8. Aucun fichier temporaire d'écriture atomique résiduel (*.tmp)", fs.readdirSync(stack.dataDir).filter((f) => f.endsWith(".tmp")).length === 0);
  const del = await post(`${API}/sparql/update`, { update: `DELETE WHERE { actors:${id} ?p ?o }` });
  check("8. Suppression ciblée via SPARQL Update acceptée", del.status === 200, JSON.stringify(del.body));
  const backups = fs.existsSync(path.join(stack.dataDir, "backups")) ? fs.readdirSync(path.join(stack.dataDir, "backups")) : [];
  check("8. Une sauvegarde « before_update » a été créée avant la suppression", backups.some((b) => b.startsWith("assurance_before_update_")), backups.join(", "));
  check("8. L'individu supprimé n'est plus dans le fichier persistant", !liveText().includes("PERSIST01"));
  const wipe = await post(`${API}/sparql/update`, { update: "DELETE WHERE { ?s ?p ?o }" });
  check("8. Effacement massif DELETE WHERE { ?s ?p ?o } REFUSÉ (403) et graphe intact", wipe.status === 403 && (await jget(`${stack.urls.semantic}/health`)).triples > 800, `HTTP ${wipe.status}`);

  // 9. fichier persistant corrompu → récupération automatique
  await post(`${API}/insured`, { prenom: "Avant", nom: "Corruption", numeroPermis: "AVANT0001", conducteur: false });
  await post(`${API}/sparql/update`, { update: `DELETE WHERE { actors:AvantCorruption ?p ?o }` }); // crée une sauvegarde contenant l'état précédent
  stack.stop("python");
  await stack.waitDown(`${stack.urls.semantic}/health`);
  fs.writeFileSync(stack.livePath, "@prefix : <x> . fichier corrompu volontairement ###");
  await stack.startPython();
  const hr = await jget(`${stack.urls.semantic}/health`);
  check("9. Fichier persistant corrompu : le service démarre quand même (récupération)", hr.status === "ok" && String(hr.source).startsWith("recovered:"), `source=${hr.source}`);
  check("9. Le fichier corrompu est conservé (assurance_live.corrupt-*.ttl), pas supprimé", fs.readdirSync(stack.dataDir).some((f) => f.startsWith("assurance_live.corrupt-")));
  check("9. /health expose les détails de la récupération", !!hr.recovery?.corruptFile && !!hr.recovery?.restoredFrom, JSON.stringify(hr.recovery));
  check("9. Les données de l'ontologie sont de nouveau disponibles", hr.triples > 800, `${hr.triples} triplets`);

  // 10. réinitialisation avec sauvegarde
  const reset = await post(`${API}/ontology/reset`, {});
  check("10. Réinitialisation : sauvegarde « before_reset » créée", reset.status === 200 && String(reset.body?.backup).startsWith("assurance_before_reset_"), reset.body?.backup);
  check("10. Réinitialisation : retour à l'ontologie d'origine + extensions (846 triplets)", reset.body?.triples === 846, `${reset.body?.triples}`);
} catch (e) {
  check("exécution du scénario de persistance", false, String(e).slice(0, 500));
} finally {
  await browser?.close();
  stack.cleanup();
}
const out = path.join(root, "docs", "persistence_results.json");
fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\nBILAN : ${results.length - failed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 2 : 0);
