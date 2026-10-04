from fastapi.testclient import TestClient
import pytest

from app.data_utils import load_jobs_list
from app.main import create_app
from app.repository import SQLiteRepository

JOB_ID = load_jobs_list()[0]["id"]


class FakeProvider:
    calls = 0
    fail = False

    def chat_json(self, **kwargs):
        self.calls += 1
        if self.fail:
            raise RuntimeError("synthetic failure")
        if "6 mock interview" in kwargs["system"]:
            return {"questions": [{"id": "q1", "category": "behavioral", "question": "Why this role?", "what_we_look_for": "specifics"}]}
        if "Evaluate" in kwargs["system"]:
            return {"score": 8, "strengths": ["Clear"], "gaps": [], "improved_answer_example": "Example"}
        if "resume parser" in kwargs["system"]:
            return {"skills": []}
        return {"mission_guess": "Preparation", "talking_points": [], "smart_questions_to_ask": [], "watch_outs": []}

    def chat_text(self, **kwargs):
        self.calls += 1
        if self.fail:
            raise RuntimeError("synthetic failure")
        return "## Summary\nSaved work\n\nATS Keywords: Python"


@pytest.fixture
def setup(tmp_path):
    repository = SQLiteRepository(tmp_path / "api.sqlite3")
    provider = FakeProvider()
    with TestClient(create_app(repository=repository, provider=provider)) as client:
        yield client, repository, provider


def test_cheap_reads_and_strict_validation(setup):
    client, _, provider = setup
    assert client.get("/api/profile").json()["revision"] == 0
    contexts = client.get("/api/jobs").json()
    assert len(contexts) == 10
    assert not contexts[0]["shortlisted"]
    assert client.get(f"/api/jobs/{JOB_ID}/dossier").json() is None
    assert client.get(f"/api/resume/{JOB_ID}/documents").json()["tailored_resume"] is None
    assert provider.calls == 0
    for value in ({"experience_years": -1}, {"name": None}, {"skills": "Python"}, {"experience_years": "3"}):
        result = client.patch("/api/profile", json=value)
        assert result.status_code == 422
        assert result.json()["code"] == "validation_error"
    assert client.post("/api/jobs/shortlist", json={"job_id": JOB_ID, "status": "invalid"}).status_code == 422
    assert client.post("/api/resume/cover-letter", json={"job_id": JOB_ID, "tone": "invalid"}).status_code == 422


def test_profile_conflict_shortlist_and_restart(setup):
    client, repository, _ = setup
    assert client.patch("/api/profile", json={"name": "Ada", "expected_revision": 0}).json()["revision"] == 1
    assert client.patch("/api/profile", json={"name": "late", "expected_revision": 0}).status_code == 409
    first = client.post("/api/jobs/shortlist", json={"job_id": JOB_ID, "status": "applied", "notes": "keep"}).json()
    assert client.post("/api/jobs/shortlist", json={"job_id": JOB_ID}).json() == first
    updated = client.patch(f"/api/jobs/shortlist/{JOB_ID}", json={"notes": "edited"}).json()
    assert updated["status"] == "applied"
    assert client.patch(f"/api/jobs/shortlist/{JOB_ID}", json={"job_id": "other", "notes": "no"}).status_code == 422
    with TestClient(create_app(repository=SQLiteRepository(repository.path))) as restarted:
        assert restarted.get("/api/profile").json()["name"] == "Ada"
        assert restarted.get("/api/jobs/shortlist").json()[0]["notes"] == "edited"


def test_artifacts_cached_retained_and_stale(setup):
    client, _, provider = setup
    client.patch("/api/profile", json={"resume_text": "Python developer"})
    initial = client.post("/api/resume/tailor", json={"job_id": JOB_ID}).json()
    assert initial["profile_revision"] == 1
    assert client.post("/api/resume/tailor", json={"job_id": JOB_ID}).json() == initial
    assert provider.calls == 1
    client.delete(f"/api/jobs/shortlist/{JOB_ID}")
    client.patch("/api/profile", json={"name": "Updated"})
    assert client.get(f"/api/resume/{JOB_ID}/documents").json()["tailored_resume"]["is_stale"]
    assert client.get("/api/jobs").json()[0]["has_preparation"]


def test_upload_replaces_missing_facts_and_preserves_selected_location(setup):
    client, _, _ = setup
    client.patch("/api/profile", json={"name": "Old", "skills": ["Go"], "preferred_location": "Bangkok"})
    result = client.post("/api/profile/upload", data={"pasted_text": "New resume"})
    assert result.status_code == 200
    assert result.json()["name"] == ""
    assert result.json()["skills"] == []
    assert result.json()["preferred_location"] == "Bangkok"


def test_session_canonical_question_draft_feedback_and_history(setup):
    client, _, provider = setup
    session = client.post("/api/interview/questions", json={"job_id": JOB_ID}).json()
    sid = session["session_id"]
    assert client.post("/api/interview/questions", json={"job_id": JOB_ID}).json()["session_id"] == sid
    invalid = {"job_id": JOB_ID, "session_id": sid, "question_id": "invented", "answer": "answer"}
    assert client.post("/api/interview/evaluate", json=invalid).status_code == 404
    invalid.update(question_id="q1", question="Tampered")
    assert client.post("/api/interview/evaluate", json=invalid).status_code == 422
    assert provider.calls == 1
    result = client.post("/api/interview/evaluate", json={"job_id": JOB_ID, "session_id": sid, "question_id": "q1", "answer": "answer"})
    assert result.status_code == 200
    assert result.json()["submitted_answer"] == "answer"
    draft = client.patch(f"/api/interview/{JOB_ID}/session/answers/q1", json={"session_id": sid, "answer": "edited", "expected_version": 1}).json()
    assert draft["feedback"] == {}
    new = client.post("/api/interview/questions", json={"job_id": JOB_ID, "regenerate": True}).json()
    assert len(new["history"]) == 2
    old = client.get(f"/api/interview/{JOB_ID}/session", params={"session_id": sid}).json()
    assert old["answers"]["q1"] == "edited"
    assert not old["is_current"]
    assert client.patch(f"/api/interview/{JOB_ID}/session/answers/q1", json={"session_id": sid, "answer": "no"}).status_code == 409
