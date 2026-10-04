"""Public request contracts and persisted candidate facts."""
from typing import Annotated, Literal

import re

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, field_validator, model_validator

Status = Literal["saved", "applied", "interviewing", "offer", "rejected"]
Tone = Literal["warm", "direct", "formal"]
Identifier = Annotated[StrictStr, Field(min_length=1, max_length=200)]
Answer = Annotated[StrictStr, Field(max_length=40000)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProfileFacts(StrictModel):
    name: Annotated[StrictStr, Field(max_length=200)] = ""
    email: Annotated[StrictStr, Field(max_length=320)] = ""
    resume_text: Annotated[StrictStr, Field(max_length=40000)] = ""
    skills: Annotated[list[Annotated[StrictStr, Field(min_length=1, max_length=100)]], Field(max_length=200)] = []
    experience_years: Annotated[StrictInt, Field(ge=0, le=80)] = 0
    preferred_location: Annotated[StrictStr, Field(max_length=200)] = ""

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        if value and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Provide a valid email or leave it empty")
        return value


class ProfileOut(ProfileFacts):
    revision: int
    updated_at: str


class ProfileUpdate(StrictModel):
    name: Annotated[StrictStr, Field(max_length=200)] | None = None
    email: Annotated[StrictStr, Field(max_length=320)] | None = None
    resume_text: Annotated[StrictStr, Field(max_length=40000)] | None = None
    skills: Annotated[list[Annotated[StrictStr, Field(min_length=1, max_length=100)]], Field(max_length=200)] | None = None
    experience_years: Annotated[StrictInt, Field(ge=0, le=80)] | None = None
    preferred_location: Annotated[StrictStr, Field(max_length=200)] | None = None
    expected_revision: Annotated[StrictInt, Field(ge=0)] | None = None

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        return ProfileFacts.valid_email(value) if value is not None else value

    @model_validator(mode="after")
    def reject_null_facts(self):
        for field in self.model_fields_set - {"expected_revision"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class GenerationIn(StrictModel):
    job_id: Identifier
    regenerate: StrictBool = False


class CoverLetterIn(GenerationIn):
    tone: Tone = "warm"


class RegenerateIn(StrictModel):
    regenerate: StrictBool = False


class ShortlistIn(StrictModel):
    job_id: Identifier
    status: Status = "saved"
    notes: Annotated[StrictStr, Field(max_length=10000)] | None = None


class ShortlistPatch(StrictModel):
    job_id: Identifier | None = None
    status: Status | None = None
    notes: Annotated[StrictStr, Field(max_length=10000)] | None = None

    @model_validator(mode="after")
    def reject_null_updates(self):
        if not self.model_fields_set & {"status", "notes"}:
            raise ValueError("Provide status or notes")
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class DraftIn(StrictModel):
    session_id: Identifier
    answer: Answer
    expected_version: Annotated[StrictInt, Field(ge=0)] | None = None


class EvaluateIn(StrictModel):
    job_id: Identifier
    session_id: Identifier
    question_id: Identifier
    question: StrictStr | None = None
    answer: Answer
    regenerate: StrictBool = False

    @model_validator(mode="after")
    def nonempty_answer(self):
        if not self.answer.strip():
            raise ValueError("Answer cannot be empty")
        return self


class SearchIn(StrictModel):
    query: Annotated[StrictStr, Field(min_length=1, max_length=2000)]
    location: Annotated[StrictStr, Field(max_length=200)] | None = None
    work_mode: Literal["Remote", "Hybrid", "On-site"] | None = None
    seniority: Literal["Intern", "Junior", "Mid", "Mid-Senior", "Senior", "Staff"] | None = None
