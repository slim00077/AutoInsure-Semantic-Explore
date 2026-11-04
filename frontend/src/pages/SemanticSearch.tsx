import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, BookOpen, BrainCircuit, CheckCircle2, Clock, Cpu, HelpCircle, History, Quote, Search, Sparkles, Target, Terminal, XCircle } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { nlpApi } from "../lib/services";
import type { NlpResponse, SparqlRow } from "../lib/types";
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Spinner, Tabs } from "../components/ui";
import { errorMessage } from "../lib/api";
import { cn, dateFr, timeAgo } from "../lib/format";
import { useToast } from "../components/toast";

const EXAMPLES = [
  "Quels véhicules sont assurés par Ahmed ?",
  "Quels contrats couvrent le vol ?",
  "Quels sinistres concernent une Peugeot 208 ?",
  "Quel est le montant de l'indemnisation du sinistre 001 ?",
  "Quels assurés ont déclaré un accident en 2026 ?",
  "Quels contrats couvrent les dommages matériels ?",
  "Quels véhicules ont subi un accident ?",
  "Quels sinistres ont été évalués par l'expert Trabelsi ?",
  "Quels contrats possèdent une garantie tous risques ?",
  "Quels sinistres ont une indemnisation supérieure à 3000 euros ?",
];

const POS_TONE: Record<string, string> = { NOUN: "bg-brand-100 text-navy-800", PROPN: "bg-violet-100 text-violet-800", VERB: "bg-emerald-100 text-emerald-800", AUX: "bg-slate-100 text-slate-600", ADJ: "bg-amber-100 text-amber-800", NUM: "bg-pink-100 text-pink-800" };
const STATUS_UI: Record<string, { tone: string; icon: React.ReactNode; title: string }> = {
  ok: { tone: "bg-emerald-50 ring-emerald-200 text-emerald-900", icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />, title: "Question comprise et traduite" },
  clarification_needed: { tone: "bg-amber-50 ring-amber-200 text-amber-900", icon: <HelpCircle className="h-5 w-5 text-amber-600" />, title: "Clarification nécessaire" },
  entity_not_found: { tone: "bg-red-50 ring-red-200 text-red-900", icon: <XCircle className="h-5 w-5 text-red-600" />, title: "Entité introuvable dans l'ontologie" },
  unsupported: { tone: "bg-amber-50 ring-amber-200 text-amber-900", icon: <AlertTriangle className="h-5 w-5 text-amber-600" />, title: "Question non prise en charge" },
  error: { tone: "bg-red-50 ring-red-200 text-red-900", icon: <XCircle className="h-5 w-5 text-red-600" />, title: "Erreur" },
};

