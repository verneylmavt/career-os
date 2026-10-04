"""Durable interview sessions, editable drafts and canonical evaluations."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from ..dependencies import generate_schema, get_job, get_provider, get_repository
from ..repository import SQLiteRepository
from ..schemas import DraftIn, EvaluateIn, GenerationIn
from ..services.model_schemas import FeedbackOutput, QuestionsOutput, evaluation_prompt, generation_prompt, verify_answer_example

router = APIRouter(prefix="/api/interview", tags=["interview"])
QuestionsIn = GenerationIn


@router.post("/questions")
async def generate_questions(body: GenerationIn, repository: SQLiteRepository = Depends(get_repository), provider=Depends(get_provider)) -> dict[str, Any]:
    job = get_job(body.job_id)
    profile = await run_in_threadpool(repository.get_profile)
    ticket = await run_in_threadpool(repository.begin_generation, "questions", body.job_id, {}, provider.model_for("questions"), provider.prompt_version("questions"), expected_revision=profile["revision"])
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_session, ticket)
        if cached is not None:
            return cached
    system, user = generation_prompt("questions", profile, job)
    output = await generate_schema(provider, "questions", system, user, QuestionsOutput)
    return await run_in_threadpool(repository.create_session, ticket, output.model_dump()["questions"])


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
    job = get_job(body.job_id)
    profile = await run_in_threadpool(repository.get_profile)
    session = await run_in_threadpool(repository.get_session, body.job_id, body.session_id)
    question = next((question for question in session["questions"] if question["id"] == body.question_id), None)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found in this session")
    if body.question is not None and body.question != question["question"]:
        raise HTTPException(status_code=422, detail="Question text must match the saved question")
    ticket = await run_in_threadpool(repository.prepare_evaluation, body.job_id, body.session_id, body.question_id, body.answer, provider.model_for("evaluation"), provider.prompt_version("evaluation"), expected_revision=profile["revision"], expected_version=session["answer_versions"].get(body.question_id, 0))
    if not body.regenerate:
        cached = await run_in_threadpool(repository.cached_feedback, ticket)
        if cached is not None:
            try:
                output = FeedbackOutput.model_validate({key: cached[key] for key in FeedbackOutput.model_fields})
                verify_answer_example(output, body.answer, question["category"])
                if cached["submitted_answer"] == body.answer:
                    return cached
            except (KeyError, ValidationError):
                pass
    system, user = evaluation_prompt(job, question, body.answer, profile)
    output = await generate_schema(provider, "evaluation", system, user, FeedbackOutput)
    verify_answer_example(output, body.answer, question["category"])
    data = {**output.model_dump(), "submitted_answer": body.answer}
    return await run_in_threadpool(repository.commit_feedback, ticket, data)
