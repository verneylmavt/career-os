"""Aggregate dashboard stats: readiness, skill gaps, pipeline."""
from collections import Counter
from typing import Any

from fastapi import APIRouter

from ..store import store

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def stats() -> dict[str, Any]:
    pipeline = Counter()
    skill_gap_counter: Counter[str] = Counter()
    interview_scores: list[float] = []

    profile_skills = {s.lower() for s in store.profile.get("skills", [])}

    for entry in store.shortlist.values():
        pipeline[entry["status"]] += 1
        job = entry["job"]
        for s in job.get("must_have_skills", []):
            if s.lower() not in profile_skills:
                skill_gap_counter[s] += 1

    for sess in store.interview_sessions.values():
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
        "total_saved": len(store.shortlist),
        "tailored_resumes": len(store.tailored_resumes),
        "cover_letters": len(store.cover_letters),
        "interview_readiness": readiness,
        "top_skill_gaps": [
            {"skill": s, "count": c} for s, c in skill_gap_counter.most_common(8)
        ],
        "has_profile": bool(store.profile.get("resume_text")),
    }
