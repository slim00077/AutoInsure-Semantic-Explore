import { useState } from "react";
import { ClipboardCheck, FileText, UserCog } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { claimsApi, expertisesApi, expertsApi } from "../lib/services";
import type { Expert, Expertise } from "../lib/types";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, KeyValue, Modal, PageHeader, StatusBadge, Tabs, Textarea, Select } from "../components/ui";
import { AddButton, FormError, RowActions, useDeleteFlow, useFormSubmit } from "../components/crud";
import { dateFr, money } from "../lib/format";

interface Form { sinistreId: string; expertId: string; dateExpertise: string; conclusion: string; dommageIds: string[]; rapport: string }
const today = new Date().toISOString().slice(0, 10);
const EMPTY: Form = { sinistreId: "", expertId: "", dateExpertise: today, conclusion: "", dommageIds: [], rapport: "" };
interface ExpertForm { prenom: string; nom: string; specialite: string }

export default function ExpertisesPage() {
  const [tab, setTab] = useState<"expertises" | "experts">("expertises");
  const exps = useAsync(() => expertisesApi.list(), []);
  const experts = useAsync(() => expertsApi.list(), []);
  const claims = useAsync(() => claimsApi.list(), []);
  const [editing, setEditing] = useState<Expertise | "new" | null>(null);
  const [viewing, setViewing] = useState<Expertise | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [expertEdit, setExpertEdit] = useState<Expert | "new" | null>(null);
  const [expertForm, setExpertForm] = useState<ExpertForm>({ prenom: "", nom: "", specialite: "" });
  const reloadAll = () => { exps.reload(); experts.reload(); claims.reload(); };
  const del = useDeleteFlow<Expertise>({ remove: expertisesApi.remove, id: (r) => r.id, label: (r) => `${r.id} (${r.sinistre?.numero})`, onDone: reloadAll, what: "l'expertise" });
  const delExpert = useDeleteFlow<Expert>({ remove: expertsApi.remove, id: (r) => r.id, label: (r) => r.label, onDone: reloadAll, what: "l'expert" });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const claim = claims.data?.items.find((c) => c.id === form.sinistreId);

  const submit = useFormSubmit<Form>({
    submit: (f) => {
      const rapport = f.rapport.trim() ? { contenuDocument: f.rapport } : undefined;
      return editing === "new"
        ? expertisesApi.create({ sinistreId: f.sinistreId, expertId: f.expertId, dateExpertise: f.dateExpertise, conclusion: f.conclusion, ...(f.dommageIds.length ? { dommageIds: f.dommageIds } : {}), ...(rapport ? { rapport } : {}) })
        : expertisesApi.update((editing as Expertise).id, { expertId: f.expertId, dateExpertise: f.dateExpertise, conclusion: f.conclusion, ...(f.dommageIds.length ? { dommageIds: f.dommageIds } : {}), ...(rapport ? { rapport } : {}) });
    },
    onSuccess: () => { setEditing(null); reloadAll(); },
    success: editing === "new" ? "Expertise créée et reliée au sinistre" : "Expertise modifiée",
  });
  const expertSubmit = useFormSubmit<ExpertForm>({
    submit: (f) => { const b = { prenom: f.prenom, nom: f.nom, specialite: f.specialite || null }; return expertEdit === "new" ? expertsApi.create(b) : expertsApi.update((expertEdit as Expert).id, b); },
    onSuccess: () => { setExpertEdit(null); reloadAll(); }, success: expertEdit === "new" ? "Expert créé" : "Expert modifié",
  });

  const open = (row: Expertise | "new") => {
    submit.reset();
    setForm(row === "new" ? EMPTY : { sinistreId: row.sinistre?.id ?? "", expertId: row.expert?.id ?? "", dateExpertise: row.dateExpertise ?? today, conclusion: row.conclusion ?? "", dommageIds: row.dommages.map((d) => d.id), rapport: row.rapport?.contenuDocument ?? "" });
    setEditing(row);
  };

  return (
    <>
      <PageHeader title="Expertises" subtitle="Expert, rapport et dommages évalués, reliés au sinistre" icon={<ClipboardCheck className="h-6 w-6" />}
        actions={tab === "expertises" ? <AddButton onClick={() => open("new")}>Créer une expertise</AddButton> : <AddButton onClick={() => { expertSubmit.reset(); setExpertForm({ prenom: "", nom: "", specialite: "" }); setExpertEdit("new"); }}>Ajouter un expert</AddButton>} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ id: "expertises", label: "Expertises", icon: <ClipboardCheck className="h-4 w-4" /> }, { id: "experts", label: "Experts", icon: <UserCog className="h-4 w-4" /> }]} /></div>

      <Card>
        {tab === "expertises" ? (
          exps.error ? <ErrorState message={exps.error} onRetry={exps.reload} /> : (
            <DataTable loading={exps.loading && !exps.data} rows={exps.data?.items ?? []} rowKey={(r) => r.id} onRowClick={setViewing}
              empty={<EmptyState title="Aucune expertise" text="Créez une expertise pour un sinistre déclaré." />}
              columns={[
                { key: "id", header: "Expertise", render: (r) => <div><p className="font-medium">{r.id}</p><p className="text-xs text-muted">{dateFr(r.dateExpertise)}</p></div> },
                { key: "s", header: "Sinistre", render: (r) => r.sinistre?.numero ?? "—" },
                { key: "e", header: "Expert", render: (r) => <div><p>{r.expert?.label}</p><p className="text-xs text-muted">{r.expert?.specialite}</p></div> },
                { key: "d", header: "Dommages évalués", render: (r) => <span className="tabular">{r.dommages.length} · {money(r.dommages.reduce((s, d) => s + (d.coutEstime ?? 0), 0))}</span>, hideOnMobile: true },
                { key: "c", header: "Conclusion", render: (r) => <span className="line-clamp-2 max-w-sm text-muted">{r.conclusion}</span>, hideOnMobile: true },
                { key: "r", header: "Rapport", render: (r) => r.rapport ? <Badge tone="green"><FileText className="h-3 w-3" /> {r.rapport.id}</Badge> : <span className="text-muted">—</span> },
              ]}
              actions={(r) => <RowActions onView={() => setViewing(r)} onEdit={() => open(r)} onDelete={() => del.ask(r)} />}
            />
          )
        ) : (
          experts.error ? <ErrorState message={experts.error} onRetry={experts.reload} /> : (
            <DataTable loading={experts.loading && !experts.data} rows={experts.data?.items ?? []} rowKey={(r) => r.id}
              empty={<EmptyState title="Aucun expert" />}
              columns={[
                { key: "n", header: "Expert", render: (r) => <div><p className="font-medium">{r.label}</p><p className="text-xs text-muted">{r.id}</p></div> },
                { key: "s", header: "Spécialité", render: (r) => r.specialite ?? "—" },
                { key: "x", header: "Expertises réalisées", render: (r) => r.expertises.length },
              ]}
              actions={(r) => <RowActions onEdit={() => { expertSubmit.reset(); setExpertForm({ prenom: r.prenom ?? "", nom: r.nom ?? "", specialite: r.specialite ?? "" }); setExpertEdit(r); }} onDelete={() => delExpert.ask(r)} />}
            />
          )
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} size="lg" title={editing === "new" ? "Nouvelle expertise" : "Modifier l'expertise"}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button><Button loading={submit.saving} onClick={() => submit.run(form)}>Enregistrer</Button></>}>
        <FormError message={submit.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sinistre (faitObjetDe)" required error={submit.errors.sinistreId}>{(id) => <Select id={id} disabled={editing !== "new"} value={form.sinistreId} onChange={(e) => setForm({ ...form, sinistreId: e.target.value, dommageIds: [] })}><option value="">— choisir —</option>{claims.data?.items.map((c) => <option key={c.id} value={c.id}>{c.numeroSinistre} — {c.typeLabel} ({c.assure?.label})</option>)}</Select>}</Field>
          <Field label="Expert (realisePar)" required error={submit.errors.expertId}>{(id) => <Select id={id} value={form.expertId} onChange={(e) => set("expertId", e.target.value)}><option value="">— choisir —</option>{experts.data?.items.map((x) => <option key={x.id} value={x.id}>{x.label}{x.specialite ? ` — ${x.specialite}` : ""}</option>)}</Select>}</Field>
          <Field label="Date de l'expertise" error={submit.errors.dateExpertise}>{(id) => <Input id={id} type="date" value={form.dateExpertise} onChange={(e) => set("dateExpertise", e.target.value)} />}</Field>
          <div />
          {(claim || editing !== "new") && (
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-medium">Dommages évalués (evalue) — vide = tous</p>
              <div className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
                {(claim?.dommages ?? (editing && editing !== "new" ? editing.dommages : [])).map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={form.dommageIds.includes(d.id)} onChange={() => set("dommageIds", form.dommageIds.includes(d.id) ? form.dommageIds.filter((x) => x !== d.id) : [...form.dommageIds, d.id])} />{d.description} <span className="text-muted">({money(d.coutEstime)})</span></label>
                ))}
              </div>
            </div>
          )}
          <div className="sm:col-span-2"><Field label="Conclusion" required error={submit.errors.conclusion}>{(id) => <Textarea id={id} value={form.conclusion} onChange={(e) => set("conclusion", e.target.value)} />}</Field></div>
          <div className="sm:col-span-2"><Field label="Rapport d'expertise (produit)" hint="Crée un individu RapportExpertise relié à l'expertise" error={submit.errors["rapport.contenuDocument"]}>{(id) => <Textarea id={id} rows={4} value={form.rapport} onChange={(e) => set("rapport", e.target.value)} />}</Field></div>
        </div>
      </Modal>

      <Modal open={!!expertEdit} onClose={() => setExpertEdit(null)} size="sm" title={expertEdit === "new" ? "Nouvel expert" : "Modifier l'expert"}
        footer={<><Button variant="secondary" onClick={() => setExpertEdit(null)}>Annuler</Button><Button loading={expertSubmit.saving} onClick={() => expertSubmit.run(expertForm)}>Enregistrer</Button></>}>
        <FormError message={expertSubmit.formError} />
        <div className="space-y-3">
          <Field label="Prénom" required error={expertSubmit.errors.prenom}>{(id) => <Input id={id} value={expertForm.prenom} onChange={(e) => setExpertForm({ ...expertForm, prenom: e.target.value })} />}</Field>
          <Field label="Nom" required error={expertSubmit.errors.nom}>{(id) => <Input id={id} value={expertForm.nom} onChange={(e) => setExpertForm({ ...expertForm, nom: e.target.value })} />}</Field>
          <Field label="Spécialité" error={expertSubmit.errors.specialite}>{(id) => <Input id={id} value={expertForm.specialite} onChange={(e) => setExpertForm({ ...expertForm, specialite: e.target.value })} />}</Field>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} size="lg" title={`Expertise ${viewing?.id ?? ""}`} footer={viewing && <Button variant="secondary" onClick={() => { const r = viewing; setViewing(null); open(r); }}>Modifier</Button>}>
        {viewing && (
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <KeyValue label="Sinistre">{viewing.sinistre?.numero}</KeyValue>
              <KeyValue label="Expert">{viewing.expert?.label}</KeyValue>
              <KeyValue label="Date">{dateFr(viewing.dateExpertise)}</KeyValue>
            </dl>
            <div><h4 className="mb-1 text-sm font-semibold">Conclusion</h4><p className="rounded-lg bg-brand-50 p-3 text-sm text-muted">{viewing.conclusion}</p></div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Dommages évalués</h4>
              <div className="space-y-2">{viewing.dommages.map((d) => <div key={d.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"><span>{d.description} <Badge tone="violet">{d.typeLabel}</Badge></span><span className="flex items-center gap-2"><StatusBadge status={d.gravite} /><b className="tabular">{money(d.coutEstime)}</b></span></div>)}</div>
            </div>
            <div><h4 className="mb-1 text-sm font-semibold">Rapport</h4>{viewing.rapport ? <div className="rounded-lg border border-line p-3 text-sm"><p className="text-xs text-muted">{viewing.rapport.id} · {dateFr(viewing.rapport.dateDocument)}</p><p className="mt-1">{viewing.rapport.contenuDocument ?? "Aucun contenu"}</p></div> : <p className="text-sm text-muted">Aucun rapport.</p>}</div>
          </div>
        )}
      </Modal>
      {del.dialog}{delExpert.dialog}
    </>
  );
}
