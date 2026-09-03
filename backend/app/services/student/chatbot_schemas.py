from pydantic import BaseModel


class ChatQuestionRequest(BaseModel):
    question: str


class ChatAnswerResponse(BaseModel):
    answer: str
    source: str
