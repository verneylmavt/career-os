from fastapi.testclient import TestClient

from app.data_utils import load_jobs_list
from app.main import create_app
from app.repository import SQLiteRepository
from app.services.gemini_client import GenerationError


class SearchProvider:
    def __init__(self, filters=None, failed=False):
        self.filters = filters or {}
        self.failed = failed

    def model_for(self, operation):
        return "fake-model"

    def prompt_version(self, operation):
        return "fake-v1"

    async def generate(self, operation, system, user, response_schema):
        if self.failed:
            raise GenerationError(503, "No AI configured", "provider_unconfigured")
        return response_schema.model_validate(self.filters)


def test_explicit_filter_wins_and_empty_results_remain_empty(tmp_path):
    repo = SQLiteRepository(tmp_path / "search.sqlite3")
    provider = SearchProvider({"work_mode": "Hybrid"})
    with TestClient(create_app(repo, provider)) as client:
        data = client.post("/api/jobs/search", json={"query": "AI", "work_mode": "Remote"}).json()
        assert data["filters"]["work_mode"] == "Remote"
        assert data["source"] == "curated" and not data["personalized"]
        assert all(x["job"]["work_mode"] == "Remote" and x["score"] is None for x in data["results"])
        empty = client.post("/api/jobs/search", json={"query": "AI", "location": "Antarctica"}).json()
        assert empty["results"] == []


def test_unavailable_ai_falls_back_transparently_and_aliases_affect_fit(tmp_path):
    repo = SQLiteRepository(tmp_path / "fallback.sqlite3")
    with TestClient(create_app(repo, SearchProvider(failed=True))) as client:
        client.patch("/api/profile", json={"skills": ["nextjs", "react.js", "TypeScript", "Python", "REST API"]})
        data = client.post("/api/jobs/search", json={"query": "Full-stack in Singapore"}).json()
        assert data["warnings"] and data["personalized"]
        match = next(x for x in data["results"] if x["job"]["id"] == "job-004")
        assert match["missing_skills"] == []
        assert match["score"] == 78
        assert client.post("/api/jobs/search", json={"query": "underwater basket weaver"}).json()["results"] == []


def test_exclusions_are_reported_instead_of_becoming_positive_filters(tmp_path):
    with TestClient(create_app(SQLiteRepository(tmp_path / "negative.sqlite3"), SearchProvider())) as client:
        data = client.post("/api/jobs/search", json={"query": "AI engineer, not remote"}).json()
        assert data["results"] == []
        assert "cannot represent exclusions" in data["warnings"][0]


def test_practice_score_counts_only_active_current_profile_work(tmp_path):
    repo = SQLiteRepository(tmp_path / "metrics.sqlite3")
    with TestClient(create_app(repo, SearchProvider())) as client:
        client.patch("/api/profile", json={"skills": ["large language models", "Python"]})
        job = load_jobs_list()[0]
        repo.add_shortlist(job)
        ticket = repo.begin_generation("questions", job["id"], {}, "fake", "v1")
        session = repo.create_session(ticket, [{"id": "q1", "category": "behavioral", "question": "Explain a choice", "what_we_look_for": "Specific action"}])
        sid = session["session_id"]
        repo.save_answer(job["id"], sid, "q1", "I chose Python.")
        evaluation = repo.begin_generation("evaluation", job["id"], {}, "fake", "v1", session_id=sid, question_id="q1", answer_version=1)
        repo.commit_feedback(evaluation, {"score": 8, "strengths": ["Clear"], "gaps": [], "improved_answer_example": "I chose Python.", "submitted_answer": "I chose Python.", "rubric": {"clarity": 8, "specificity": 8, "role_alignment": 8, "technical_accuracy": None}})
        stats = client.get("/api/dashboard/stats").json()
        assert stats["practice_score"] == 80 and stats["evaluated_answer_count"] == 1
        assert "LLMs" not in [gap["skill"] for gap in stats["top_skill_gaps"]]
        repo.patch_shortlist(job["id"], {"status": "offer"})
        assert client.get("/api/dashboard/stats").json()["practice_score"] is None
        repo.patch_shortlist(job["id"], {"status": "saved"})
        client.patch("/api/profile", json={"name": "Updated"})
        assert client.get("/api/dashboard/stats").json()["evaluated_answer_count"] == 0
        assert repo.get_session(job["id"])["feedback"]["q1"]["score"] == 8
