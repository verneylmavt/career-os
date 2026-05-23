"""In-memory state store. Resets on server restart — fine for hackathon."""
from typing import Any

class Store:
    def __init__(self) -> None:
        self.profile: dict[str, Any] = {
            "name": "",
            "email": "",
            "resume_text": "",
            "skills": [],
            "experience_years": 0,
            "preferred_location": "",
        }
        self.shortlist: dict[str, dict[str, Any]] = {}  # job_id -> {job, status, notes, added_at}
        self.tailored_resumes: dict[str, str] = {}  # job_id -> tailored markdown
        self.cover_letters: dict[str, str] = {}  # job_id -> cover letter
        self.interview_sessions: dict[str, dict[str, Any]] = {}  # job_id -> {questions, answers, scores}

store = Store()
