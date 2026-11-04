import { useState } from "react";
import { FileText, Info } from "lucide-react";
import { useAsync, useDebounce } from "../hooks/useAsync";
import { contractsApi, referencesApi, vehiclesApi } from "../lib/services";
import type { Contract } from "../lib/types";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, KeyValue, Modal, PageHeader, SearchInput, Select, StatusBadge } from "../components/ui";
import { AddButton, FormError, RowActions, useDeleteFlow, useFormSubmit } from "../components/crud";
import { useToast } from "../components/toast";
import { dateFr, money } from "../lib/format";

interface Form {
  type: string; numeroContrat: string; dateDebut: string; dateFin: string; statutContrat: string; montantPrime: string; frequencePaiement: string;
  assureId: string; compagnieId: string; vehiculeIds: string[]; garanties: Record<string, string>; clauseIds: string[];
}
const today = new Date().toISOString().slice(0, 10);
const nextYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
const EMPTY: Form = { type: "AssuranceTousRisques", numeroContrat: "", dateDebut: today, dateFin: nextYear, statutContrat: "Actif", montantPrime: "", frequencePaiement: "Annuelle", assureId: "", compagnieId: "", vehiculeIds: [], garanties: {}, clauseIds: [] };

export default function ContractsPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [type, setType] = useState("");
  const dq = useDebounce(q);
  const { data, loading, error, reload } = useAsync(() => contractsApi.list({ q: dq, statut, type }), [dq, statut, type]);
  const refs = useAsync(() => referencesApi.get(), []);
  const vehicles = useAsync(() => vehiclesApi.list(), []);
  const [editing, setEditing] = useState<Contract | "new" | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const del = useDeleteFlow<Contract>({ remove: contractsApi.remove, id: (r) => r.id, label: (r) => r.numeroContrat ?? r.id, onDone: reload, what: "le contrat" });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const required = refs.data?.enums.contractTypes.find((t) => t.id === form.type)?.required ?? [];

  const submit = useFormSubmit<Form>({
    submit: async (f) => {
      if (editing === "new") {
        const r = await contractsApi.create({
          ...(f.numeroContrat ? { numeroContrat: f.numeroContrat } : {}), type: f.type, dateDebut: f.dateDebut, dateFin: f.dateFin, statutContrat: f.statutContrat,
          prime: { montantPrime: Number(f.montantPrime), frequencePaiement: f.frequencePaiement }, assureId: f.assureId, ...(f.compagnieId ? { compagnieId: f.compagnieId } : {}),
          vehiculeIds: f.vehiculeIds, clauseIds: f.clauseIds,
          garanties: Object.entries(f.garanties).map(([type, p]) => ({ type, ...(p ? { plafondGarantie: Number(p) } : {}) })),
        });
        if (r.autoAddedGuarantees?.length) toast.info("Garanties exigées par l'ontologie ajoutées", r.autoAddedGuarantees.join(", "));
        return r;
      }
      const c = editing as Contract;
      return contractsApi.update(c.id, {
        numeroContrat: f.numeroContrat, type: f.type, dateDebut: f.dateDebut, dateFin: f.dateFin, statutContrat: f.statutContrat,
        prime: { montantPrime: Number(f.montantPrime), frequencePaiement: f.frequencePaiement }, assureId: f.assureId, compagnieId: f.compagnieId,
        vehiculeIds: f.vehiculeIds, clauseIds: f.clauseIds,
      });
    },
    onSuccess: () => { setEditing(null); reload(); },
    success: editing === "new" ? "Contrat créé dans le graphe RDF" : "Contrat modifié",
  });

  const open = (row: Contract | "new") => {
    submit.reset();
    setForm(row === "new" ? { ...EMPTY, compagnieId: refs.data?.compagnies[0]?.id ?? "" } : {
      type: row.type, numeroContrat: row.numeroContrat ?? "", dateDebut: row.dateDebut ?? "", dateFin: row.dateFin ?? "", statutContrat: row.statutContrat ?? "Actif",
      montantPrime: String(row.prime?.montantPrime ?? ""), frequencePaiement: row.prime?.frequencePaiement ?? "Annuelle", assureId: row.assure?.id ?? "",
      compagnieId: row.compagnie?.id ?? "", vehiculeIds: row.vehicules.map((v) => v!.id), garanties: {}, clauseIds: row.clauses.map((c) => c.id),
    });
    setEditing(row);
  };
  const toggle = (key: "vehiculeIds" | "clauseIds", id: string) => set(key, form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id]);
  const toggleGuarantee = (id: string, plafond: number) => {
    const g = { ...form.garanties };
    if (id in g) delete g[id]; else g[id] = String(plafond);
    set("garanties", g);
  };

  return (
    <>
      <PageHeader title="Contrats d'assurance" subtitle="ContratAssurance : garanties, véhicules couverts, compagnie, dates et primes" icon={<FileText className="h-6 w-6" />} actions={<AddButton onClick={() => open("new")}>Créer un contrat</AddButton>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ} placeholder="N° de contrat, assuré, véhicule…" />
          <Select value={statut} onChange={(e) => setStatut(e.target.value)} className="!w-auto" aria-label="Statut">
            <option value="">Tous statuts</option><option value="Actif">Actif</option><option value="Expire">Expiré</option><option value="Resilie">Résilié</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-auto" aria-label="Type de contrat">
            <option value="">Tous types</option>
            {refs.data?.enums.contractTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <span className="text-sm text-muted">{data?.total ?? 0} résultat(s)</span>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable loading={loading && !data} rows={data?.items ?? []} rowKey={(r) => r.id} onRowClick={setViewing}
            empty={<EmptyState title="Aucun contrat" text="Créez un contrat ou modifiez les filtres." />}
            columns={[
              { key: "n", header: "Contrat", render: (r) => <div><p className="font-medium">{r.numeroContrat}</p><p className="text-xs text-muted">{r.typeLabel}</p></div> },
              { key: "a", header: "Assuré", render: (r) => r.assure?.label ?? "—" },
              { key: "v", header: "Véhicules couverts", render: (r) => r.vehicules.map((v) => v?.label).join(", "), hideOnMobile: true },
              { key: "g", header: "Garanties", render: (r) => <div className="flex max-w-xs flex-wrap gap-1">{r.garanties.map((g) => <Badge key={g.id} tone="blue">{g.typeLabel}</Badge>)}</div>, hideOnMobile: true },
              { key: "c", header: "Compagnie", render: (r) => r.compagnie?.label ?? "—", hideOnMobile: true },
              { key: "d", header: "Période", render: (r) => <span className="whitespace-nowrap text-xs">{dateFr(r.dateDebut)} → {dateFr(r.dateFin)}</span> },
              { key: "p", header: "Prime", render: (r) => <span className="tabular whitespace-nowrap">{money(r.prime?.montantPrime)} <span className="text-xs text-muted">{r.prime?.frequencePaiement}</span></span> },
              { key: "s", header: "Statut", render: (r) => <StatusBadge status={r.statutContrat} /> },
            ]}
            actions={(r) => <RowActions onView={() => setViewing(r)} onEdit={() => open(r)} onDelete={() => del.ask(r)} />}
          />
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} size="lg" title={editing === "new" ? "Nouveau contrat" : `Modifier ${(editing as Contract | null)?.numeroContrat ?? ""}`}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button><Button loading={submit.saving} onClick={() => submit.run(form)}>Enregistrer</Button></>}>
        <FormError message={submit.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type de contrat" required error={submit.errors.type}>{(id) => <Select id={id} value={form.type} onChange={(e) => set("type", e.target.value)}>{refs.data?.enums.contractTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>}</Field>
          <Field label="N° de contrat" error={submit.errors.numeroContrat} hint={editing === "new" ? "Laisser vide pour une numérotation automatique" : undefined}>{(id) => <Input id={id} value={form.numeroContrat} placeholder="C-005" onChange={(e) => set("numeroContrat", e.target.value)} />}</Field>
          <Field label="Date de début" required error={submit.errors.dateDebut}>{(id) => <Input id={id} type="date" value={form.dateDebut} onChange={(e) => set("dateDebut", e.target.value)} />}</Field>
          <Field label="Date de fin" required error={submit.errors.dateFin}>{(id) => <Input id={id} type="date" value={form.dateFin} onChange={(e) => set("dateFin", e.target.value)} />}</Field>
          <Field label="Prime" required error={submit.errors["prime.montantPrime"]}>{(id) => <Input id={id} type="number" min={0} value={form.montantPrime} onChange={(e) => set("montantPrime", e.target.value)} />}</Field>
          <Field label="Fréquence de paiement">{(id) => <Select id={id} value={form.frequencePaiement} onChange={(e) => set("frequencePaiement", e.target.value)}>{refs.data?.enums.frequencies.map((f) => <option key={f}>{f}</option>)}</Select>}</Field>
          <Field label="Assuré (possede)" required error={submit.errors.assureId}>{(id) => <Select id={id} value={form.assureId} onChange={(e) => set("assureId", e.target.value)}><option value="">— choisir —</option>{refs.data?.assures.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>}</Field>
          <Field label="Compagnie d'assurance (propose)" error={submit.errors.compagnieId}>{(id) => <Select id={id} value={form.compagnieId} onChange={(e) => set("compagnieId", e.target.value)}>{refs.data?.compagnies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
          <Field label="Statut" error={submit.errors.statutContrat}>{(id) => <Select id={id} value={form.statutContrat} onChange={(e) => set("statutContrat", e.target.value)}>{refs.data?.enums.contractStatus.map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
          <div className="sm:col-span-2">
            <p className="mb-1 text-xs font-medium">Véhicules couverts (couvre) <span className="text-red-500">*</span> — au moins un</p>
            <div className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
              {vehicles.data?.items.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={form.vehiculeIds.includes(v.id)} onChange={() => toggle("vehiculeIds", v.id)} />{v.label}</label>
              ))}
            </div>
            {(submit.errors.vehiculeIds) && <p className="mt-1 text-xs text-red-600">{submit.errors.vehiculeIds}</p>}
          </div>
          {editing === "new" && (
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-medium">Garanties (contient)</p>
              <div className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
                {refs.data?.enums.guaranteeTypes.map((g) => {
                  const isReq = required.includes(g.id);
                  const on = isReq || g.id in form.garanties;
                  return (
                    <div key={g.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={on} disabled={isReq} onChange={() => toggleGuarantee(g.id, g.plafond)} aria-label={g.label} />
                      <span className="flex-1">{g.label}{isReq && <Badge tone="amber" className="ml-1">exigée</Badge>}</span>
                      {on && !isReq && <Input type="number" className="!w-28 !py-1" value={form.garanties[g.id] ?? ""} onChange={(e) => set("garanties", { ...form.garanties, [g.id]: e.target.value })} aria-label={`Plafond ${g.label}`} />}
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Les garanties « exigées » découlent des axiomes OWL du type de contrat (restrictions someValuesFrom) ; elles sont ajoutées automatiquement.</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <p className="mb-1 text-xs font-medium">Clauses (aPourClause)</p>
            <div className="grid gap-2 rounded-lg border border-line p-3">
              {refs.data?.clauses.map((c) => (
                <label key={c.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={form.clauseIds.includes(c.id)} onChange={() => toggle("clauseIds", c.id)} /><span>{c.texte}</span></label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} size="lg" title={`Contrat ${viewing?.numeroContrat ?? ""}`} footer={viewing && <Button variant="secondary" onClick={() => { const r = viewing; setViewing(null); open(r); }}>Modifier</Button>}>
        {viewing && (
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <KeyValue label="Type (classe OWL)">{viewing.type}</KeyValue>
              <KeyValue label="Statut"><StatusBadge status={viewing.statutContrat} /></KeyValue>
              <KeyValue label="Compagnie">{viewing.compagnie?.label ?? "—"}</KeyValue>
              <KeyValue label="Assuré">{viewing.assure?.label ?? "—"}</KeyValue>
              <KeyValue label="Début">{dateFr(viewing.dateDebut)}</KeyValue>
              <KeyValue label="Fin">{dateFr(viewing.dateFin)}</KeyValue>
              <KeyValue label="Prime">{money(viewing.prime?.montantPrime)} — {viewing.prime?.frequencePaiement}</KeyValue>
              <KeyValue label="Sinistres rattachés">{viewing.sinistres.map((s) => s.numero).join(", ") || "—"}</KeyValue>
              <KeyValue label="Documents">{viewing.documents.map((d) => `${d.id} (${dateFr(d.date)})`).join(", ") || "—"}</KeyValue>
            </dl>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Véhicules couverts</h4>
              <div className="flex flex-wrap gap-2">{viewing.vehicules.map((v) => <Badge key={v!.id} tone="violet">{v!.label}</Badge>)}</div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Garanties</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {viewing.garanties.map((g) => <div key={g.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"><span>{g.typeLabel}</span><span className="tabular text-muted">plafond {money(g.plafondGarantie)}</span></div>)}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Clauses</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{viewing.clauses.length ? viewing.clauses.map((c) => <li key={c.id}>{c.texte}</li>) : <li>Aucune clause</li>}</ul>
            </div>
          </div>
        )}
      </Modal>
      {del.dialog}
    </>
  );
}
