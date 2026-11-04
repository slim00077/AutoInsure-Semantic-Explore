// Types TypeScript du contrat d'API (miroir des DTO du backend Express).

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Ref {
  id: string;
  label: string;
}

export interface Insured {
  id: string;
  label: string;
  prenom: string | null;
  nom: string | null;
  dateNaissance: string | null;
  numeroPermis: string | null;
  conducteur: boolean;
  contrats: { id: string; numero: string | null; statut: string | null }[];
  vehicules: Ref[];
  sinistres: { id: string; numero: string | null }[];
}

export interface Vehicle {
  id: string;
  label: string;
  marque: string | null;
  modele: string | null;
  anneeFabrication: number | null;
  immatriculation: string | null;
  valeurVehicule: number | null;
  type: "Voiture" | "Moto" | "Camion" | "Vehicule";
  conducteur: Ref | null;
  assures: Ref[];
  contrats: { id: string; numero: string | null; statut: string | null }[];
  sinistres: { id: string; numero: string | null }[];
  garages: Ref[];
}

export interface Guarantee {
  id: string;
  type: string;
  typeLabel: string;
  plafondGarantie: number | null;
  contrat: { id: string; numero: string | null; statut: string | null } | null;
  sinistres: { id: string; numero: string | null }[];
}

export interface GuaranteeType {
  id: string;
  prefix: string;
  label: string;
  plafond: number;
  description: string;
  count: number;
  averagePlafond: number | null;
  requiredBy: string[];
  contrats: string[];
}

export interface Contract {
  id: string;
  numeroContrat: string | null;
  type: string;
  typeLabel: string;
  dateDebut: string | null;
  dateFin: string | null;
  statutContrat: string | null;
  prime: { id: string; montantPrime: number | null; frequencePaiement: string | null } | null;
  compagnie: Ref | null;
  assure: Ref | null;
  vehicules: (Ref | null)[];
  garanties: Guarantee[];
  clauses: { id: string; texte: string | null }[];
  documents: { id: string; date: string | null }[];
  sinistres: { id: string; numero: string | null }[];
  autoAddedGuarantees?: string[];
}

export interface Damage {
  id: string;
  type: string;
  typeLabel: string;
  description: string | null;
  gravite: string | null;
  coutEstime: number | null;
  victime: Ref | null;
  sinistre: { id: string; numero: string | null } | null;
  indemnisation: { id: string; montant: number | null; statut: string | null } | null;
  expertises: string[];
}

export interface Claim {
  id: string;
  numeroSinistre: string | null;
  type: string;
  typeLabel: string;
  dateSinistre: string | null;
  lieuSinistre: string | null;
  descriptionSinistre: string | null;
  statutSinistre: string;
  vehicule: Ref | null;
  assure: Ref | null;
  contrat: { id: string; numero: string | null } | null;
  conducteur: Ref | null;
  garanties: { id: string; type: string | null; plafondGarantie: number | null }[];
  dommages: Damage[];
  expertises: { id: string; date: string | null; expert: Ref | null }[];
  declaration: { id: string; date: string | null } | null;
}

export interface Expert {
  id: string;
  label: string;
  prenom: string | null;
  nom: string | null;
  specialite: string | null;
  expertises: string[];
}

export interface Expertise {
  id: string;
  dateExpertise: string | null;
  conclusion: string | null;
  expert: { id: string; label: string; specialite: string | null } | null;
  sinistre: { id: string; numero: string | null } | null;
  dommages: Damage[];
  rapport: { id: string; dateDocument: string | null; contenuDocument: string | null } | null;
}

export interface Indemnification {
  id: string;
  montantIndemnisation: number | null;
  dateIndemnisation: string | null;
  statutIndemnisation: string | null;
  motifDecision: string | null;
  dommage: { id: string; description: string | null; coutEstime: number | null; type: string | null } | null;
  sinistre: { id: string; numero: string | null } | null;
  franchise: { id: string; montantFranchise: number | null } | null;
  bareme: { id: string; tauxIndemnisation: number | null; plafondIndemnisation: number | null; regleCalcul: string | null } | null;
  beneficiaire: Ref | null;
  compagnie: Ref | null;
}

export interface References {
  compagnies: (Ref & { ville: string | null })[];
  garages: (Ref & { ville: string | null })[];
  experts: (Ref & { specialite: string | null })[];
  assures: (Ref & { conducteur: boolean })[];
  conducteurs: Ref[];
  personnes: (Ref & { roles: string[] })[];
  baremes: { id: string; tauxIndemnisation: number | null; plafondIndemnisation: number | null; regleCalcul: string | null }[];
  franchises: { id: string; montantFranchise: number | null }[];
  clauses: { id: string; texte: string | null }[];
  enums: {
    vehicleTypes: string[];
    contractTypes: { id: string; label: string; required: string[] }[];
    contractStatus: string[];
    frequencies: string[];
    guaranteeTypes: { id: string; label: string; plafond: number }[];
    claimTypes: { id: string; label: string }[];
    claimStatus: string[];
    damageTypes: { id: string; label: string }[];
    severities: string[];
    indemnificationStatus: string[];
  };
}

