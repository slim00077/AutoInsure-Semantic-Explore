import { useState } from "react";
import { Flame, Gem, ShieldCheck, ShieldPlus, Snowflake, Zap, CloudLightning, Lock } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { contractsApi, guaranteesApi } from "../lib/services";
import type { Guarantee, GuaranteeType } from "../lib/types";
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton } from "../components/ui";
import { FormError, RowActions, useDeleteFlow, useFormSubmit } from "../components/crud";
import { humanize, money } from "../lib/format";

const ICONS: Record<string, React.ReactNode> = {
  GarantieResponsabiliteCivile: <ShieldCheck className="h-6 w-6" />, GarantieVol: <Lock className="h-6 w-6" />, GarantieIncendie: <Flame className="h-6 w-6" />,
  GarantieBrisDeGlace: <Snowflake className="h-6 w-6" />, GarantieDommagesTousAccidents: <Zap className="h-6 w-6" />, GarantieCatastrophesNaturelles: <CloudLightning className="h-6 w-6" />,
};

export default function GuaranteesPage() {
  const types = useAsync(() => guaranteesApi.types(), []);
  const [filter, setFilter] = useState<string>("");
  const list = useAsync(() => guaranteesApi.list({ type: filter }), [filter]);
  const contracts = useAsync(() => contractsApi.list(), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Guarantee | null>(null);
  const [form, setForm] = useState({ contratId: "", type: "GarantieVol", plafondGarantie: "" });
  const [plafond, setPlafond] = useState("");
  const reloadAll = () => { types.reload(); list.reload(); contracts.reload(); };
  const del = useDeleteFlow<Guarantee>({ remove: guaranteesApi.remove, id: (r) => r.id, label: (r) => `${r.typeLabel} (${r.contrat?.numero})`, onDone: reloadAll, what: "la garantie" });

  const create = useFormSubmit<typeof form>({
    submit: (f) => guaranteesApi.create({ contratId: f.contratId, type: f.type, ...(f.plafondGarantie ? { plafondGarantie: Number(f.plafondGarantie) } : {}) }),
    onSuccess: () => { setAdding(false); reloadAll(); }, success: "Garantie ajoutée au contrat",
  });
  const update = useFormSubmit<string>({
    submit: (p) => guaranteesApi.update(editing!.id, { plafondGarantie: Number(p) }),
    onSuccess: () => { setEditing(null); reloadAll(); }, success: "Plafond modifié",
  });

  return (
    <>
      <PageHeader title="Garanties" subtitle="Les six sous-classes de Garantie définies dans l'ontologie, avec leurs instances réelles" icon={<ShieldCheck className="h-6 w-6" />}
        actions={<Button icon={<ShieldPlus className="h-4 w-4" />} onClick={() => { create.reset(); setForm({ contratId: contracts.data?.items[0]?.id ?? "", type: "GarantieVol", plafondGarantie: "" }); setAdding(true); }}>Ajouter une garantie à un contrat</Button>} />

      {types.error ? <ErrorState message={types.error} onRetry={types.reload} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!types.data ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />) : types.data.map((t: GuaranteeType) => (
            <button key={t.id} onClick={() => setFilter(filter === t.id ? "" : t.id)} className={`focus-ring rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${filter === t.id ? "border-brand-500 ring-2 ring-brand-300" : "border-line"}`}>
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-navy-800">{ICONS[t.id] ?? <Gem className="h-6 w-6" />}</div>
                <Badge tone={t.count ? "green" : "gray"}>{t.count} instance(s)</Badge>
              </div>
              <h3 className="mt-3 font-semibold text-ink">{t.label}</h3>
              <p className="mt-1 text-xs text-muted">{t.description}</p>
              <p className="mt-2 text-xs text-muted">Plafond moyen : <b className="text-ink">{t.averagePlafond !== null ? money(t.averagePlafond) : "—"}</b>{t.requiredBy.length > 0 && <> · exigée par <b>{t.requiredBy.map((x) => humanize(x).replace("Assurance ", "")).join(", ")}</b></>}</p>
            </button>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title={filter ? `Instances — ${humanize(filter)}` : "Toutes les garanties souscrites"} subtitle="Cliquez sur une carte pour filtrer" action={filter && <Button size="sm" variant="secondary" onClick={() => setFilter("")}>Tout afficher</Button>} />
        {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : (
          <DataTable loading={list.loading && !list.data} rows={list.data?.items ?? []} rowKey={(r) => r.id}
            empty={<EmptyState title="Aucune garantie" text="Aucune instance pour ce type." />}
            columns={[
              { key: "id", header: "Identifiant", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
              { key: "t", header: "Type", render: (r) => <Badge>{r.typeLabel}</Badge> },
              { key: "p", header: "Plafond", render: (r) => <span className="tabular">{money(r.plafondGarantie)}</span> },
              { key: "c", header: "Contrat", render: (r) => r.contrat?.numero ?? "—" },
              { key: "s", header: "Sinistres mobilisant", render: (r) => r.sinistres.map((s) => s.numero).join(", ") || "—", hideOnMobile: true },
            ]}
            actions={(r) => <RowActions onEdit={() => { update.reset(); setPlafond(String(r.plafondGarantie ?? "")); setEditing(r); }} onDelete={() => del.ask(r)} />}
          />
        )}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Ajouter une garantie" size="sm" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Annuler</Button><Button loading={create.saving} onClick={() => create.run(form)}>Ajouter</Button></>}>
        <FormError message={create.formError} />
        <div className="space-y-4">
          <Field label="Contrat (contient)" required error={create.errors.contratId}>{(id) => <Select id={id} value={form.contratId} onChange={(e) => setForm({ ...form, contratId: e.target.value })}>{contracts.data?.items.map((c) => <option key={c.id} value={c.id}>{c.numeroContrat} — {c.assure?.label}</option>)}</Select>}</Field>
          <Field label="Type de garantie" required error={create.errors.type}>{(id) => <Select id={id} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>}</Field>
          <Field label="Plafond" hint="Vide = plafond par défaut du type" error={create.errors.plafondGarantie}>{(id) => <Input id={id} type="number" min={0} value={form.plafondGarantie} onChange={(e) => setForm({ ...form, plafondGarantie: e.target.value })} />}</Field>
        </div>
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Modifier le plafond" size="sm" footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button><Button loading={update.saving} onClick={() => update.run(plafond)}>Enregistrer</Button></>}>
        <FormError message={update.formError} />
        <Field label={`Plafond — ${editing?.typeLabel ?? ""}`} error={update.errors.plafondGarantie}>{(id) => <Input id={id} type="number" min={0} value={plafond} onChange={(e) => setPlafond(e.target.value)} />}</Field>
      </Modal>
      {del.dialog}
    </>
  );
}
