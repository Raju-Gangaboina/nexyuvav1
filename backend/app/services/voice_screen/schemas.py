import uuid
from datetime import datetime

from pydantic import BaseModel


class VoiceScreenQuestionPublic(BaseModel):
    index: int
    question: str


class StartVoiceScreenResponse(BaseModel):
    attempt_id: uuid.UUID
    questions: list[VoiceScreenQuestionPublic]


class SubmitVoiceAnswerResponse(BaseModel):
    """
    Deliberately does NOT include the score/notes for this individual
    answer in the response — mirrors 5.4's SubmitInterviewAnswerResponse
    (no per-question score surfaced live to the candidate mid-attempt),
    keeping the async, unattended flow from turning into a live-graded one.
    """
    graded: bool
    transcript: str | None
    all_answered: bool


class VoiceScreenQuestionResult(BaseModel):
    question: str
    transcript: str | None
    score: float | None
    notes: str | None


class VoiceScreenResultResponse(BaseModel):
    """
    Company-facing review shape (per-question transcript/score/notes plus
    the aggregate) — student-facing status polling reuses the same model
    but the routes layer only returns it once the attempt is COMPLETED,
    same "no live score" rule as SubmitVoiceAnswerResponse above.
    """
    attempt_id: uuid.UUID
    application_id: uuid.UUID
    status: str
    questions: list[VoiceScreenQuestionResult]
    final_score: float | None
    passed: bool | None
    started_at: datetime
    completed_at: datetime | None

    # Company review dashboard enrichment (matches 5.4/5.6's shape so all
    # interview modes are comparable in one dashboard)
    student_name: str | None = None
    internship_title: str | None = None

    model_config = {"from_attributes": True}
