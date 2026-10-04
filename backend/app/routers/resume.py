"""Generate application documents explicitly and restore saved versions cheaply."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from ..dependencies import generate_schema, get_job, get_provider, get_repository
from ..repository import SQLiteRepository
from ..schemas import CoverLetterIn, GenerationIn, Tone
from ..services.model_schemas import CoverLetterOutput, TailoredResumeOutput, generation_prompt, verify_grounding

router = APIRouter(prefix="/api/resume", tags=["resume"])
TailorIn = GenerationIn


@router.get("/{job_id}/documents")
def get_documents(job_id: str, tone: Tone = "warm", repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    get_job(job_id)
    return {"job_id": job_id, "tailored_resume": repository.get_artifact("tailored_resume", job_id), "cover_letter": repository.get_artifact("cover_letter", job_id, {"tone": tone})}


@router.post("/tailor")
async def tailor_resume(body: GenerationIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> dict[str, Any]:
    job = get_job(body.job_id)
    profile = await run_in_threadpool(repository.get_profile)
    if not profile["resume_text"]:
        raise HTTPException(status_code=400, detail="Upload a resume first")
    ticket = await run_in_threadpool(repository.begin_generation, "tailored_resume", body.job_id, {}, provider.model_for("tailor"), provider.prompt_version("tailor"), expected_revision=profile["revision"])
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_artifact, ticket)
        if cached is not None:
            return cached
    system, user = generation_prompt("tailor", profile, job)
    output = await generate_schema(provider, "tailor", system, user, TailoredResumeOutput)
    verify_grounding(output, profile["resume_text"])
    return await run_in_threadpool(repository.commit_artifact, ticket, output.model_dump())


@router.post("/cover-letter")
async def cover_letter(body: CoverLetterIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> dict[str, Any]:
    job = get_job(body.job_id)
    profile = await run_in_threadpool(repository.get_profile)
    if not profile["resume_text"]:
        raise HTTPException(status_code=400, detail="Upload a resume first")
    ticket = await run_in_threadpool(repository.begin_generation, "cover_letter", body.job_id, {"tone": body.tone}, provider.model_for("cover_letter"), provider.prompt_version("cover_letter"), expected_revision=profile["revision"])
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_artifact, ticket)
        if cached is not None:
            return cached
    system, user = generation_prompt("cover_letter", profile, job, {"tone": body.tone})
    output = await generate_schema(provider, "cover_letter", system, user, CoverLetterOutput)
    verify_grounding(output, profile["resume_text"])
    return await run_in_threadpool(repository.commit_artifact, ticket, output.model_dump())
