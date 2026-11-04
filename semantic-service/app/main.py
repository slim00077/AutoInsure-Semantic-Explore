"""Service sémantique (FastAPI) : triple store RDFLib, SPARQL, introspection OWL et module NLP.

Ce service est appelé par l'API Express (backend/). Il n'est pas destiné à être exposé publiquement.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import config, ontology_info
from .nlp.service import describe_module, get_nlp_service
from .store import SparqlRejected, SparqlSyntaxError, get_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("semantic-service")

app = FastAPI(title="AutoInsure Semantic Service", version="1.0.0")


class QueryBody(BaseModel):
    query: str = Field(..., max_length=20000)
    limit: int | None = Field(default=None, ge=1, le=10000)


class UpdateBody(BaseModel):
    update: str = Field(..., max_length=100000)


class QuestionBody(BaseModel):
    question: str = Field(..., max_length=600)


@app.exception_handler(SparqlSyntaxError)
async def _syntax(_: Request, exc: SparqlSyntaxError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": {"code": "SPARQL_ERROR", "message": str(exc)}})


@app.exception_handler(SparqlRejected)
async def _rejected(_: Request, exc: SparqlRejected) -> JSONResponse:
    return JSONResponse(status_code=403, content={"error": {"code": "SPARQL_FORBIDDEN", "message": str(exc)}})


@app.on_event("startup")
def _startup() -> None:
    store = get_store()
    get_nlp_service()
    log.info("Ontologie chargée : %s triplets (source : %s)", len(store.graph), store.source)


@app.get("/health")
def health() -> dict[str, Any]:
    store = get_store()
    out = {"status": "ok", "triples": len(store.graph), "source": store.source, "version": store.version,
           "ontology": str(config.ONTOLOGY_PATH.name), "livePath": str(config.LIVE_PATH)}
    if store.recovery:
        out["recovery"] = store.recovery
    return out


# ----------------------------------------------------------------------------- SPARQL
@app.post("/sparql/query")
def sparql_query(body: QueryBody) -> dict[str, Any]:
    log.info("SPARQL query (%d car.)", len(body.query))
    return get_store().query(body.query, body.limit)


@app.post("/sparql/update")
def sparql_update(body: UpdateBody) -> dict[str, Any]:
    log.info("SPARQL update (%d car.)", len(body.update))
    return get_store().update(body.update)


# ----------------------------------------------------------------------------- ontologie
@app.get("/ontology/classes")
def classes() -> list[dict[str, Any]]:
    return ontology_info.get_classes(get_store())


@app.get("/ontology/properties")
def properties() -> list[dict[str, Any]]:
    return ontology_info.get_properties(get_store())


@app.get("/ontology/individuals")
def individuals(type: str | None = Query(default=None, pattern=r"^[A-Za-z][A-Za-z0-9_]*$")) -> list[dict[str, Any]]:
    return ontology_info.get_individuals(get_store(), type)


@app.get("/ontology/individuals/{ident}")
def individual(ident: str) -> dict[str, Any]:
    if not ident.replace("_", "").isalnum():
        raise HTTPException(400, "Identifiant invalide")
    data = ontology_info.describe_individual(get_store(), ident)
    if data is None:
        raise HTTPException(404, f"Individu introuvable : {ident}")
    return data


@app.get("/ontology/graph")
def graph(level: str = Query(default="schema", pattern="^(schema|instances)$")) -> dict[str, Any]:
    return ontology_info.get_graph(get_store(), level)


@app.get("/ontology/statistics")
def statistics() -> dict[str, Any]:
    return ontology_info.get_statistics(get_store())


@app.get("/ontology/validate")
def validate() -> dict[str, Any]:
    return ontology_info.validate(get_store())


@app.get("/ontology/export")
def export(format: str = Query(default="xml", pattern="^(xml|turtle|ttl|nt|jsonld)$")) -> Response:
    body, mime = get_store().export(format)
    return Response(content=body, media_type=mime)


@app.post("/store/reset")
def reset() -> dict[str, Any]:
    log.warning("Réinitialisation du store demandée")
    return get_store().reset()


# ----------------------------------------------------------------------------- NLP
@app.get("/nlp/module")
def nlp_module() -> dict[str, Any]:
    return describe_module()


@app.post("/nlp/translate")
def nlp_translate(body: QuestionBody) -> dict[str, Any]:
    log.info("NLP translate : %s", body.question[:120])
    return get_nlp_service().translate(body.question, get_store())


@app.post("/nlp/search")
def nlp_search(body: QuestionBody) -> dict[str, Any]:
    log.info("NLP search : %s", body.question[:120])
    return get_nlp_service().search(body.question, get_store())
