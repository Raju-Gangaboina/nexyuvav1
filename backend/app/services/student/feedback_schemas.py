import uuid

from pydantic import BaseModel, Field


class SubmitFeedbackRequest(BaseModel):
    feedback_text: str = Field(min_length=10, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)


class SubmitFeedbackResponse(BaseModel):
    feedback_id: uuid.UUID
    sentiment_label: str
    sentiment_compound_score: float
