"""Transparent practice metrics for current profiles and active roles."""
from collections import Counter
import math
from typing import Any

from fastapi import APIRouter, Depends

from ..dependencies import get_repository
from ..repository import SQLiteRepository
from ..services.matching import skill_key

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
STAGES = ("saved", "applied", "interviewing", "offer", "rejected")


@router.get("/stats")
def stats(repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    snapshot = repository.dashboard_snapshot()
    profile, shortlist, counts = snapshot["profile"], snapshot["shortlist"], snapshot["counts"]
    pipeline = Counter(entry["status"] for entry in shortlist)
    skills = {skill_key(s) for s in profile["skills"]}
    gaps = Counter(s for entry in shortlist if entry["status"] in STAGES[:3]
                   for s in entry["job"]["must_have_skills"] if skill_key(s) not in skills)
    scores = [item["score"] for item in snapshot["feedback"] if isinstance(item.get("score"), (int, float))
              and not isinstance(item["score"], bool) and math.isfinite(item["score"]) and 1 <= item["score"] <= 10]
    practice = round(sum(scores) / len(scores) * 10) if scores else None
    return {"pipeline": {stage: pipeline[stage] for stage in STAGES}, "total_saved": len(shortlist),
            "tailored_resumes": counts["tailored_resume"], "cover_letters": counts["cover_letter"],
            "interview_readiness": practice or 0, "practice_score": practice,
            "evaluated_answer_count": len(scores),
            "top_skill_gaps": [{"skill": skill, "count": count} for skill, count in gaps.most_common(8)],
            "has_profile": bool(profile["resume_text"])}
