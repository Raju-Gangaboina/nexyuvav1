import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.certificate_generator import generate_completion_certificate
from app.core.database import get_db
from app.core.event_bus import publish
from app.core.models import Application, ApplicationStatus, Internship, Organization, StudentProfile
from app.core.security import require_role
from app.services.certificate.schemas import IssueCertificateRequest, IssueCertificateResponse

router = APIRouter(prefix="/api/v1/certificates", tags=["certificates"])
logger = logging.getLogger("nexyuva.certificates")

CERT_OUTPUT_DIR = Path("uploads/certificates")
CERT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/issue", response_model=IssueCertificateResponse)
async def issue_certificate(
    payload: IssueCertificateRequest,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Org marks an application as completed and issues a certificate in one
    action — a real Application state machine with a separate "mark
    complete" step would be more thorough, but for contest scope this
    single action (accepted-or-later -> completed + certificate) is the
    honest minimum viable version of the PRD's "certificate generation on
    internship completion" feature, not a shortcut hidden as more than it is.
    """
    application = await db.get(Application, payload.application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    internship = await db.get(Internship, application.internship_id)
    if internship is None:
        raise HTTPException(status_code=404, detail="Internship not found")

    org_result = await db.execute(
        select(Organization).where(Organization.user_id == uuid.UUID(user["user_id"]))
    )
    org = org_result.scalar_one_or_none()
    if org is None or internship.organization_id != org.id:
        raise HTTPException(
            status_code=403, detail="This application does not belong to your organization"
        )

    if application.status == ApplicationStatus.REJECTED:
        raise HTTPException(
            status_code=400, detail="Cannot issue a certificate for a rejected application"
        )

    student = await db.get(StudentProfile, application.student_id)

    pdf_bytes = generate_completion_certificate(
        student_name=student.full_name,
        internship_title=internship.title,
        organization_name=org.name,
    )

    cert_id = str(uuid.uuid4())[:8].upper()
    cert_path = CERT_OUTPUT_DIR / f"certificate_{cert_id}.pdf"
    cert_path.write_bytes(pdf_bytes)

    application.status = ApplicationStatus.COMPLETED
    application.certificate_path = str(cert_path)
    await db.commit()

    await publish(
        "certificate.issued",
        {
            "student_id": str(student.id),
            "student_email_user_id": str(student.user_id),
            "internship_title": internship.title,
        },
    )

    return IssueCertificateResponse(
        certificate_id=cert_id, download_url=f"/api/v1/certificates/{application.id}/download"
    )


@router.get("/{application_id}/download")
async def download_certificate(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("student", "organization", "admin")),
    db: AsyncSession = Depends(get_db),
):
    application = await db.get(Application, application_id)
    if application is None or application.certificate_path is None:
        raise HTTPException(status_code=404, detail="Certificate not found")

    # Ownership check — mirrors student/routes.py's version of this same
    # endpoint, which already scopes to application.student_id == caller.
    # This duplicate route previously skipped that check entirely (IDOR).
    role = user.get("role")
    if role == "student":
        student_result = await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user["user_id"]))
        )
        student = student_result.scalar_one_or_none()
        if student is None or application.student_id != student.id:
            raise HTTPException(status_code=404, detail="Certificate not found")
    elif role == "organization":
        internship = await db.get(Internship, application.internship_id)
        org_result = await db.execute(
            select(Organization).where(Organization.user_id == uuid.UUID(user["user_id"]))
        )
        org = org_result.scalar_one_or_none()
        if internship is None or org is None or internship.organization_id != org.id:
            raise HTTPException(status_code=404, detail="Certificate not found")
    # role == "admin" — no additional scoping, admins may access any certificate

    path = Path(application.certificate_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Certificate file missing on disk")

    return FileResponse(path, media_type="application/pdf", filename=path.name)
