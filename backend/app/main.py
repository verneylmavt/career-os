"""CareerOS FastAPI entrypoint."""
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette.concurrency import run_in_threadpool

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")  # also accept backend/.env

from .routers import dashboard, interview, jobs, profile, resume  # noqa: E402
from .config import database_path  # noqa: E402
from .repository import RepositoryError, SQLiteRepository  # noqa: E402
from .services.gemini_client import GeminiProvider, GenerationError  # noqa: E402

def create_app(repository: SQLiteRepository | None = None, provider=None) -> FastAPI:
    selected_repository = repository if repository is not None else SQLiteRepository(database_path())
    selected_provider = provider if provider is not None else GeminiProvider()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        await run_in_threadpool(selected_repository.initialize)
        try:
            yield
        finally:
            if provider is None and hasattr(selected_provider, "aclose"):
                await selected_provider.aclose()

    application = FastAPI(title="CareerOS API", version="0.2.0", lifespan=lifespan)
    application.state.repository = selected_repository
    application.state.provider = selected_provider
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(RepositoryError)
    async def repository_error(request, exc):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code, "retryable": False})

    @application.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse(status_code=422, content={"detail": "Invalid request. Check field values and required fields.", "code": "validation_error", "retryable": False})

    @application.exception_handler(GenerationError)
    async def generation_error(request, exc):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code, "retryable": exc.retryable}, headers=exc.headers)

    @application.exception_handler(HTTPException)
    async def http_error(request, exc):
        codes = {400: "invalid_request", 404: "not_found", 409: "conflict", 422: "validation_error", 429: "quota_exceeded", 503: "provider_unavailable", 502: "provider_error"}
        detail = exc.detail if isinstance(exc.detail, str) else "Request could not be completed"
        return JSONResponse(status_code=exc.status_code, content={"detail": detail, "code": codes.get(exc.status_code, "request_failed"), "retryable": exc.status_code in (429, 502, 503, 504)}, headers=exc.headers)

    @application.exception_handler(Exception)
    async def unexpected_error(request, exc):
        return JSONResponse(status_code=500, content={"detail": "Request could not be completed. Try again.", "code": "internal_error", "retryable": False})

    @application.get("/")
    def root() -> dict[str, str]:
        return {"status": "ok", "service": "CareerOS API"}

    for router in (profile.router, jobs.router, resume.router, interview.router, dashboard.router):
        application.include_router(router)
    return application


app = create_app()
