import { useState } from "react";
import { Plus, Siren, Trash2 } from "lucide-react";
import { useAsync, useDebounce } from "../hooks/useAsync";
import { claimsApi, contractsApi, referencesApi, vehiclesApi } from "../lib/services";
import type { Claim, Damage } from "../lib/types";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, IconButton, Input, KeyValue, Modal, PageHeader, SearchInput, Select, StatusBadge, Textarea } from "../components/ui";
import { AddButton, FormError, RowActions, useDeleteFlow, useFormSubmit } from "../components/crud";
import { useToast } from "../components/toast";
import { errorMessage } from "../lib/api";
import { dateFr, money } from "../lib/format";

interface DamageForm { type: string; description: string; gravite: string; coutEstime: string }
interface Form {
  type: string; dateSinistre: string; lieuSinistre: string; descriptionSinistre: string; statutSinistre: string;
  assureId: string; contratId: string; vehiculeId: string; conducteurId: string; garantieIds: string[]; dommages: DamageForm[];
}
const blankDamage = (): DamageForm => ({ type: "DommageMateriel", description: "", gravite: "Moyenne", coutEstime: "" });
const EMPTY: Form = { type: "AccidentCirculation", dateSinistre: new Date().toISOString().slice(0, 10), lieuSinistre: "", descriptionSinistre: "", statutSinistre: "Declare", assureId: "", contratId: "", vehiculeId: "", conducteurId: "", garantieIds: [], dommages: [blankDamage()] };

