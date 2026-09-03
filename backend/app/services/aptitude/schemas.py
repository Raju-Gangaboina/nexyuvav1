import uuid

from pydantic import BaseModel


class StartAptitudeRequest(BaseModel):
    internship_id: uuid.UUID


class QuestionPublic(BaseModel):
    id: str
    question: str
    options: list[str]


class StartAptitudeResponse(BaseModel):
    attempt_id: uuid.UUID
    internship_id: uuid.UUID
    seconds_per_question: int
    overall_attempt_seconds: int
    questions: list[QuestionPublic]


class SubmitAptitudeRequest(BaseModel):
    """All answers submitted together at the end of the timed run, rather
    than one-at-a-time like assessment's adaptive flow — the aptitude quiz
    isn't adaptive (every question is generated up front at one difficulty),
    so there's no next-question decision to make per answer."""
    answers: list["AptitudeAnswer"]


class AptitudeAnswer(BaseModel):
    question_id: str
    selected_index: int


class IntegrityFlagBreakdown(BaseModel):
    """Per-flag-type breakdown of what actually hit the integrity score,
    so the student result screen can show *why* the score dropped instead
    of just the final number."""
    flag_type: str
    count: int
    points_deducted: float


class QuestionResult(BaseModel):
    question_id: str
    correct: bool
    selected_index: int | None = None
    correct_index: int
    options: list[str]
    question: str


class SubmitAptitudeResponse(BaseModel):
    raw_score: float
    percentile: float
    integrity_score: float
    passed: bool
    badge_awarded: bool
    percentile_pending: bool  # Fix Plan Option A: pool too small to rank fairly yet
    integrity_breakdown: list[IntegrityFlagBreakdown] = []
    question_results: list[QuestionResult] = []


class IntegrityFlagRequest(BaseModel):
    flag_type: str
    count: int = 1


class BadgeResponse(BaseModel):
    domain: str
    awarded_at: str

    class Config:
        from_attributes = True


SubmitAptitudeRequest.model_rebuild()
