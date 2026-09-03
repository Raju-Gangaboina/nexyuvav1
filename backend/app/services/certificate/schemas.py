import uuid

from pydantic import BaseModel


class IssueCertificateRequest(BaseModel):
    application_id: uuid.UUID


class IssueCertificateResponse(BaseModel):
    certificate_id: str
    download_url: str
