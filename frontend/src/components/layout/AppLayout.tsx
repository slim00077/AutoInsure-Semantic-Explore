import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import {
  BrainCircuit, Car, ChevronRight, Code2, FileSearch, FileText, Gauge, Home, Menu, Network, Search, ShieldCheck, Siren, Users, Wallet, X, ClipboardCheck, Wifi, WifiOff,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../../lib/format";
import { http } from "../../lib/api";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Pilotage", items: [{ to: "/app", label: "Tableau de bord", icon: Gauge, end: true }] },
  {
    group: "Gestion",
    items: [
      { to: "/app/insured", label: "Assurés", icon: Users },
      { to: "/app/vehicles", label: "Véhicules", icon: Car },
      { to: "/app/contracts", label: "Contrats", icon: FileText },
      { to: "/app/guarantees", label: "Garanties", icon: ShieldCheck },
      { to: "/app/claims", label: "Sinistres", icon: Siren },
      { to: "/app/expertises", label: "Expertises", icon: ClipboardCheck },
      { to: "/app/indemnifications", label: "Indemnisations", icon: Wallet },
    ],
  },
  {
    group: "Web sémantique",
    items: [
      { to: "/app/ontology", label: "Ontology Explorer", icon: Network },
      { to: "/app/sparql", label: "SPARQL Explorer", icon: Code2 },
      { to: "/app/search", label: "Recherche NLP", icon: BrainCircuit },
    ],
  },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.to, i.label])));

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-navy-950 to-navy-900 text-white">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20 ring-1 ring-brand-400/40">
          <ShieldCheck className="h-6 w-6 text-brand-300" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold">AutoInsure</p>
          <p className="text-[11px] font-medium text-brand-300">Semantic Explorer</p>
        </div>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Navigation principale">
        {NAV.map((g) => (
          <div key={g.group} className="mt-4">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-300/70">{g.group}</p>
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "focus-ring group relative mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-white/12 text-white" : "text-brand-100/80 hover:bg-white/8 hover:text-white",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-active" className="absolute left-0 top-1.5 h-6 w-1 rounded-r bg-brand-400" />}
                    <it.icon className="h-[18px] w-[18px] shrink-0" />
                    {it.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2 text-xs text-brand-200/80 hover:text-white">
          <Home className="h-4 w-4" /> Page d'accueil
        </Link>
        <p className="mt-2 text-[11px] text-brand-300/60">Ontologie OWL · RDFLib · spaCy</p>
      </div>
    </div>
  );
}

function HealthDot() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () =>
      http.get("/health").then(() => alive && setOk(true)).catch(() => alive && setOk(false));
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <span
      className={cn("hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex", ok === false ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}
      title={ok === false ? "API ou service sémantique injoignable" : "API et triple store opérationnels"}
    >
      {ok === false ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
      {ok === null ? "Connexion…" : ok ? "Triple store connecté" : "Hors ligne"}
    </span>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const loc = useLocation();
  const title = TITLES[loc.pathname] ?? "AutoInsure";

  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl"><Sidebar onNavigate={() => setOpen(false)} /></aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button className="focus-ring rounded-lg p-2 text-navy-900 hover:bg-brand-100 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="hidden items-center gap-1.5 text-sm text-muted sm:flex">
            <span>AutoInsure</span><ChevronRight className="h-4 w-4" /><span className="font-semibold text-ink">{title}</span>
          </div>
          <form
            className="relative ml-auto max-w-md flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) nav(`/app/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Posez une question : « Quels contrats couvrent le vol ? »"
              aria-label="Recherche sémantique rapide"
              className="focus-ring w-full rounded-full border border-line bg-brand-50/60 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400"
            />
          </form>
          <HealthDot />
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl animate-fade-in px-4 py-6 sm:px-6" key={loc.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export { FileSearch };
