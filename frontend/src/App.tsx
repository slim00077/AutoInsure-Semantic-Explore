import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import { Spinner } from "./components/ui";

// Pages lourdes chargées à la demande (React Flow, éditeur SPARQL...)
const OntologyExplorer = lazy(() => import("./pages/OntologyExplorer"));
const InsuredPage = lazy(() => import("./pages/Insured"));
const VehiclesPage = lazy(() => import("./pages/Vehicles"));
const ContractsPage = lazy(() => import("./pages/Contracts"));
const GuaranteesPage = lazy(() => import("./pages/Guarantees"));
const ClaimsPage = lazy(() => import("./pages/Claims"));
const ExpertisesPage = lazy(() => import("./pages/Expertises"));
const IndemnificationsPage = lazy(() => import("./pages/Indemnifications"));
const SparqlExplorer = lazy(() => import("./pages/SparqlExplorer"));
const SemanticSearch = lazy(() => import("./pages/SemanticSearch"));

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="ontology" element={<OntologyExplorer />} />
          <Route path="insured" element={<InsuredPage />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="guarantees" element={<GuaranteesPage />} />
          <Route path="claims" element={<ClaimsPage />} />
          <Route path="expertises" element={<ExpertisesPage />} />
          <Route path="indemnifications" element={<IndemnificationsPage />} />
          <Route path="sparql" element={<SparqlExplorer />} />
          <Route path="search" element={<SemanticSearch />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
