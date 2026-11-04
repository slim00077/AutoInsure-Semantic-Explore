import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Inbox, Loader2, Search, X } from "lucide-react";
import { cn, statusLabel } from "../lib/format";

// ------------------------------------------------------------------ boutons
type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 shadow-sm shadow-navy-900/20",
  secondary: "bg-white text-navy-900 border border-line hover:bg-brand-50",
  ghost: "text-navy-900 hover:bg-brand-100/60",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
export function Button({
  variant = "primary", size = "md", loading, icon, children, className, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} aria-label={label} title={label} className={cn("focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-brand-100 hover:text-navy-900", className)}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ cartes & mise en page
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("rounded-2xl border border-line bg-white shadow-sm shadow-navy-900/5", className)}>
      {children}
    </div>
  );
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon && <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white shadow-md shadow-navy-900/25">{icon}</div>}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ badges
const BADGE: Record<string, string> = {
  blue: "bg-brand-100 text-navy-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  gray: "bg-slate-100 text-slate-700",
  violet: "bg-violet-100 text-violet-800",
};
export function Badge({ tone = "blue", children, className }: { tone?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", BADGE[tone], className)}>{children}</span>;
}
const STATUS_TONE: Record<string, keyof typeof BADGE> = {
  Actif: "green", Acceptee: "green", Indemnise: "green", Expire: "gray", Clos: "gray", Resilie: "red", Refusee: "red", Refuse: "red",
  EnCours: "amber", EnExpertise: "violet", Declare: "blue", Legere: "green", Moyenne: "amber", Grave: "red",
};
export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted">—</span>;
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{statusLabel(status)}</Badge>;
}

// ------------------------------------------------------------------ états
export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> {label}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-brand-100/70", className)} />;
}
export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-navy-800">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="max-w-md text-sm text-ink">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Réessayer</Button>}
    </div>
  );
}

// ------------------------------------------------------------------ modale
export function Modal({
  open, onClose, title, children, footer, size = "md",
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const width = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" }[size];
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="fixed inset-0 bg-navy-950/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={cn("relative z-10 my-auto w-full rounded-2xl bg-white shadow-2xl", width)}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24 }}
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <IconButton label="Fermer" onClick={onClose}><X className="h-5 w-5" /></IconButton>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-brand-50/50 px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open, title, message, confirmLabel = "Supprimer", loading, onConfirm, onClose,
}: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ formulaires
const fieldCls = "focus-ring w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400 disabled:bg-slate-50";
export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode; required?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(fieldCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cn(fieldCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(fieldCls, p.className)} />;

export function SearchInput({ value, onChange, placeholder = "Rechercher…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative min-w-[14rem] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cn(fieldCls, "pl-9")} />
    </div>
  );
}

// ------------------------------------------------------------------ tableau
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}
export function DataTable<T>({
  columns, rows, rowKey, onRowClick, loading, empty, actions,
}: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; loading?: boolean; empty?: ReactNode; actions?: (r: T) => ReactNode }) {
  if (loading) return <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (!rows.length) return <>{empty ?? <EmptyState title="Aucun résultat" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-brand-50/60 text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th key={c.key} className={cn("whitespace-nowrap px-4 py-3 font-semibold", c.hideOnMobile && "hidden md:table-cell", c.className)}>{c.header}</th>
            ))}
            {actions && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={() => onRowClick?.(r)} className={cn("border-b border-line/70 last:border-0 hover:bg-brand-50/50", onRowClick && "cursor-pointer")}>
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 align-middle", c.hideOnMobile && "hidden md:table-cell", c.className)}>{c.render(r)}</td>
              ))}
              {actions && <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatCard({ label, value, icon, hint, tone = "blue" }: { label: string; value: ReactNode; icon: ReactNode; hint?: string; tone?: "blue" | "navy" | "teal" | "amber" }) {
  const tones = { blue: "bg-brand-100 text-navy-800", navy: "bg-navy-900 text-white", teal: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800" };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted">{label}</p>
          <p className="tabular text-2xl font-bold leading-tight text-ink">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-brand-100/60 p-1" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn("focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", value === t.id ? "bg-white text-navy-900 shadow-sm" : "text-muted hover:text-navy-900")}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Lie les erreurs de validation API (champ → message) au formulaire. */
export function fieldErrors(e: unknown): Record<string, string> {
  const d = (e as { details?: { path: string; message: string }[] })?.details;
  const out: Record<string, string> = {};
  d?.forEach((x) => (out[x.path] = x.message));
  return out;
}