function Step({ n, title, icon, children, right }: { n: number; title: string; icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">{n}</span>{icon}{title}</h3>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function Cell({ term }: { term?: SparqlRow[string] }) {
  if (!term) return <span className="text-slate-300">—</span>;
  if (term.type === "uri") return <span className="font-medium text-navy-800" title={term.value}>{term.local}</span>;
  if (term.datatype?.endsWith("dateTime")) return <span title={term.value}>{dateFr(term.value)}</span>;
  if (term.datatype?.endsWith("decimal")) return <span className="tabular">{Number(term.value).toLocaleString("fr-FR")}</span>;
  return <span>{term.value}</span>;
}

export default function SemanticSearch() {
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [question, setQuestion] = useState(params.get("q") ?? "");
  const [res, setRes] = useState<NlpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [side, setSide] = useState<"history" | "about">("history");
  const [dict, setDict] = useState(false);
  const history = useAsync(() => nlpApi.history(), []);
  const mod = useAsync(() => nlpApi.module(), []);
  const lastRun = useRef<string | null>(null);

  const run = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    setParams(text ? { q: text } : {}, { replace: true });
    setLoading(true);
    try { setRes(await nlpApi.search(text)); } catch (e) { toast.error("Recherche impossible", errorMessage(e)); setRes(null); } finally { setLoading(false); history.reload(); }
  };
  useEffect(() => {
    const q = params.get("q");
    if (q && q !== lastRun.current) { lastRun.current = q; void run(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const ui = res ? STATUS_UI[res.status] ?? STATUS_UI.error : null;
  const rows = res?.result?.rows ?? [];
  const vars = res?.result?.variables ?? [];

  return (
    <>
      <PageHeader title="Recherche sémantique en langage naturel" subtitle="Question en français → analyse spaCy → SPARQL → résultats" icon={<BrainCircuit className="h-6 w-6" />} />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-navy-900 to-navy-700 p-4 text-white shadow-md">
        <Cpu className="h-6 w-6 shrink-0 text-brand-300" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Traduction réalisée par notre propre module NLP — aucune API LLM externe</p>
          <p className="text-brand-100/90">Outils : {(res?.libraries ?? mod.data?.libraries)?.map((l) => l.name === "spaCy" || l.name === "NLTK" || l.name === "RDFLib" ? `${l.name} ${l.version ?? ""}` : null).filter(Boolean).join(" · ") || "spaCy · NLTK · RDFLib"} · règles · dictionnaire de synonymes · templates SPARQL</p>
        </div>
        <Button variant="secondary" size="sm" icon={<BookOpen className="h-4 w-4" />} onClick={() => setDict(true)}>Dictionnaire & intentions</Button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); lastRun.current = question.trim(); void run(question); }} className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} aria-label="Question en langage naturel" placeholder="Posez votre question en français… ex. « Quels contrats couvrent le vol ? »"
          className="focus-ring w-full rounded-2xl border border-line bg-white py-4 pl-12 pr-36 text-base shadow-sm" />
        <Button type="submit" loading={loading} className="absolute right-2 top-1/2 -translate-y-1/2" icon={<Sparkles className="h-4 w-4" />}>Rechercher</Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => <button key={e} onClick={() => { lastRun.current = e; void run(e); }} className="focus-ring rounded-full border border-line bg-white px-3 py-1 text-xs text-navy-800 hover:bg-brand-100">{e}</button>)}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {loading && <Spinner label="Analyse linguistique et exécution…" />}
          {!loading && !res && <Card><EmptyState title="Posez une question" text="Choisissez un exemple ou écrivez votre propre question. Vous verrez chaque étape du pipeline NLP." icon={<BrainCircuit className="h-6 w-6" />} /></Card>}

          {!loading && res && ui && (
            <>
              <div className={cn("flex items-start gap-3 rounded-2xl p-4 ring-1", ui.tone)} role="status">
                <div className="mt-0.5">{ui.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{ui.title}</p>
                  <p className="mt-0.5 text-sm">{res.status === "ok" ? res.explanation : res.message}</p>
                  {res.status !== "ok" && (
                    <div className="mt-3"><p className="mb-1 text-xs font-medium">Essayez par exemple :</p><div className="flex flex-wrap gap-2">{res.suggestions.slice(0, 4).map((s) => <button key={s} onClick={() => { lastRun.current = s; void run(s); }} className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-black/10 hover:bg-white/70">{s}</button>)}</div></div>
                  )}
                </div>
                {res.status === "ok" && <div className="flex shrink-0 flex-col items-end gap-1 text-xs"><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Traduction {res.translationMs} ms</span><span className="flex items-center gap-1"><Terminal className="h-3.5 w-3.5" />Exécution {res.executionMs} ms</span></div>}
              </div>

              <Step n={1} title="Votre question" icon={<Quote className="h-4 w-4 text-brand-600" />}>
                <p className="text-lg font-medium">« {res.question} »</p>
                {res.normalizedQuestion && res.normalizedQuestion !== res.question && <p className="mt-1 text-xs text-muted">Normalisée : {res.normalizedQuestion}</p>}
              </Step>

              {res.tokens && res.tokens.length > 0 && (
                <Step n={2} title="Analyse linguistique (spaCy)" icon={<Cpu className="h-4 w-4 text-brand-600" />} right={<span className="text-xs text-muted">tokenisation · lemmes · POS · dépendances · NER</span>}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="pb-2 pr-4">Token</th><th className="pb-2 pr-4">Lemme</th><th className="pb-2 pr-4">POS</th><th className="pb-2 pr-4">Dépendance</th><th className="pb-2">Rôle dans la traduction</th></tr></thead>
                      <tbody>
                        {res.tokens.filter((t) => t.pos !== "PUNCT").map((t) => (
                          <tr key={t.i} className="border-t border-line/60">
                            <td className="py-1.5 pr-4 font-medium">{t.text}</td><td className="py-1.5 pr-4 text-muted">{t.lemma}</td>
                            <td className="py-1.5 pr-4"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", POS_TONE[t.pos] ?? "bg-slate-100 text-slate-600")}>{t.pos}</span></td>
                            <td className="py-1.5 pr-4 text-xs text-muted">{t.dep}</td>
                            <td className="py-1.5 text-xs">{t.used ? <Badge tone={t.used.startsWith("concept") ? "blue" : "violet"}>{t.used.replace("concept:", "concept ").replace("entité:", "entité ")}</Badge> : <span className="text-slate-300">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {res.spacyEntities && res.spacyEntities.length > 0 && <p className="mt-3 text-xs text-muted">Entités nommées spaCy : {res.spacyEntities.map((e) => <Badge key={e.text} tone="violet" className="mr-1">{e.text} · {e.label}</Badge>)}</p>}
                </Step>
              )}

              {res.intent !== undefined && (
                <Step n={3} title="Intention détectée" icon={<Target className="h-4 w-4 text-brand-600" />}>
                  {res.intent ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="!px-3 !py-1 !text-sm">{res.intent}</Badge>
                        <span className="text-sm text-muted">{res.intentLabel}</span>
                        {res.modifiers?.map((m, i) => <Badge key={m} tone="amber">{m}<span className="font-normal opacity-70"> · {res.modifierLabels?.[i]}</span></Badge>)}
                      </div>
                      <div className="grid gap-3 text-sm sm:grid-cols-4">
                        <div><p className="text-xs text-muted">Type de question</p><p className="font-medium">{res.questionType === "COUNT" ? "Comptage" : "Liste / valeur"}</p></div>
                        <div><p className="text-xs text-muted">Classe OWL cible</p><p className="font-medium">{res.focusClass ?? "—"}</p></div>
                        <div><p className="text-xs text-muted">Attribut demandé</p><p className="font-medium">{res.answerAttribute ?? "—"}</p></div>
                        <div><p className="text-xs text-muted">Confiance</p><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-brand-100"><div className={cn("h-2 rounded-full", (res.confidence ?? 0) >= 0.7 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${(res.confidence ?? 0) * 100}%` }} /></div><span className="tabular font-medium">{Math.round((res.confidence ?? 0) * 100)}%</span></div></div>
                      </div>
                    </div>
                  ) : <p className="text-sm text-muted">Aucune intention reconnue.</p>}
                </Step>
              )}

              <Step n={4} title="Entités, concepts OWL et synonymes" icon={<BookOpen className="h-4 w-4 text-brand-600" />}>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Entités liées aux individus</h4>
                    {res.entities?.length ? res.entities.map((e, i) => (
                      <div key={i} className="mb-2 rounded-lg border border-line p-2.5 text-sm">
                        <p className="font-medium">« {e.text} » <span className="text-xs font-normal text-muted">({e.kind}{e.fuzzy ? ", correspondance approchée" : ""}{e.cue ? `, indice « ${e.cue} »` : ""}{e.expectedByVerb ? `, rôle attendu après « ${e.expectedByVerb} »` : ""})</span></p>
                        {e.resolved.length ? e.resolved.map((r, j) => <p key={j} className="text-xs text-muted">→ <b className="text-ink">{r.label}</b> {r.id && <code className="rounded bg-brand-50 px-1">{r.id}</code>} {r.classes.filter((c) => !["Personne", "Organisation"].includes(c)).slice(0, 3).join(", ")}</p>) : <p className="text-xs text-red-600">Aucun individu correspondant</p>}
                      </div>
                    )) : <p className="text-sm text-muted">Aucune entité nommée.</p>}
                    {res.issues?.map((i, k) => <p key={k} className="mt-1 text-xs text-red-600">⚠ {i.message}</p>)}
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Concepts reconnus (synonymes → OWL)</h4>
                    {res.concepts?.length ? <ul className="space-y-1.5">{res.concepts.map((c, i) => <li key={i} className="flex flex-wrap items-center gap-1.5 text-sm"><Badge tone="gray">{c.matched}</Badge><ArrowRight className="h-3 w-3 text-muted" /><Badge>{c.label}</Badge><span className="text-xs text-muted">{c.kind}{c.owl ? ` · ${c.owl}` : ""} · via {c.via}</span></li>)}</ul> : <p className="text-sm text-muted">Aucun concept.</p>}
                    {res.constraints && res.constraints.length > 0 && <><h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Contraintes extraites</h4><ul className="space-y-1">{res.constraints.map((c, i) => <li key={i} className="text-sm"><Badge tone="amber">{c.kind}</Badge> {c.description}</li>)}</ul></>}
                    {res.negations && res.negations.length > 0 && (
                      <div className="mt-4" data-testid="negation-analysis">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Négation détectée (portée → SPARQL FILTER NOT EXISTS)</h4>
                        <ul className="space-y-1.5">{res.negations.map((n, i) => (
                          <li key={i} className="rounded-lg border border-line p-2 text-sm">
                            <Badge tone={n.status === "ok" ? "amber" : "red"}>{n.cue}</Badge> <span className="text-xs text-muted">portée : « {n.scope} » · gouverneur « {n.head} » · dépendances {n.dep.join("/")}</span>
                            <p className="text-xs">{n.negated.length ? <>critère(s) nié(s) : {n.negated.map((x) => `${x.kind} « ${x.text} »`).join(", ")}</> : <span className="text-red-600">portée non résolue : aucune requête exécutée</span>}</p>
                          </li>
                        ))}</ul>
                      </div>
                    )}
                    {res.unrecognized && res.unrecognized.length > 0 && <p className="mt-3 text-xs text-muted">Termes non exploités : {res.unrecognized.join(", ")}</p>}
                  </div>
                </div>
              </Step>

              {res.sparql && (
                <Step n={5} title="Requête SPARQL générée" icon={<Terminal className="h-4 w-4 text-brand-600" />}
                  right={<div className="flex items-center gap-2"><Badge tone={res.valid ? "green" : "red"}>{res.valid ? "syntaxe valide" : "invalide"}</Badge><Button size="sm" variant="secondary" onClick={() => { localStorage.setItem("sparql.editor", JSON.stringify(res.sparql)); nav("/app/sparql"); }}>Ouvrir dans l'explorateur</Button></div>}>
                  <pre className="overflow-x-auto rounded-xl bg-navy-950 p-4 font-mono text-[12.5px] leading-relaxed text-brand-100">{res.sparql}</pre>
                  <p className="mt-2 text-xs text-muted">Template : <b>{res.template}</b> · fragments : {res.fragments?.join(" · ")}</p>
                  <p className="mt-1 text-xs text-muted">{res.description}</p>
                </Step>
              )}

              {res.executed && res.result && (
                <Step n={6} title="Résultats de l'exécution" icon={<CheckCircle2 className="h-4 w-4 text-brand-600" />} right={<span className="text-xs text-muted">{rows.length} ligne(s) · {res.executionMs} ms</span>}>
                  {rows.length ? (
                    <div className="max-h-96 overflow-auto rounded-lg border border-line">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-brand-50"><tr className="text-xs uppercase tracking-wide text-muted">{vars.map((v) => <th key={v} className="whitespace-nowrap px-3 py-2">{v}</th>)}</tr></thead>
                        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line/60">{vars.map((v) => <td key={v} className="px-3 py-1.5"><Cell term={r[v]} /></td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p className="text-sm text-muted">Aucune ligne : aucune donnée de l'ontologie ne satisfait ces conditions.</p>}
                </Step>
              )}

              {res.steps.length > 0 && (
                <Step n={7} title="Pipeline NLP et temps par étape" icon={<Clock className="h-4 w-4 text-brand-600" />}>
                  <ol className="space-y-1.5">{res.steps.map((s, i) => <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-brand-50/60 px-3 py-1.5 text-sm"><span><b>{s.name}</b> <span className="text-xs text-muted">— {s.detail}</span></span><span className="tabular text-xs text-muted">{s.ms} ms</span></li>)}</ol>
                </Step>
              )}
            </>
          )}
        </div>

        <Card className="h-fit xl:sticky xl:top-0">
          <div className="border-b border-line p-3"><Tabs value={side} onChange={setSide} tabs={[{ id: "history", label: "Historique", icon: <History className="h-4 w-4" /> }, { id: "about", label: "Limites", icon: <HelpCircle className="h-4 w-4" /> }]} /></div>
          {side === "history" ? (
            history.data?.length ? <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">{history.data.map((h) => <li key={h.id}><button onClick={() => { lastRun.current = h.question; void run(h.question); }} className="w-full px-4 py-2.5 text-left hover:bg-brand-50"><p className="text-sm font-medium">{h.question}</p><p className="mt-0.5 flex items-center gap-2 text-xs text-muted"><Badge tone={h.status === "ok" ? "green" : "amber"}>{h.status}</Badge>{h.intent}{h.count !== undefined && ` · ${h.count} rés.`} · {timeAgo(h.ts)}</p></button></li>)}</ul> : <EmptyState title="Aucune recherche" text="Vos questions apparaîtront ici." />
          ) : (
            <div className="space-y-3 p-4 text-sm text-muted">
              <p>Le module n'invente jamais de réponse : hors domaine, entité inconnue, homonymes ou question non gérée → message explicite, <b>aucune requête exécutée</b>.</p>
              <p>Limites : français uniquement, intentions de recherche (pas de raisonnement multi-étapes ni de négation), « accident » ≈ AccidentCirculation, montants sans conversion de devise, relations déduites du graphe de l'ontologie.</p>
            </div>
          )}
        </Card>
      </div>

      <Modal open={dict} onClose={() => setDict(false)} size="xl" title="Dictionnaire de synonymes, intentions et pipeline">
        {mod.data ? (
          <div className="space-y-6">
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">Aucune API LLM : <b>llm = {String(mod.data.llm)}</b>. Bibliothèques : {mod.data.libraries.map((l) => `${l.name}${l.version ? " " + l.version : ""}`).join(", ")}.</div>
            <div><h4 className="mb-2 text-sm font-semibold">Pipeline</h4><ol className="flex flex-wrap gap-2 text-xs">{mod.data.pipeline.map((p, i) => <li key={i} className="flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1"><b>{i + 1}</b>{p}</li>)}</ol></div>
            <div><h4 className="mb-2 text-sm font-semibold">Intentions</h4><div className="grid gap-2 sm:grid-cols-2">{mod.data.intents.map((i) => <div key={i.id} className="rounded-lg border border-line px-3 py-2 text-sm"><b>{i.id}</b> <span className="text-muted">— {i.label}</span></div>)}</div></div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Synonymes français → concepts OWL</h4>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="pb-2 pr-3">Concept</th><th className="pb-2 pr-3">Type</th><th className="pb-2 pr-3">OWL</th><th className="pb-2">Termes</th></tr></thead>
                <tbody>{mod.data.lexicon.map((c) => <tr key={c.id} className="border-t border-line/60 align-top"><td className="py-1.5 pr-3 font-medium">{c.label}</td><td className="py-1.5 pr-3"><Badge tone="gray">{c.kind}</Badge></td><td className="py-1.5 pr-3 text-xs">{c.owl ?? Object.values(c.variants).join(" | ") ?? c.value ?? c.property}</td><td className="py-1.5"><div className="flex flex-wrap gap-1">{c.terms.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}</div></td></tr>)}</tbody></table></div>
            </div>
          </div>
        ) : <Spinner />}
      </Modal>
    </>
  );
}
