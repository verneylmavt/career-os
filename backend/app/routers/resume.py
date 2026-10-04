"""Generate application documents explicitly and restore saved versions cheaply."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from ..config import PROMPT_VERSION, generation_model
from ..dependencies import get_job, get_provider, get_repository, legacy_text
from ..repository import SQLiteRepository
from ..schemas import CoverLetterIn, GenerationIn, Tone

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
    ticket = await run_in_threadpool(repository.begin_generation, "tailored_resume", body.job_id, {}, generation_model(), PROMPT_VERSION, expected_revision=profile["revision"])
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_artifact, ticket)
        if cached is not None:
            return cached
    response = await legacy_text(
        provider,
        system="You are an expert resume writer. Only restate truths already present in the candidate's resume, using vocabulary of the target role.",
        user=(f"JOB POSTING\nTitle: {job['title']} @ {job['company']} ({job['location']}, {job['work_mode']})\n"
              f"Must-have skills: {', '.join(job.get('must_have_skills', []))}\nDescription: {job['description']}\n"
              f"CANDIDATE RESUME\n{profile['resume_text']}\n"
              "Rewrite in Markdown with a tailored summary, Skills, Experience, Projects and Education. Do not invent facts. End with ATS Keywords: followed by a comma-separated keyword list."),
        temperature=0.5,
    )
    if not response.strip():
        raise HTTPException(status_code=502, detail="Generated resume was empty. Try again.")
    tailored, keywords = response, []
    for marker in ("ATS Keywords:", "ATS keywords:", "**ATS Keywords**:", "## ATS Keywords"):
        if marker in response:
            head, _, tail = response.partition(marker)
            tailored = head.rstrip()
            keywords = [item.strip(" \n*-•") for item in tail.replace("\n", ",").split(",") if item.strip(" \n*-•")][:20]
            break
    summary_lines, collecting = [], False
    for line in tailored.splitlines():
        if line.strip().lower().startswith(("## summary", "**summary**", "# summary", "summary")):
            collecting = True
            continue
        if collecting:
            if line.strip().startswith(("#", "**")):
                break
            if line.strip():
                summary_lines.append(line.strip())
            if len(summary_lines) >= 5:
                break
    payload = {"tailored_resume_md": tailored, "ats_keywords": keywords, "summary_rewrite": " ".join(summary_lines)}
    return await run_in_threadpool(repository.commit_artifact, ticket, payload)


@router.post("/cover-letter")
async def cover_letter(body: CoverLetterIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> dict[str, Any]:
    job = get_job(body.job_id)
    profile = await run_in_threadpool(repository.get_profile)
    if not profile["resume_text"]:
        raise HTTPException(status_code=400, detail="Upload a resume first")
    ticket = await run_in_threadpool(repository.begin_generation, "cover_letter", body.job_id, {"tone": body.tone}, generation_model(), PROMPT_VERSION, expected_revision=profile["revision"])
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_artifact, ticket)
        if cached is not None:
            return cached
    text = await legacy_text(
        provider,
        system="Write concise, sincere cover letters. Use only candidate facts in the resume. Avoid clichés. Write three short paragraphs.",
        user=f"Role: {job['title']} @ {job['company']}\nDescription: {job['description']}\nCandidate resume:\n{profile['resume_text']}\nTone: {body.tone}. Under 250 words.",
        temperature=0.7,
    )
    if not text.strip():
        raise HTTPException(status_code=502, detail="Generated cover letter was empty. Try again.")
    return await run_in_threadpool(repository.commit_artifact, ticket, {"cover_letter": text})
