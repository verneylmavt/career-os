"""Editable profile and resume extraction, persisted across process restarts."""
import io
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool

from ..dependencies import generate_schema, get_provider, get_repository
from ..repository import SQLiteRepository
from ..schemas import ProfileOut, ProfileUpdate
from ..services.gemini_client import GenerationError
from ..services.model_schemas import ExtractionOutput, extraction_prompt

router = APIRouter(prefix="/api/profile", tags=["profile"])
MAX_BYTES = 5 * 1024 * 1024
MAX_PAGES = 25
MAX_CHARACTERS = 40000


@router.get("", response_model=ProfileOut)
def get_profile(repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    return repository.get_profile()


@router.patch("", response_model=ProfileOut)
def update_profile(patch: ProfileUpdate, repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    return repository.patch_profile(patch.model_dump(exclude_unset=True))


def read_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise HTTPException(status_code=400, detail="Encrypted PDFs are not supported. Export an unlocked copy or paste the text.")
        if len(reader.pages) > MAX_PAGES:
            raise HTTPException(status_code=413, detail="Resume PDFs must have at most 25 pages")
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read PDF. Provide a readable PDF or paste the resume text.") from exc


@router.post("/upload", response_model=ProfileOut)
async def upload_resume(
    request: Request,
    file: UploadFile | None = File(default=None),
    pasted_text: str | None = Form(default=None),
    expected_revision: int | None = Form(default=None, ge=0),
    repository: SQLiteRepository = Depends(get_repository),
    provider=Depends(get_provider),
) -> dict[str, Any]:
    profile = await run_in_threadpool(repository.get_profile)
    if file is not None and pasted_text is not None:
        raise HTTPException(status_code=400, detail="Provide one file or pasted text")
    if file is None and not pasted_text:
        raise HTTPException(status_code=400, detail="Provide a file or pasted_text")
    extension = Path(file.filename or "").suffix.lower() if file is not None else None
    if file is not None and extension not in {".pdf", ".txt", ".md"}:
        raise HTTPException(status_code=415, detail="Use a PDF, TXT or MD resume file")
    # Establish ordering before slower file reads and PDF extraction. An older
    # upload must not replace a newer request merely because parsing took longer.
    ticket = await run_in_threadpool(repository.begin_generation, "profile_upload", "", {}, provider.model_for("extraction"), provider.prompt_version("extraction"), expected_revision=profile["revision"] if expected_revision is None else expected_revision)
    if file is not None:
        data = await file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Resume files must be at most 5 MiB")
        if extension == ".pdf":
            text = await run_in_threadpool(read_pdf, data)
        else:
            try:
                text = data.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise HTTPException(status_code=400, detail="Text files must use UTF-8 encoding") from exc
    elif pasted_text:
        text = pasted_text
    else:
        raise HTTPException(status_code=400, detail="Provide a file or pasted_text")
    if len(text) > MAX_CHARACTERS:
        raise HTTPException(status_code=413, detail="Resume text must contain at most 40,000 characters")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Resume text is empty. Scanned PDFs need OCR first; paste readable text instead.")
    if await request.is_disconnected():
        raise GenerationError(499, "Upload was cancelled. Your saved profile is unchanged.", "request_cancelled")
    system, user = extraction_prompt(text)
    extracted = await generate_schema(provider, "extraction", system, user, ExtractionOutput)
    if await request.is_disconnected():
        raise GenerationError(499, "Upload was cancelled. Your saved profile is unchanged.", "request_cancelled")
    facts = extracted.model_dump()
    facts["resume_text"] = text
    try:
        return await run_in_threadpool(repository.commit_profile, ticket, facts)
    except ValueError as exc:
        raise GenerationError(502, "The extracted profile did not meet the expected format.", "generation_invalid") from exc