export default function ClaimsPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [statut, setStatut] = useState("");
  const dq = useDebounce(q);
  const { data, loading, error, reload } = useAsync(() => claimsApi.list({ q: dq, type, statut }), [dq, type, statut]);
  const refs = useAsync(() => referencesApi.get(), []);
  const contracts = useAsync(() => contractsApi.list(), []);
  const vehicles = useAsync(() => vehiclesApi.list(), []);
  const [editing, setEditing] = useState<Claim | "new" | null>(null);
  const [viewing, setViewing] = useState<Claim | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [dmg, setDmg] = useState<{ claim: Claim; form: DamageForm } | null>(null);
  const del = useDeleteFlow<Claim>({ remove: claimsApi.remove, id: (r) => r.id, label: (r) => r.numeroSinistre ?? r.id, onDone: reload, what: "le sinistre" });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // contrats de l'assuré choisi ; véhicules couverts par le contrat choisi
  const myContracts = contracts.data?.items.filter((c) => !form.assureId || c.assure?.id === form.assureId) ?? [];
  const chosen = contracts.data?.items.find((c) => c.id === form.contratId);

  const refreshViewing = async (id: string) => { setViewing(await claimsApi.get(id)); reload(); };

  const submit = useFormSubmit<Form>({
    submit: (f) => {
      const core = {
        type: f.type, dateSinistre: f.dateSinistre, lieuSinistre: f.lieuSinistre, descriptionSinistre: f.descriptionSinistre, statutSinistre: f.statutSinistre,
        assureId: f.assureId, contratId: f.contratId, vehiculeId: f.vehiculeId, ...(f.conducteurId ? { conducteurId: f.conducteurId } : {}), garantieIds: f.garantieIds,
      };
      if (editing === "new") return claimsApi.create({ ...core, dommages: f.dommages.map((d) => ({ ...d, coutEstime: Number(d.coutEstime) })) });
      return claimsApi.update((editing as Claim).id, core);
    },
    onSuccess: () => { setEditing(null); reload(); },
    success: editing === "new" ? "Sinistre déclaré dans le graphe RDF" : "Sinistre modifié",
  });

  const open = (row: Claim | "new") => {
    submit.reset();
    setForm(row === "new" ? EMPTY : {
      type: row.type, dateSinistre: row.dateSinistre ?? "", lieuSinistre: row.lieuSinistre ?? "", descriptionSinistre: row.descriptionSinistre ?? "", statutSinistre: row.statutSinistre,
      assureId: row.assure?.id ?? "", contratId: row.contrat?.id ?? "", vehiculeId: row.vehicule?.id ?? "", conducteurId: row.conducteur?.id ?? "", garantieIds: row.garanties.map((g) => g.id), dommages: [],
    });
    setEditing(row);
  };

  const saveDamage = async () => {
    if (!dmg) return;
    try {
      await claimsApi.addDamage(dmg.claim.id, { ...dmg.form, coutEstime: Number(dmg.form.coutEstime) });
      toast.success("Dommage ajouté au sinistre");
      const id = dmg.claim.id;
      setDmg(null);
      await refreshViewing(id);
    } catch (e) { toast.error("Ajout impossible", errorMessage(e)); }
  };
  const removeDamage = async (c: Claim, d: Damage) => {
    try { await claimsApi.removeDamage(d.id); toast.success("Dommage supprimé"); await refreshViewing(c.id); }
    catch (e) { toast.error("Suppression impossible", errorMessage(e)); }
  };

  return (
    <>
      <PageHeader title="Sinistres" subtitle="Déclaration, dommages, statut — relié au véhicule, à l'assuré et au contrat" icon={<Siren className="h-6 w-6" />} actions={<AddButton onClick={() => open("new")}>Déclarer un sinistre</AddButton>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ} placeholder="N° de sinistre, lieu, description, assuré…" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-auto" aria-label="Type de sinistre">
            <option value="">Tous types</option>{refs.data?.enums.claimTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <Select value={statut} onChange={(e) => setStatut(e.target.value)} className="!w-auto" aria-label="Statut">
            <option value="">Tous statuts</option>{refs.data?.enums.claimStatus.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <span className="text-sm text-muted">{data?.total ?? 0} résultat(s)</span>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable loading={loading && !data} rows={data?.items ?? []} rowKey={(r) => r.id} onRowClick={setViewing}
            empty={<EmptyState title="Aucun sinistre" text="Déclarez un sinistre ou modifiez les filtres." />}
            columns={[
              { key: "n", header: "Sinistre", render: (r) => <div><p className="font-medium">{r.numeroSinistre}</p><p className="text-xs text-muted">{r.id}</p></div> },
              { key: "t", header: "Type", render: (r) => <Badge tone="amber">{r.typeLabel}</Badge> },
              { key: "d", header: "Date", render: (r) => dateFr(r.dateSinistre) },
              { key: "l", header: "Lieu", render: (r) => r.lieuSinistre, hideOnMobile: true },
              { key: "v", header: "Véhicule", render: (r) => r.vehicule?.label, hideOnMobile: true },
              { key: "a", header: "Assuré", render: (r) => r.assure?.label ?? "—" },
              { key: "dm", header: "Dommages", render: (r) => <span className="tabular">{r.dommages.length} · {money(r.dommages.reduce((s, x) => s + (x.coutEstime ?? 0), 0))}</span>, hideOnMobile: true },
              { key: "s", header: "Statut", render: (r) => <StatusBadge status={r.statutSinistre} /> },
            ]}
            actions={(r) => <RowActions onView={() => setViewing(r)} onEdit={() => open(r)} onDelete={() => del.ask(r)} />}
          />
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} size="lg" title={editing === "new" ? "Déclarer un sinistre" : `Modifier ${(editing as Claim | null)?.numeroSinistre ?? ""}`}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button><Button loading={submit.saving} onClick={() => submit.run(form)}>Enregistrer</Button></>}>
        <FormError message={submit.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type de sinistre" required error={submit.errors.type}>{(id) => <Select id={id} value={form.type} onChange={(e) => set("type", e.target.value)}>{refs.data?.enums.claimTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>}</Field>
          <Field label="Statut" error={submit.errors.statutSinistre}>{(id) => <Select id={id} value={form.statutSinistre} onChange={(e) => set("statutSinistre", e.target.value)}>{refs.data?.enums.claimStatus.map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
          <Field label="Date du sinistre" required error={submit.errors.dateSinistre}>{(id) => <Input id={id} type="date" value={form.dateSinistre} onChange={(e) => set("dateSinistre", e.target.value)} />}</Field>
          <Field label="Lieu" required error={submit.errors.lieuSinistre}>{(id) => <Input id={id} value={form.lieuSinistre} onChange={(e) => set("lieuSinistre", e.target.value)} />}</Field>
          <Field label="Assuré (declare)" required error={submit.errors.assureId}>{(id) => <Select id={id} value={form.assureId} onChange={(e) => setForm({ ...form, assureId: e.target.value, contratId: "", vehiculeId: "", garantieIds: [] })}><option value="">— choisir —</option>{refs.data?.assures.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>}</Field>
          <Field label="Contrat (rattacheAContrat)" required error={submit.errors.contratId}>{(id) => <Select id={id} value={form.contratId} onChange={(e) => setForm({ ...form, contratId: e.target.value, vehiculeId: "", garantieIds: [] })}><option value="">— choisir —</option>{myContracts.map((c) => <option key={c.id} value={c.id}>{c.numeroContrat} — {c.typeLabel}</option>)}</Select>}</Field>
          <Field label="Véhicule concerné (concerne)" required error={submit.errors.vehiculeId}>
            {(id) => <Select id={id} value={form.vehiculeId} onChange={(e) => set("vehiculeId", e.target.value)}><option value="">— choisir —</option>{(chosen?.vehicules ?? vehicles.data?.items ?? []).map((v) => v && <option key={v.id} value={v.id}>{v.label}</option>)}</Select>}
          </Field>
          <Field label="Conducteur au volant (implique)" error={submit.errors.conducteurId}>{(id) => <Select id={id} value={form.conducteurId} onChange={(e) => set("conducteurId", e.target.value)}><option value="">— non renseigné —</option>{refs.data?.conducteurs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
          <div className="sm:col-span-2"><Field label="Description" required error={submit.errors.descriptionSinistre}>{(id) => <Textarea id={id} value={form.descriptionSinistre} onChange={(e) => set("descriptionSinistre", e.target.value)} />}</Field></div>
          {chosen && (
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-medium">Garanties mobilisées (mobiliseGarantie)</p>
              <div className="flex flex-wrap gap-3 rounded-lg border border-line p-3">
                {chosen.garanties.map((g) => <label key={g.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={form.garantieIds.includes(g.id)} onChange={() => set("garantieIds", form.garantieIds.includes(g.id) ? form.garantieIds.filter((x) => x !== g.id) : [...form.garantieIds, g.id])} />{g.typeLabel}</label>)}
              </div>
            </div>
          )}
          {editing === "new" && (
            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Dommages provoqués (provoque) — au moins un <span className="text-red-500">*</span></p>
                <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set("dommages", [...form.dommages, blankDamage()])}>Ajouter un dommage</Button>
              </div>
              {form.dommages.map((d, i) => (
                <div key={i} className="grid gap-3 rounded-xl border border-line bg-brand-50/40 p-3 sm:grid-cols-4">
                  <Select aria-label="Type de dommage" value={d.type} onChange={(e) => set("dommages", form.dommages.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>{refs.data?.enums.damageTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
                  <Select aria-label="Gravité" value={d.gravite} onChange={(e) => set("dommages", form.dommages.map((x, j) => j === i ? { ...x, gravite: e.target.value } : x))}>{refs.data?.enums.severities.map((s) => <option key={s}>{s}</option>)}</Select>
                  <Input aria-label="Coût estimé" type="number" min={0} placeholder="Coût estimé" value={d.coutEstime} onChange={(e) => set("dommages", form.dommages.map((x, j) => j === i ? { ...x, coutEstime: e.target.value } : x))} />
                  <div className="flex gap-2">
                    <Input aria-label="Description du dommage" placeholder="Description" value={d.description} onChange={(e) => set("dommages", form.dommages.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                    {form.dommages.length > 1 && <IconButton label="Retirer ce dommage" onClick={() => set("dommages", form.dommages.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconButton>}
                  </div>
                </div>
              ))}
              {submit.errors.dommages && <p className="text-xs text-red-600">{submit.errors.dommages}</p>}
              {Object.entries(submit.errors).filter(([k]) => k.startsWith("dommages.")).map(([k, m]) => <p key={k} className="text-xs text-red-600">{k} : {m}</p>)}
            </div>
          )}
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} size="lg" title={`Sinistre ${viewing?.numeroSinistre ?? ""}`} footer={viewing && <Button variant="secondary" onClick={() => { const r = viewing; setViewing(null); open(r); }}>Modifier</Button>}>
        {viewing && (
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <KeyValue label="Type (classe OWL)">{viewing.type}</KeyValue>
              <KeyValue label="Statut"><StatusBadge status={viewing.statutSinistre} /></KeyValue>
              <KeyValue label="Date / lieu">{dateFr(viewing.dateSinistre)} — {viewing.lieuSinistre}</KeyValue>
              <KeyValue label="Assuré">{viewing.assure?.label ?? "—"}</KeyValue>
              <KeyValue label="Véhicule">{viewing.vehicule?.label ?? "—"}</KeyValue>
              <KeyValue label="Contrat">{viewing.contrat?.numero ?? "—"}</KeyValue>
              <KeyValue label="Conducteur">{viewing.conducteur?.label ?? "—"}</KeyValue>
              <KeyValue label="Déclaration">{viewing.declaration ? `${viewing.declaration.id} (${dateFr(viewing.declaration.date)})` : "—"}</KeyValue>
              <KeyValue label="Garanties mobilisées">{viewing.garanties.map((g) => g.type?.replace("Garantie", "")).join(", ") || "—"}</KeyValue>
            </dl>
            <p className="rounded-lg bg-brand-50 p-3 text-sm text-muted">{viewing.descriptionSinistre}</p>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Dommages ({viewing.dommages.length})</h4>
                <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDmg({ claim: viewing, form: blankDamage() })}>Ajouter un dommage</Button>
              </div>
              <div className="space-y-2">
                {viewing.dommages.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{d.description} <Badge tone="violet" className="ml-1">{d.typeLabel}</Badge> <StatusBadge status={d.gravite} /></p>
                      <p className="text-xs text-muted">Victime : {d.victime?.label ?? "—"} · coût estimé {money(d.coutEstime)} · {d.indemnisation ? `indemnisation ${money(d.indemnisation.montant)} (${d.indemnisation.statut})` : "pas d'indemnisation"}</p>
                    </div>
                    <IconButton label="Supprimer le dommage" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => removeDamage(viewing, d)}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Expertises</h4>
              {viewing.expertises.length ? viewing.expertises.map((e) => <p key={e.id} className="text-sm">{e.id} — {e.expert?.label ?? "?"} le {dateFr(e.date)}</p>) : <p className="text-sm text-muted">Aucune expertise (page Expertises).</p>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!dmg} onClose={() => setDmg(null)} size="sm" title="Ajouter un dommage" footer={<><Button variant="secondary" onClick={() => setDmg(null)}>Annuler</Button><Button onClick={saveDamage}>Ajouter</Button></>}>
        {dmg && (
          <div className="space-y-3">
            <Field label="Type">{(id) => <Select id={id} value={dmg.form.type} onChange={(e) => setDmg({ ...dmg, form: { ...dmg.form, type: e.target.value } })}>{refs.data?.enums.damageTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>}</Field>
            <Field label="Description">{(id) => <Input id={id} value={dmg.form.description} onChange={(e) => setDmg({ ...dmg, form: { ...dmg.form, description: e.target.value } })} />}</Field>
            <Field label="Gravité">{(id) => <Select id={id} value={dmg.form.gravite} onChange={(e) => setDmg({ ...dmg, form: { ...dmg.form, gravite: e.target.value } })}>{refs.data?.enums.severities.map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
            <Field label="Coût estimé">{(id) => <Input id={id} type="number" min={0} value={dmg.form.coutEstime} onChange={(e) => setDmg({ ...dmg, form: { ...dmg.form, coutEstime: e.target.value } })} />}</Field>
          </div>
        )}
      </Modal>
      {del.dialog}
    </>
  );
}
