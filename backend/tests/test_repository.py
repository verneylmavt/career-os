import pytest
import sqlite3

from app.repository import RepositoryError, SQLiteRepository
from app.data_utils import load_jobs_list

JOB_ID = load_jobs_list()[0]["id"]


def repo(tmp_path):
    repository = SQLiteRepository(tmp_path / "career.sqlite3")
    repository.initialize()
    return repository


def test_restart_isolation_and_profile_revision(tmp_path):
    first = repo(tmp_path)
    updated = first.patch_profile({"name": "Ada", "skills": ["Python"]}, expected_revision=0)
    assert updated["revision"] == 1
    second = SQLiteRepository(first.path)
    second.initialize()
    assert second.get_profile()["name"] == "Ada"
    isolated = SQLiteRepository(tmp_path / "other.sqlite3")
    isolated.initialize()
    assert isolated.get_profile()["name"] == ""
    with pytest.raises(RepositoryError, match="changed"):
        second.patch_profile({"name": "stale"}, expected_revision=0)


def test_shortlist_is_idempotent_and_patch_is_partial(tmp_path):
    repository = repo(tmp_path)
    job = {"id": "role", "title": "Engineer"}
    first = repository.add_shortlist(job, "applied", "notes")
    assert repository.add_shortlist(job, "saved", "") == first
    updated = repository.patch_shortlist("role", {"notes": "updated"})
    assert updated["status"] == "applied"
    assert updated["added_at"] == first["added_at"]


def test_generation_tickets_reject_stale_profile_and_late_results(tmp_path):
    repository = repo(tmp_path)
    first = repository.begin_generation("tailored_resume", JOB_ID, {}, "fake", "v1")
    latest = repository.begin_generation("tailored_resume", JOB_ID, {}, "fake", "v1")
    with pytest.raises(RepositoryError):
        repository.commit_artifact(first, {"tailored_resume_md": "late"})
    repository.commit_artifact(latest, {"tailored_resume_md": "saved"})
    pending = repository.begin_generation("tailored_resume", JOB_ID, {}, "fake", "v1")
    repository.patch_profile({"name": "new"})
    with pytest.raises(RepositoryError):
        repository.commit_artifact(pending, {"tailored_resume_md": "stale"})
    assert repository.get_artifact("tailored_resume", JOB_ID)["tailored_resume_md"] == "saved"
    assert repository.get_artifact("tailored_resume", JOB_ID)["is_stale"]


def test_sessions_drafts_feedback_history_and_late_evaluation(tmp_path):
    repository = repo(tmp_path)
    ticket = repository.begin_generation("questions", JOB_ID, {}, "fake", "v1")
    session = repository.create_session(ticket, [{"id": "q1", "category": "behavioral", "question": "Why?", "what_we_look_for": "specifics"}])
    sid = session["session_id"]
    draft = repository.save_answer(JOB_ID, sid, "q1", "answer", expected_version=0)
    assert draft["answer_versions"]["q1"] == 1
    evaluation = repository.begin_generation("evaluation", JOB_ID, {}, "fake", "v1", session_id=sid, question_id="q1", answer_version=1)
    repository.commit_feedback(evaluation, {"score": 8, "submitted_answer": "answer"})
    assert repository.get_session(JOB_ID)["scores"]["q1"] == 8
    pending = repository.begin_generation("evaluation", JOB_ID, {}, "fake", "v1", session_id=sid, question_id="q1", answer_version=1)
    repository.save_answer(JOB_ID, sid, "q1", "edited", expected_version=1)
    with pytest.raises(RepositoryError):
        repository.commit_feedback(pending, {"score": 9})
    assert repository.get_session(JOB_ID)["feedback"] == {}
    regen = repository.begin_generation("questions", JOB_ID, {}, "fake", "v1")
    assert repository.get_session(JOB_ID)["session_id"] == sid
    current = repository.create_session(regen, [{"id": "q2", "question": "New?"}])
    assert current["session_id"] != sid
    assert len(current["history"]) == 2
    with pytest.raises(RepositoryError):
        repository.save_answer(JOB_ID, sid, "q1", "archived")
    reopened = SQLiteRepository(repository.path)
    reopened.initialize()
    assert reopened.get_session(JOB_ID, sid)["answers"]["q1"] == "edited"


def test_profile_replacement_does_not_inherit_candidate_facts(tmp_path):
    repository = repo(tmp_path)
    repository.patch_profile({"name": "Old", "email": "old@example.com", "skills": ["Go"], "preferred_location": "Bangkok"})
    profile = repository.replace_profile({"resume_text": "New resume"})
    assert profile["name"] == ""
    assert profile["skills"] == []
    assert profile["preferred_location"] == "Bangkok"


def test_upload_latest_ticket_wins_and_noop_patch_keeps_revision(tmp_path):
    repository = repo(tmp_path)
    first = repository.begin_generation("profile_upload", "", {}, "fake", "v1")
    newer = repository.begin_generation("profile_upload", "", {}, "fake", "v1")
    assert repository.patch_profile({})["revision"] == 0
    with pytest.raises(RepositoryError):
        repository.commit_profile(first, {"resume_text": "old"})
    assert repository.commit_profile(newer, {"resume_text": "new"})["revision"] == 1


