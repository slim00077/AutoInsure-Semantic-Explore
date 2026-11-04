import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Code2, Copy, Download, History, Play, Trash2 } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { sparqlApi } from "../lib/services";
import type { SparqlResult, SparqlRow, SparqlUpdateResult } from "../lib/types";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, PageHeader, SearchInput, Spinner, Tabs } from "../components/ui";
import { useToast } from "../components/toast";
import { ApiError, errorMessage } from "../lib/api";
import { cn, timeAgo } from "../lib/format";
import { useLocalStorage } from "../hooks/useAsync";

const DEFAULT_QUERY = `PREFIX actors: <http://www.semanticweb.org/assurance/actors#>

SELECT ?assure ?nom ?marque ?modele WHERE {
  ?assure a actors:Assure ; actors:nom ?nom ; actors:possede ?contrat .
  ?contrat actors:couvre ?v .
  ?v actors:marque ?marque ; actors:modele ?modele .
}
ORDER BY ?nom`;

const isUpdate = (q: string) => /^\s*(?:(?:PREFIX|BASE)[^\n]*\n\s*)*(INSERT|DELETE|WITH|LOAD|CLEAR|DROP|CREATE|ADD|MOVE|COPY)\b/i.test(q.replace(/#[^\n]*/g, ""));

function Cell({ term }: { term?: SparqlRow[string] }) {
  if (!term) return <span className="text-slate-300">—</span>;
  if (term.type === "uri") return <span title={term.value} className="font-medium text-navy-800">{term.local ?? term.value}</span>;
  return <span title={term.datatype ?? term.lang}>{term.value}</span>;
}

function toCsv(vars: string[], rows: SparqlRow[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [vars.join(","), ...rows.map((r) => vars.map((v) => esc(r[v]?.value ?? "")).join(","))].join("\n");
}

export default function SparqlExplorer() {
  const toast = useToast();
  const [query, setQuery] = useLocalStorage("sparql.editor", DEFAULT_QUERY);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SparqlResult | null>(null);
  const [updateRes, setUpdateRes] = useState<SparqlUpdateResult | null>(null);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [side, setSide] = useState<"examples" | "history">("examples");
  const [confirm, setConfirm] = useState(false);
  const examples = useAsync(() => sparqlApi.examples(), []);
  const history = useAsync(() => sparqlApi.history(), []);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const run = async (confirmed = false) => {
    if (!query.trim()) return;
    const update = isUpdate(query);
    if (update && !confirmed) return setConfirm(true);
    setConfirm(false); setRunning(true); setError(null); setResult(null); setUpdateRes(null); setFilter("");
    try {
      if (update) { const r = await sparqlApi.update(query); setUpdateRes(r); toast.success("SPARQL Update exécuté", `+${r.added} / −${r.removed} triplets`); }
      else setResult(await sparqlApi.query(query));
    } catch (e) {
      setError({ message: errorMessage(e), code: e instanceof ApiError ? e.code : "ERROR" });
    } finally { setRunning(false); history.reload(); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void run(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const rows = useMemo(() => {
    const all = result?.rows ?? [];
    if (!filter.trim()) return all;
    const f = filter.toLowerCase();
    return all.filter((r) => Object.values(r).some((t) => `${t.local ?? ""} ${t.value}`.toLowerCase().includes(f)));
  }, [result, filter]);

  const lines = query.split("\n").length;
  const grouped = useMemo(() => {
    const m = new Map<string, typeof examples.data>();
    examples.data?.forEach((e) => m.set(e.category, [...(m.get(e.category) ?? []), e]));
    return [...m.entries()];
  }, [examples.data]);

  return (
    <>
      <PageHeader title="SPARQL Query Explorer" subtitle="Requêtes exécutées sur le graphe RDF réel · Ctrl+Entrée pour lancer" icon={<Code2 className="h-6 w-6" />} />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Éditeur" subtitle={isUpdate(query) ? "Requête de mise à jour (modifie le graphe)" : "Requête de lecture (SELECT / ASK / CONSTRUCT / DESCRIBE)"}
              action={<div className="flex gap-2"><Badge tone={isUpdate(query) ? "amber" : "blue"}>{isUpdate(query) ? "UPDATE" : "QUERY"}</Badge><Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { void navigator.clipboard.writeText(query); toast.info("Requête copiée"); }}>Copier</Button></div>} />
            <div className="flex font-mono text-[13px] leading-6">
              <pre aria-hidden className="select-none border-r border-line bg-brand-50/70 px-3 py-3 text-right text-slate-400">{Array.from({ length: Math.max(lines, 12) }, (_, i) => i + 1).join("\n")}</pre>
              <textarea ref={taRef} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} aria-label="Requête SPARQL" rows={Math.max(lines, 12)}
                onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart; setQuery(query.slice(0, s) + "  " + query.slice(t.selectionEnd)); requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2)); } }}
                className="focus-ring w-full resize-y bg-white px-3 py-3 text-ink outline-none" />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-brand-50/50 px-4 py-3">
              <Button loading={running} icon={<Play className="h-4 w-4" />} onClick={() => run()}>Exécuter</Button>
              <Button variant="secondary" onClick={() => { setQuery(""); setResult(null); setError(null); setUpdateRes(null); }}>Effacer</Button>
              <span className="ml-auto text-xs text-muted">Préfixes disponibles sans déclaration : actors, rdf, rdfs, owl, xsd</span>
            </div>
          </Card>

          <Card>
            <CardHeader title="Résultats" action={result && (result.rows?.length ?? 0) > 0 && (
              <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => {
                const blob = new Blob([toCsv(result.variables ?? [], result.rows ?? [])], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "resultats-sparql.csv"; a.click();
              }}>CSV</Button>)} />
            {running && <Spinner label="Exécution…" />}
            {error && (
              <div className="m-5 rounded-xl bg-red-50 p-4 ring-1 ring-red-200" role="alert">
                <p className="flex items-center gap-2 text-sm font-semibold text-red-800"><AlertTriangle className="h-4 w-4" />{error.code === "SPARQL_FORBIDDEN" ? "Requête refusée" : "Erreur SPARQL"}</p>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-700">{error.message}</pre>
              </div>
            )}
            {updateRes && (
              <div className="m-5 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Mise à jour appliquée et persistée</p>
                <p className="mt-1 text-sm text-emerald-900">{updateRes.added} triplet(s) ajouté(s), {updateRes.removed} supprimé(s) · total {updateRes.totalTriples} · {updateRes.executionMs} ms</p>
              </div>
            )}
            {result?.queryType === "ASK" && (
              <div className="m-5 flex items-center gap-3 rounded-xl bg-brand-50 p-4"><Badge tone={result.boolean ? "green" : "red"}>{result.boolean ? "true" : "false"}</Badge><span className="text-sm text-muted">Résultat ASK · {result.executionMs} ms</span></div>
            )}
            {result?.queryType === "SELECT" && (
              <>
                <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                  <SearchInput value={filter} onChange={setFilter} placeholder="Filtrer les résultats…" />
                  <span className="flex items-center gap-1.5 text-sm text-muted"><Clock className="h-4 w-4" />{result.executionMs} ms · {rows.length}{filter ? ` / ${result.count}` : ""} ligne(s)</span>
                </div>
                {result.truncated && <p className="bg-amber-50 px-4 py-2 text-xs text-amber-800">Résultats tronqués par la limite du serveur.</p>}
                {rows.length ? (
                  <div className="max-h-[28rem] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-white"><tr className="border-b border-line text-xs uppercase tracking-wide text-muted">{result.variables!.map((v) => <th key={v} className="whitespace-nowrap px-4 py-2.5 font-semibold">?{v}</th>)}</tr></thead>
                      <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line/60 hover:bg-brand-50/60">{result.variables!.map((v) => <td key={v} className="px-4 py-2"><Cell term={r[v]} /></td>)}</tr>)}</tbody>
                    </table>
                  </div>
                ) : <EmptyState title="Aucun résultat" text="La requête est valide mais ne retourne aucune ligne." />}
              </>
            )}
            {result && result.queryType !== "SELECT" && result.queryType !== "ASK" && (
              <div className="max-h-96 overflow-auto"><table className="w-full text-sm"><tbody>{result.triples?.map((t, i) => <tr key={i} className="border-b border-line/60"><td className="px-4 py-2"><Cell term={t.s} /></td><td className="px-4 py-2"><Cell term={t.p} /></td><td className="px-4 py-2"><Cell term={t.o} /></td></tr>)}</tbody></table></div>
            )}
            {!running && !error && !result && !updateRes && <EmptyState title="Aucun résultat à afficher" text="Écrivez une requête ou choisissez un exemple, puis cliquez sur Exécuter." icon={<Code2 className="h-6 w-6" />} />}
          </Card>
        </div>

        <Card className="h-fit xl:sticky xl:top-0">
          <div className="border-b border-line p-3"><Tabs value={side} onChange={setSide} tabs={[{ id: "examples", label: "Exemples", icon: <Code2 className="h-4 w-4" /> }, { id: "history", label: "Historique", icon: <History className="h-4 w-4" /> }]} /></div>
          <div className="max-h-[70vh] overflow-y-auto">
            {side === "examples" ? (
              examples.loading ? <Spinner /> : grouped.map(([cat, list]) => (
                <div key={cat}>
                  <p className="bg-brand-50/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</p>
                  {list!.map((e) => (
                    <button key={e.id} onClick={() => { setQuery(e.query); setResult(null); setError(null); setUpdateRes(null); }} className="block w-full border-b border-line/60 px-4 py-2.5 text-left hover:bg-brand-50">
                      <p className="flex items-center gap-2 text-sm font-medium">{e.title}{e.kind === "update" && <Badge tone="amber">UPDATE</Badge>}</p>
                      <p className="text-xs text-muted">{e.description}</p>
                    </button>
                  ))}
                </div>
              ))
            ) : history.data?.length ? (
              <>
                <div className="flex justify-end px-3 pt-2"><Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={async () => { await sparqlApi.clearHistory(); history.reload(); }}>Vider</Button></div>
                {history.data.map((h) => (
                  <button key={h.id} onClick={() => setQuery(h.text)} className="block w-full border-b border-line/60 px-4 py-2.5 text-left hover:bg-brand-50">
                    <div className="mb-1 flex items-center gap-2 text-xs"><Badge tone={h.ok ? "green" : "red"}>{h.ok ? "OK" : "Erreur"}</Badge><Badge tone="gray">{h.kind}</Badge><span className="text-muted">{timeAgo(h.ts)}</span>{h.ms !== undefined && <span className="text-muted">{h.ms} ms</span>}</div>
                    <pre className={cn("line-clamp-3 whitespace-pre-wrap break-words font-mono text-[11px] text-ink")}>{h.text.replace(/PREFIX[^\n]*\n/g, "").trim()}</pre>
                    {h.error && <p className="mt-1 line-clamp-2 text-xs text-red-600">{h.error}</p>}
                  </button>
                ))}
              </>
            ) : <EmptyState title="Historique vide" text="Les requêtes exécutées apparaîtront ici." icon={<History className="h-6 w-6" />} />}
          </div>
        </Card>
      </div>
      <ConfirmDialog open={confirm} title="Exécuter une mise à jour" confirmLabel="Exécuter l'Update" onClose={() => setConfirm(false)} onConfirm={() => run(true)}
        message="Cette requête modifie le graphe RDF de façon persistante. INSERT/DELETE sont autorisés ; LOAD, CLEAR, DROP, CREATE, COPY, MOVE et SERVICE sont bloqués. Continuer ?" />
    </>
  );
}
