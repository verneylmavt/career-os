"""Mock interview: generate questions + evaluate answers."""
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..data_utils import load_jobs_dict
from ..services.openai_client import chat_json
from ..store import store

router = APIRouter(prefix="/api/interview", tags=["interview"])


class QuestionsIn(BaseModel):
    job_id: str


@router.post("/questions")
def generate_questions(body: QuestionsIn) -> dict[str, Any]:
    job = load_jobs_dict().get(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    data = chat_json(
        system=(
            "You are a senior hiring manager. Generate 6 mock interview questions tailored to "
            "this specific role: 2 behavioral, 2 role-specific technical, 2 deep-dive on the "
            "key skills required. Mix difficulty."
        ),
        user=(
            f"Role: {job['title']} @ {job['company']}\n"
            f"Seniority: {job['seniority']}\n"
            f"Must-have skills: {', '.join(job.get('must_have_skills', []))}\n"
            f"Description: {job['description']}"
        ),
        schema_hint=(
            '{ "questions": [ { "id": string, "category": "behavioral"|"technical"|"role-specific", '
            '"question": string, "what_we_look_for": string } ] }'
        ),
    )
    questions = data.get("questions", [])
    store.interview_sessions[body.job_id] = {"questions": questions, "answers": {}, "scores": {}}
    return {"job_id": body.job_id, "questions": questions}


class EvaluateIn(BaseModel):
    job_id: str
    question_id: str
    question: str
    answer: str


@router.post("/evaluate")
def evaluate_answer(body: EvaluateIn) -> dict[str, Any]:
    if not body.answer.strip():
        raise HTTPException(status_code=400, detail="Answer cannot be empty")

    data = chat_json(
        system=(
            "You are a fair, kind interviewer. Evaluate the candidate's answer on a 1-10 scale. "
            "Focus on: clarity, specificity (STAR-style examples for behavioral), technical accuracy "
            "(for technical), and alignment with the role. Be constructive — every weakness should "
            "come with a concrete way to improve."
        ),
        user=(
            f"Interview question: {body.question}\n\n"
            f"Candidate answer:\n{body.answer}"
        ),
        schema_hint=(
            '{ "score": number, "strengths": string[], "gaps": string[], '
            '"improved_answer_example": string }'
        ),
    )

    session = store.interview_sessions.setdefault(
        body.job_id, {"questions": [], "answers": {}, "scores": {}}
    )
    session["answers"][body.question_id] = body.answer
    session["scores"][body.question_id] = data.get("score", 0)
    return data


@router.get("/{job_id}/session")
def get_session(job_id: str) -> dict[str, Any]:
    return store.interview_sessions.get(job_id, {"questions": [], "answers": {}, "scores": {}})
