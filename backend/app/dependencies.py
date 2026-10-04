"""Request-scoped access to injectable application state."""
from typing import Any

from fastapi import HTTPException, Request
from pydantic import BaseModel, ValidationError

from .data_utils import load_jobs_dict
from .repository import SQLiteRepository
from .services.gemini_client import GenerationError


def get_repository(request: Request) -> SQLiteRepository:
    return request.app.state.repository


def get_provider(request: Request) -> Any:
    return request.app.state.provider


def get_job(job_id: str) -> dict[str, Any]:
    job = load_jobs_dict().get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def generate_schema(provider: Any, operation: str, system: str, user: str, schema: type[BaseModel]):
    """Validate injected outputs too, so callers never persist an unchecked response."""
    try:
        output = await provider.generate(operation, system, user, schema)
        return schema.model_validate(output.model_dump() if isinstance(output, BaseModel) else output)
    except ValidationError as exc:
        raise GenerationError(502, "The AI response did not meet the expected format. Try generating again.", "generation_invalid") from exc
