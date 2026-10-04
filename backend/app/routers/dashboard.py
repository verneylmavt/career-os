"""Aggregate dashboard stats: readiness, skill gaps, pipeline."""
from collections import Counter
from typing import Any

from fastapi import APIRouter, Depends

from ..dependencies import get_repository
from ..repository import SQLiteRepository

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def stats(repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    pipeline = Counter()
    skill_gap_counter: Counter[str] = Counter()
    interview_scores: list[float] = []

    profile = repository.get_profile()
    shortlist = repository.list_shortlist()
    counts = repository.preparation_counts()
    profile_skills = {s.lower() for s in profile.get("skills", [])}

    for entry in shortlist:
        pipeline[entry["status"]] += 1
        job = entry["job"]
        for s in job.get("must_have_skills", []):
            if s.lower() not in profile_skills:
                skill_gap_counter[s] += 1

    for context in repository.job_contexts():
        sess = repository.get_session(context["job"]["id"])
        for s in sess.get("scores", {}).values():
            try:
                interview_scores.append(float(s))
            except (TypeError, ValueError):
                pass

    readiness = (
        int(sum(interview_scores) / len(interview_scores) * 10) if interview_scores else 0
    )

    return {
        "pipeline": dict(pipeline),
        "total_saved": len(shortlist),
        "tailored_resumes": counts["tailored_resume"],
        "cover_letters": counts["cover_letter"],
        "interview_readiness": readiness,
        "top_skill_gaps": [
            {"skill": s, "count": c} for s, c in skill_gap_counter.most_common(8)
        ],
        "has_profile": bool(profile.get("resume_text")),
    }
