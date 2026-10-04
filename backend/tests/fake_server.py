"""Offline integration server. Never import this fixture from production code."""
import json
import os
import re
from collections import Counter

from fastapi import HTTPException
from pydantic import BaseModel

from app.main import create_app
from app.repository import SQLiteRepository
from app.services.gemini_client import GenerationError


class SyntheticProvider:
    def __init__(self):
        self.calls = Counter()
        self.failures = {}

    def model_for(self, operation):
        return "synthetic-integration-model"

    def prompt_version(self, operation):
        return "synthetic-integration-v1"

    async def generate(self, operation, system, user, response_schema):
        self.calls[operation] += 1
        failure = self.failures.pop(operation, None)
        if failure == "quota":
            raise GenerationError(429, "Synthetic quota reached. Try again later.", "quota_exceeded",
                                  True, {"Retry-After": "7"})
        if failure == "unavailable":
            raise GenerationError(503, "Synthetic provider unavailable.", "provider_unavailable", True)
        if failure == "malformed":
            return {"unexpected": "invalid output"}
        source = json.loads(user)
        if operation == "extraction":
            resume = source["resume_source"]
            email = re.search(r"[^\s@]+@[^\s@]+\.[^\s@]+", resume)
            return response_schema.model_validate({
                "name": resume.splitlines()[0], "email": email.group(0) if email else "",
                "skills": [skill for skill in ["Python", "SQL", "React"] if skill in resume],
                "experience_years": 0, "preferred_location": "",
            })
        if operation == "search":
            query = source["search_request_source"].casefold()
            return response_schema.model_validate({
                "role_keywords": ["engineer"] if "engineer" in query else [],
                "skills": ["Python"] if "python" in query else [],
            })
        if operation in {"tailor", "cover_letter"}:
            resume = source["candidate_source"]["resume_text"]
            claim = "Built a Python reporting tool." if "Built a Python reporting tool." in resume else resume
            evidence = [{"claim": claim, "source_excerpt": claim}]
            if operation == "tailor":
                return response_schema.model_validate({
                    "tailored_resume_md": f"## Summary\n\n{claim}\n\n<script>window.syntheticUnsafe = true</script>",
                    "summary_rewrite": claim, "ats_keywords": ["Python"], "source_excerpts": evidence,
                })
            return response_schema.model_validate({
                "cover_letter": f"Dear hiring team,\n\n{claim}\n\nI would welcome a conversation about this role.",
                "source_excerpts": evidence,
            })
        if operation == "dossier":
            return response_schema.model_validate({
                "mission_guess": "The posting emphasizes reliable delivery and useful team outcomes.",
                "talking_points": ["Discuss how you made a reporting tool useful to its users."],
                "smart_questions_to_ask": ["What would success in the first months look like?"],
                "watch_outs": ["Confirm the responsibilities and working arrangement with the employer."],
            })
        if operation == "questions":
            questions = [
                ("behavioral", "Tell me about a time you clarified an ambiguous task."),
                ("behavioral", "How have you responded to constructive feedback?"),
                ("technical", "How would you test a Python reporting tool?"),
                ("technical", "How would you investigate an unreliable data pipeline?"),
                ("role-specific", "How would you prioritize the responsibilities in this posting?"),
                ("role-specific", "What would you clarify before starting this role?"),
            ]
            return response_schema.model_validate({"questions": [
                {"id": f"q{index + 1}", "category": category, "question": question,
                 "what_we_look_for": "A clear action, grounded example, and reflection."}
                for index, (category, question) in enumerate(questions)
            ]})
        if operation == "evaluation":
            answer = source["answer_source"]
            category = source["canonical_question"]["category"]
            return response_schema.model_validate({
                "score": 7, "strengths": ["Your answer describes a concrete action."],
                "gaps": ["Explain the outcome and what you learned."],
                "improved_answer_example": answer + " [add the outcome you observed]",
                "rubric": {"clarity": 7, "specificity": 7, "role_alignment": 7,
                           "technical_accuracy": None if category == "behavioral" else 7},
            })
        raise AssertionError(f"Unexpected fixture operation: {operation}")


class FailureIn(BaseModel):
    operation: str
    mode: str


provider = SyntheticProvider()
app = create_app(SQLiteRepository(os.environ["CAREEROS_DB_PATH"]), provider)


@app.post("/__test/fail")
def fail_next(body: FailureIn):
    if body.operation not in {"extraction", "search", "tailor", "cover_letter", "dossier", "questions", "evaluation"}:
        raise HTTPException(400, "Unknown synthetic operation")
    if body.mode not in {"quota", "unavailable", "malformed"}:
        raise HTTPException(400, "Unknown synthetic failure")
    provider.failures[body.operation] = body.mode
    return {"status": "ok"}


@app.get("/__test/calls")
def provider_calls():
    return dict(provider.calls)
