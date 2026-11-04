import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BadgeCheck, ChevronDown, ChevronRight, Download, GitBranch, ListTree, Network, RotateCcw, ShieldAlert, Tags, Users } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { ontologyApi } from "../lib/services";
import type { OntoClass, OntoIndividual, OntoProperty } from "../lib/types";
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, EmptyState, ErrorState, KeyValue, Modal, PageHeader, SearchInput, Select, Spinner, Tabs } from "../components/ui";
import { Ontograph } from "../components/Ontograph";
import { useToast } from "../components/toast";
import { errorMessage } from "../lib/api";
import { cn } from "../lib/format";

type Tab = "hierarchy" | "properties" | "individuals" | "graph" | "validation";

// ---------------------------------------------------------------- arbre de classes
function Tree({ classes, selected, onSelect }: { classes: OntoClass[]; selected: string | null; onSelect: (id: string) => void }) {
  const byId = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const roots = classes.filter((c) => c.parents.length === 0);
  const [open, setOpen] = useState<Set<string>>(() => new Set(roots.map((r) => r.id)));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const Node = ({ c, depth }: { c: OntoClass; depth: number }) => {
    const hasKids = c.children.length > 0;
    return (
      <li>
        <div className={cn("group flex items-center gap-1 rounded-lg py-1 pr-2 text-sm", selected === c.id ? "bg-navy-900 text-white" : "hover:bg-brand-100/70")} style={{ paddingLeft: depth * 16 + 4 }}>
          <button className="flex h-5 w-5 items-center justify-center" onClick={() => toggle(c.id)} aria-label={open.has(c.id) ? "Replier" : "Déplier"} disabled={!hasKids}>
            {hasKids ? (open.has(c.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />}
          </button>
          <button className="flex flex-1 items-center justify-between gap-2 text-left" onClick={() => onSelect(c.id)}>
            <span className="truncate font-medium">{c.label}</span>
            <span className={cn("rounded-full px-1.5 text-[11px] tabular", selected === c.id ? "bg-white/20" : "bg-brand-100 text-navy-800")}>{c.totalInstances}</span>
          </button>
        </div>
        {hasKids && open.has(c.id) && <ul>{c.children.map((k) => byId.get(k)).filter(Boolean).map((k) => <Node key={k!.id} c={k!} depth={depth + 1} />)}</ul>}
      </li>
    );
  };
  return <ul className="space-y-0.5">{roots.map((r) => <Node key={r.id} c={r} depth={0} />)}</ul>;
}

function ClassDetail({ cls, onSelect, onIndividual }: { cls: OntoClass; onSelect: (id: string) => void; onIndividual: (id: string) => void }) {
  const inds = useAsync(() => ontologyApi.individuals(cls.id), [cls.id]);
  const chip = (id: string) => <button key={id} onClick={() => onSelect(id)} className="focus-ring rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-navy-800 hover:bg-brand-200">{id}</button>;
  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{cls.label}</h2>
          <Badge>{cls.totalInstances} individu(s)</Badge>
          {cls.equivalentTo.length > 0 && <Badge tone="violet">classe définie</Badge>}
        </div>
        {cls.comment && <p className="mt-1 text-sm text-muted">{cls.comment}</p>}
        <p className="mt-1 text-xs text-muted">IRI : …/actors#{cls.id}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <KeyValue label="Super-classes">{cls.parents.length ? <div className="flex flex-wrap gap-1">{cls.parents.map(chip)}</div> : "owl:Thing"}</KeyValue>
        <KeyValue label="Sous-classes">{cls.children.length ? <div className="flex flex-wrap gap-1">{cls.children.map(chip)}</div> : "—"}</KeyValue>
        <KeyValue label="Disjointe avec">{cls.disjointWith.length ? <div className="flex flex-wrap gap-1">{cls.disjointWith.map(chip)}</div> : "—"}</KeyValue>
        <KeyValue label="Équivalente à">{cls.equivalentTo.length ? cls.equivalentTo.map((e) => <code key={e} className="block rounded bg-brand-50 px-2 py-1 text-xs">{e}</code>) : "—"}</KeyValue>
      </dl>
      {cls.restrictions.length > 0 && (
        <div><h4 className="mb-1.5 text-sm font-semibold">Axiomes (restrictions OWL)</h4><ul className="space-y-1">{cls.restrictions.map((r, i) => <li key={i} className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200">⊑ {r.text}</li>)}</ul></div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">DataProperties ({cls.dataProperties.length})</h4>
          <div className="flex flex-wrap gap-1.5">{cls.dataProperties.map((d) => <span key={d.id} className="rounded-lg border border-line px-2 py-1 text-xs"><b>{d.id}</b> <span className="text-muted">: {d.range}</span></span>) || "—"}{!cls.dataProperties.length && <span className="text-sm text-muted">—</span>}</div>
        </div>
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">ObjectProperties (domaine / range)</h4>
          <div className="space-y-1 text-xs">
            {cls.objectProperties.map((o) => <div key={o.id} className="rounded-lg border border-line px-2 py-1"><b>{o.id}</b> → {o.range.join(", ")}</div>)}
            {cls.incomingProperties.map((o) => <div key={"in" + o.id} className="rounded-lg border border-dashed border-line px-2 py-1 text-muted">{o.domain.join(", ")} —<b>{o.id}</b>→ <span className="text-ink">{cls.id}</span></div>)}
            {!cls.objectProperties.length && !cls.incomingProperties.length && <span className="text-sm text-muted">—</span>}
          </div>
        </div>
      </div>
      <div>
        <h4 className="mb-1.5 text-sm font-semibold">Individus associés</h4>
        {inds.loading ? <Spinner /> : inds.data?.length ? (
          <div className="flex flex-wrap gap-2">{inds.data.map((i) => <button key={i.id} onClick={() => onIndividual(i.id)} className="focus-ring rounded-lg border border-line px-3 py-1.5 text-left text-sm hover:bg-brand-50"><span className="font-medium">{i.label}</span><span className="ml-2 text-xs text-muted">{i.id}</span></button>)}</div>
        ) : <p className="text-sm text-muted">Aucun individu.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- onglets
function PropertiesTab() {
  const { data, loading, error, reload } = useAsync(() => ontologyApi.properties(), []);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const rows = (data ?? []).filter((p) => (!kind || p.kind === kind) && (p.id + p.domain.join() + p.range.join()).toLowerCase().includes(q.toLowerCase()));
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <SearchInput value={q} onChange={setQ} placeholder="Propriété, domaine, range…" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto" aria-label="Type de propriété"><option value="">Toutes</option><option value="object">ObjectProperties</option><option value="datatype">DataProperties</option></Select>
        <span className="text-sm text-muted">{rows.length} propriété(s)</span>
      </div>
      <DataTable<OntoProperty> loading={loading} rows={rows} rowKey={(p) => p.id} empty={<EmptyState title="Aucune propriété" />}
        columns={[
          { key: "id", header: "Propriété", render: (p) => <span className="font-medium">{p.id}</span> },
          { key: "k", header: "Type", render: (p) => <Badge tone={p.kind === "object" ? "blue" : "green"}>{p.kind === "object" ? "ObjectProperty" : "DataProperty"}</Badge> },
          { key: "d", header: "Domaine", render: (p) => p.domain.join(", ") || "—" },
          { key: "r", header: "Range", render: (p) => p.range.join(", ") || "—" },
          { key: "f", header: "Caractéristiques", render: (p) => <div className="flex flex-wrap gap-1">{p.functional && <Badge tone="amber">Functional</Badge>}{p.inverseOf.length > 0 && <Badge tone="violet">inverse : {p.inverseOf.join(", ")}</Badge>}</div> },
          { key: "u", header: "Usages", render: (p) => p.usage, className: "tabular" },
        ]}
      />
    </Card>
  );
}

function IndividualsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, loading, error, reload } = useAsync(() => ontologyApi.individuals(), []);
  const [q, setQ] = useState("");
  const rows = (data ?? []).filter((i: OntoIndividual) => (i.id + i.label + i.allTypes.join()).toLowerCase().includes(q.toLowerCase()));
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4"><SearchInput value={q} onChange={setQ} placeholder="Rechercher un individu ou une classe…" /><span className="text-sm text-muted">{rows.length} individu(s)</span></div>
      <DataTable<OntoIndividual> loading={loading} rows={rows} rowKey={(i) => i.id} onRowClick={(i) => onOpen(i.id)} empty={<EmptyState title="Aucun individu" />}
        columns={[
          { key: "id", header: "Individu", render: (i) => <div><p className="font-medium">{i.label}</p><p className="text-xs text-muted">{i.id}</p></div> },
          { key: "t", header: "Classes", render: (i) => <div className="flex flex-wrap gap-1">{i.types.map((t) => <Badge key={t}>{t}</Badge>)}</div> },
          { key: "n", header: "Assertions", render: (i) => i.properties.length, className: "tabular" },
        ]}
      />
    </Card>
  );
}

function ValidationTab() {
  const v = useAsync(() => ontologyApi.validate(), []);
  if (v.loading) return <Spinner label="Validation en cours…" />;
  if (v.error || !v.data) return <ErrorState message={v.error ?? "Erreur"} onRetry={v.reload} />;
  const r = v.data;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          {r.consistent ? <BadgeCheck className="h-10 w-10 text-emerald-600" /> : <ShieldAlert className="h-10 w-10 text-red-600" />}
          <div className="flex-1">
            <h3 className="text-lg font-bold">{r.consistent ? "Ontologie cohérente" : `${r.errors.length} violation(s) détectée(s)`}</h3>
            <p className="text-sm text-muted">{r.note}</p>
          </div>
          <Button variant="secondary" onClick={v.reload}>Relancer la validation</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Contrôles" />
        <ul className="divide-y divide-line">
          {r.checks.map((c) => (
            <li key={c.name} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>{c.name}</span>
              <Badge tone={c.passed ? "green" : c.level === "warning" ? "amber" : "red"}>{c.passed ? "OK" : `${c.issues} problème(s)`}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      {[...r.errors, ...r.warnings].length > 0 && (
        <Card><CardHeader title="Détails" /><ul className="divide-y divide-line">{[...r.errors, ...r.warnings].map((e, i) => <li key={i} className="px-5 py-2 text-sm"><b>{e.subject}</b> · {e.property} — {e.message}</li>)}</ul></Card>
      )}
      <Card className="p-5 text-sm text-muted">
        <p><b>HermiT :</b> pour un raisonnement OWL complet (inférence de ContratActif, SinistreExpertise, inconsistance logique), ouvrez l'export RDF/XML dans Protégé puis <i>Reasoner → HermiT → Start reasoner</i>.</p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function OntologyExplorer() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "hierarchy";
  const setTab = (t: Tab) => setParams({ tab: t });
  const classes = useAsync(() => ontologyApi.classes(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [indiv, setIndiv] = useState<string | null>(null);
  const detail = useAsync(() => (indiv ? ontologyApi.individual(indiv) : Promise.resolve(null)), [indiv]);
  const [confirmReset, setConfirmReset] = useState(false);
  const stats = useAsync(() => ontologyApi.statistics(), []);

  useEffect(() => { if (!selected && classes.data?.length) setSelected("ContratAssurance"); }, [classes.data, selected]);
  const cls = classes.data?.find((c) => c.id === selected);

  return (
    <>
      <PageHeader title="Ontology Explorer" subtitle="Classes, propriétés, individus et ontographe — lus depuis le graphe RDF en direct" icon={<Network className="h-6 w-6" />}
        actions={<>
          <a href={ontologyApi.exportUrl("xml")}><Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export RDF/XML (Protégé)</Button></a>
          <a href={ontologyApi.exportUrl("turtle")}><Button variant="secondary" icon={<Download className="h-4 w-4" />}>Turtle</Button></a>
          <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>Réinitialiser</Button>
        </>} />

      {stats.data && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <Badge>{stats.data.ontology.classes} classes</Badge><Badge tone="green">{stats.data.ontology.objectProperties} ObjectProperties</Badge><Badge tone="green">{stats.data.ontology.dataProperties} DataProperties</Badge>
          <Badge tone="violet">{stats.data.ontology.individuals} individus</Badge><Badge tone="amber">{stats.data.ontology.restrictions} restrictions</Badge><Badge tone="gray">{stats.data.ontology.disjointGroups} groupes de disjonction</Badge><Badge tone="gray">{stats.data.ontology.triples} triplets</Badge>
        </div>
      )}

      <div className="mb-4">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[
          { id: "hierarchy", label: "Hiérarchie", icon: <ListTree className="h-4 w-4" /> },
          { id: "properties", label: "Propriétés", icon: <Tags className="h-4 w-4" /> },
          { id: "individuals", label: "Individus", icon: <Users className="h-4 w-4" /> },
          { id: "graph", label: "Ontographe", icon: <GitBranch className="h-4 w-4" /> },
          { id: "validation", label: "Cohérence", icon: <BadgeCheck className="h-4 w-4" /> },
        ]} />
      </div>

      {tab === "hierarchy" && (
        classes.error ? <ErrorState message={classes.error} onRetry={classes.reload} /> : classes.loading ? <Spinner /> : (
          <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
            <Card className="max-h-[75vh] overflow-y-auto p-3"><Tree classes={classes.data!} selected={selected} onSelect={setSelected} /></Card>
            <Card>{cls ? <ClassDetail cls={cls} onSelect={setSelected} onIndividual={setIndiv} /> : <EmptyState title="Sélectionnez une classe" />}</Card>
          </div>
        )
      )}
      {tab === "properties" && <PropertiesTab />}
      {tab === "individuals" && <IndividualsTab onOpen={setIndiv} />}
      {tab === "graph" && <Ontograph onSelectClass={(id) => { setSelected(id); setTab("hierarchy"); }} onSelectIndividual={setIndiv} />}
      {tab === "validation" && <ValidationTab />}

      <Modal open={!!indiv} onClose={() => setIndiv(null)} size="lg" title={detail.data?.label ?? indiv ?? ""}>
        {detail.loading ? <Spinner /> : detail.data && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1">{detail.data.types.map((t) => <Badge key={t}>{t}</Badge>)}<span className="text-xs text-muted">{detail.data.id}</span></div>
            <div>
              <h4 className="mb-1 text-sm font-semibold">Assertions</h4>
              <table className="w-full text-sm"><tbody>
                {detail.data.properties.map((p, i) => (
                  <tr key={i} className="border-b border-line/60"><td className="w-48 py-1.5 pr-3 font-medium text-navy-800">{p.property}</td>
                    <td className="py-1.5">{p.type === "uri" ? <button className="text-brand-600 hover:underline" onClick={() => setIndiv(p.id!)}>{p.label}</button> : p.value}</td></tr>
                ))}
              </tbody></table>
            </div>
            {detail.data.incoming.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-semibold">Référencé par</h4>
                <div className="flex flex-wrap gap-2">{detail.data.incoming.map((r, i) => <button key={i} onClick={() => setIndiv(r.id)} className="rounded-lg border border-line px-2 py-1 text-xs hover:bg-brand-50">{r.label} <span className="text-muted">—{r.property}→</span></button>)}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={confirmReset} title="Réinitialiser l'ontologie" confirmLabel="Réinitialiser" onClose={() => setConfirmReset(false)}
        message="Toutes les modifications (CRUD et SPARQL Update) seront annulées : le graphe revient à assurance_auto.xml + extensions. Une sauvegarde de l'état actuel est conservée dans data/backups."
        onConfirm={async () => { try { const r = await ontologyApi.reset(); toast.success("Ontologie réinitialisée", `Sauvegarde : ${r.backup}`); setConfirmReset(false); classes.reload(); stats.reload(); } catch (e) { toast.error("Échec", errorMessage(e)); } }} />
    </>
  );
}
