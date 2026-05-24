"""Shared helpers for loading static data files."""
import json
from pathlib import Path
from typing import Any

_JOBS_PATH = Path(__file__).parent / "data" / "mock_jobs.json"


def load_jobs_list() -> list[dict[str, Any]]:
    """Return all jobs as a list."""
    with _JOBS_PATH.open() as f:
        return json.load(f)


def load_jobs_dict() -> dict[str, dict[str, Any]]:
    """Return all jobs keyed by id."""
    return {j["id"]: j for j in load_jobs_list()}
