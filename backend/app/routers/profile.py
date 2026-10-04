"""Editable profile and resume extraction, persisted across process restarts."""
import io
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool

from ..config import PROMPT_VERSION, generation_model
from ..dependencies import get_provider, get_repository, legacy_json
from ..repository import SQLiteRepository
from ..schemas import ProfileOut, ProfileUpdate

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def get_profile(repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    return repository.get_profile()


@router.patch("", response_model=ProfileOut)
def update_profile(patch: ProfileUpdate, repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    return repository.patch_profile(patch.model_dump(exclude_unset=True))


def read_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read PDF. Provide a readable PDF or paste the resume text.") from exc


@router.post("/upload", response_model=ProfileOut)
async def upload_resume(
    file: UploadFile | None = File(default=None),
    pasted_text: str | None = Form(default=None),
    repository: SQLiteRepository = Depends(get_repository),
    provider=Depends(get_provider),
) -> dict[str, Any]:
    profile = await run_in_threadpool(repository.get_profile)
    if file is not None:
        data = await file.read()
        if file.filename and file.filename.lower().endswith(".pdf"):
            text = await run_in_threadpool(read_pdf, data)
        else:
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise HTTPException(status_code=400, detail="Text files must use UTF-8 encoding") from exc
    elif pasted_text:
        text = pasted_text
    else:
        raise HTTPException(status_code=400, detail="Provide a file or pasted_text")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Resume appears to be empty")
    ticket = await run_in_threadpool(repository.begin_generation, "profile_upload", "", {}, generation_model(), PROMPT_VERSION, expected_revision=profile["revision"])
    extracted = await legacy_json(
        provider,
        system="You are a resume parser. Extract a candidate's structured profile from raw resume text. Be conservative: missing fields must be empty or zero.",
        user=f"Resume text:\n\n{text}",
        schema_hint='{ "name": string, "email": string, "skills": string[], "experience_years": integer, "preferred_location": string }',
    )
    facts = {key: extracted[key] for key in ("name", "email", "skills", "experience_years", "preferred_location") if key in extracted}
    facts["resume_text"] = text
    return await run_in_threadpool(repository.commit_profile, ticket, facts)
