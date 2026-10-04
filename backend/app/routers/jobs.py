"""Job discovery, matching, and shortlist."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from ..config import PROMPT_VERSION, generation_model
from ..data_utils import load_jobs_list
from ..dependencies import get_job, get_provider, get_repository, legacy_json
from ..repository import SQLiteRepository
from ..schemas import RegenerateIn, SearchIn, ShortlistIn, ShortlistPatch

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobOut(BaseModel):
    job: dict[str, Any]
    score: int
    matched_skills: list[str]
    missing_skills: list[str]
    reason: str


def _score_job(profile: dict[str, Any], job: dict[str, Any], filters: dict[str, Any]) -> tuple[int, list[str], list[str], str]:
    """Heuristic match score using the user's skills + soft filters from the query.
    Returns (score 0-100, matched, missing, brief reason).
    """
    profile_skills = {s.lower() for s in profile.get("skills", [])}
    must = job.get("must_have_skills", []) or []
    nice = job.get("nice_to_have_skills", []) or []

    matched_must = [s for s in must if s.lower() in profile_skills]
    missing_must = [s for s in must if s.lower() not in profile_skills]
    matched_nice = [s for s in nice if s.lower() in profile_skills]

    skill_score = 0
    if must:
        skill_score = int(70 * len(matched_must) / len(must))
    if nice:
        skill_score += int(20 * len(matched_nice) / len(nice))

    # Location & work mode soft preferences
    bonus = 0
    desired_location = (filters.get("location") or "").strip().lower()
    if desired_location and desired_location in job.get("location", "").lower():
        bonus += 5

    desired_mode = (filters.get("work_mode") or "").strip().lower()
    if desired_mode and desired_mode == job.get("work_mode", "").lower():
        bonus += 5

    desired_seniority = (filters.get("seniority") or "").strip().lower()
    if desired_seniority and desired_seniority in job.get("seniority", "").lower():
        bonus += 5

    total = min(100, skill_score + bonus + 5)  # +5 baseline so demos never feel hopeless

    reason_parts = []
    if matched_must:
        reason_parts.append(f"Matches {len(matched_must)}/{len(must)} must-haves ({', '.join(matched_must[:3])})")
    if missing_must:
        reason_parts.append(f"Gaps: {', '.join(missing_must[:3])}")
    if desired_location and desired_location in job.get("location", "").lower():
        reason_parts.append(f"Location fits ({job['location']})")
    if desired_mode and desired_mode == job.get("work_mode", "").lower():
        reason_parts.append(f"{job['work_mode']} work mode")
    reason = "; ".join(reason_parts) or "Partial fit — explore further"

    matched_skills = matched_must + matched_nice
    return total, matched_skills, missing_must, reason


@router.post("/search", response_model=list[JobOut])
async def search_jobs(body: SearchIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> list[dict[str, Any]]:
    """Natural-language search → structured filters → ranked jobs with explanations."""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty")

    # 1. Extract structured filters with LLM
    filters = await legacy_json(
        provider,
        system=(
            "You convert a job-seeker's natural-language wish into structured filters. "
            "Only fill fields that are clearly expressed. Use these enums where applicable: "
            "work_mode in [Remote, Hybrid, On-site]. seniority in [Intern, Junior, Mid, Mid-Senior, Senior, Staff]."
        ),
        user=body.query,
        schema_hint=(
            '{ "role_keywords": string[], "location": string, "work_mode": string, '
            '"seniority": string, "skills": string[], "industries": string[] }'
        ),
    )

    jobs = load_jobs_list()

    # 2. Filter by role keywords (loose substring match)
    role_keywords = [k.lower() for k in (filters.get("role_keywords") or []) if k]
    skill_keywords = [k.lower() for k in (filters.get("skills") or []) if k]

    def matches_role(job: dict[str, Any]) -> bool:
        if not role_keywords and not skill_keywords:
            return True
        haystack = " ".join([
            job.get("title", ""),
            job.get("description", ""),
            " ".join(job.get("must_have_skills", []) + job.get("nice_to_have_skills", [])),
        ]).lower()
        return any(kw in haystack for kw in role_keywords + skill_keywords)

    candidates = [j for j in jobs if matches_role(j)]
    if not candidates:
        candidates = jobs  # fall back to all jobs so demo isn't empty

    # 3. Score + rank
    profile = await run_in_threadpool(repository.get_profile)
    scored = []
    for j in candidates:
        score, matched, missing, reason = _score_job(profile, j, filters)
        scored.append({
            "job": j,
            "score": score,
            "matched_skills": matched,
            "missing_skills": missing,
            "reason": reason,
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:8]


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
    ticket = await run_in_threadpool(repository.begin_generation, "dossier", job_id, {}, generation_model(), PROMPT_VERSION)
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_artifact, ticket)
        if cached is not None:
            return cached
    data = await legacy_json(
        provider,
        system=(
            "You are an interview-prep researcher. Given a company + role, produce a concise dossier. "
            "When unsure, write 'Likely…' rather than fabricating specifics."
        ),
        user=(
            f"Company: {job['company']}\nRole: {job['title']}\nLocation: {job['location']}\n"
            f"Description: {job['description']}"
        ),
        schema_hint=(
            '{ "mission_guess": string, "talking_points": string[], '
            '"smart_questions_to_ask": string[], "watch_outs": string[] }'
        ),
    )
    return await run_in_threadpool(repository.commit_artifact, ticket, data)
