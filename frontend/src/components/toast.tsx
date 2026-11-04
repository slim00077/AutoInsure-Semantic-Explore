import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

type Kind = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  text?: string;
}
interface Ctx {
  push: (kind: Kind, title: string, text?: string) => void;
  success: (title: string, text?: string) => void;
  error: (title: string, text?: string) => void;
  info: (title: string, text?: string) => void;
  warning: (title: string, text?: string) => void;
}
const ToastCtx = createContext<Ctx | null>(null);

const STYLE: Record<Kind, { icon: ReactNode; ring: string }> = {
  success: { icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />, ring: "border-emerald-200" },
  error: { icon: <XCircle className="h-5 w-5 text-red-600" />, ring: "border-red-200" },
  info: { icon: <Info className="h-5 w-5 text-brand-600" />, ring: "border-brand-200" },
  warning: { icon: <AlertTriangle className="h-5 w-5 text-amber-600" />, ring: "border-amber-200" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = (id: number) => setItems((l) => l.filter((t) => t.id !== id));
  const push = useCallback((kind: Kind, title: string, text?: string) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, kind, title, text }]);
    setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
  }, []);
  const api = useMemo<Ctx>(
    () => ({
      push,
      success: (t, x) => push("success", t, x),
      error: (t, x) => push("error", t, x),
      info: (t, x) => push("info", t, x),
      warning: (t, x) => push("warning", t, x),
    }),
    [push],
  );
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg ${STYLE[t.kind].ring}`}
              role="status"
            >
              <div className="mt-0.5">{STYLE[t.kind].icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.text && <p className="mt-0.5 break-words text-sm text-muted">{t.text}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} aria-label="Fermer" className="rounded p-1 text-muted hover:bg-brand-50">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast doit être utilisé dans <ToastProvider>");
  return c;
}
