"""Shared helpers for loading static data files."""
import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

_JOBS_PATH = Path(__file__).parent / "data" / "mock_jobs.json"


@lru_cache(maxsize=1)
def _catalog() -> tuple[dict[str, Any], ...]:
    with _JOBS_PATH.open(encoding="utf-8") as f:
        jobs = json.load(f)
    required = {"id", "title", "company", "description", "must_have_skills", "nice_to_have_skills", "location", "work_mode", "seniority"}
    if not isinstance(jobs, list) or not all(isinstance(job, dict) and required <= job.keys() for job in jobs):
        raise ValueError("Invalid curated job catalog")
    if len({job["id"] for job in jobs}) != len(jobs):
        raise ValueError("Duplicate curated job identifiers")
    return tuple(jobs)


def load_jobs_list() -> list[dict[str, Any]]:
    """Return an isolated copy of the validated immutable catalog."""
    return deepcopy(list(_catalog()))


def load_jobs_dict() -> dict[str, dict[str, Any]]:
    """Return all jobs keyed by id."""
    return {j["id"]: j for j in load_jobs_list()}
