import { useState, type ReactNode } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, IconButton, Button, fieldErrors } from "./ui";
import { useToast } from "./toast";
import { errorMessage } from "../lib/api";

/** Gère la confirmation + l'appel de suppression, avec toast de succès / d'erreur (409 intégrité incluse). */
export function useDeleteFlow<T>(opts: { remove: (id: string) => Promise<void>; id: (r: T) => string; label: (r: T) => string; onDone: () => void; what: string }) {
  const toast = useToast();
  const [target, setTarget] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const dialog = (
    <ConfirmDialog
      open={!!target}
      title={`Supprimer ${opts.what}`}
      message={target ? <>Vous allez supprimer <b>{opts.label(target)}</b> du graphe RDF. Cette action est définitive.</> : null}
      loading={loading}
      onClose={() => setTarget(null)}
      onConfirm={async () => {
        if (!target) return;
        setLoading(true);
        try {
          await opts.remove(opts.id(target));
          toast.success(`${opts.what} supprimé(e)`, opts.label(target));
          setTarget(null);
          opts.onDone();
        } catch (e) {
          toast.error("Suppression impossible", errorMessage(e));
          setTarget(null);
        } finally {
          setLoading(false);
        }
      }}
    />
  );
  return { ask: setTarget, dialog };
}

export function RowActions({ onView, onEdit, onDelete }: { onView?: () => void; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex justify-end gap-0.5">
      {onView && <IconButton label="Consulter" onClick={onView}><Eye className="h-4 w-4" /></IconButton>}
      {onEdit && <IconButton label="Modifier" onClick={onEdit}><Pencil className="h-4 w-4" /></IconButton>}
      {onDelete && <IconButton label="Supprimer" className="hover:!bg-red-50 hover:!text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>}
    </div>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <Button onClick={onClick} icon={<Plus className="h-4 w-4" />}>{children}</Button>;
}

/** État d'un formulaire de création/édition avec erreurs locales et erreurs de validation renvoyées par l'API. */
export function useFormSubmit<V>(opts: { submit: (v: V) => Promise<unknown>; onSuccess: () => void; success: string }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const run = async (v: V) => {
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await opts.submit(v);
      toast.success(opts.success);
      opts.onSuccess();
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? "Corrigez les champs signalés." : errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return { run, saving, errors, formError, reset: () => { setErrors({}); setFormError(null); } };
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200" role="alert">{message}</p>;
}
