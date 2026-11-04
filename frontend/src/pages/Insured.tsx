import { useState } from "react";
import { Users } from "lucide-react";
import { useAsync, useDebounce } from "../hooks/useAsync";
import { insuredApi } from "../lib/services";
import type { Insured } from "../lib/types";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, KeyValue, Modal, PageHeader, SearchInput, Select, StatusBadge } from "../components/ui";
import { AddButton, FormError, RowActions, useDeleteFlow, useFormSubmit } from "../components/crud";
import { dateFr } from "../lib/format";

interface Form { prenom: string; nom: string; dateNaissance: string; numeroPermis: string; conducteur: boolean }
const EMPTY: Form = { prenom: "", nom: "", dateNaissance: "", numeroPermis: "", conducteur: true };

export default function InsuredPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const dq = useDebounce(q);
  const { data, loading, error, reload } = useAsync(() => insuredApi.list({ q: dq, conducteur: role || undefined }), [dq, role]);
  const [editing, setEditing] = useState<Insured | "new" | null>(null);
  const [viewing, setViewing] = useState<Insured | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const del = useDeleteFlow<Insured>({ remove: insuredApi.remove, id: (r) => r.id, label: (r) => r.label, onDone: reload, what: "l'assuré" });

  const submit = useFormSubmit<Form>({
    submit: (f) => {
      const body = { prenom: f.prenom, nom: f.nom, dateNaissance: f.dateNaissance || null, numeroPermis: f.numeroPermis || null, conducteur: f.conducteur };
      return editing === "new" ? insuredApi.create(body) : insuredApi.update((editing as Insured).id, body);
    },
    onSuccess: () => { setEditing(null); reload(); },
    success: editing === "new" ? "Assuré créé dans le graphe RDF" : "Assuré modifié",
  });

  const open = (row: Insured | "new") => {
    submit.reset();
    setForm(row === "new" ? EMPTY : { prenom: row.prenom ?? "", nom: row.nom ?? "", dateNaissance: row.dateNaissance ?? "", numeroPermis: row.numeroPermis ?? "", conducteur: row.conducteur });
    setEditing(row);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHeader title="Assurés" subtitle="Individus de la classe Assure (et Conducteur)" icon={<Users className="h-6 w-6" />} actions={<AddButton onClick={() => open("new")}>Ajouter un assuré</AddButton>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Rechercher par nom, prénom, permis…" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="!w-auto" aria-label="Filtrer par rôle">
            <option value="">Tous les rôles</option>
            <option value="true">Conducteurs</option>
            <option value="false">Non conducteurs</option>
          </Select>
          <span className="text-sm text-muted">{data?.total ?? 0} résultat(s)</span>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable
            loading={loading && !data}
            rows={data?.items ?? []}
            rowKey={(r) => r.id}
            onRowClick={setViewing}
            empty={<EmptyState title="Aucun assuré" text="Aucun assuré ne correspond à votre recherche." action={<Button variant="secondary" size="sm" onClick={() => { setQ(""); setRole(""); }}>Réinitialiser les filtres</Button>} />}
            columns={[
              { key: "n", header: "Assuré", render: (r) => <div><p className="font-medium">{r.label}</p><p className="text-xs text-muted">{r.id}</p></div> },
              { key: "d", header: "Naissance", render: (r) => dateFr(r.dateNaissance), hideOnMobile: true },
              { key: "p", header: "Permis", render: (r) => r.numeroPermis ?? "—", hideOnMobile: true },
              { key: "r", header: "Rôles", render: (r) => <div className="flex gap-1"><Badge>Assuré</Badge>{r.conducteur && <Badge tone="violet">Conducteur</Badge>}</div> },
              { key: "c", header: "Contrats", render: (r) => r.contrats.length },
              { key: "v", header: "Véhicules", render: (r) => r.vehicules.map((v) => v.label).join(", ") || "—", hideOnMobile: true },
              { key: "s", header: "Sinistres", render: (r) => r.sinistres.length },
            ]}
            actions={(r) => <RowActions onView={() => setViewing(r)} onEdit={() => open(r)} onDelete={() => del.ask(r)} />}
          />
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Nouvel assuré" : "Modifier l'assuré"}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button><Button loading={submit.saving} onClick={() => submit.run(form)}>Enregistrer</Button></>}>
        <FormError message={submit.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" required error={submit.errors.prenom}>{(id) => <Input id={id} value={form.prenom} onChange={(e) => set("prenom", e.target.value)} />}</Field>
          <Field label="Nom" required error={submit.errors.nom}>{(id) => <Input id={id} value={form.nom} onChange={(e) => set("nom", e.target.value)} />}</Field>
          <Field label="Date de naissance" error={submit.errors.dateNaissance}>{(id) => <Input id={id} type="date" value={form.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)} />}</Field>
          <Field label="Numéro de permis" error={submit.errors.numeroPermis} hint="5 à 12 caractères alphanumériques">{(id) => <Input id={id} value={form.numeroPermis} onChange={(e) => set("numeroPermis", e.target.value)} />}</Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.conducteur} onChange={(e) => set("conducteur", e.target.checked)} className="h-4 w-4 rounded border-line" />
            Cet assuré est aussi <b>Conducteur</b> (rôles non disjoints dans l'ontologie)
          </label>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.label ?? ""} footer={viewing && <Button variant="secondary" onClick={() => { const r = viewing; setViewing(null); open(r); }}>Modifier</Button>}>
        {viewing && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue label="Identifiant (URI)">{viewing.id}</KeyValue>
            <KeyValue label="Date de naissance">{dateFr(viewing.dateNaissance)}</KeyValue>
            <KeyValue label="Numéro de permis">{viewing.numeroPermis ?? "—"}</KeyValue>
            <KeyValue label="Rôles">{viewing.conducteur ? "Assuré, Conducteur" : "Assuré"}</KeyValue>
            <KeyValue label="Contrats">{viewing.contrats.length ? viewing.contrats.map((c) => <div key={c.id} className="flex items-center gap-2">{c.numero} <StatusBadge status={c.statut} /></div>) : "—"}</KeyValue>
            <KeyValue label="Véhicules assurés">{viewing.vehicules.length ? viewing.vehicules.map((v) => <div key={v.id}>{v.label}</div>) : "—"}</KeyValue>
            <KeyValue label="Sinistres déclarés">{viewing.sinistres.length ? viewing.sinistres.map((s) => <div key={s.id}>{s.numero}</div>) : "—"}</KeyValue>
          </dl>
        )}
      </Modal>
      {del.dialog}
    </>
  );
}
