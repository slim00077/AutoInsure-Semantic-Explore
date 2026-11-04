import { useState } from "react";
import { Car } from "lucide-react";
import { useAsync, useDebounce } from "../hooks/useAsync";
import { contractsApi, referencesApi, vehiclesApi } from "../lib/services";
import type { Vehicle } from "../lib/types";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, KeyValue, Modal, PageHeader, SearchInput, Select, StatusBadge } from "../components/ui";
import { AddButton, FormError, RowActions, useDeleteFlow, useFormSubmit } from "../components/crud";
import { money } from "../lib/format";

interface Form { marque: string; modele: string; anneeFabrication: string; immatriculation: string; valeurVehicule: string; type: string; conducteurId: string; contratIds: string[] }
const EMPTY: Form = { marque: "", modele: "", anneeFabrication: String(new Date().getFullYear()), immatriculation: "", valeurVehicule: "", type: "Voiture", conducteurId: "", contratIds: [] };

export default function VehiclesPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const dq = useDebounce(q);
  const { data, loading, error, reload } = useAsync(() => vehiclesApi.list({ q: dq, type }), [dq, type]);
  const refs = useAsync(() => referencesApi.get(), []);
  const contracts = useAsync(() => contractsApi.list(), []);
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const [viewing, setViewing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const del = useDeleteFlow<Vehicle>({ remove: vehiclesApi.remove, id: (r) => r.id, label: (r) => r.label, onDone: reload, what: "le véhicule" });

  const submit = useFormSubmit<Form>({
    submit: (f) => {
      const body = {
        marque: f.marque, modele: f.modele, anneeFabrication: Number(f.anneeFabrication), immatriculation: f.immatriculation,
        valeurVehicule: Number(f.valeurVehicule), type: f.type, conducteurId: f.conducteurId || null, contratIds: f.contratIds,
      };
      return editing === "new" ? vehiclesApi.create(body) : vehiclesApi.update((editing as Vehicle).id, body);
    },
    onSuccess: () => { setEditing(null); reload(); contracts.reload(); },
    success: editing === "new" ? "Véhicule créé et relié dans le graphe RDF" : "Véhicule modifié",
  });
  const open = (row: Vehicle | "new") => {
    submit.reset();
    setForm(row === "new" ? EMPTY : {
      marque: row.marque ?? "", modele: row.modele ?? "", anneeFabrication: String(row.anneeFabrication ?? ""), immatriculation: row.immatriculation ?? "",
      valeurVehicule: String(row.valeurVehicule ?? ""), type: row.type === "Vehicule" ? "Voiture" : row.type, conducteurId: row.conducteur?.id ?? "", contratIds: row.contrats.map((c) => c.id),
    });
    setEditing(row);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleContract = (id: string) => set("contratIds", form.contratIds.includes(id) ? form.contratIds.filter((x) => x !== id) : [...form.contratIds, id]);

  return (
    <>
      <PageHeader title="Véhicules" subtitle="Voitures, motos et camions reliés à leurs conducteurs et contrats" icon={<Car className="h-6 w-6" />} actions={<AddButton onClick={() => open("new")}>Ajouter un véhicule</AddButton>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Marque, modèle, immatriculation, assuré…" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-auto" aria-label="Type de véhicule">
            <option value="">Tous types</option><option>Voiture</option><option>Moto</option><option>Camion</option>
          </Select>
          <span className="text-sm text-muted">{data?.total ?? 0} résultat(s)</span>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable
            loading={loading && !data} rows={data?.items ?? []} rowKey={(r) => r.id} onRowClick={setViewing}
            empty={<EmptyState title="Aucun véhicule" text="Ajoutez un véhicule ou modifiez les filtres." />}
            columns={[
              { key: "v", header: "Véhicule", render: (r) => <div><p className="font-medium">{r.marque} {r.modele}</p><p className="text-xs text-muted">{r.id}</p></div> },
              { key: "t", header: "Type", render: (r) => <Badge tone="violet">{r.type}</Badge> },
              { key: "i", header: "Immatriculation", render: (r) => <span className="font-mono text-xs">{r.immatriculation}</span> },
              { key: "a", header: "Année", render: (r) => r.anneeFabrication, hideOnMobile: true },
              { key: "val", header: "Valeur", render: (r) => <span className="tabular">{money(r.valeurVehicule)}</span> },
              { key: "o", header: "Assuré", render: (r) => r.assures.map((a) => a?.label).join(", ") || <span className="text-muted">non assuré</span>, hideOnMobile: true },
              { key: "c", header: "Contrats", render: (r) => r.contrats.map((c) => c.numero).join(", ") || "—", hideOnMobile: true },
            ]}
            actions={(r) => <RowActions onView={() => setViewing(r)} onEdit={() => open(r)} onDelete={() => del.ask(r)} />}
          />
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Nouveau véhicule" : "Modifier le véhicule"} size="lg"
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button><Button loading={submit.saving} onClick={() => submit.run(form)}>Enregistrer</Button></>}>
        <FormError message={submit.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" required error={submit.errors.type}>{(id) => <Select id={id} value={form.type} onChange={(e) => set("type", e.target.value)}><option>Voiture</option><option>Moto</option><option>Camion</option></Select>}</Field>
          <Field label="Immatriculation" required error={submit.errors.immatriculation}>{(id) => <Input id={id} value={form.immatriculation} onChange={(e) => set("immatriculation", e.target.value)} />}</Field>
          <Field label="Marque" required error={submit.errors.marque}>{(id) => <Input id={id} value={form.marque} onChange={(e) => set("marque", e.target.value)} />}</Field>
          <Field label="Modèle" required error={submit.errors.modele}>{(id) => <Input id={id} value={form.modele} onChange={(e) => set("modele", e.target.value)} />}</Field>
          <Field label="Année de fabrication" required error={submit.errors.anneeFabrication}>{(id) => <Input id={id} type="number" value={form.anneeFabrication} onChange={(e) => set("anneeFabrication", e.target.value)} />}</Field>
          <Field label="Valeur du véhicule" required error={submit.errors.valeurVehicule}>{(id) => <Input id={id} type="number" min={0} value={form.valeurVehicule} onChange={(e) => set("valeurVehicule", e.target.value)} />}</Field>
          <div className="sm:col-span-2">
            <Field label="Conducteur (estConduitPar)" error={submit.errors.conducteurId} hint="Seuls les individus de classe Conducteur sont acceptés (range de l'ontologie).">
              {(id) => (
                <Select id={id} value={form.conducteurId} onChange={(e) => set("conducteurId", e.target.value)}>
                  <option value="">— aucun —</option>
                  {refs.data?.conducteurs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-xs font-medium">Contrats couvrant ce véhicule (couvre)</p>
            <div className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
              {contracts.data?.items.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.contratIds.includes(c.id)} onChange={() => toggleContract(c.id)} className="h-4 w-4" />
                  <span>{c.numeroContrat} <span className="text-muted">— {c.assure?.label}</span></span>
                </label>
              ))}
              {!contracts.data?.items.length && <p className="text-sm text-muted">Aucun contrat.</p>}
            </div>
            {submit.errors.contratIds && <p className="mt-1 text-xs text-red-600">{submit.errors.contratIds}</p>}
          </div>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.label ?? ""} footer={viewing && <Button variant="secondary" onClick={() => { const r = viewing; setViewing(null); open(r); }}>Modifier</Button>}>
        {viewing && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue label="Identifiant (URI)">{viewing.id}</KeyValue>
            <KeyValue label="Type (classe OWL)">{viewing.type}</KeyValue>
            <KeyValue label="Marque / modèle">{viewing.marque} {viewing.modele}</KeyValue>
            <KeyValue label="Année">{viewing.anneeFabrication}</KeyValue>
            <KeyValue label="Immatriculation">{viewing.immatriculation}</KeyValue>
            <KeyValue label="Valeur">{money(viewing.valeurVehicule)}</KeyValue>
            <KeyValue label="Conducteur">{viewing.conducteur?.label ?? "—"}</KeyValue>
            <KeyValue label="Assuré(s)">{viewing.assures.map((a) => a?.label).join(", ") || "—"}</KeyValue>
            <KeyValue label="Contrats">{viewing.contrats.length ? viewing.contrats.map((c) => <div key={c.id} className="flex items-center gap-2">{c.numero} <StatusBadge status={c.statut} /></div>) : "—"}</KeyValue>
            <KeyValue label="Sinistres">{viewing.sinistres.map((s) => s.numero).join(", ") || "—"}</KeyValue>
            <KeyValue label="Garage(s)">{viewing.garages.map((g) => g.label).join(", ") || "—"}</KeyValue>
          </dl>
        )}
      </Modal>
      {del.dialog}
    </>
  );
}
