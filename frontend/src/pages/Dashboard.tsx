import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity as ActivityIcon, BadgeCheck, Boxes, Car, ClipboardCheck, FileText, Gauge, GitBranch, Network, ShieldAlert, Siren, Users, Wallet } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { ontologyApi } from "../lib/services";
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, Badge } from "../components/ui";
import { humanize, money, timeAgo, dateFr } from "../lib/format";

// Palette catégorielle validée (ordre fixe : bleu, orange, aqua, jaune, magenta)
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];
const AXIS = { fontSize: 12, fill: "#5b6b8c" };
const ACTION_LABEL: Record<string, string> = { create: "Création", update: "Modification", delete: "Suppression", sparql: "SPARQL Update", reset: "Réinitialisation" };
const ACTION_TONE = { create: "green", update: "blue", delete: "red", sparql: "violet", reset: "amber" } as const;

function ChartCard({ title, subtitle, children, empty }: { title: string; subtitle?: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="h-64 p-4">{empty ? <EmptyState title="Pas encore de données" /> : children}</div>
    </Card>
  );
}

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f4", boxShadow: "0 8px 24px rgba(11,42,107,.12)", fontSize: 13 };

export default function Dashboard() {
  const stats = useAsync(() => ontologyApi.statistics(), []);
  const activity = useAsync(() => ontologyApi.activity(8), []);
  const validation = useAsync(() => ontologyApi.validate(), []);
  const s = stats.data;

  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />;

  const cards = s && [
    { label: "Classes OWL", value: s.ontology.classes, icon: <Boxes className="h-5 w-5" />, tone: "navy" as const },
    { label: "Propriétés", value: s.ontology.objectProperties + s.ontology.dataProperties, icon: <GitBranch className="h-5 w-5" />, tone: "navy" as const, hint: `${s.ontology.objectProperties} objet · ${s.ontology.dataProperties} données` },
    { label: "Individus", value: s.ontology.individuals, icon: <Network className="h-5 w-5" />, tone: "navy" as const, hint: `${s.ontology.triples} triplets RDF` },
    { label: "Contrats", value: s.entities.contrats, icon: <FileText className="h-5 w-5" /> },
    { label: "Véhicules", value: s.entities.vehicules, icon: <Car className="h-5 w-5" /> },
    { label: "Sinistres", value: s.entities.sinistres, icon: <Siren className="h-5 w-5" />, tone: "amber" as const },
    { label: "Indemnisations", value: s.entities.indemnisations, icon: <Wallet className="h-5 w-5" />, tone: "teal" as const },
    { label: "Assurés", value: s.entities.assures, icon: <Users className="h-5 w-5" /> },
  ];

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Statistiques calculées en direct par des requêtes SPARQL sur le graphe RDF" icon={<Gauge className="h-6 w-6" />} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!cards ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />) : cards.map((c) => <StatCard key={c.label} {...c} />)}
      </div>

      {s && (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs font-medium text-muted">Total indemnisé (acceptées)</p>
              <p className="tabular mt-1 text-2xl font-bold">{money(s.finance.totalIndemnisationAcceptee)}</p>
              <p className="text-xs text-muted">{s.finance.acceptedCount} indemnisation(s) · moyenne {money(Math.round(s.finance.averageIndemnisationAcceptee))}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted">Primes annuelles cumulées</p>
              <p className="tabular mt-1 text-2xl font-bold">{money(s.finance.totalPrimes)}</p>
              <p className="text-xs text-muted">{s.entities.garanties} garanties · {s.entities.expertises} expertises · {s.entities.experts} experts</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted">Cohérence de l'ontologie</p>
                {validation.data ? (
                  validation.data.consistent ? <BadgeCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-red-600" />
                ) : null}
              </div>
              <p className="mt-1 text-2xl font-bold">{validation.data ? (validation.data.consistent ? "Cohérente" : `${validation.data.errors.length} violation(s)`) : "…"}</p>
              <p className="text-xs text-muted">{validation.data ? `${validation.data.checks.filter((c) => c.passed).length}/${validation.data.checks.length} contrôles réussis` : "Validation en cours"}</p>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Contrats par type" subtitle="Sous-classes de ContratAssurance" empty={!s.byContractType.some((x) => x.count)}>
              <ResponsiveContainer>
                <BarChart data={s.byContractType.map((x) => ({ ...x, name: humanize(x.name).replace("Assurance ", "") }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#e8eefb" />
                  <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#eff6ff" }} formatter={(v: number) => [v, "Contrats"]} />
                  <Bar isAnimationActive={false} dataKey="count" fill={SERIES[0]} radius={[0, 4, 4, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Sinistres par type" subtitle="Sous-classes de Sinistre" empty={!s.byClaimType.some((x) => x.count)}>
              <ResponsiveContainer>
                <BarChart data={s.byClaimType.map((x) => ({ ...x, name: humanize(x.name) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#e8eefb" />
                  <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#fff4ee" }} formatter={(v: number) => [v, "Sinistres"]} />
                  <Bar isAnimationActive={false} dataKey="count" fill={SERIES[1]} radius={[0, 4, 4, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Sinistres par mois" subtitle="Date de survenance (dateSinistre)" empty={!s.claimsByMonth.length}>
              <ResponsiveContainer>
                <AreaChart data={s.claimsByMonth} margin={{ left: -10, right: 12, top: 8 }}>
                  <defs>
                    <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#e8eefb" />
                  <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Sinistres"]} />
                  <Area isAnimationActive={false} type="monotone" dataKey="count" stroke={SERIES[0]} strokeWidth={2} fill="url(#gArea)" dot={{ r: 4, fill: SERIES[0], stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Statut des indemnisations" subtitle="Acceptée · en cours · refusée" empty={!s.byIndemnisationStatus.length}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie isAnimationActive={false} data={s.byIndemnisationStatus.map((x) => ({ ...x, name: x.name === "Acceptee" ? "Acceptée" : x.name === "Refusee" ? "Refusée" : "En cours" }))} dataKey="count" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                    {s.byIndemnisationStatus.map((x) => <Cell key={x.name} fill={x.name === "Acceptee" ? "#1baf7a" : x.name === "Refusee" ? "#e34948" : "#eda100"} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend verticalAlign="bottom" iconType="circle" formatter={(v) => <span style={{ color: "#0f1b3d", fontSize: 13 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Garanties par type" subtitle="Sous-classes de Garantie" empty={!s.byGuaranteeType.some((x) => x.count)}>
              <ResponsiveContainer>
                <BarChart data={s.byGuaranteeType.map((x) => ({ ...x, name: humanize(x.name).replace("Garantie ", "") }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#e8eefb" />
                  <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ ...AXIS, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#eef9f4" }} formatter={(v: number) => [v, "Garanties"]} />
                  <Bar isAnimationActive={false} dataKey="count" fill={SERIES[2]} radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Véhicules par marque" subtitle="Propriété marque" empty={!s.vehiclesByBrand.length}>
              <ResponsiveContainer>
                <BarChart data={s.vehiclesByBrand} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e8eefb" />
                  <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#fdf6e3" }} formatter={(v: number) => [v, "Véhicules"]} />
                  <Bar isAnimationActive={false} dataKey="count" fill={SERIES[3]} radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Activité récente" subtitle="Opérations CRUD et SPARQL Update (journal secondaire)" action={<ActivityIcon className="h-4 w-4 text-muted" />} />
              {activity.data && activity.data.length ? (
                <ul className="divide-y divide-line">
                  {activity.data.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge tone={ACTION_TONE[a.action]}>{ACTION_LABEL[a.action]}</Badge>
                        <span className="truncate"><b>{a.entity}</b> {a.label}</span>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{timeAgo(a.ts)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Aucune activité pour l'instant" text="Créez, modifiez ou supprimez une entité : elle apparaîtra ici et le graphe RDF sera mis à jour." />
              )}
            </Card>
            <Card>
              <CardHeader title="Derniers sinistres" subtitle="Requête SPARQL ORDER BY DESC(dateSinistre)" action={<Link to="/app/claims" className="text-xs font-medium text-brand-600 hover:underline">Tout voir</Link>} />
              {s.recentClaims.length ? (
                <ul className="divide-y divide-line">
                  {s.recentClaims.map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <span className="font-medium">{c.number}</span>
                      <span className="text-muted">{c.place ?? "—"}</span>
                      <span className="tabular text-muted">{dateFr(c.date)}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Aucun sinistre" icon={<ClipboardCheck className="h-6 w-6" />} />}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
