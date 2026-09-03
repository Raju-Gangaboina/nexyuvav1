import uuid
from datetime import datetime

from pydantic import BaseModel


class InterviewQuestionPublic(BaseModel):
    index: int
    question: str


class StartInterviewResponse(BaseModel):
    attempt_id: uuid.UUID
    questions: list[InterviewQuestionPublic]


class SubmitInterviewAnswerRequest(BaseModel):
    question_index: int
    answer: str


class SubmitInterviewAnswerResponse(BaseModel):
    graded: bool
    all_answered: bool
    final_score: float | None = None
    integrity_score: float | None = None
    passed: bool | None = None
    badge_awarded: bool = False


class IntegrityFlagRequest(BaseModel):
    flag_type: str
    count: int = 1


class FrameCheckRequest(BaseModel):
    image_base64: str


class FrameCheckResponse(BaseModel):
    phone_detected: bool
    multiple_people: bool
    no_person: bool


class InterviewResultResponse(BaseModel):
    status: str
    final_score: float | None
    integrity_score: float | None
    passed: bool | None
    badge_awarded: bool
    questions: list[dict]
    # Same aggregated-signal shape as the org-facing dashboard (see
    # organization/schemas.py IntegrityFlagDetail) -- surfaced to the
    # student too so a low integrity score isn't a black box: they can see
    # which signals fired and roughly when, not just a bare number.
    integrity_flags: list[dict] = []
