"""Profile + resume upload. Parses PDF or accepts pasted text, extracts structured profile via LLM."""
import io
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader

from ..services.openai_client import chat_json
from ..store import store

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileOut(BaseModel):
    name: str
    email: str
    resume_text: str
    skills: list[str]
    experience_years: int
    preferred_location: str


class ProfileUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    resume_text: str | None = None
    skills: list[str] | None = None
    experience_years: int | None = None
    preferred_location: str | None = None


@router.get("", response_model=ProfileOut)
def get_profile() -> dict[str, Any]:
    return store.profile


@router.patch("", response_model=ProfileOut)
def update_profile(patch: ProfileUpdate) -> dict[str, Any]:
    for k, v in patch.model_dump(exclude_unset=True).items():
        store.profile[k] = v
    return store.profile


@router.post("/upload", response_model=ProfileOut)
async def upload_resume(
    file: UploadFile | None = File(default=None),
    pasted_text: str | None = Form(default=None),
) -> dict[str, Any]:
    """Accept a PDF file OR pasted text. Extract a structured profile via LLM."""
    text = ""
    if file is not None:
        data = await file.read()
        if file.filename and file.filename.lower().endswith(".pdf"):
            try:
                reader = PdfReader(io.BytesIO(data))
                text = "\n".join((page.extract_text() or "") for page in reader.pages)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Could not read PDF: {e}")
        else:
            text = data.decode("utf-8", errors="ignore")
    elif pasted_text:
        text = pasted_text
    else:
        raise HTTPException(status_code=400, detail="Provide a file or pasted_text")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Resume appears to be empty")

    extracted = chat_json(
        system=(
            "You are a resume parser. Extract a candidate's structured profile from raw resume text. "
            "Be conservative: if a field is missing, return a sensible empty/zero default."
        ),
        user=f"Resume text:\n\n{text[:8000]}",
        schema_hint=(
            '{ "name": string, "email": string, "skills": string[], '
            '"experience_years": number, "preferred_location": string }'
        ),
    )

    store.profile.update({
        "name": extracted.get("name", "") or store.profile.get("name", ""),
        "email": extracted.get("email", "") or store.profile.get("email", ""),
        "skills": extracted.get("skills") or store.profile.get("skills", []),
        "experience_years": int(extracted.get("experience_years") or store.profile.get("experience_years") or 0),
        "preferred_location": extracted.get("preferred_location", "") or store.profile.get("preferred_location", ""),
        "resume_text": text,
    })
    return store.profile
