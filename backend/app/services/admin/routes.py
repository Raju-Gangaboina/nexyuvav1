"""
Admin routes -- the Trust & Safety Control Center. See
ADMIN_TRUST_SAFETY_MEMO.md at the repo root for the full design (phase 1
backend is implemented here; the admin frontend redesign is phase 2, not
yet built).

Every state change on an Organization's verification case is written to
AdminAuditLog from inside the endpoint that makes it -- never bolted on
after the fact -- so there is always a trail of who did what, when, and
why.
"""
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.models import (
    AdminAuditLog,
    Application,
    DocumentReviewStatus,
    Internship,
    ModerationStatus,
    Organization,
    OrgVerificationStatus,
    Report,
    ReportStatus,
    User,
    VerificationDocument,
    VerificationRiskLevel,
)
from app.core.security import require_role
from app.services.admin.risk import compute_risk

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class RejectOrganizationRequest(BaseModel):
    reason: str | None = None


class RequestInformationRequest(BaseModel):
    reason: str


class SuspendOrganizationRequest(BaseModel):
    reason: str


class DocumentReviewRequest(BaseModel):
    status: DocumentReviewStatus
    notes: str | None = None


class ModerationDecisionRequest(BaseModel):
    notes: str | None = None


class ReportResolutionRequest(BaseModel):
    notes: str | None = None


async def _log_action(
    db: AsyncSession,
    admin_user_id: str,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    previous_status: str | None,
    new_status: str | None,
    reason: str | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            admin_user_id=uuid.UUID(admin_user_id),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            previous_status=previous_status,
            new_status=new_status,
            reason=reason,
        )
    )


async def _get_org_or_404(org_id: uuid.UUID, db: AsyncSession) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _recompute_risk(org: Organization, db: AsyncSession) -> None:
    """Refreshes org.risk_level/risk_notes in place. Caller commits."""
    user_row = await db.get(User, org.user_id)
    docs_result = await db.execute(
        select(VerificationDocument).where(VerificationDocument.organization_id == org.id)
    )
    documents = docs_result.scalars().all()
    level, notes = compute_risk(org, user_row.email if user_row else "", list(documents))
    org.risk_level = level
    org.risk_notes = notes


def _queue_item(org: Organization) -> dict:
    return {
        "id": org.id,
        "name": org.name,
        "legal_name": org.legal_name,
        "description": org.description,
        "status": org.verification_status.value,
        "risk_level": org.risk_level.value,
        "risk_notes": org.risk_notes,
        "verification_doc_name": org.verification_doc_name,
        "submitted_at": org.verification_submitted_at,
    }


