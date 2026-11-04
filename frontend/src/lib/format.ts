export const nf = new Intl.NumberFormat("fr-FR");
export const money = (n: number | null | undefined, unit = "") =>
  n === null || n === undefined ? "—" : `${nf.format(Number(n))}${unit ? " " + unit : ""}`;

export const dateFr = (d: string | null | undefined) => {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};

export const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Libellé lisible pour un identifiant CamelCase de l'ontologie (AssuranceTousRisques → Assurance Tous Risques). */
export const humanize = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");

export const STATUS_FR: Record<string, string> = {
  Actif: "Actif", Expire: "Expiré", Resilie: "Résilié",
  EnCours: "En cours", Acceptee: "Acceptée", Refusee: "Refusée",
  Declare: "Déclaré", EnExpertise: "En expertise", Indemnise: "Indemnisé", Refuse: "Refusé", Clos: "Clos",
  Legere: "Légère", Moyenne: "Moyenne", Grave: "Grave",
};
export const statusLabel = (s: string | null | undefined) => (s ? STATUS_FR[s] ?? s : "—");
