import uuid

from pydantic import BaseModel


class StartAssessmentRequest(BaseModel):
    domain: str


class QuestionPublic(BaseModel):
    id: str
    difficulty: str
    question: str
    options: list[str]


class StartAssessmentResponse(BaseModel):
    attempt_id: uuid.UUID
    domain: str
    question: QuestionPublic


class SubmitAnswerRequest(BaseModel):
    question_id: str
    selected_index: int


class SubmitAnswerResponse(BaseModel):
    was_correct: bool
    attempt_status: str  # "in_progress" | "completed"
    next_question: QuestionPublic | None = None
    final_score: float | None = None
    integrity_score: float | None = None
    passed: bool | None = None
    badge_awarded: bool = False


class IntegrityFlagRequest(BaseModel):
    flag_type: str
    count: int = 1


class BadgeResponse(BaseModel):
    domain: str
    awarded_at: str

    class Config:
        from_attributes = True