@router.get("/organizations/verification-queue")
async def verification_queue(
    status: OrgVerificationStatus | None = Query(default=None),
    risk: VerificationRiskLevel | None = Query(default=None),
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    The admin's first screen (design doc #3, "Admin Verification Queue").
    Defaults to everything awaiting a decision (PENDING + ACTION_REQUIRED)
    when no status filter is given, since that's what an admin opens this
    page to work through -- pass status=approved/rejected/suspended
    explicitly to browse those instead.
    """
    stmt = select(Organization)
    if status is not None:
        stmt = stmt.where(Organization.verification_status == status)
    else:
        stmt = stmt.where(
            Organization.verification_status.in_(
                [OrgVerificationStatus.PENDING, OrgVerificationStatus.ACTION_REQUIRED]
            )
        )
    if risk is not None:
        stmt = stmt.where(Organization.risk_level == risk)
    stmt = stmt.order_by(Organization.verification_submitted_at.desc().nulls_last())

    result = await db.execute(stmt)
    orgs = result.scalars().all()
    return [_queue_item(o) for o in orgs]


@router.get("/organizations/pending")
async def list_pending_organizations_legacy(
    user: dict = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)
):
    """Deprecated alias for verification_queue's default view -- kept so
    anything still calling the old MVP endpoint doesn't break."""
    return await verification_queue(status=None, risk=None, user=user, db=db)


@router.get("/organizations/{org_id}/case")
async def get_verification_case(
    org_id: uuid.UUID,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    The investigation workspace (design doc #4). Identity + representative
    + documents + risk + activity counts + this org's audit history, all
    in one payload so the admin frontend doesn't need N round trips to
    render one case.
    """
    org = await _get_org_or_404(org_id, db)
    user_row = await db.get(User, org.user_id)

    docs_result = await db.execute(
        select(VerificationDocument)
        .where(VerificationDocument.organization_id == org.id)
        .order_by(VerificationDocument.uploaded_at.desc())
    )
    documents = docs_result.scalars().all()

    internship_count = await db.scalar(
        select(func.count(Internship.id)).where(Internship.organization_id == org.id)
    )
    application_count = await db.scalar(
        select(func.count(Application.id))
        .join(Internship, Application.internship_id == Internship.id)
        .where(Internship.organization_id == org.id)
    )

    audit_result = await db.execute(
        select(AdminAuditLog)
        .where(AdminAuditLog.entity_type == "organization", AdminAuditLog.entity_id == org.id)
        .order_by(AdminAuditLog.created_at.desc())
    )
    audit_events = audit_result.scalars().all()
    admin_ids = {e.admin_user_id for e in audit_events}
    admin_rows = {}
    if admin_ids:
        admins_result = await db.execute(select(User).where(User.id.in_(admin_ids)))
        admin_rows = {a.id: a.email for a in admins_result.scalars().all()}

    return {
        "id": org.id,
        "status": org.verification_status.value,
        "identity": {
            "display_name": org.name,
            "legal_name": org.legal_name,
            "cin": org.cin,
            "pan": org.pan,
            "official_website": org.official_website,
            "industry": org.industry,
            "description": org.description,
            "account_email": user_row.email if user_row else None,
            "account_created_at": user_row.created_at if user_row else None,
        },
        "representative": {
            "name": org.representative_name,
            "designation": org.representative_designation,
            "phone": org.representative_phone,
            "email_verified": org.representative_email_verified,
            "phone_verified": org.representative_phone_verified,
        },
        "documents": [
            {
                "id": d.id,
                "doc_type": d.doc_type.value,
                "file_name": d.file_name,
                "uploaded_at": d.uploaded_at,
                "status": d.status.value,
                "reviewed_at": d.reviewed_at,
                "review_notes": d.review_notes,
            }
            for d in documents
        ],
        "legacy_document": (
            {"file_name": org.verification_doc_name, "submitted_at": org.verification_submitted_at}
            if org.verification_doc_path
            else None
        ),
        "risk": {"level": org.risk_level.value, "notes": org.risk_notes},
        "activity": {
            "internships_posted": internship_count or 0,
            "applications_received": application_count or 0,
        },
        "rejection_reason": org.rejection_reason,
        "action_required_reason": org.action_required_reason,
        "audit_history": [
            {
                "admin_email": admin_rows.get(e.admin_user_id, "unknown"),
                "action": e.action,
                "previous_status": e.previous_status,
                "new_status": e.new_status,
                "reason": e.reason,
                "created_at": e.created_at,
            }
            for e in audit_events
        ],
    }


async def _approve(org_id: uuid.UUID, user: dict, db: AsyncSession) -> dict:
    org = await _get_org_or_404(org_id, db)
    previous = org.verification_status.value
    org.is_verified = True
    org.verification_status = OrgVerificationStatus.APPROVED
    org.verification_reviewed_at = datetime.utcnow()
    org.rejection_reason = None
    org.action_required_reason = None
    await _log_action(
        db, user["user_id"], "approve_organization", "organization", org.id, previous, "approved"
    )
    await db.commit()
    return {"id": org.id, "name": org.name, "is_verified": True, "status": "approved"}


@router.post("/organizations/{org_id}/approve")
async def approve_organization(
    org_id: uuid.UUID,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    return await _approve(org_id, user, db)


@router.post("/organizations/{org_id}/verify")
async def verify_organization_legacy(
    org_id: uuid.UUID,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Deprecated alias for /approve -- kept so anything still calling the
    old MVP endpoint doesn't break."""
    return await _approve(org_id, user, db)


@router.post("/organizations/{org_id}/reject")
async def reject_organization(
    org_id: uuid.UUID,
    payload: RejectOrganizationRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(org_id, db)
    previous = org.verification_status.value
    org.is_verified = False
    org.verification_status = OrgVerificationStatus.REJECTED
    org.verification_reviewed_at = datetime.utcnow()
    org.rejection_reason = payload.reason
    org.action_required_reason = None
    await _log_action(
        db, user["user_id"], "reject_organization", "organization", org.id,
        previous, "rejected", payload.reason,
    )
    await db.commit()
    return {"id": org.id, "name": org.name, "is_verified": False, "status": "rejected"}


@router.post("/organizations/{org_id}/request-information")
async def request_information(
    org_id: uuid.UUID,
    payload: RequestInformationRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Design doc #6 -- the middle ground between approve/reject. The company
    is plausibly legitimate but something is missing; this puts the case
    into ACTION_REQUIRED so it's clearly distinguished from a rejection
    both for the admin queue and for the org's own dashboard, and stores
    the specific ask so the org knows what to fix before resubmitting.
    """
    org = await _get_org_or_404(org_id, db)
    previous = org.verification_status.value
    org.verification_status = OrgVerificationStatus.ACTION_REQUIRED
    org.action_required_reason = payload.reason
    org.verification_reviewed_at = datetime.utcnow()
    await _log_action(
        db, user["user_id"], "request_information", "organization", org.id,
        previous, "action_required", payload.reason,
    )
    await db.commit()
    return {"id": org.id, "status": "action_required", "action_required_reason": payload.reason}


@router.post("/organizations/{org_id}/suspend")
async def suspend_organization(
    org_id: uuid.UUID,
    payload: SuspendOrganizationRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Design doc #8 -- for a company that was approved and later needs to
    be pulled (reports, policy violation, suspicious activity), distinct
    from REJECTED which is a pre-approval outcome."""
    org = await _get_org_or_404(org_id, db)
    if org.verification_status != OrgVerificationStatus.APPROVED:
        raise HTTPException(
            status_code=400, detail="Only an approved organization can be suspended"
        )
    previous = org.verification_status.value
    org.verification_status = OrgVerificationStatus.SUSPENDED
    org.is_verified = False
    await _log_action(
        db, user["user_id"], "suspend_organization", "organization", org.id,
        previous, "suspended", payload.reason,
    )
    await db.commit()
    return {"id": org.id, "status": "suspended"}


@router.post("/organizations/{org_id}/reinstate")
async def reinstate_organization(
    org_id: uuid.UUID,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(org_id, db)
    if org.verification_status != OrgVerificationStatus.SUSPENDED:
        raise HTTPException(status_code=400, detail="Organization is not suspended")
    previous = org.verification_status.value
    org.verification_status = OrgVerificationStatus.APPROVED
    org.is_verified = True
    await _log_action(
        db, user["user_id"], "reinstate_organization", "organization", org.id,
        previous, "approved",
    )
    await db.commit()
    return {"id": org.id, "status": "approved"}


@router.post("/organizations/{org_id}/documents/{doc_id}/review")
async def review_document(
    org_id: uuid.UUID,
    doc_id: uuid.UUID,
    payload: DocumentReviewRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Design doc #5 -- Preview -> Verify/Reject with a reason, per
    document, rather than one blanket judgment on the whole case."""
    org = await _get_org_or_404(org_id, db)
    doc = await db.get(VerificationDocument, doc_id)
    if doc is None or doc.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Document not found")

    previous = doc.status.value
    doc.status = payload.status
    doc.reviewed_by = uuid.UUID(user["user_id"])
    doc.reviewed_at = datetime.utcnow()
    doc.review_notes = payload.notes

    await _log_action(
        db, user["user_id"], "review_document", "document", doc.id,
        previous, payload.status.value, payload.notes,
    )
    await _recompute_risk(org, db)
    await db.commit()
    return {"id": doc.id, "status": doc.status.value}


@router.get("/organizations/{org_id}/verification-document")
async def get_verification_document(
    org_id: uuid.UUID,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Legacy single-document download -- kept for the MVP doc field."""
    org = await _get_org_or_404(org_id, db)
    if not org.verification_doc_path:
        raise HTTPException(status_code=404, detail="No verification document on file")
    doc_path = Path(org.verification_doc_path)
    if not doc_path.exists():
        raise HTTPException(status_code=404, detail="Document file missing on disk")
    return FileResponse(doc_path, filename=org.verification_doc_name or doc_path.name)


@router.get("/organizations/{org_id}/documents/{doc_id}/download")
async def download_verification_document(
    org_id: uuid.UUID,
    doc_id: uuid.UUID,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(org_id, db)
    doc = await db.get(VerificationDocument, doc_id)
    if doc is None or doc.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Document not found")
    doc_path = Path(doc.file_path)
    if not doc_path.exists():
        raise HTTPException(status_code=404, detail="Document file missing on disk")
    return FileResponse(doc_path, filename=doc.file_name)


# --- Internship moderation (ADMIN_TRUST_SAFETY_MEMO.md Phase 3) --
# per-listing job-quality review, independent of the organization's own
# verification status: a verified company can still post a bad listing. ---

def _moderation_item(i: Internship, org_name: str) -> dict:
    return {
        "id": i.id,
        "title": i.title,
        "organization_id": i.organization_id,
        "organization_name": org_name,
        "domain": i.domain,
        "location": i.location,
        "stipend": i.stipend,
        "description": i.description,
        "moderation_status": i.moderation_status.value,
        "moderation_notes": i.moderation_notes,
        "is_active": i.is_active,
        "created_at": i.created_at,
    }


@router.get("/internships/moderation-queue")
async def internship_moderation_queue(
    status: ModerationStatus | None = Query(default=None),
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Defaults to UNREVIEWED (what an admin opens this page to work
    through) when no status filter is given -- pass status=flagged/
    approved/removed explicitly to browse those instead.
    """
    stmt = select(Internship, Organization.name).join(
        Organization, Internship.organization_id == Organization.id
    )
    if status is not None:
        stmt = stmt.where(Internship.moderation_status == status)
    else:
        stmt = stmt.where(Internship.moderation_status == ModerationStatus.UNREVIEWED)
    stmt = stmt.order_by(Internship.created_at.desc())

    result = await db.execute(stmt)
    rows = result.all()
    return [_moderation_item(i, org_name) for i, org_name in rows]


async def _get_internship_or_404(internship_id: uuid.UUID, db: AsyncSession) -> Internship:
    listing = await db.get(Internship, internship_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Internship not found")
    return listing


async def _moderate(
    internship_id: uuid.UUID,
    new_status: ModerationStatus,
    action: str,
    notes: str | None,
    user: dict,
    db: AsyncSession,
) -> dict:
    listing = await _get_internship_or_404(internship_id, db)
    previous = listing.moderation_status.value
    listing.moderation_status = new_status
    listing.moderation_notes = notes
    listing.moderated_by = uuid.UUID(user["user_id"])
    listing.moderated_at = datetime.utcnow()
    if new_status == ModerationStatus.REMOVED:
        listing.is_active = False
    await _log_action(
        db, user["user_id"], action, "internship", listing.id, previous, new_status.value, notes
    )
    await db.commit()
    return {"id": listing.id, "moderation_status": new_status.value}


@router.post("/internships/{internship_id}/approve")
async def approve_internship(
    internship_id: uuid.UUID,
    payload: ModerationDecisionRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    return await _moderate(internship_id, ModerationStatus.APPROVED, "approve_internship", payload.notes, user, db)


@router.post("/internships/{internship_id}/flag")
async def flag_internship(
    internship_id: uuid.UUID,
    payload: ModerationDecisionRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Listing stays live but is marked with a specific quality issue --
    the middle ground between approve and remove, same pattern as the
    organization case's request-information action."""
    if not payload.notes:
        raise HTTPException(status_code=400, detail="A note describing the issue is required to flag a listing")
    return await _moderate(internship_id, ModerationStatus.FLAGGED, "flag_internship", payload.notes, user, db)


@router.post("/internships/{internship_id}/remove")
async def remove_internship(
    internship_id: uuid.UUID,
    payload: ModerationDecisionRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Pulls the listing from public view (is_active=False) in addition to
    marking it REMOVED, so it stops surfacing in recommendations/search
    immediately rather than only being flagged for a future cleanup pass."""
    return await _moderate(internship_id, ModerationStatus.REMOVED, "remove_internship", payload.notes, user, db)


@router.get("/audit-log")
async def get_audit_log(
    entity_type: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Design doc #12 -- do not skip this. Every admin action, queryable."""
    stmt = select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit)
    if entity_type is not None:
        stmt = stmt.where(AdminAuditLog.entity_type == entity_type)
    result = await db.execute(stmt)
    events = result.scalars().all()

    admin_ids = {e.admin_user_id for e in events}
    admin_rows = {}
    if admin_ids:
        admins_result = await db.execute(select(User).where(User.id.in_(admin_ids)))
        admin_rows = {a.id: a.email for a in admins_result.scalars().all()}

    return [
        {
            "admin_email": admin_rows.get(e.admin_user_id, "unknown"),
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "previous_status": e.previous_status,
            "new_status": e.new_status,
            "reason": e.reason,
            "created_at": e.created_at,
        }
        for e in events
    ]


# --- Student reports (ADMIN_TRUST_SAFETY_MEMO.md Phase 4) --
# Raw complaints filed via POST /api/v1/students/reports. Separate from
# internship moderation and org verification -- a report is a *signal*,
# not itself a decision, so resolving one records both its own status and
# an AdminAuditLog entry, same as every other admin action here. ---

def _report_item(r: Report, reporter_email: str | None) -> dict:
    return {
        "id": r.id,
        "reporter_id": r.reporter_id,
        "reporter_email": reporter_email,
        "target_type": r.target_type.value,
        "target_id": r.target_id,
        "reason": r.reason.value,
        "details": r.details,
        "evidence_path": r.evidence_path,
        "status": r.status.value,
        "resolution_notes": r.resolution_notes,
        "created_at": r.created_at,
        "resolved_at": r.resolved_at,
    }


@router.get("/reports")
async def reports_queue(
    status: ReportStatus | None = Query(default=None),
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Defaults to OPEN (what an admin opens this page to work through) --
    pass status=investigating/dismissed/action_taken to browse those."""
    stmt = select(Report, User.email).join(User, Report.reporter_id == User.id)
    if status is not None:
        stmt = stmt.where(Report.status == status)
    else:
        stmt = stmt.where(Report.status == ReportStatus.OPEN)
    stmt = stmt.order_by(Report.created_at.desc())

    result = await db.execute(stmt)
    rows = result.all()
    return [_report_item(r, email) for r, email in rows]


async def _get_report_or_404(report_id: uuid.UUID, db: AsyncSession) -> Report:
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


async def _resolve_report(
    report_id: uuid.UUID,
    new_status: ReportStatus,
    action: str,
    notes: str | None,
    user: dict,
    db: AsyncSession,
) -> dict:
    report = await _get_report_or_404(report_id, db)
    previous = report.status.value
    report.status = new_status
    report.resolution_notes = notes
    report.resolved_by = uuid.UUID(user["user_id"])
    report.resolved_at = datetime.utcnow()
    await _log_action(
        db, user["user_id"], action, "report", report.id, previous, new_status.value, notes
    )
    await db.commit()
    return {"id": report.id, "status": new_status.value}


@router.post("/reports/{report_id}/investigate")
async def investigate_report(
    report_id: uuid.UUID,
    payload: ReportResolutionRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Marks the report as actively being looked into -- doesn't itself
    touch the reported internship/organization, just moves it out of the
    untouched OPEN pile so two admins don't duplicate work."""
    return await _resolve_report(report_id, ReportStatus.INVESTIGATING, "investigate_report", payload.notes, user, db)


@router.post("/reports/{report_id}/dismiss")
async def dismiss_report(
    report_id: uuid.UUID,
    payload: ReportResolutionRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """No action warranted -- e.g. duplicate, unfounded, or already
    resolved via a different channel."""
    return await _resolve_report(report_id, ReportStatus.DISMISSED, "dismiss_report", payload.notes, user, db)


@router.post("/reports/{report_id}/action-taken")
async def action_taken_report(
    report_id: uuid.UUID,
    payload: ReportResolutionRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Closes the report as resolved with real consequence. Deliberately
    does not itself flag/remove the listing or suspend the org -- an admin
    does that separately via the moderation/verification endpoints, so
    this note should say what was actually done (e.g. \"listing removed,
    see internship moderation log\")."""
    return await _resolve_report(report_id, ReportStatus.ACTION_TAKEN, "action_taken_report", payload.notes, user, db)