def test_version_one_database_upgrades_without_losing_drafts(tmp_path):
    repository = repo(tmp_path)
    ticket = repository.begin_generation("questions", JOB_ID, {}, "fake", "v1")
    session = repository.create_session(ticket, [{"id": "q1", "question": "Question"}])
    repository.save_answer(JOB_ID, session["session_id"], "q1", "Keep this draft")
    with sqlite3.connect(repository.path) as db:
        db.execute("ALTER TABLE answers DROP COLUMN feedback_cache_key")
        db.execute("ALTER TABLE profile DROP COLUMN location_is_manual")
        db.execute("PRAGMA user_version=1")
    repository.initialize()
    assert repository.get_session(JOB_ID)["answers"]["q1"] == "Keep this draft"
    with sqlite3.connect(repository.path) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 3


def test_extracted_location_is_replaced_but_manual_preference_survives(tmp_path):
    repository = repo(tmp_path)
    repository.replace_profile({"resume_text": "First", "preferred_location": "Singapore"})
    assert repository.replace_profile({"resume_text": "Second"})["preferred_location"] == ""
    ticket = repository.begin_generation("profile_upload", "", {}, "fake", "v1")
    repository.commit_profile(ticket, {"resume_text": "Third", "preferred_location": "Tokyo"})
    ticket = repository.begin_generation("profile_upload", "", {}, "fake", "v1")
    assert repository.commit_profile(ticket, {"resume_text": "Fourth", "preferred_location": "Paris"})["preferred_location"] == "Paris"
    repository.patch_profile({"preferred_location": "Bangkok"})
    assert repository.replace_profile({"resume_text": "Fifth", "preferred_location": "London"})["preferred_location"] == "Bangkok"
    reopened = SQLiteRepository(repository.path)
    reopened.initialize()
    ticket = reopened.begin_generation("profile_upload", "", {}, "fake", "v1")
    assert reopened.commit_profile(ticket, {"resume_text": "Sixth"})["preferred_location"] == "Bangkok"
    reopened.patch_profile({"preferred_location": ""})
    assert reopened.replace_profile({"resume_text": "Seventh", "preferred_location": "Tokyo"})["preferred_location"] == ""


def test_selecting_existing_extracted_location_marks_manual_without_revision_change(tmp_path):
    repository = repo(tmp_path)
    extracted = repository.replace_profile({"resume_text": "First", "preferred_location": "Singapore"})
    assert repository.patch_profile({"preferred_location": "Singapore"})["revision"] == extracted["revision"]
    assert repository.replace_profile({"resume_text": "Second"})["preferred_location"] == "Singapore"


def test_version_two_profile_migrates_without_assuming_manual_preference(tmp_path):
    repository = repo(tmp_path)
    repository.replace_profile({"resume_text": "Old candidate", "preferred_location": "Singapore"})
    with sqlite3.connect(repository.path) as db:
        db.execute("ALTER TABLE profile DROP COLUMN location_is_manual")
        db.execute("PRAGMA user_version=2")
    repository.initialize()
    assert repository.get_profile()["preferred_location"] == "Singapore"
    assert repository.replace_profile({"resume_text": "New candidate"})["preferred_location"] == ""


def test_evaluation_preparation_checks_draft_version_before_any_mutation(tmp_path):
    repository = repo(tmp_path)
    ticket = repository.begin_generation("questions", JOB_ID, {}, "fake", "v1")
    session = repository.create_session(ticket, [{"id": "q1", "question": "Question"}])
    sid = session["session_id"]
    repository.save_answer(JOB_ID, sid, "q1", "Saved answer")
    accepted = repository.prepare_evaluation(JOB_ID, sid, "q1", "Saved answer", "fake", "v1", expected_revision=0, expected_version=1)
    repository.commit_feedback(accepted, {"score": 8})
    before = repository.get_session(JOB_ID)
    with pytest.raises(RepositoryError, match="Draft changed"):
        repository.prepare_evaluation(JOB_ID, sid, "q1", "Rejected answer", "fake", "v1", expected_revision=0, expected_version=0)
    assert repository.get_session(JOB_ID) == before
    assert repository.cached_feedback(accepted)["score"] == 8


def test_evaluation_preparation_excludes_concurrent_profile_writer(tmp_path, monkeypatch):
    repository = repo(tmp_path)
    ticket = repository.begin_generation("questions", JOB_ID, {}, "fake", "v1")
    session = repository.create_session(ticket, [{"id": "q1", "question": "Question"}])
    original_write_answer = repository._write_answer

    def check_write_excluded(db, *args, **kwargs):
        # At the moment the answer is changed, a second connection must be unable
        # to modify the profile between eligibility validation and ticket issue.
        with sqlite3.connect(repository.path, timeout=0) as concurrent:
            with pytest.raises(sqlite3.OperationalError, match="locked"):
                concurrent.execute("UPDATE profile SET revision=revision+1 WHERE id=1")
        return original_write_answer(db, *args, **kwargs)

    monkeypatch.setattr(repository, "_write_answer", check_write_excluded)
    evaluation = repository.prepare_evaluation(JOB_ID, session["session_id"], "q1", "Accepted answer", "fake", "v1", expected_revision=0, expected_version=0)
    assert evaluation.profile_revision == 0
    assert evaluation.answer_version == 1
    repository.commit_feedback(evaluation, {"score": 8})
    assert repository.get_session(JOB_ID)["answers"]["q1"] == "Accepted answer"
