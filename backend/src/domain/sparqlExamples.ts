/** Requêtes d'exemple proposées dans le SPARQL Query Explorer (textes de requêtes, pas des données). */
export interface SparqlExample {
  id: string;
  title: string;
  category: "Lecture" | "Recherche" | "Filtrage" | "Agrégation" | "Raisonnement" | "Mise à jour";
  description: string;
  kind: "query" | "update";
  query: string;
}

const P = `PREFIX actors: <http://www.semanticweb.org/assurance/actors#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export const SPARQL_EXAMPLES: SparqlExample[] = [
  {
    id: "assures-vehicules", title: "Assurés et véhicules associés", category: "Lecture", kind: "query",
    description: "Requête croisée assuré → contrat → véhicule.",
    query: `${P}SELECT ?assure ?nom ?prenom ?marque ?modele ?immatriculation WHERE {
  ?assure a actors:Assure ; actors:nom ?nom ; actors:prenom ?prenom ; actors:possede ?contrat .
  ?contrat actors:couvre ?vehicule .
  ?vehicule actors:marque ?marque ; actors:modele ?modele ; actors:immatriculation ?immatriculation .
}
ORDER BY ?nom`,
  },
  {
    id: "contrats-actifs", title: "Contrats actifs", category: "Filtrage", kind: "query",
    description: "Contrats dont le statut vaut « Actif » (équivalent de la classe définie ContratActif).",
    query: `${P}SELECT ?contrat ?numero ?debut ?fin ?prime WHERE {
  ?contrat a/rdfs:subClassOf* actors:ContratAssurance ;
           actors:numeroContrat ?numero ;
           actors:statutContrat "Actif" ;
           actors:dateDebut ?debut ; actors:dateFin ?fin ;
           actors:aPourPrime/actors:montantPrime ?prime .
}
ORDER BY ?numero`,
  },
  {
    id: "contrats-garantie-vol", title: "Contrats couvrant le vol", category: "Recherche", kind: "query",
    description: "Contrats contenant une GarantieVol.",
    query: `${P}SELECT ?contrat ?numero ?plafond WHERE {
  ?contrat actors:numeroContrat ?numero ;
           actors:contient ?g .
  ?g a actors:GarantieVol ; actors:plafondGarantie ?plafond .
}`,
  },
  {
    id: "sinistres-peugeot", title: "Sinistres d'une Peugeot 208", category: "Recherche", kind: "query",
    description: "Sinistres liés à un véhicule précis (marque + modèle).",
    query: `${P}SELECT ?sinistre ?numero ?date ?lieu WHERE {
  ?v actors:marque "Peugeot" ; actors:modele "208" .
  ?sinistre actors:concerne ?v ; actors:numeroSinistre ?numero ; actors:dateSinistre ?date .
  OPTIONAL { ?sinistre actors:lieuSinistre ?lieu }
}`,
  },
  {
    id: "indemnisations-3000", title: "Indemnisations > 3000", category: "Filtrage", kind: "query",
    description: "Filtrage avancé par montant, avec franchise, barème et statut.",
    query: `${P}SELECT ?indemnisation ?montant ?statut ?franchise ?taux WHERE {
  ?indemnisation a actors:Indemnisation ;
                 actors:montantIndemnisation ?montant ;
                 actors:statutIndemnisation ?statut .
  OPTIONAL { ?indemnisation actors:appliqueFranchise/actors:montantFranchise ?franchise }
  OPTIONAL { ?indemnisation actors:utiliseBareme/actors:tauxIndemnisation ?taux }
  FILTER(?montant > 3000)
}
ORDER BY DESC(?montant)`,
  },
  {
    id: "sinistres-par-type", title: "Nombre de sinistres par type", category: "Agrégation", kind: "query",
    description: "GROUP BY sur les sous-classes de Sinistre.",
    query: `${P}SELECT ?type (COUNT(?s) AS ?nombre) WHERE {
  ?s a ?type . ?type rdfs:subClassOf actors:Sinistre .
}
GROUP BY ?type
ORDER BY DESC(?nombre)`,
  },
  {
    id: "total-indemnise", title: "Total indemnisé par assuré", category: "Agrégation", kind: "query",
    description: "Somme des indemnisations acceptées, par bénéficiaire.",
    query: `${P}SELECT ?nom ?prenom (SUM(?montant) AS ?total) WHERE {
  ?i actors:statutIndemnisation "Acceptee" ; actors:montantIndemnisation ?montant ; actors:verseeA ?p .
  ?p actors:nom ?nom ; actors:prenom ?prenom .
}
GROUP BY ?nom ?prenom`,
  },
  {
    id: "expertises", title: "Sinistres, experts et dommages évalués", category: "Lecture", kind: "query",
    description: "Chaîne sinistre → expertise → expert → dommage évalué.",
    query: `${P}SELECT ?numero ?expertNom ?specialite ?dommage ?cout WHERE {
  ?s actors:numeroSinistre ?numero ; actors:faitObjetDe ?e .
  ?e actors:realisePar ?x ; actors:evalue ?d .
  ?x actors:nom ?expertNom ; actors:specialite ?specialite .
  ?d actors:description ?dommage ; actors:coutEstime ?cout .
}`,
  },
  {
    id: "hierarchie", title: "Hiérarchie des classes de garanties", category: "Raisonnement", kind: "query",
    description: "Sous-classes de Garantie et nombre d'instances (parcours rdfs:subClassOf).",
    query: `${P}SELECT ?classe (COUNT(?i) AS ?instances) WHERE {
  ?classe rdfs:subClassOf actors:Garantie .
  OPTIONAL { ?i a ?classe }
}
GROUP BY ?classe`,
  },
  {
    id: "tous-vehicules", title: "Tous les véhicules (sous-classes incluses)", category: "Raisonnement", kind: "query",
    description: "rdf:type/rdfs:subClassOf* retrouve Voiture, Moto et Camion comme des Vehicule.",
    query: `${P}SELECT ?v ?type ?marque WHERE {
  ?v a ?type . ?type rdfs:subClassOf* actors:Vehicule .
  ?v actors:marque ?marque .
}`,
  },
  {
    id: "ask-garantie", title: "ASK : un contrat couvre-t-il le vol ?", category: "Recherche", kind: "query",
    description: "Requête booléenne ASK.",
    query: `${P}ASK { ?c actors:contient ?g . ?g a actors:GarantieVol }`,
  },
  {
    id: "insert-clause", title: "INSERT : ajouter une clause", category: "Mise à jour", kind: "update",
    description: "Ajoute une nouvelle clause d'exemple (modifie réellement le graphe).",
    query: `${P}INSERT DATA {
  actors:Clause_900 a owl:NamedIndividual , actors:Clause ;
    actors:texteClause "Clause de démonstration ajoutée via SPARQL Update." .
}`,
  },
  {
    id: "delete-clause", title: "DELETE : supprimer la clause de démonstration", category: "Mise à jour", kind: "update",
    description: "Supprime la clause ajoutée par l'exemple précédent.",
    query: `${P}DELETE WHERE { actors:Clause_900 ?p ?o }`,
  },
];
