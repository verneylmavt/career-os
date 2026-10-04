"""Request-scoped access to injectable application state."""
from typing import Any

from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

from .data_utils import load_jobs_dict
from .repository import SQLiteRepository


def get_repository(request: Request) -> SQLiteRepository:
    return request.app.state.repository


def get_provider(request: Request) -> Any:
    return request.app.state.provider


def get_job(job_id: str) -> dict[str, Any]:
    job = load_jobs_dict().get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def legacy_json(provider: Any, **kwargs) -> dict[str, Any]:
    if provider is None:
        from .services.openai_client import chat_json
        return await run_in_threadpool(chat_json, **kwargs)
    return await run_in_threadpool(provider.chat_json, **kwargs)


async def legacy_text(provider: Any, **kwargs) -> str:
    if provider is None:
        from .services.openai_client import chat_text
        return await run_in_threadpool(chat_text, **kwargs)
    return await run_in_threadpool(provider.chat_text, **kwargs)
