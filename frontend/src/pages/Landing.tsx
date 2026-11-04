import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BrainCircuit, Car, Code2, Database, FileText, Network, Share2, ShieldCheck, Siren, Sparkles, Users, Wallet, ClipboardCheck } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { ontologyApi } from "../lib/services";

const fade = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.5 } };

const CHAIN = [
  { icon: Users, label: "Assuré" }, { icon: FileText, label: "Contrat" }, { icon: Car, label: "Véhicule" }, { icon: ShieldCheck, label: "Garantie" },
  { icon: Siren, label: "Sinistre" }, { icon: ClipboardCheck, label: "Expertise" }, { icon: Wallet, label: "Indemnisation" },
];
const PIPELINE = [
  "Question en français", "Prétraitement", "spaCy : lemmes, POS, NER", "Entités liées aux individus OWL", "Intention + concepts (synonymes)", "Template SPARQL", "Validation", "Exécution & réponse",
];

export default function Landing() {
  const stats = useAsync(() => ontologyApi.statistics(), []);
  const s = stats.data;
  const kpis = [
    { v: s?.ontology.classes, l: "classes OWL" },
    { v: s ? s.ontology.objectProperties + s.ontology.dataProperties : undefined, l: "propriétés" },
    { v: s?.ontology.individuals, l: "individus" },
    { v: s?.ontology.triples, l: "triplets RDF" },
  ];

  return (
    <div className="min-h-full overflow-y-auto bg-white">
      {/* barre */}
      <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/30"><ShieldCheck className="h-5 w-5" /></div>
          <span className="font-bold">AutoInsure <span className="font-medium text-brand-300">Semantic Explorer</span></span>
        </div>
        <Link to="/app" className="focus-ring rounded-lg bg-white/15 px-4 py-2 text-sm font-medium ring-1 ring-white/30 transition hover:bg-white/25">Ouvrir l'application</Link>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 pb-28 pt-32 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #3b82f6 0, transparent 40%), radial-gradient(circle at 85% 70%, #60a5fa 0, transparent 35%)" }} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
          <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="white" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="relative mx-auto max-w-6xl px-5">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/25">
              <Sparkles className="h-3.5 w-3.5 text-brand-300" /> Projet Web Sémantique · OWL · RDF · SPARQL
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              L'assurance automobile, <span className="bg-gradient-to-r from-brand-300 to-white bg-clip-text text-transparent">comprise par une ontologie</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-brand-100/90">
              Gérez assurés, contrats, sinistres et indemnisations dans un graphe de connaissances OWL, interrogez-le en SPARQL
              ou… en français : un module NLP développé par l'équipe traduit vos questions en requêtes, sans aucune API LLM.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/app" className="focus-ring group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-navy-900 shadow-lg shadow-black/20 transition hover:bg-brand-50">
                Accéder à l'application <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link to="/app/search" className="focus-ring inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/10">
                <BrainCircuit className="h-4 w-4" /> Essayer la recherche NLP
              </Link>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.l} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur">
                <p className="tabular text-3xl font-bold">{k.v ?? "—"}</p>
                <p className="text-sm text-brand-200">{k.l}</p>
              </div>
            ))}
          </motion.div>
          {stats.error && <p className="mt-3 text-xs text-brand-200">Statistiques indisponibles : démarrez le backend pour voir les chiffres réels de l'ontologie.</p>}
        </div>
      </section>

      {/* le projet */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <motion.div {...fade} className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-ink">Le cycle de vie d'un dossier d'assurance</h2>
          <p className="mt-3 text-muted">
            Comment le Web Sémantique permet-il de structurer et d'interroger efficacement les connaissances liées à l'assurance
            automobile et à la gestion des sinistres ? Notre ontologie modélise chaque maillon de la chaîne et ses relations.
          </p>
        </motion.div>
        <motion.div {...fade} className="mt-12 flex flex-wrap items-center justify-center gap-2">
          {CHAIN.map((c, i) => (
            <div key={c.label} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-brand-50 px-5 py-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <c.icon className="h-7 w-7 text-navy-800" />
                <span className="text-sm font-semibold text-ink">{c.label}</span>
              </div>
              {i < CHAIN.length - 1 && <ArrowRight className="h-4 w-4 text-brand-400" />}
            </div>
          ))}
        </motion.div>
      </section>

      {/* trois piliers */}
      <section className="bg-brand-50/70 py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 md:grid-cols-3">
          {[
            { icon: Network, title: "Ontologie OWL", text: `${s ? `${s.ontology.classes} classes, ${s.ontology.objectProperties} ObjectProperties, ${s.ontology.dataProperties} DataProperties` : "Classes, ObjectProperties, DataProperties"}, restrictions de cardinalité, classes définies et axiomes de disjonction conçus sous Protégé et vérifiables avec HermiT.` },
            { icon: Database, title: "Graphe RDF persistant", text: "Toutes les opérations CRUD modifient réellement le graphe RDF via SPARQL Update. Les données survivent au redémarrage et restent exportables vers Protégé." },
            { icon: Code2, title: "Requêtes SPARQL", text: "Un explorateur professionnel : éditeur, exemples, historique, résultats tabulaires et erreurs expliquées. SERVICE et opérations destructrices sont bloqués." },
          ].map((c, i) => (
            <motion.div key={c.title} {...fade} transition={{ duration: 0.5, delay: i * 0.1 }} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-900 text-white"><c.icon className="h-6 w-6" /></div>
              <h3 className="text-lg font-semibold text-ink">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* NLP */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <motion.div {...fade} className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-navy-800"><BrainCircuit className="h-3.5 w-3.5" /> Recherche sémantique</span>
            <h2 className="mt-4 text-3xl font-bold text-ink">Posez vos questions en français</h2>
            <p className="mt-3 text-muted">
              « Quels contrats couvrent le vol ? » devient une requête SPARQL exécutable. La traduction est réalisée par notre propre
              module : <b>spaCy</b> pour l'analyse linguistique, <b>NLTK</b> pour la tolérance aux fautes, <b>RDFLib</b> pour le graphe, un dictionnaire de synonymes, des règles et des templates contrôlés.
            </p>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
              <Share2 className="mt-0.5 h-4 w-4 shrink-0" /> Aucune API LLM (OpenAI, Gemini, Claude…) : la conversion est faite par des règles et des bibliothèques NLP open-source.
            </p>
            <Link to="/app/search" className="mt-6 inline-flex items-center gap-2 font-semibold text-navy-800 hover:text-brand-600">Essayer maintenant <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <ol className="space-y-2">
            {PIPELINE.map((p, i) => (
              <motion.li key={p} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5 shadow-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">{i + 1}</span>
                <span className="text-sm font-medium text-ink">{p}</span>
              </motion.li>
            ))}
          </ol>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-navy-900 to-navy-700 py-16 text-center text-white">
        <motion.div {...fade} className="mx-auto max-w-2xl px-5">
          <h2 className="text-3xl font-bold">Prêt à explorer le graphe ?</h2>
          <p className="mt-2 text-brand-100">Tableau de bord, ontographe interactif, CRUD complet et recherche en langage naturel.</p>
          <Link to="/app" className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-navy-900 hover:bg-brand-50">Accéder à l'application <ArrowRight className="h-4 w-4" /></Link>
        </motion.div>
      </section>
      <footer className="bg-navy-950 py-6 text-center text-xs text-brand-300/80">
        AutoInsure Semantic Explorer — Projet universitaire de Web Sémantique · Ontologie pour l'Assurance Automobile et la Gestion des Sinistres
      </footer>
    </div>
  );
}
