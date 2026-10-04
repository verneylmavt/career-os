"""Durable interview sessions, editable drafts and canonical evaluations."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from ..config import PROMPT_VERSION, generation_model
from ..dependencies import get_job, get_provider, get_repository, legacy_json
from ..repository import SQLiteRepository
from ..schemas import DraftIn, EvaluateIn, GenerationIn

router = APIRouter(prefix="/api/interview", tags=["interview"])
QuestionsIn = GenerationIn


@router.post("/questions")
async def generate_questions(body: GenerationIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> dict[str, Any]:
    job = get_job(body.job_id)
    ticket = await run_in_threadpool(repository.begin_generation, "questions", body.job_id, {}, generation_model(), PROMPT_VERSION)
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_session, ticket)
        if cached is not None:
            return cached
    data = await legacy_json(
        provider,
        system="You are a senior hiring manager. Generate 6 mock interview questions for this role: 2 behavioral, 2 technical, 2 role-specific. Mix difficulty.",
        user=f"Role: {job['title']} @ {job['company']}\nSeniority: {job['seniority']}\nSkills: {', '.join(job['must_have_skills'])}\nDescription: {job['description']}",
        schema_hint='{ "questions": [{"id": string, "category": "behavioral"|"technical"|"role-specific", "question": string, "what_we_look_for": string}] }',
    )
    return await run_in_threadpool(repository.create_session, ticket, data.get("questions", []))


@router.get("/{job_id}/session")
def get_session(job_id: str, session_id: str | None = None, repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    get_job(job_id)
    return repository.get_session(job_id, session_id)


@router.patch("/{job_id}/session/answers/{question_id}")
def save_draft(job_id: str, question_id: str, body: DraftIn, repository: SQLiteRepository = Depends(get_repository)) -> dict[str, Any]:
    get_job(job_id)
    return repository.save_answer(job_id, body.session_id, question_id, body.answer, body.expected_version)


@router.post("/evaluate")
async def evaluate_answer(body: EvaluateIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> dict[str, Any]:
    get_job(body.job_id)
    session = await run_in_threadpool(repository.get_session, body.job_id, body.session_id)
    question = next((question for question in session["questions"] if question["id"] == body.question_id), None)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found in this session")
    if body.question is not None and body.question != question["question"]:
        raise HTTPException(status_code=422, detail="Question text must match the saved question")
    session = await run_in_threadpool(repository.save_answer, body.job_id, body.session_id, body.question_id, body.answer)
    ticket = await run_in_threadpool(repository.begin_generation, "evaluation", body.job_id, {}, generation_model(), PROMPT_VERSION, session_id=body.session_id, question_id=body.question_id, answer_version=session["answer_versions"][body.question_id])
    data = await legacy_json(
        provider,
        system="You are a fair, kind interviewer. Evaluate the candidate's answer on a 1-10 scale for clarity, specificity, role alignment and technical accuracy. Be constructive.",
        user=f"Interview question: {question['question']}\nCandidate answer:\n{body.answer}",
        schema_hint='{ "score": number, "strengths": string[], "gaps": string[], "improved_answer_example": string }',
    )
    if not isinstance(data.get("score"), (int, float)) or isinstance(data["score"], bool) or not 1 <= data["score"] <= 10:
        raise HTTPException(status_code=502, detail="Generated feedback was invalid. Try again.")
    score = data["score"]
    rubric = data.get("rubric") or {"clarity": score, "specificity": score, "role_alignment": score, "technical_accuracy": None if question.get("category") == "behavioral" else score}
    data.update(rubric=rubric, submitted_answer=body.answer)
    return await run_in_threadpool(repository.commit_feedback, ticket, data)
