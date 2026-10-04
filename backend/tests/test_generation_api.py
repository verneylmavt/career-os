"""API-level generation checks with isolated SQLite and zero real AI calls."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import io
import json
import threading

from fastapi.testclient import TestClient
from pypdf import PdfWriter
import pytest

from app.main import create_app
from app.repository import SQLiteRepository
from app.services.gemini_client import GeminiProvider
from test_persistence_api import FakeProvider, JOB_ID


@pytest.fixture
def setup(tmp_path):
    repository = SQLiteRepository(tmp_path / "generation.sqlite3")
    provider = FakeProvider()
    with TestClient(create_app(repository=repository, provider=provider)) as client:
        yield client, repository, provider


def test_feedback_cache_includes_model_prompt_and_answer(setup):
    client, _, provider = setup
    session = client.post("/api/interview/questions", json={"job_id": JOB_ID}).json()
    payload = {"job_id": JOB_ID, "session_id": session["session_id"], "question_id": "q1", "answer": "A useful example"}
    first = client.post("/api/interview/evaluate", json=payload).json()
    calls = provider.calls
    assert client.post("/api/interview/evaluate", json=payload).json() == first
    assert provider.calls == calls
    provider.model = "new-model"
    assert client.post("/api/interview/evaluate", json=payload).json()["model"] == "new-model"
    assert provider.calls == calls + 1
    provider.version = "new-prompt"
    assert client.post("/api/interview/evaluate", json=payload).json()["prompt_version"] == "new-prompt"
    assert provider.calls == calls + 2
    assert client.post("/api/interview/evaluate", json={**payload, "regenerate": True}).status_code == 200
    assert provider.calls == calls + 3


def test_failed_regeneration_preserves_document_session_and_feedback(setup):
    client, _, provider = setup
    client.patch("/api/profile", json={"resume_text": "Python developer"})
    document = client.post("/api/resume/tailor", json={"job_id": JOB_ID}).json()
    session = client.post("/api/interview/questions", json={"job_id": JOB_ID}).json()
    sid = session["session_id"]
    payload = {"job_id": JOB_ID, "session_id": sid, "question_id": "q1", "answer": "A useful example"}
    feedback = client.post("/api/interview/evaluate", json=payload).json()
    provider.fail = True
    result = client.post("/api/resume/tailor", json={"job_id": JOB_ID, "regenerate": True})
    assert result.status_code == 503
    assert result.json() == {"detail": "Synthetic service failure", "code": "provider_unavailable", "retryable": True}
    assert client.get(f"/api/resume/{JOB_ID}/documents").json()["tailored_resume"] == document
    assert client.post("/api/interview/questions", json={"job_id": JOB_ID, "regenerate": True}).status_code == 503
    assert client.get(f"/api/interview/{JOB_ID}/session").json()["session_id"] == sid
    assert client.post("/api/interview/evaluate", json={**payload, "regenerate": True}).status_code == 503
    assert client.get(f"/api/interview/{JOB_ID}/session").json()["feedback"]["q1"] == feedback


def test_upload_bounds_and_formats_do_not_touch_provider_or_profile(setup):
    client, repository, provider = setup
    original = repository.get_profile()
    assert client.post("/api/profile/upload", files={"file": ("resume.exe", b"text")}).status_code == 415
    assert client.post("/api/profile/upload", files={"file": ("resume.txt", b"\xff")}).status_code == 400
    assert client.post("/api/profile/upload", files={"file": ("resume.txt", b"x" * (5 * 1024 * 1024 + 1))}).status_code == 413
    assert client.post("/api/profile/upload", data={"pasted_text": "x" * 40001}).status_code == 413
    assert client.post("/api/profile/upload", files={"file": ("resume.pdf", b"invalid PDF")}).status_code == 400
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buffer = io.BytesIO()
    writer.write(buffer)
    assert client.post("/api/profile/upload", files={"file": ("resume.pdf", buffer.getvalue())}).status_code == 400
    writer.encrypt("secret")
    encrypted = io.BytesIO()
    writer.write(encrypted)
    assert client.post("/api/profile/upload", files={"file": ("resume.pdf", encrypted.getvalue())}).status_code == 400
    too_many = PdfWriter()
    for _ in range(26):
        too_many.add_blank_page(width=100, height=100)
    pages = io.BytesIO()
    too_many.write(pages)
    assert client.post("/api/profile/upload", files={"file": ("resume.pdf", pages.getvalue())}).status_code == 413
    assert provider.calls == 0
    assert repository.get_profile() == original


def test_upload_cas_and_full_bounded_text(setup):
    client, _, provider = setup
    client.patch("/api/profile", json={"name": "Current"})
    assert client.post("/api/profile/upload", data={"pasted_text": "new", "expected_revision": 0}).status_code == 409
    assert provider.calls == 0
    text = "First part. " + "a" * 12000 + " Final source fact."
    result = client.post("/api/profile/upload", files={"file": ("resume.md", text.encode())}, data={"expected_revision": 1})
    assert result.status_code == 200
    assert result.json()["resume_text"] == text
    assert json.loads(provider.last_user)["resume_source"] == text


def test_missing_credentials_boots_and_reads_are_available(tmp_path):
    provider = GeminiProvider(environment={})
    with TestClient(create_app(SQLiteRepository(tmp_path / "no-key.sqlite3"), provider)) as client:
        assert client.get("/api/jobs").status_code == 200
        assert client.get("/api/profile").status_code == 200
        assert client.get("/api/dashboard/stats").status_code == 200
        result = client.post("/api/interview/questions", json={"job_id": JOB_ID})
        assert result.status_code == 503
        assert result.json()["code"] == "provider_unconfigured"
        assert not result.json()["retryable"]


class DelayedProvider(FakeProvider):
    def __init__(self, delayed_operation):
        self.delayed_operation = delayed_operation
        self.entered = threading.Event()
        self.release = threading.Event()
        self.delayed_once = False

    async def generate(self, operation, system, user, response_schema):
        if operation == self.delayed_operation and not self.delayed_once:
            self.delayed_once = True
            self.entered.set()
            while not self.release.is_set():
                await asyncio.sleep(0.005)
        return await super().generate(operation, system, user, response_schema)


@pytest.mark.parametrize("change", ["profile", "draft", "session"])
def test_delayed_evaluation_cannot_overwrite_new_state(tmp_path, change):
    provider = DelayedProvider("evaluation")
    repository = SQLiteRepository(tmp_path / "late.sqlite3")
    with TestClient(create_app(repository, provider)) as client, ThreadPoolExecutor(max_workers=1) as executor:
        session = client.post("/api/interview/questions", json={"job_id": JOB_ID}).json()
        sid = session["session_id"]
        payload = {"job_id": JOB_ID, "session_id": sid, "question_id": "q1", "answer": "A useful example"}
        future = executor.submit(client.post, "/api/interview/evaluate", json=payload)
        assert provider.entered.wait(timeout=5)
        try:
            if change == "profile":
                assert client.patch("/api/profile", json={"name": "Changed"}).status_code == 200
            elif change == "draft":
                assert client.patch(f"/api/interview/{JOB_ID}/session/answers/q1", json={"session_id": sid, "answer": "Newer draft"}).status_code == 200
            else:
                assert client.post("/api/interview/questions", json={"job_id": JOB_ID, "regenerate": True}).status_code == 200
        finally:
            provider.release.set()
        assert future.result(timeout=5).status_code == 409
        assert client.get(f"/api/interview/{JOB_ID}/session", params={"session_id": sid}).json()["feedback"] == {}


def test_overlapping_upload_latest_request_wins(tmp_path):
    provider = DelayedProvider("extraction")
    repository = SQLiteRepository(tmp_path / "uploads.sqlite3")
    with TestClient(create_app(repository, provider)) as client, ThreadPoolExecutor(max_workers=1) as executor:
        old = executor.submit(client.post, "/api/profile/upload", data={"pasted_text": "Old source"})
        assert provider.entered.wait(timeout=5)
        try:
            newer = client.post("/api/profile/upload", data={"pasted_text": "New source"})
            assert newer.status_code == 200
        finally:
            provider.release.set()
        assert old.result(timeout=5).status_code == 409
        assert client.get("/api/profile").json()["resume_text"] == "New source"


def test_slow_pdf_cannot_supersede_newer_pasted_upload(tmp_path, monkeypatch):
    parsing = threading.Event()
    release = threading.Event()

    def slow_read_pdf(data):
        parsing.set()
        assert release.wait(timeout=5)
        return "Old PDF source"

    monkeypatch.setattr("app.routers.profile.read_pdf", slow_read_pdf)
    repository = SQLiteRepository(tmp_path / "slow-pdf.sqlite3")
    provider = DelayedProvider("extraction")
    with TestClient(create_app(repository, provider)) as client, ThreadPoolExecutor(max_workers=2) as executor:
        older = executor.submit(client.post, "/api/profile/upload", files={"file": ("old.pdf", b"synthetic PDF")})
        assert parsing.wait(timeout=5)
        newer = executor.submit(client.post, "/api/profile/upload", data={"pasted_text": "New pasted source"})
        assert provider.entered.wait(timeout=5)
        try:
            release.set()
            assert older.result(timeout=5).status_code == 409
        finally:
            release.set()
            provider.release.set()
        assert newer.result(timeout=5).status_code == 200
        assert client.get("/api/profile").json()["resume_text"] == "New pasted source"


def test_disconnected_upload_does_not_replace_saved_profile(setup, monkeypatch):
    client, repository, provider = setup
    repository.patch_profile({"name": "Saved", "resume_text": "Original source"})
    original = repository.get_profile()

    async def disconnected(request):
        return provider.calls > 0

    monkeypatch.setattr("starlette.requests.Request.is_disconnected", disconnected)
    result = client.post("/api/profile/upload", data={"pasted_text": "Replacement source"})
    assert result.status_code == 499
    assert result.json()["code"] == "request_cancelled"
    assert repository.get_profile() == original


def test_upload_location_provenance_is_internal_and_no_candidate_fact_leaks(setup):
    client, _, provider = setup
    locations = iter(["Singapore", "", "Tokyo", "London"])

    async def extraction(operation, system, user, response_schema):
        return response_schema.model_validate({"preferred_location": next(locations)})

    provider.generate = extraction
    first = client.post("/api/profile/upload", data={"pasted_text": "First candidate"}).json()
    assert first["preferred_location"] == "Singapore"
    assert "location_is_manual" not in first
    assert client.post("/api/profile/upload", data={"pasted_text": "Second candidate"}).json()["preferred_location"] == ""
    client.patch("/api/profile", json={"preferred_location": "Bangkok"})
    assert client.post("/api/profile/upload", data={"pasted_text": "Third candidate"}).json()["preferred_location"] == "Bangkok"
    client.patch("/api/profile", json={"preferred_location": ""})
    assert client.post("/api/profile/upload", data={"pasted_text": "Fourth candidate"}).json()["preferred_location"] == ""


def test_invalid_model_output_never_replaces_saved_artifact(setup):
    client, _, provider = setup
    client.patch("/api/profile", json={"resume_text": "Python developer"})
    original = client.post("/api/resume/tailor", json={"job_id": JOB_ID}).json()

    async def invalid(operation, system, user, response_schema):
        return {"tailored_resume_md": "Invented"}

    provider.generate = invalid
    result = client.post("/api/resume/tailor", json={"job_id": JOB_ID, "regenerate": True})
    assert result.status_code == 502
    assert result.json()["code"] == "generation_invalid"
    assert client.get(f"/api/resume/{JOB_ID}/documents").json()["tailored_resume"] == original


def test_ungrounded_model_output_is_rejected(setup):
    client, _, provider = setup
    client.patch("/api/profile", json={"resume_text": "Python developer"})

    async def ungrounded(operation, system, user, response_schema):
        return response_schema.model_validate({"tailored_resume_md": "Managed a team", "summary_rewrite": "Manager", "ats_keywords": [], "source_excerpts": [{"claim": "Managed a team", "source_excerpt": "Managed a team"}]})

    provider.generate = ungrounded
    result = client.post("/api/resume/tailor", json={"job_id": JOB_ID})
    assert result.status_code == 502
    assert result.json()["code"] == "unsupported_claim"
    assert client.get(f"/api/resume/{JOB_ID}/documents").json()["tailored_resume"] is None


def test_public_email_validation(setup):
    client, _, _ = setup
    assert client.patch("/api/profile", json={"email": "invalid"}).status_code == 422
    assert client.patch("/api/profile", json={"email": "ada@example.com"}).status_code == 200
    assert client.patch("/api/profile", json={"email": ""}).status_code == 200