// ---------------------------------------------------------------- ontologie
export interface OntoClass {
  id: string;
  label: string;
  comment: string | null;
  parents: string[];
  children: string[];
  ancestors: string[];
  directInstances: number;
  totalInstances: number;
  restrictions: { text: string }[];
  equivalentTo: string[];
  disjointWith: string[];
  dataProperties: { id: string; range: string }[];
  objectProperties: { id: string; range: string[] }[];
  incomingProperties: { id: string; domain: string[] }[];
}
export interface OntoProperty {
  id: string;
  kind: "object" | "datatype";
  label: string;
  comment: string | null;
  domain: string[];
  range: string[];
  functional: boolean;
  inverseOf: string[];
  usage: number;
}
export interface OntoIndividual {
  id: string;
  label: string;
  types: string[];
  allTypes: string[];
  properties: { property: string; type: string; value?: string; id?: string; label?: string; datatype?: string }[];
}
export interface IndividualDetail {
  id: string;
  label: string;
  types: string[];
  properties: { property: string; type: string; value?: string; id?: string; label?: string }[];
  incoming: { property: string; id: string; label: string }[];
}
export interface GraphData {
  level: string;
  nodes: { id: string; label: string; kind: string; group: string; instances?: number; className?: string }[];
  edges: { id: string; source: string; target: string; label: string; kind: string }[];
}
export interface Statistics {
  ontology: { classes: number; objectProperties: number; dataProperties: number; individuals: number; triples: number; restrictions: number; disjointGroups: number };
  entities: Record<string, number>;
  byContractType: { name: string; label: string; count: number }[];
  byClaimType: { name: string; label: string; count: number }[];
  byGuaranteeType: { name: string; label: string; count: number }[];
  byDamageType: { name: string; label: string; count: number }[];
  byVehicleType: { name: string; label: string; count: number }[];
  byIndemnisationStatus: { name: string; count: number }[];
  byContractStatus: { name: string; count: number }[];
  claimsByMonth: { month: string; count: number }[];
  vehiclesByBrand: { name: string; count: number }[];
  finance: { totalIndemnisationAcceptee: number; averageIndemnisationAcceptee: number; acceptedCount: number; totalPrimes: number };
  recentClaims: { id: string; number: string; date: string; place: string | null }[];
}
export interface ValidationReport {
  consistent: boolean;
  errors: { subject: string; property: string; message: string }[];
  warnings: { subject: string; property: string; message: string }[];
  checks: { name: string; passed: boolean; issues: number; level: string }[];
  note: string;
}
export interface Activity {
  id: string;
  ts: string;
  action: "create" | "update" | "delete" | "sparql" | "reset";
  entity: string;
  entityId?: string;
  label?: string;
}

// ---------------------------------------------------------------- SPARQL & NLP
export interface RdfTerm {
  type: "uri" | "literal" | "bnode";
  value: string;
  local?: string;
  datatype?: string;
  lang?: string;
}
export type SparqlRow = Record<string, RdfTerm>;
export interface SparqlResult {
  queryType: string;
  variables?: string[];
  rows?: SparqlRow[];
  count?: number;
  truncated?: boolean;
  boolean?: boolean;
  triples?: { s: RdfTerm; p: RdfTerm; o: RdfTerm }[];
  executionMs: number;
}
export interface SparqlUpdateResult {
  added: number;
  removed: number;
  totalTriples: number;
  executionMs: number;
}
export interface SparqlHistoryEntry {
  id: string;
  ts: string;
  kind: "query" | "update";
  text: string;
  ok: boolean;
  count?: number;
  ms?: number;
  error?: string;
}
export interface SparqlExample {
  id: string;
  title: string;
  category: string;
  description: string;
  kind: "query" | "update";
  query: string;
}

export interface NlpToken {
  i: number;
  text: string;
  lemma: string;
  pos: string;
  dep: string;
  stop: boolean;
  used: string | null;
}
export interface NlpResponse {
  question: string;
  normalizedQuestion?: string;
  status: "ok" | "clarification_needed" | "entity_not_found" | "unsupported" | "empty" | "too_long" | "error";
  message: string;
  method: string;
  intent?: string | null;
  intentLabel?: string | null;
  modifiers?: string[];
  modifierLabels?: string[];
  questionType?: string;
  focus?: string | null;
  focusClass?: string | null;
  answerAttribute?: string | null;
  confidence?: number;
  tokens?: NlpToken[];
  spacyEntities?: { text: string; label: string }[];
  concepts?: { id: string; kind: string; label: string; matched: string; via: string; owl: string | null }[];
  entities?: { text: string; kind: string; source: string; fuzzy: boolean; resolved: { id: string | null; label: string; classes: string[] }[]; cue?: string | null; expectedByVerb?: string | null }[];
  numbers?: Record<string, unknown>[];
  constraints?: { kind: string; node: string; description: string; source: string }[];
  /** Négations détectées (analyse linguistique explicite : marqueur, portée, critères niés, statut). */
  negations?: { cue: string; kind: string; scope: string; head: string; dep: string[]; negated: { kind: string; text: string }[]; status: string }[];
  unrecognized?: string[];
  issues?: { code: string; message: string }[];
  sparql: string | null;
  valid: boolean;
  template?: string;
  fragments?: string[];
  description?: string;
  steps: { name: string; ms: number; detail: string }[];
  libraries: { name: string; version: string | null; role: string }[];
  suggestions: string[];
  executed?: boolean;
  result?: SparqlResult;
  executionMs?: number;
  translationMs?: number;
  explanation?: string;
}
export interface NlpModule {
  libraries: { name: string; version: string | null; role: string }[];
  intents: { id: string; label: string }[];
  lexicon: { id: string; kind: string; label: string; terms: string[]; owl: string | null; variants: Record<string, string>; value: string | null; intent: string | null; property: string | null }[];
  pipeline: string[];
  llm: boolean;
}
export interface NlpHistoryEntry {
  id: string;
  ts: string;
  question: string;
  status: string;
  intent?: string | null;
  count?: number;
}
