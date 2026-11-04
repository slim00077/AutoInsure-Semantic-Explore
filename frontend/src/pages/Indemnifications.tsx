import { useEffect, useState } from "react";
import { Calculator, Wallet } from "lucide-react";
import { useAsync, useDebounce } from "../hooks/useAsync";
import { claimsApi, indemnificationsApi, referencesApi } from "../lib/services";
import type { Indemnification } from "../lib/types";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, KeyValue, Modal, PageHeader, SearchInput, Select, StatusBadge, Textarea } from "../components/ui";
import { AddButton, FormError, RowActions, useDeleteFlow, useFormSubmit } from "../components/crud";
import { dateFr, money } from "../lib/format";

interface Form { dommageId: string; statutIndemnisation: string; dateIndemnisation: string; motifDecision: string; baremeId: string; franchiseMontant: string; montantIndemnisation: string; auto: boolean }
const EMPTY: Form = { dommageId: "", statutIndemnisation: "EnCours", dateIndemnisation: "", motifDecision: "", baremeId: "", franchiseMontant: "", montantIndemnisation: "", auto: true };

export default function IndemnificationsPage() {
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const dq = useDebounce(q);
  const { data, loading, error, reload } = useAsync(() => indemnificationsApi.list({ q: dq, statut }), [dq, statut]);
  const refs = useAsync(() => referencesApi.get(), []);
  const damages = useAsync(() => claimsApi.damages(), []);
  const [editing, setEditing] = useState<Indemnification | "new" | null>(null);
  const [viewing, setViewing] = useState<Indemnification | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [sim, setSim] = useState<number | null>(null);
  const del = useDeleteFlow<Indemnification>({ remove: indemnificationsApi.remove, id: (r) => r.id, label: (r) => `${r.id} (${money(r.montantIndemnisation)})`, onDone: () => { reload(); damages.reload(); }, what: "l'indemnisation" });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const free = damages.data?.items.filter((d) => !d.indemnisation) ?? [];
  const dommage = damages.data?.items.find((d) => d.id === form.dommageId) ?? (editing && editing !== "new" ? (editing.dommage && { ...editing.dommage, coutEstime: editing.dommage.coutEstime }) : undefined);

  // simulation en direct du barème : (coût − franchise) × taux, plafonné
  const debouncedKey = useDebounce(`${dommage?.coutEstime}|${form.franchiseMontant}|${form.baremeId}`, 250);
  useEffect(() => {
    if (!dommage?.coutEstime && dommage?.coutEstime !== 0) return setSim(null);
    if (!form.baremeId) return setSim(null);
    indemnificationsApi.simulate({ coutEstime: dommage.coutEstime ?? 0, franchise: Number(form.franchiseMontant || 0), baremeId: form.baremeId }).then((r) => setSim(r.montant)).catch(() => setSim(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey]);

  const submit = useFormSubmit<Form>({
    submit: (f) => {
      const manual = !f.auto && f.montantIndemnisation !== "";
      const common = {
        statutIndemnisation: f.statutIndemnisation, ...(f.dateIndemnisation ? { dateIndemnisation: f.dateIndemnisation } : {}), ...(f.motifDecision ? { motifDecision: f.motifDecision } : {}),
        ...(f.baremeId ? { baremeId: f.baremeId } : {}), ...(f.franchiseMontant !== "" ? { franchiseMontant: Number(f.franchiseMontant) } : {}),
      };
      if (editing === "new") return indemnificationsApi.create({ dommageId: f.dommageId, ...common, ...(manual ? { montantIndemnisation: Number(f.montantIndemnisation) } : {}) });
      return indemnificationsApi.update((editing as Indemnification).id, { ...common, ...(manual ? { montantIndemnisation: Number(f.montantIndemnisation) } : f.baremeId ? { recalculer: true } : {}) });
    },
    onSuccess: () => { setEditing(null); reload(); damages.reload(); },
    success: editing === "new" ? "Indemnisation créée dans le graphe RDF" : "Indemnisation modifiée",
  });

  const open = (row: Indemnification | "new") => {
    submit.reset(); setSim(null);
    setForm(row === "new" ? EMPTY : {
      dommageId: row.dommage?.id ?? "", statutIndemnisation: row.statutIndemnisation ?? "EnCours", dateIndemnisation: row.dateIndemnisation ?? "", motifDecision: row.motifDecision ?? "",
      baremeId: row.bareme?.id ?? "", franchiseMontant: String(row.franchise?.montantFranchise ?? ""), montantIndemnisation: String(row.montantIndemnisation ?? ""), auto: false,
    });
    setEditing(row);
  };

  return (
    <>
      <PageHeader title="Indemnisations" subtitle="Montant, date, statut, franchise, barème et dommage concerné" icon={<Wallet className="h-6 w-6" />} actions={<AddButton onClick={() => open("new")}>Créer une indemnisation</AddButton>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Sinistre, bénéficiaire, motif…" />
          <Select value={statut} onChange={(e) => setStatut(e.target.value)} className="!w-auto" aria-label="Statut">
            <option value="">Tous statuts</option><option value="EnCours">En cours</option><option value="Acceptee">Acceptée</option><option value="Refusee">Refusée</option>
          </Select>
          <span className="text-sm text-muted">{data?.total ?? 0} résultat(s)</span>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable loading={loading && !data} rows={data?.items ?? []} rowKey={(r) => r.id} onRowClick={setViewing}
            empty={<EmptyState title="Aucune indemnisation" text="Les indemnisations sont rattachées à un dommage d'un sinistre." />}
            columns={[
              { key: "id", header: "Indemnisation", render: (r) => <div><p className="font-medium">{r.id}</p><p className="text-xs text-muted">{dateFr(r.dateIndemnisation)}</p></div> },
              { key: "m", header: "Montant", render: (r) => <b className="tabular">{money(r.montantIndemnisation)}</b> },
              { key: "s", header: "Statut", render: (r) => <StatusBadge status={r.statutIndemnisation} /> },
              { key: "sin", header: "Sinistre", render: (r) => r.sinistre?.numero ?? "—" },
              { key: "d", header: "Dommage concerné", render: (r) => <span className="line-clamp-1 max-w-[14rem]">{r.dommage?.description}</span>, hideOnMobile: true },
              { key: "f", header: "Franchise", render: (r) => <span className="tabular">{money(r.franchise?.montantFranchise)}</span>, hideOnMobile: true },
              { key: "b", header: "Barème", render: (r) => r.bareme ? <Badge>{r.bareme.id} · ×{r.bareme.tauxIndemnisation}</Badge> : "—", hideOnMobile: true },
              { key: "be", header: "Bénéficiaire", render: (r) => r.beneficiaire?.label, hideOnMobile: true },
            ]}
            actions={(r) => <RowActions onView={() => setViewing(r)} onEdit={() => open(r)} onDelete={() => del.ask(r)} />}
          />
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} size="lg" title={editing === "new" ? "Nouvelle indemnisation" : "Modifier l'indemnisation"}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button><Button loading={submit.saving} onClick={() => submit.run(form)}>Enregistrer</Button></>}>
        <FormError message={submit.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Dommage concerné (donneLieuA)" required error={submit.errors.dommageId} hint={editing === "new" && !free.length ? "Tous les dommages ont déjà une indemnisation." : undefined}>
              {(id) => (
                <Select id={id} disabled={editing !== "new"} value={form.dommageId} onChange={(e) => set("dommageId", e.target.value)}>
                  <option value="">— choisir un dommage sans indemnisation —</option>
                  {(editing === "new" ? free : damages.data?.items.filter((d) => d.id === form.dommageId) ?? []).map((d) => <option key={d.id} value={d.id}>{d.sinistre?.numero} — {d.description} ({money(d.coutEstime)})</option>)}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Statut" error={submit.errors.statutIndemnisation}>{(id) => <Select id={id} value={form.statutIndemnisation} onChange={(e) => set("statutIndemnisation", e.target.value)}><option value="EnCours">En cours</option><option value="Acceptee">Acceptée</option><option value="Refusee">Refusée</option></Select>}</Field>
          <Field label="Date" error={submit.errors.dateIndemnisation} hint="Vide = aujourd'hui si acceptée/refusée">{(id) => <Input id={id} type="date" value={form.dateIndemnisation} onChange={(e) => set("dateIndemnisation", e.target.value)} />}</Field>
          <Field label="Barème (utiliseBareme)" error={submit.errors.baremeId}>{(id) => <Select id={id} value={form.baremeId} onChange={(e) => set("baremeId", e.target.value)}><option value="">— aucun —</option>{refs.data?.baremes.map((b) => <option key={b.id} value={b.id}>{b.id} — taux {b.tauxIndemnisation}, plafond {money(b.plafondIndemnisation)}</option>)}</Select>}</Field>
          <Field label="Franchise (appliqueFranchise)" error={submit.errors.franchiseMontant}>{(id) => <Input id={id} type="number" min={0} value={form.franchiseMontant} placeholder="0" onChange={(e) => set("franchiseMontant", e.target.value)} />}</Field>
          <div className="rounded-xl bg-brand-50 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Calculator className="h-4 w-4 text-navy-800" /> Calcul par le barème : (coût − franchise) × taux, plafonné</div>
              <div className="tabular text-lg font-bold text-navy-900">{sim !== null ? money(sim) : "—"}</div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={form.auto} onChange={(e) => set("auto", e.target.checked)} />Utiliser le montant calculé {editing !== "new" && "(recalcul)"}</label>
            {!form.auto && <div className="mt-3 max-w-xs"><Field label="Montant manuel" error={submit.errors.montantIndemnisation}>{(id) => <Input id={id} type="number" min={0} value={form.montantIndemnisation} onChange={(e) => set("montantIndemnisation", e.target.value)} />}</Field></div>}
          </div>
          <div className="sm:col-span-2"><Field label="Motif de la décision" error={submit.errors.motifDecision}>{(id) => <Textarea id={id} value={form.motifDecision} onChange={(e) => set("motifDecision", e.target.value)} />}</Field></div>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} size="md" title={`Indemnisation ${viewing?.id ?? ""}`} footer={viewing && <Button variant="secondary" onClick={() => { const r = viewing; setViewing(null); open(r); }}>Modifier</Button>}>
        {viewing && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue label="Montant"><b className="tabular text-lg">{money(viewing.montantIndemnisation)}</b></KeyValue>
            <KeyValue label="Statut"><StatusBadge status={viewing.statutIndemnisation} /></KeyValue>
            <KeyValue label="Date">{dateFr(viewing.dateIndemnisation)}</KeyValue>
            <KeyValue label="Sinistre">{viewing.sinistre?.numero ?? "—"}</KeyValue>
            <KeyValue label="Dommage concerné">{viewing.dommage?.description} ({money(viewing.dommage?.coutEstime)})</KeyValue>
            <KeyValue label="Franchise">{money(viewing.franchise?.montantFranchise)}</KeyValue>
            <KeyValue label="Barème">{viewing.bareme ? `${viewing.bareme.id} — taux ${viewing.bareme.tauxIndemnisation}, plafond ${money(viewing.bareme.plafondIndemnisation)}` : "—"}</KeyValue>
            <KeyValue label="Règle de calcul">{viewing.bareme?.regleCalcul ?? "—"}</KeyValue>
            <KeyValue label="Bénéficiaire (verseeA)">{viewing.beneficiaire?.label ?? "—"}</KeyValue>
            <KeyValue label="Versée par">{viewing.compagnie?.label ?? "—"}</KeyValue>
            <div className="sm:col-span-2"><KeyValue label="Motif">{viewing.motifDecision ?? "—"}</KeyValue></div>
          </dl>
        )}
      </Modal>
      {del.dialog}
    </>
  );
}
