import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { useAsync } from "../hooks/useAsync";
import { ontologyApi } from "../lib/services";
import type { GraphData } from "../lib/types";
import { Card, ErrorState, Spinner, Tabs } from "./ui";

// Couleur par grande famille de l'ontologie (palette catégorielle fixe)
const GROUP_COLORS: Record<string, string> = {
  Personne: "#e87ba4", Organisation: "#2a78d6", Vehicule: "#1baf7a", ContratAssurance: "#eda100", Garantie: "#6250d6",
  Sinistre: "#eb6834", Dommage: "#0ea5e9", Expertise: "#16a34a", Indemnisation: "#e34948", Document: "#64748b",
};
const colorOf = (g: string) => GROUP_COLORS[g] ?? "#2563eb";

function layout(data: GraphData, level: "schema" | "instances", full: boolean) {
  const g = new dagre.graphlib.Graph();
  const compact = level === "schema" && !full;
  g.setGraph({ rankdir: compact ? "TB" : "LR", nodesep: compact ? 40 : level === "schema" ? 8 : 14, ranksep: compact ? 90 : level === "schema" ? 60 : 120 });
  g.setDefaultEdgeLabel(() => ({}));
  const w = level === "schema" ? 176 : 150;
  const h = level === "schema" ? 34 : 38;
  data.nodes.forEach((n) => g.setNode(n.id, { width: w, height: h }));
  if (level === "schema" && full) {
    // le schéma complet est positionné par la hiérarchie subClassOf seule ; les ObjectProperties sont tracées par-dessus
    g.setNode("__thing", { width: 1, height: 1 });
    data.nodes.filter((n) => !data.edges.some((e) => e.kind === "subClassOf" && e.source === n.id)).forEach((n) => g.setEdge("__thing", n.id));
    data.edges.filter((e) => e.kind === "subClassOf").forEach((e) => g.setEdge(e.target, e.source));
  } else {
    data.edges.forEach((e) => g.setEdge(e.source, e.target));
  }
  dagre.layout(g);
  const nodes: Node[] = data.nodes.map((n) => {
    const p = g.node(n.id);
    const c = colorOf(n.group);
    return {
      id: n.id,
      position: { x: p.x - w / 2, y: p.y - h / 2 },
      data: { label: level === "schema" ? `${n.label}${n.instances ? ` (${n.instances})` : ""}` : n.label },
      sourcePosition: compact ? Position.Bottom : Position.Right, targetPosition: compact ? Position.Top : Position.Left,
      style: {
        width: w, height: h, borderRadius: level === "schema" ? 12 : 20, border: `2px solid ${c}`, background: level === "schema" ? `${c}22` : "#fff",
        color: "#0f1b3d", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 4,
      },
    };
  });
  const edges: Edge[] = data.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target,
    label: e.kind === "subClassOf" ? undefined : e.label,
    type: "default",
    animated: false,
    style: e.kind === "subClassOf" ? { stroke: "#94a3b8", strokeDasharray: "5 4", strokeWidth: 1.5 } : { stroke: "#2563eb", strokeWidth: 1.6 },
    labelStyle: { fontSize: 10, fill: "#123a8f", fontWeight: 600 },
    labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
    labelBgPadding: [3, 2],
    markerEnd: { type: MarkerType.ArrowClosed, color: e.kind === "subClassOf" ? "#94a3b8" : "#2563eb", width: 16, height: 16 },
  }));
  return { nodes, edges };
}

