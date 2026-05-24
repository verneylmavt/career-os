"""Job discovery, matching, and shortlist."""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..data_utils import load_jobs_dict, load_jobs_list
from ..services.openai_client import chat_json, chat_text
from ..store import store

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class SearchIn(BaseModel):
    query: str


class JobOut(BaseModel):
    job: dict[str, Any]
    score: int
    matched_skills: list[str]
    missing_skills: list[str]
    reason: str


class ShortlistIn(BaseModel):
    job_id: str
    status: str = "saved"  # saved | applied | interviewing | offer | rejected
    notes: str | None = None


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
def search_jobs(body: SearchIn) -> list[dict[str, Any]]:
    """Natural-language search → structured filters → ranked jobs with explanations."""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty")

    # 1. Extract structured filters with LLM
    filters = chat_json(
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
    profile = store.profile
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
def list_shortlist() -> list[dict[str, Any]]:
    return list(store.shortlist.values())


@router.post("/shortlist")
def add_to_shortlist(body: ShortlistIn) -> dict[str, Any]:
    jobs = load_jobs_dict()
    job = jobs.get(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    entry = {
        "job": job,
        "status": body.status,
        "notes": body.notes or "",
        "added_at": datetime.utcnow().isoformat(),
    }
    store.shortlist[body.job_id] = entry
    return entry


@router.patch("/shortlist/{job_id}")
def update_shortlist(job_id: str, body: ShortlistIn) -> dict[str, Any]:
    if job_id not in store.shortlist:
        raise HTTPException(status_code=404, detail="Not in shortlist")
    entry = store.shortlist[job_id]
    entry["status"] = body.status
    if body.notes is not None:
        entry["notes"] = body.notes
    return entry


@router.delete("/shortlist/{job_id}")
def remove_from_shortlist(job_id: str) -> dict[str, str]:
    store.shortlist.pop(job_id, None)
    return {"status": "ok"}


@router.get("/{job_id}/dossier")
def company_dossier(job_id: str) -> dict[str, Any]:
    """Generate a 'what to know before your interview' brief."""
    jobs = load_jobs_dict()
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    data = chat_json(
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
    return {"job_id": job_id, **data}
