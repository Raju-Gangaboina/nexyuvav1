import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.models import ApplicationStatus


class ApplyRequest(BaseModel):
    internship_id: uuid.UUID


class ApplicationResponse(BaseModel):
    id: uuid.UUID
    internship_id: uuid.UUID
    status: ApplicationStatus
    applied_at: datetime
    internship_title: str | None = None
    organization_name: str | None = None

    class Config:
        from_attributes = True


class UpdateApplicationStatusRequest(BaseModel):
    status: ApplicationStatus
