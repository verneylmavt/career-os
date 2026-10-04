"""Curated job discovery and durable saved preparation."""
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from ..data_utils import load_jobs_list
from ..dependencies import generate_schema, get_job, get_provider, get_repository
from ..repository import SQLiteRepository
from ..schemas import RegenerateIn, SearchIn, ShortlistIn, ShortlistPatch
from ..services.gemini_client import GenerationError
from ..services.matching import local_filters, query_warnings, rank_jobs
from ..services.model_schemas import PreparationBriefOutput, SearchFiltersOutput, generation_prompt, search_prompt

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobOut(BaseModel):
    job: dict[str, Any]
    score: int | None
    matched_skills: list[str]
    missing_skills: list[str]
    reason: str
    relevance: int


class SearchOut(BaseModel):
    results: list[JobOut]
    filters: SearchFiltersOutput
    warnings: list[str]
    source: Literal["curated"] = "curated"
    personalized: bool


@router.post("/search", response_model=SearchOut)
async def search_jobs(body: SearchIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> dict[str, Any]:
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty")
    jobs = load_jobs_list()
    warnings = query_warnings(body.query, body.model_dump(exclude_unset=True))
    filters = local_filters(body.query, jobs)
    if not warnings:
        try:
            system, user = search_prompt(body.query)
            filters = (await generate_schema(provider, "search", system, user, SearchFiltersOutput)).model_dump()
        except GenerationError:
            warnings.append("AI parsing is unavailable. Using local keyword search; review the filters and results.")
    for field in ("location", "work_mode", "seniority"):
        if getattr(body, field) is not None:
            filters[field] = getattr(body, field)
    profile = await run_in_threadpool(repository.get_profile)
    ambiguous = any("cannot represent" in warning for warning in warnings)
    return {"results": [] if ambiguous else rank_jobs(jobs, profile, filters), "filters": filters,
            "warnings": warnings, "source": "curated", "personalized": bool(profile["skills"])}


@router.get("/shortlist")
def list_shortlist(repository: SQLiteRepository = Depends(get_repository)) -> list[dict[str, Any]]:
    return repository.list_shortlist()


@router.get("")
def job_contexts(repository: SQLiteRepository = Depends(get_repository)) -> list[dict[str, Any]]:
    return repository.job_contexts()


@router.post("/shortlist")
def add_to_shortlist(body: ShortlistIn, repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    return repository.add_shortlist(get_job(body.job_id), body.status, body.notes or "")


@router.patch("/shortlist/{job_id}")
def update_shortlist(job_id: str, body: ShortlistPatch, repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    return repository.patch_shortlist(job_id, body.model_dump(exclude_unset=True))


@router.delete("/shortlist/{job_id}")
def remove_from_shortlist(job_id: str, repository: SQLiteRepository = Depends(get_repository)) -> dict[str, str]:
    get_job(job_id)
    repository.remove_shortlist(job_id)
    return {"status": "ok"}


@router.get("/{job_id}/dossier")
def get_company_dossier(job_id: str, repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any] | None:
    get_job(job_id)
    return repository.get_artifact("dossier", job_id)


@router.post("/{job_id}/dossier")
async def company_dossier(job_id: str, body: RegenerateIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> dict[str, Any]:
    job = get_job(job_id)
    profile = await run_in_threadpool(repository.get_profile)
    ticket = await run_in_threadpool(repository.begin_generation, "dossier", job_id, {}, provider.model_for("dossier"), provider.prompt_version("dossier"), expected_revision=profile["revision"])
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_artifact, ticket)
        if cached is not None:
            return cached
    system, user = generation_prompt("dossier", profile, job)
    output = await generate_schema(provider, "dossier", system, user, PreparationBriefOutput)
    return await run_in_threadpool(repository.commit_artifact, ticket, output.model_dump())
