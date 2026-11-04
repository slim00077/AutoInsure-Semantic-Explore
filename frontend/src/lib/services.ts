import { http } from "./api";
import type {
  Activity, Claim, Contract, Damage, Expert, Expertise, GraphData, Guarantee, GuaranteeType, Indemnification, IndividualDetail,
  Insured, NlpHistoryEntry, NlpModule, NlpResponse, OntoClass, OntoIndividual, OntoProperty, Paginated, References, SparqlExample,
  SparqlHistoryEntry, SparqlResult, SparqlUpdateResult, Statistics, ValidationReport, Vehicle,
} from "./types";

type Params = Record<string, string | number | boolean | undefined | null>;
const clean = (p?: Params) => (p ? Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "")) : undefined);

/** Fabrique un client CRUD typé pour une ressource REST. */
function crud<T, I = Partial<T>>(path: string) {
  return {
    list: async (params?: Params) => (await http.get<Paginated<T>>(path, { params: clean({ pageSize: 500, ...params }) })).data,
    get: async (id: string) => (await http.get<T>(`${path}/${id}`)).data,
    create: async (body: I) => (await http.post<T>(path, body)).data,
    update: async (id: string, body: Partial<I>) => (await http.put<T>(`${path}/${id}`, body)).data,
    remove: async (id: string) => {
      await http.delete(`${path}/${id}`);
    },
  };
}

export const insuredApi = crud<Insured, Record<string, unknown>>("/insured");
export const vehiclesApi = crud<Vehicle, Record<string, unknown>>("/vehicles");
export const contractsApi = crud<Contract, Record<string, unknown>>("/contracts");
export const guaranteesApi = {
  ...crud<Guarantee, Record<string, unknown>>("/guarantees"),
  types: async () => (await http.get<GuaranteeType[]>("/guarantee-types")).data,
};
export const claimsApi = {
  ...crud<Claim, Record<string, unknown>>("/claims"),
  addDamage: async (claimId: string, body: Record<string, unknown>) => (await http.post<Damage>(`/claims/${claimId}/damages`, body)).data,
  updateDamage: async (id: string, body: Record<string, unknown>) => (await http.put<Damage>(`/damages/${id}`, body)).data,
  removeDamage: async (id: string) => {
    await http.delete(`/damages/${id}`);
  },
  damages: async (params?: Params) => (await http.get<Paginated<Damage>>("/damages", { params: clean({ pageSize: 500, ...params }) })).data,
};
export const expertisesApi = crud<Expertise, Record<string, unknown>>("/expertises");
export const expertsApi = crud<Expert, Record<string, unknown>>("/experts");
export const indemnificationsApi = {
  ...crud<Indemnification, Record<string, unknown>>("/indemnifications"),
  simulate: async (body: { coutEstime: number; franchise: number; baremeId: string }) =>
    (await http.post<{ montant: number }>("/indemnifications-simulate", body)).data,
};
export const referencesApi = { get: async () => (await http.get<References>("/references")).data };

export const ontologyApi = {
  classes: async () => (await http.get<OntoClass[]>("/ontology/classes")).data,
  properties: async () => (await http.get<OntoProperty[]>("/ontology/properties")).data,
  individuals: async (type?: string) => (await http.get<OntoIndividual[]>("/ontology/individuals", { params: clean({ type }) })).data,
  individual: async (id: string) => (await http.get<IndividualDetail>(`/ontology/individuals/${id}`)).data,
  graph: async (level: "schema" | "instances") => (await http.get<GraphData>("/ontology/graph", { params: { level } })).data,
  statistics: async () => (await http.get<Statistics>("/ontology/statistics")).data,
  validate: async () => (await http.get<ValidationReport>("/ontology/validate")).data,
  activity: async (limit = 12) => (await http.get<Activity[]>("/ontology/activity", { params: { limit } })).data,
  reset: async () => (await http.post<{ backup: string; triples: number }>("/ontology/reset")).data,
  exportUrl: (format: "xml" | "turtle" | "nt" | "jsonld") => `${http.defaults.baseURL}/ontology/export?format=${format}`,
};

export const sparqlApi = {
  query: async (query: string, limit?: number) => (await http.post<SparqlResult>("/sparql/query", { query, limit })).data,
  update: async (update: string) => (await http.post<SparqlUpdateResult>("/sparql/update", { update })).data,
  history: async () => (await http.get<SparqlHistoryEntry[]>("/sparql/history")).data,
  clearHistory: async () => {
    await http.delete("/sparql/history");
  },
  examples: async () => (await http.get<SparqlExample[]>("/sparql/examples")).data,
};

export const nlpApi = {
  translate: async (question: string) => (await http.post<NlpResponse>("/nlp/translate", { question })).data,
  search: async (question: string) => (await http.post<NlpResponse>("/nlp/search", { question })).data,
  module: async () => (await http.get<NlpModule>("/nlp/module")).data,
  history: async () => (await http.get<NlpHistoryEntry[]>("/nlp/history")).data,
  clearHistory: async () => {
    await http.delete("/nlp/history");
  },
};
