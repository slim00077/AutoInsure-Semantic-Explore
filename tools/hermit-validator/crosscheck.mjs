// Recoupement APPLICATION ↔ HERMIT.
// 1. démarre une pile ISOLÉE (service Python + Express, graphe temporaire, ports 8211/4110) ;
// 2. crée des données via l'API (contrat Actif, contrat Résilié, sinistre avec expertise, sinistre sans expertise) ;
// 3. exporte le graphe de l'application en RDF/XML ;
// 4. fait raisonner HermiT sur cet export (cohérence + classes définies ContratActif / SinistreExpertise) ;
// 5. compare avec les réponses de l'application (SPARQL équivalent + questions NLP).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Stack } from "../../e2e/lib/stack.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const javaHome = process.env.JAVA_HOME || path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Java", "jdk-21.0.13+9");
const javaCandidate = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
const javaBin = fs.existsSync(javaCandidate) ? javaCandidate : "java"; // sinon : java du PATH
const sep = process.platform === "win32" ? ";" : ":";
const cp = [path.join(here, "target", "classes"), path.join(here, "target", "lib", "*")].join(sep);

const stack = new Stack({ ports: { semantic: 8211, api: 4110, web: 5211 } });
const API = stack.urls.api;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? " — " + detail : ""}`);
};
const call = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};
const sparqlIds = async (q) => (await call("POST", `${API}/sparql/query`, { query: q })).rows.map((r) => r.x.local).sort();
const nlpIds = async (q) => {
  const r = await call("POST", `${API}/nlp/search`, { question: q });
  return r.status === "ok" ? [...new Set(r.result.rows.map((x) => x.x.local))].sort() : `STATUS:${r.status}`;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  await stack.startPython();
  await stack.startExpress();
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${new Date().getFullYear() + 1}${today.slice(4)}`;
  const refs = await call("GET", `${API}/references`);
  const compagnie = refs.compagnies[0].id;

  // --- données de test créées PAR L'APPLICATION (donc avec ses axiomes : garanties exigées, inverses, etc.)
  const insured = await call("POST", `${API}/insured`, { prenom: "Hermit", nom: "Crosscheck", numeroPermis: "HERMIT001", conducteur: true });
  const veh = await call("POST", `${API}/vehicles`, { marque: "Hm", modele: "Test", anneeFabrication: 2022, immatriculation: "HM-001-ZZ", valeurVehicule: 9000, type: "Voiture", conducteurId: insured.id, contratIds: [] });
  const mk = (n, statut) => call("POST", `${API}/contracts`, {
    type: "AssuranceResponsabiliteCivile", numeroContrat: n, dateDebut: today, dateFin: nextYear, statutContrat: statut,
    prime: { montantPrime: 400, frequencePaiement: "Annuelle" }, assureId: insured.id, compagnieId: compagnie, vehiculeIds: [veh.id], clauseIds: [], garanties: [],
  });
  const cActif = await mk("C-801", "Actif");
  const cResilie = await mk("C-802", "Resilie");
  const dmg = (d) => ({ type: "DommageMateriel", description: d, gravite: "Legere", coutEstime: 1200 });
  const claim = (d) => call("POST", `${API}/claims`, {
    type: "AccidentCirculation", dateSinistre: today, lieuSinistre: "Hermitville", descriptionSinistre: d, assureId: insured.id,
    contratId: cActif.id, vehiculeId: veh.id, dommages: [dmg(d)],
  });
  const s1 = await claim("sinistre avec expertise");
  const s2 = await claim("sinistre sans expertise");
  const expert = (await call("GET", `${API}/experts`)).items[0];
  await call("POST", `${API}/expertises`, { sinistreId: s1.id, expertId: expert.id, conclusion: "Expertise de recoupement", dateExpertise: today });
  console.log(`Données créées : ${cActif.id} (Actif), ${cResilie.id} (Résilié), ${s1.id} (expertisé), ${s2.id} (non expertisé)`);

  // --- export de l'application → HermiT
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermit-cross-"));
  const exportFile = path.join(dir, "export_application.rdf");
  const xml = await (await fetch(`${stack.urls.semantic}/ontology/export?format=xml`)).text();
  fs.writeFileSync(exportFile, xml);
  console.log(`Export RDF/XML de l'application : ${exportFile} (${xml.length} octets)`);
  const run = spawnSync(javaBin, ["-Dfile.encoding=UTF-8", "-cp", cp, "fr.autoinsure.HermitValidation", "--check-export", exportFile], { encoding: "utf8" });
  if (run.status !== 0 && run.status !== 3) throw new Error(`HermiT a échoué : ${run.stderr || run.stdout}`);
  const kv = Object.fromEntries(run.stdout.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const list = (v) => (v ? v.split(",").filter(Boolean).sort() : []);
  console.log("HermiT :", JSON.stringify(kv));

  check("HermiT : l'export de l'application est COHÉRENT (données créées via le CRUD)", kv.CONSISTENT === "true");
  check("HermiT : aucune classe insatisfiable", kv.UNSATISFIABLE === "");
  const hermitActif = list(kv.CONTRATACTIF), hermitExp = list(kv.SINISTREEXPERTISE);
  check("HermiT infère ContratActif pour le nouveau contrat Actif", hermitActif.includes(cActif.id));
  check("HermiT n'infère PAS ContratActif pour le contrat Résilié", !hermitActif.includes(cResilie.id));
  check("HermiT infère SinistreExpertise pour le sinistre expertisé", hermitExp.includes(s1.id));
  check("HermiT n'infère PAS SinistreExpertise pour le sinistre sans expertise", !hermitExp.includes(s2.id));

  // --- l'application doit donner les MÊMES ensembles
  const appActif = await sparqlIds(`SELECT ?x WHERE { ?x a/rdfs:subClassOf* actors:ContratAssurance ; actors:statutContrat "Actif" }`);
  const appExp = await sparqlIds(`SELECT ?x WHERE { ?x a/rdfs:subClassOf* actors:Sinistre ; actors:faitObjetDe ?e . ?e a actors:Expertise }`);
  check("Application (SPARQL équivalent) = HermiT pour ContratActif", same(appActif, hermitActif), `app=${appActif} hermit=${hermitActif}`);
  check("Application (SPARQL équivalent) = HermiT pour SinistreExpertise", same(appExp, hermitExp), `app=${appExp} hermit=${hermitExp}`);
  const nlpActif = await nlpIds("Quels contrats sont actifs ?");
  check("Recherche NLP « Quels contrats sont actifs ? » = ContratActif de HermiT", same(nlpActif, hermitActif), `nlp=${nlpActif}`);
  const nlpExp = await nlpIds("Quels sinistres ont fait l'objet d'une expertise ?");
  check("Recherche NLP « sinistres ayant fait l'objet d'une expertise » = SinistreExpertise de HermiT", same(nlpExp, hermitExp), `nlp=${nlpExp}`);
  const nlpNon = await nlpIds("Quels contrats ne sont pas actifs ?");
  const allContracts = await sparqlIds(`SELECT ?x WHERE { ?x a/rdfs:subClassOf* actors:ContratAssurance }`);
  check("NLP négation « contrats pas actifs » = complémentaire de ContratActif (HermiT)", same(nlpNon, allContracts.filter((c) => !hermitActif.includes(c))), `nlp=${nlpNon}`);
  const val = await call("GET", `${API}/ontology/validate`);
  check("Validation structurelle de l'application : aucune erreur sur ces données", val.errors.length === 0, `${val.errors.length} erreur(s)`);
} catch (e) {
  check("exécution du recoupement", false, String(e).slice(0, 400));
} finally {
  stack.cleanup();
}
const out = path.join(root, "docs", "hermit", "crosscheck_output.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\nBILAN : ${results.length - failed} réussi(s), ${failed} échec(s) — ${out}`);
process.exit(failed ? 2 : 0);
