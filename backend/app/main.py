"""CareerOS FastAPI entrypoint."""
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")  # also accept backend/.env

from .routers import dashboard, interview, jobs, profile, resume  # noqa: E402

app = FastAPI(title="CareerOS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "service": "CareerOS API"}


app.include_router(profile.router)
app.include_router(jobs.router)
app.include_router(resume.router)
app.include_router(interview.router)
app.include_router(dashboard.router)