/** Ontographe interactif : schéma (classes + relations) ou instances (individus et liens), calculé depuis le graphe RDF. */
export function Ontograph({ onSelectClass, onSelectIndividual }: { onSelectClass: (id: string) => void; onSelectIndividual: (id: string) => void }) {
  const [level, setLevel] = useState<"schema" | "instances">("schema");
  const [showSub, setShowSub] = useState(true);
  const [showRel, setShowRel] = useState(true);
  const { data, loading, error, reload } = useAsync(() => ontologyApi.graph(level), [level]);
  const [hover, setHover] = useState<string | null>(null);

  const [full, setFull] = useState(false);
  const filtered = useMemo<GraphData | null>(() => {
    if (!data) return null;
    if (level === "schema" && !full) {
      // vue d'ensemble : une seule bulle par grande famille de l'ontologie, relations agrégées
      const root = new Map(data.nodes.map((n) => [n.id, n.group]));
      const nodes = data.nodes.filter((n) => n.group === n.id);
      const agg = new Map<string, { s: string; t: string; labels: string[] }>();
      data.edges.filter((e) => e.kind === "objectProperty").forEach((e) => {
        const s = root.get(e.source) ?? e.source, t = root.get(e.target) ?? e.target;
        if (s === t) return;
        const k = `${s}>${t}`;
        const cur = agg.get(k) ?? { s, t, labels: [] };
        if (!cur.labels.includes(e.label)) cur.labels.push(e.label);
        agg.set(k, cur);
      });
      return { ...data, nodes, edges: showRel ? [...agg.values()].map((a) => ({ id: `${a.s}>${a.t}`, source: a.s, target: a.t, kind: "objectProperty", label: a.labels.slice(0, 3).join(", ") + (a.labels.length > 3 ? ` +${a.labels.length - 3}` : "") })) : [] };
    }
    return { ...data, edges: data.edges.filter((e) => (e.kind === "subClassOf" ? showSub : showRel)) };
  }, [data, showSub, showRel, full, level]);
  const { nodes, edges } = useMemo(() => (filtered ? layout(filtered, level, full) : { nodes: [], edges: [] }), [filtered, level, full]);
  const view = useMemo(() => {
    if (!hover) return { nodes, edges };
    const linked = new Set<string>([hover]);
    edges.forEach((e) => { if (e.source === hover) linked.add(e.target); if (e.target === hover) linked.add(e.source); });
    return {
      nodes: nodes.map((n) => ({ ...n, style: { ...n.style, opacity: linked.has(n.id) ? 1 : 0.25 } })),
      edges: edges.map((e) => ({ ...e, style: { ...e.style, opacity: e.source === hover || e.target === hover ? 1 : 0.12 } })),
    };
  }, [nodes, edges, hover]);

  useEffect(() => setHover(null), [level]);
  const onClick: NodeMouseHandler = (_, n) => (level === "schema" ? onSelectClass(n.id) : onSelectIndividual(n.id));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <Tabs value={level} onChange={setLevel} tabs={[{ id: "schema", label: "Schéma (classes)" }, { id: "instances", label: "Instances (individus)" }]} />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {level === "schema" && (
            <>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Toutes les classes (détail)</label>
              {full && <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSub} onChange={(e) => setShowSub(e.target.checked)} /> subClassOf</label>}
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={showRel} onChange={(e) => setShowRel(e.target.checked)} /> ObjectProperties</label>
            </>
          )}
          <span className="text-muted">{data ? `${data.nodes.length} nœuds · ${data.edges.length} arêtes` : ""}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs">
        {Object.entries(GROUP_COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k}</span>)}
      </div>
      <div className="h-[68vh] min-h-[420px]">
        {error ? <ErrorState message={error} onRetry={reload} /> : loading || !filtered ? <Spinner label="Construction de l'ontographe…" /> : (
          <ReactFlow nodes={view.nodes} edges={view.edges} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.15} nodesConnectable={false}
            onNodeClick={onClick} onNodeMouseEnter={(_, n) => setHover(n.id)} onNodeMouseLeave={() => setHover(null)} proOptions={{ hideAttribution: true }}>
            <Background gap={22} color="#dbe5fb" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => (n.style?.border as string | undefined)?.split(" ").pop() ?? "#2563eb"} />
          </ReactFlow>
        )}
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">Survolez un nœud pour isoler ses relations ; cliquez pour ouvrir la classe (schéma) ou l'individu (instances). Traits pointillés : subClassOf ; traits pleins : ObjectProperties (domaine → range).</p>
    </Card>
  );
}
