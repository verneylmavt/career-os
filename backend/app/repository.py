"""Durable SQLite state. Each operation owns a short connection/transaction."""
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any
from uuid import uuid4

from .data_utils import load_jobs_list
from .schemas import ProfileFacts, ProfileUpdate, ShortlistPatch, Status


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def encoded(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


class RepositoryError(Exception):
    def __init__(self, detail: str, code: str = "conflict", status_code: int = 409):
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class GenerationTicket:
    token: str
    target: str
    kind: str
    job_id: str
    options: dict[str, Any]
    profile_revision: int
    model: str
    prompt_version: str
    cache_key: str
    session_id: str | None = None
    question_id: str | None = None
    answer_version: int | None = None


class SQLiteRepository:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    @contextmanager
    def connection(self, write: bool = False):
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        try:
            if write:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            if write:
                connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
        with self.connection(write=True) as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > 3:
                raise RuntimeError("CareerOS database version is newer than this application")
            if version == 0:
                statements = [
                    "CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK(id=1), facts TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)",
                    "CREATE TABLE jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
                    "CREATE TABLE shortlist (job_id TEXT PRIMARY KEY REFERENCES jobs(id), status TEXT NOT NULL CHECK(status IN ('saved','applied','interviewing','offer','rejected')), notes TEXT NOT NULL, added_at TEXT NOT NULL)",
                    "CREATE TABLE artifacts (kind TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), options TEXT NOT NULL, cache_key TEXT NOT NULL, profile_revision INTEGER NOT NULL, payload TEXT NOT NULL, generated_at TEXT NOT NULL, model TEXT NOT NULL, prompt_version TEXT NOT NULL, PRIMARY KEY(kind,job_id,options))",
                    "CREATE TABLE sessions (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), profile_revision INTEGER NOT NULL, created_at TEXT NOT NULL, is_current INTEGER NOT NULL, questions TEXT NOT NULL, cache_key TEXT NOT NULL, model TEXT NOT NULL, prompt_version TEXT NOT NULL)",
                    "CREATE UNIQUE INDEX current_session ON sessions(job_id) WHERE is_current=1",
                    "CREATE TABLE answers (session_id TEXT NOT NULL REFERENCES sessions(id), question_id TEXT NOT NULL, answer TEXT NOT NULL, version INTEGER NOT NULL, feedback TEXT, PRIMARY KEY(session_id,question_id))",
                    "CREATE TABLE generation_tickets (target TEXT PRIMARY KEY, token TEXT NOT NULL)",
                ]
                for statement in statements:
                    db.execute(statement)
                db.execute("PRAGMA user_version=1")
            if version < 2:
                db.execute("ALTER TABLE answers ADD COLUMN feedback_cache_key TEXT")
                db.execute("PRAGMA user_version=2")
            if version < 3:
                db.execute("ALTER TABLE profile ADD COLUMN location_is_manual INTEGER NOT NULL DEFAULT 0 CHECK(location_is_manual IN (0,1))")
                db.execute("PRAGMA user_version=3")
            db.execute("INSERT OR IGNORE INTO profile (id,facts,revision,updated_at) VALUES (1,?,?,?)", (encoded(ProfileFacts().model_dump()), 0, timestamp()))
            for job in load_jobs_list():
                db.execute("INSERT INTO jobs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", (job["id"], encoded(job)))

    def _profile(self, db) -> dict[str, Any]:
        row = db.execute("SELECT * FROM profile WHERE id=1").fetchone()
        return {**json.loads(row["facts"]), "revision": row["revision"], "updated_at": row["updated_at"]}

    def get_profile(self) -> dict[str, Any]:
        with self.connection() as db:
            return self._profile(db)

    def patch_profile(self, patch: dict[str, Any], expected_revision: int | None = None) -> dict[str, Any]:
        checked = ProfileUpdate.model_validate(patch).model_dump(exclude_unset=True)
        expected_revision = checked.pop("expected_revision", expected_revision)
        with self.connection(write=True) as db:
            profile = self._profile(db)
            if expected_revision is not None and profile["revision"] != expected_revision:
                raise RepositoryError("Profile changed. Reload before saving.", "profile_revision_conflict")
            facts = {key: profile[key] for key in ProfileFacts.model_fields}
            facts.update(checked)
            if "preferred_location" in checked:
                db.execute("UPDATE profile SET location_is_manual=1 WHERE id=1")
            if facts == {key: profile[key] for key in ProfileFacts.model_fields}:
                return profile
            db.execute("UPDATE profile SET facts=?, revision=revision+1, updated_at=? WHERE id=1", (encoded(facts), timestamp()))
            return self._profile(db)

    def replace_profile(self, facts: dict[str, Any], expected_revision: int | None = None) -> dict[str, Any]:
        defaults = ProfileFacts.model_validate(facts).model_dump()
        with self.connection(write=True) as db:
            old = self._profile(db)
            if expected_revision is not None and old["revision"] != expected_revision:
                raise RepositoryError("Profile changed while parsing. Reload and try again.", "profile_revision_conflict")
            if db.execute("SELECT location_is_manual FROM profile WHERE id=1").fetchone()[0]:
                defaults["preferred_location"] = old["preferred_location"]
            db.execute("UPDATE profile SET facts=?, revision=revision+1, updated_at=? WHERE id=1", (encoded(defaults), timestamp()))
            return self._profile(db)

    def commit_profile(self, ticket: GenerationTicket, facts: dict[str, Any]) -> dict[str, Any]:
        defaults = ProfileFacts.model_validate(facts).model_dump()
        with self.connection(write=True) as db:
            self._check_ticket(db, ticket)
            old = self._profile(db)
            if db.execute("SELECT location_is_manual FROM profile WHERE id=1").fetchone()[0]:
                defaults["preferred_location"] = old["preferred_location"]
            db.execute("UPDATE profile SET facts=?, revision=revision+1, updated_at=? WHERE id=1", (encoded(defaults), timestamp()))
            return self._profile(db)

    def _shortlist_row(self, row) -> dict[str, Any]:
        return {"job": json.loads(row["payload"]), "status": row["status"], "notes": row["notes"], "added_at": row["added_at"]}

    def list_shortlist(self) -> list[dict[str, Any]]:
        with self.connection() as db:
            return [self._shortlist_row(row) for row in db.execute("SELECT s.*, j.payload FROM shortlist s JOIN jobs j ON j.id=s.job_id ORDER BY s.added_at, s.job_id")]

    def add_shortlist(self, job: dict[str, Any], status: Status = "saved", notes: str = "") -> dict[str, Any]:
        ShortlistPatch.model_validate({"status": status, "notes": notes})
        with self.connection(write=True) as db:
            db.execute("INSERT OR IGNORE INTO jobs VALUES (?,?)", (job["id"], encoded(job)))
            db.execute("INSERT OR IGNORE INTO shortlist VALUES (?,?,?,?)", (job["id"], status, notes, timestamp()))
            return self._shortlist_row(db.execute("SELECT s.*, j.payload FROM shortlist s JOIN jobs j ON j.id=s.job_id WHERE s.job_id=?", (job["id"],)).fetchone())

    def patch_shortlist(self, job_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        checked = ShortlistPatch.model_validate(patch).model_dump(exclude_unset=True)
        if "job_id" in checked and checked.pop("job_id") != job_id:
            raise RepositoryError("Body job_id must match path", "job_id_mismatch", 422)
        with self.connection(write=True) as db:
            if not db.execute("SELECT 1 FROM shortlist WHERE job_id=?", (job_id,)).fetchone():
                raise RepositoryError("Not in shortlist", "shortlist_not_found", 404)
            for field, value in checked.items():
                db.execute(f"UPDATE shortlist SET {field}=? WHERE job_id=?", (value, job_id))
            return self._shortlist_row(db.execute("SELECT s.*, j.payload FROM shortlist s JOIN jobs j ON j.id=s.job_id WHERE s.job_id=?", (job_id,)).fetchone())

    def remove_shortlist(self, job_id: str) -> None:
        with self.connection(write=True) as db:
            db.execute("DELETE FROM shortlist WHERE job_id=?", (job_id,))

    def job_contexts(self) -> list[dict[str, Any]]:
        with self.connection() as db:
            rows = db.execute("SELECT j.payload, EXISTS(SELECT 1 FROM shortlist s WHERE s.job_id=j.id) shortlisted, (EXISTS(SELECT 1 FROM artifacts a WHERE a.job_id=j.id) OR EXISTS(SELECT 1 FROM sessions s WHERE s.job_id=j.id)) has_preparation FROM jobs j ORDER BY j.rowid")
            return [{"job": json.loads(row["payload"]), "shortlisted": bool(row["shortlisted"]), "has_preparation": bool(row["has_preparation"])} for row in rows]

    def begin_generation(self, kind: str, job_id: str, options: dict[str, Any], model: str, prompt_version: str, *, session_id: str | None = None, question_id: str | None = None, answer_version: int | None = None, expected_revision: int | None = None) -> GenerationTicket:
        with self.connection(write=True) as db:
            profile_revision = self._profile(db)["revision"]
            if expected_revision is not None and profile_revision != expected_revision:
                raise RepositoryError("Profile changed before generation started", "profile_revision_conflict")
            target = encoded([kind, job_id, options, session_id, question_id])
            job = db.execute("SELECT payload FROM jobs WHERE id=?", (job_id,)).fetchone()
            if job is None and kind != "profile_upload":
                raise RepositoryError("Job not found", "job_not_found", 404)
            evaluation_inputs = None
            if session_id is not None:
                session = self._check_session(db, job_id, session_id, question_id, writable=True)
                if session["profile_revision"] != profile_revision:
                    raise RepositoryError("Profile changed. Generate a new interview session before evaluating.", "session_stale")
                answer = db.execute("SELECT version, answer FROM answers WHERE session_id=? AND question_id=?", (session_id, question_id)).fetchone()
                if answer is None or answer["version"] != answer_version:
                    raise RepositoryError("Answer changed before evaluation", "answer_version_conflict")
                question = next(question for question in json.loads(session["questions"]) if question["id"] == question_id)
                evaluation_inputs = [session_id, question, answer_version, answer["answer"]]
            cache_key = hashlib.sha256(encoded([kind, job_id, job[0] if job else None, options, profile_revision, model, prompt_version, evaluation_inputs]).encode()).hexdigest()
            ticket = GenerationTicket(uuid4().hex, target, kind, job_id, dict(options), profile_revision, model, prompt_version, cache_key, session_id, question_id, answer_version)
            db.execute("INSERT INTO generation_tickets VALUES (?,?) ON CONFLICT(target) DO UPDATE SET token=excluded.token", (target, ticket.token))
            return ticket

    def _check_ticket(self, db, ticket: GenerationTicket) -> None:
        row = db.execute("SELECT token FROM generation_tickets WHERE target=?", (ticket.target,)).fetchone()
        if not row or row[0] != ticket.token:
            raise RepositoryError("A newer request replaced this generation", "generation_superseded")
        if self._profile(db)["revision"] != ticket.profile_revision:
            raise RepositoryError("Profile changed during generation", "profile_revision_conflict")
        if ticket.session_id:
            self._check_session(db, ticket.job_id, ticket.session_id, ticket.question_id, writable=True)
            row = db.execute("SELECT version FROM answers WHERE session_id=? AND question_id=?", (ticket.session_id, ticket.question_id)).fetchone()
            if row is None or row[0] != ticket.answer_version:
                raise RepositoryError("Answer changed during evaluation", "answer_version_conflict")

    def _artifact_row(self, row, revision: int) -> dict[str, Any] | None:
        if row is None:
            return None
        return {**json.loads(row["payload"]), "job_id": row["job_id"], "profile_revision": row["profile_revision"], "generated_at": row["generated_at"], "model": row["model"], "prompt_version": row["prompt_version"], "is_stale": row["profile_revision"] != revision}

    def get_artifact(self, kind: str, job_id: str, options: dict[str, Any] | None = None) -> dict[str, Any] | None:
        with self.connection() as db:
            row = db.execute("SELECT * FROM artifacts WHERE kind=? AND job_id=? AND options=?", (kind, job_id, encoded(options or {}))).fetchone()
            return self._artifact_row(row, self._profile(db)["revision"])

    def cached_artifact(self, ticket: GenerationTicket) -> dict[str, Any] | None:
        with self.connection() as db:
            row = db.execute("SELECT * FROM artifacts WHERE kind=? AND job_id=? AND options=? AND cache_key=?", (ticket.kind, ticket.job_id, encoded(ticket.options), ticket.cache_key)).fetchone()
            return self._artifact_row(row, self._profile(db)["revision"])

    def commit_artifact(self, ticket: GenerationTicket, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connection(write=True) as db:
            self._check_ticket(db, ticket)
            db.execute("INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(kind,job_id,options) DO UPDATE SET cache_key=excluded.cache_key, profile_revision=excluded.profile_revision, payload=excluded.payload, generated_at=excluded.generated_at, model=excluded.model, prompt_version=excluded.prompt_version", (ticket.kind, ticket.job_id, encoded(ticket.options), ticket.cache_key, ticket.profile_revision, encoded(payload), timestamp(), ticket.model, ticket.prompt_version))
            row = db.execute("SELECT * FROM artifacts WHERE kind=? AND job_id=? AND options=?", (ticket.kind, ticket.job_id, encoded(ticket.options))).fetchone()
            return self._artifact_row(row, ticket.profile_revision)

    def _check_session(self, db, job_id: str, session_id: str, question_id: str | None = None, writable: bool = False):
        row = db.execute("SELECT * FROM sessions WHERE id=? AND job_id=?", (session_id, job_id)).fetchone()
        if row is None:
            raise RepositoryError("Interview session not found", "session_not_found", 404)
        if writable and not row["is_current"]:
            raise RepositoryError("Archived sessions are read-only", "session_archived")
        if question_id is not None and not any(q["id"] == question_id for q in json.loads(row["questions"])):
            raise RepositoryError("Question not found in this session", "question_not_found", 404)
        return row

    def _session(self, db, job_id: str, session_id: str | None = None) -> dict[str, Any]:
        revision = self._profile(db)["revision"]
        history = [{"session_id": row["id"], "created_at": row["created_at"], "evaluated_count": row["evaluated_count"], "is_current": bool(row["is_current"]), "is_stale": row["profile_revision"] != revision} for row in db.execute("SELECT s.*, (SELECT COUNT(*) FROM answers a WHERE a.session_id=s.id AND a.feedback IS NOT NULL) evaluated_count FROM sessions s WHERE s.job_id=? ORDER BY s.created_at DESC", (job_id,))]
        row = self._check_session(db, job_id, session_id) if session_id else db.execute("SELECT * FROM sessions WHERE job_id=? AND is_current=1", (job_id,)).fetchone()
        result = {"job_id": job_id, "session_id": None, "profile_revision": revision, "created_at": None, "generated_at": None, "model": None, "prompt_version": None, "is_stale": False, "is_current": False, "questions": [], "answers": {}, "answer_versions": {}, "scores": {}, "feedback": {}, "history": history}
        if row is None:
            return result
        result.update(session_id=row["id"], profile_revision=row["profile_revision"], created_at=row["created_at"], generated_at=row["created_at"], model=row["model"], prompt_version=row["prompt_version"], is_stale=row["profile_revision"] != revision, is_current=bool(row["is_current"]), questions=json.loads(row["questions"]))
        for answer in db.execute("SELECT * FROM answers WHERE session_id=?", (row["id"],)):
            qid = answer["question_id"]
            result["answers"][qid] = answer["answer"]
            result["answer_versions"][qid] = answer["version"]
            if answer["feedback"]:
                feedback = json.loads(answer["feedback"])
                feedback["is_stale"] = row["profile_revision"] != revision
                result["feedback"][qid] = feedback
                result["scores"][qid] = feedback["score"]
        return result

    def get_session(self, job_id: str, session_id: str | None = None) -> dict[str, Any]:
        with self.connection() as db:
            return self._session(db, job_id, session_id)

    def cached_session(self, ticket: GenerationTicket) -> dict[str, Any] | None:
        with self.connection() as db:
            row = db.execute("SELECT id FROM sessions WHERE job_id=? AND is_current=1 AND cache_key=?", (ticket.job_id, ticket.cache_key)).fetchone()
            return self._session(db, ticket.job_id, row[0]) if row else None

    def create_session(self, ticket: GenerationTicket, questions: list[dict[str, Any]]) -> dict[str, Any]:
        ids = [q.get("id") for q in questions]
        if not questions or any(not isinstance(qid, str) or not qid for qid in ids) or len(set(ids)) != len(ids):
            raise RepositoryError("Invalid interview questions", "invalid_model_output", 502)
        with self.connection(write=True) as db:
            self._check_ticket(db, ticket)
            db.execute("UPDATE sessions SET is_current=0 WHERE job_id=?", (ticket.job_id,))
            sid = uuid4().hex
            db.execute("INSERT INTO sessions VALUES (?,?,?,?,1,?,?,?,?)", (sid, ticket.job_id, ticket.profile_revision, timestamp(), encoded(questions), ticket.cache_key, ticket.model, ticket.prompt_version))
            return self._session(db, ticket.job_id, sid)

    def save_answer(self, job_id: str, session_id: str, question_id: str, answer: str, expected_version: int | None = None) -> dict[str, Any]:
        with self.connection(write=True) as db:
            self._check_session(db, job_id, session_id, question_id, writable=True)
            old = db.execute("SELECT * FROM answers WHERE session_id=? AND question_id=?", (session_id, question_id)).fetchone()
            version = old["version"] if old else 0
            if expected_version is not None and expected_version != version:
                raise RepositoryError("Draft changed. Reload before saving.", "answer_version_conflict")
            if old is None or old["answer"] != answer:
                db.execute("INSERT INTO answers (session_id,question_id,answer,version,feedback,feedback_cache_key) VALUES (?,?,?,?,NULL,NULL) ON CONFLICT(session_id,question_id) DO UPDATE SET answer=excluded.answer, version=excluded.version, feedback=NULL, feedback_cache_key=NULL", (session_id, question_id, answer, version + 1))
            return self._session(db, job_id, session_id)

    def commit_feedback(self, ticket: GenerationTicket, feedback: dict[str, Any]) -> dict[str, Any]:
        with self.connection(write=True) as db:
            self._check_ticket(db, ticket)
            answer = db.execute("SELECT answer FROM answers WHERE session_id=? AND question_id=?", (ticket.session_id, ticket.question_id)).fetchone()[0]
            output = {**feedback, "submitted_answer": answer, "job_id": ticket.job_id, "profile_revision": ticket.profile_revision, "generated_at": timestamp(), "model": ticket.model, "prompt_version": ticket.prompt_version, "is_stale": False}
            db.execute("UPDATE answers SET feedback=?, feedback_cache_key=? WHERE session_id=? AND question_id=?", (encoded(output), ticket.cache_key, ticket.session_id, ticket.question_id))
            return output

    def cached_feedback(self, ticket: GenerationTicket) -> dict[str, Any] | None:
        with self.connection() as db:
            self._check_ticket(db, ticket)
            row = db.execute("SELECT feedback FROM answers WHERE session_id=? AND question_id=? AND version=? AND feedback_cache_key=?", (ticket.session_id, ticket.question_id, ticket.answer_version, ticket.cache_key)).fetchone()
            return json.loads(row["feedback"]) if row and row["feedback"] else None

    def preparation_counts(self) -> dict[str, int]:
        with self.connection() as db:
            return {kind: db.execute("SELECT COUNT(DISTINCT job_id) FROM artifacts WHERE kind=?", (kind,)).fetchone()[0] for kind in ("tailored_resume", "cover_letter")}

    def dashboard_snapshot(self) -> dict[str, Any]:
        """One short read snapshot keeps metrics consistent with the profile and stages."""
        with self.connection() as db:
            db.execute("BEGIN")
            profile = self._profile(db)
            shortlist = [self._shortlist_row(row) for row in db.execute("SELECT s.*, j.payload FROM shortlist s JOIN jobs j ON j.id=s.job_id ORDER BY s.added_at, s.job_id")]
            feedback = [json.loads(row[0]) for row in db.execute("SELECT a.feedback FROM answers a JOIN sessions s ON s.id=a.session_id JOIN shortlist l ON l.job_id=s.job_id WHERE s.is_current=1 AND s.profile_revision=? AND l.status IN ('saved','applied','interviewing') AND a.feedback IS NOT NULL", (profile["revision"],))]
            counts = {kind: db.execute("SELECT COUNT(DISTINCT job_id) FROM artifacts WHERE kind=?", (kind,)).fetchone()[0] for kind in ("tailored_resume", "cover_letter")}
            return {"profile": profile, "shortlist": shortlist, "feedback": feedback, "counts": counts}
