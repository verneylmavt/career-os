"""Resume tailoring + cover letter generation."""
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.openai_client import chat_text
from ..store import store

router = APIRouter(prefix="/api/resume", tags=["resume"])

_JOBS_PATH = Path(__file__).parent.parent / "data" / "mock_jobs.json"


def _load_jobs() -> dict[str, dict[str, Any]]:
    with _JOBS_PATH.open() as f:
        return {j["id"]: j for j in json.load(f)}


class TailorIn(BaseModel):
    job_id: str


class TailorOut(BaseModel):
    job_id: str
    tailored_resume_md: str
    ats_keywords: list[str]
    summary_rewrite: str


@router.post("/tailor", response_model=TailorOut)
def tailor_resume(body: TailorIn) -> dict[str, Any]:
    job = _load_jobs().get(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    resume_text = store.profile.get("resume_text") or ""
    if not resume_text:
        raise HTTPException(status_code=400, detail="Upload a resume first")

    prompt = (
        f"JOB POSTING\n----------\n"
        f"Title: {job['title']} @ {job['company']} ({job['location']}, {job['work_mode']})\n"
        f"Must-have skills: {', '.join(job.get('must_have_skills', []))}\n"
        f"Nice-to-haves: {', '.join(job.get('nice_to_have_skills', []))}\n"
        f"Description:\n{job['description']}\n\n"
        f"Responsibilities:\n- " + "\n- ".join(job.get('responsibilities', [])) + "\n\n"
        f"CANDIDATE RESUME\n----------\n{resume_text[:6000]}\n\n"
        "Task: Rewrite this resume in clean Markdown to maximize fit for THIS specific role. "
        "Keep all factual claims grounded in the original resume — do not invent experience, "
        "but reorder, reframe, and amplify what's relevant. Lead with a tailored 3-sentence "
        "professional summary. Use ATS-friendly section headings (Summary, Skills, Experience, "
        "Projects, Education). End with a comma-separated list of the top 15 ATS keywords to include."
    )

    resp = chat_text(
        system=(
            "You are an expert resume writer. You only restate truths already present in the "
            "candidate's resume, but you reframe them with the precise vocabulary of the target role."
        ),
        user=prompt,
        temperature=0.5,
    )

    # Heuristic split: last paragraph after 'ATS Keywords' line is the keyword list
    ats_keywords: list[str] = []
    tailored = resp
    for marker in ["ATS Keywords:", "ATS keywords:", "**ATS Keywords**:", "## ATS Keywords"]:
        if marker in resp:
            head, _, tail = resp.partition(marker)
            tailored = head.rstrip()
            ats_keywords = [k.strip(" \n*-•") for k in tail.replace("\n", ",").split(",") if k.strip(" \n*-•")][:20]
            break

    # Pull the first H1/H2/section that looks like Summary
    summary_lines: list[str] = []
    collecting = False
    for line in tailored.splitlines():
        low = line.strip().lower()
        if low.startswith(("## summary", "**summary**", "# summary", "summary")):
            collecting = True
            continue
        if collecting:
            if line.strip().startswith("#") or line.strip().startswith("**"):
                break
            if line.strip():
                summary_lines.append(line.strip())
            if len(summary_lines) >= 5:
                break
    summary_rewrite = " ".join(summary_lines).strip()

    store.tailored_resumes[body.job_id] = tailored
    return {
        "job_id": body.job_id,
        "tailored_resume_md": tailored,
        "ats_keywords": ats_keywords,
        "summary_rewrite": summary_rewrite,
    }


class CoverLetterIn(BaseModel):
    job_id: str
    tone: str = "warm"  # warm | direct | formal


@router.post("/cover-letter")
def cover_letter(body: CoverLetterIn) -> dict[str, Any]:
    job = _load_jobs().get(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    resume_text = store.profile.get("resume_text") or ""
    if not resume_text:
        raise HTTPException(status_code=400, detail="Upload a resume first")

    text = chat_text(
        system=(
            "You write concise, sincere cover letters. Avoid clichés ('I am writing to apply…'). "
            "Open with a specific reason this role excites the candidate. Three short paragraphs."
        ),
        user=(
            f"Role: {job['title']} @ {job['company']}\n"
            f"Job description: {job['description']}\n\n"
            f"Candidate resume:\n{resume_text[:4000]}\n\n"
            f"Tone: {body.tone}. Length: under 250 words."
        ),
        temperature=0.7,
    )
    store.cover_letters[body.job_id] = text
    return {"job_id": body.job_id, "cover_letter": text}
