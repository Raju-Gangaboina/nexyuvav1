"""
Module 5.5 — Smart Scheduling.

Coordination flow:
  1. Org connects their Google Calendar once (GET .../google/login -> OAuth
     consent -> .../google/callback stores an encrypted refresh_token).
  2. Org proposes 1-10 candidate slots for a specific application. Each
     slot is checked against the org's own Google freebusy so we never
     propose a time the org is already booked.
  3. Student picks one of the proposed slots. We create a real Google
     Calendar event (with a Meet link) on the org's calendar and invite
     both the org and the student by email, then mark the row CONFIRMED.
  4. Either side can cancel — this deletes the Calendar event too.

Distinct from Module 5.4 (AI-led interview, InterviewAttempt): this
schedules an actual human interview slot, it does not run one.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import google_calendar as gcal
from app.core.config import settings
from app.core.crypto import encrypt_token, decrypt_token
from app.core.database import get_db
from app.core.models import (
    Application,
    Internship,
    Organization,
    OrgCalendarAuth,
    ScheduledInterview,
    ScheduledInterviewStatus,
    StudentProfile,
    User,
)
from app.core.security import require_role, decode_access_token
from app.services.scheduling.schemas import (
    CalendarStatusResponse,
    ProposeSlotsRequest,
    ScheduledInterviewResponse,
    SelectSlotRequest,
)

router = APIRouter(prefix="/api/v1/scheduling", tags=["scheduling"])
logger = logging.getLogger("nexyuva.scheduling")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_own_org(user_id: str, db: AsyncSession) -> Organization:
    result = await db.execute(select(Organization).where(Organization.user_id == uuid.UUID(user_id)))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _get_own_student(user_id: str, db: AsyncSession) -> StudentProfile:
    result = await db.execute(select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id)))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return profile


async def _get_user_email(user_id: uuid.UUID, db: AsyncSession) -> str:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user.email


async def _require_org_calendar(org_id: uuid.UUID, db: AsyncSession) -> OrgCalendarAuth:
    result = await db.execute(select(OrgCalendarAuth).where(OrgCalendarAuth.organization_id == org_id))
    auth = result.scalar_one_or_none()
    if auth is None:
        raise HTTPException(
            status_code=400,
            detail="Connect your Google Calendar first (GET /api/v1/scheduling/google/login).",
        )
    return auth


async def _get_valid_access_token(auth: OrgCalendarAuth) -> str:
    refresh_token = decrypt_token(auth.encrypted_refresh_token)
    return await gcal.refresh_access_token(refresh_token)


def _intervals_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


async def _enrich(row: ScheduledInterview, db: AsyncSession) -> ScheduledInterviewResponse:
    internship = (await db.execute(select(Internship).where(Internship.id == row.internship_id))).scalar_one_or_none()
    org = (await db.execute(select(Organization).where(Organization.id == row.organization_id))).scalar_one_or_none()
    student = (await db.execute(select(StudentProfile).where(StudentProfile.id == row.student_id))).scalar_one_or_none()
    data = ScheduledInterviewResponse.model_validate(row)
    data.internship_title = internship.title if internship else None
    data.organization_name = org.name if org else None
    data.student_name = student.full_name if student else None
    return data


# ---------------------------------------------------------------------------
# Google Calendar connection (org-side)
# ---------------------------------------------------------------------------

@router.get("/google/login")
async def google_login(
    access_token: str = Query(..., description="JWT — passed as a query param because this is a browser navigation to Google's consent screen, not a fetch, so no Authorization header can be attached."),
):
    """
    Redirects the org to Google's OAuth consent screen. Deliberately takes
    the JWT as a query param instead of Depends(require_role(...)): the
    frontend has to do a top-level browser navigation here (Google's
    consent screen can't be reached via fetch/XHR), and a navigation can't
    carry an Authorization header. We decode the token ourselves instead.
    """
    gcal.require_google_configured()
    payload = decode_access_token(access_token)
    if payload.get("role") != "organization":
        raise HTTPException(status_code=403, detail="Only organizations can connect a calendar")
    return RedirectResponse(gcal.build_consent_url(state=payload["sub"]))


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    # This whole handler is a full-page browser navigation Google redirected
    # back to (never a fetch), so every exit path here must be a redirect
    # back into frontend-web — returning raw JSON or raising an HTTPException
    # would strand the user on a bare API response with no way back to the app.
    integrations_url = f"{settings.FRONTEND_URL}/company/integrations"

    try:
        gcal.require_google_configured()

        token_data = await gcal.exchange_code_for_tokens(code)
        refresh_token = token_data.get("refresh_token")
        if not refresh_token:
            # Google only returns a refresh_token on first consent (or with
            # prompt=consent, which build_consent_url always sets) — if it's
            # still missing something is wrong upstream, fail loudly rather
            # than silently storing an access-only connection that expires in
            # an hour with no way to renew it.
            return RedirectResponse(
                f"{integrations_url}?calendar_error="
                "Google+didn%27t+return+a+refresh+token.+Revoke+access+at+"
                "myaccount.google.com%2Fpermissions+and+try+again."
            )

        userinfo = await gcal.fetch_userinfo(token_data["access_token"])

        try:
            org_user_id = uuid.UUID(state)
        except ValueError:
            return RedirectResponse(f"{integrations_url}?calendar_error=Invalid+request+state")

        org = await _get_own_org(str(org_user_id), db)

        result = await db.execute(select(OrgCalendarAuth).where(OrgCalendarAuth.organization_id == org.id))
        auth = result.scalar_one_or_none()
        encrypted = encrypt_token(refresh_token)
        if auth is None:
            auth = OrgCalendarAuth(
                organization_id=org.id,
                google_email=userinfo.get("email", ""),
                encrypted_refresh_token=encrypted,
            )
            db.add(auth)
        else:
            auth.google_email = userinfo.get("email", auth.google_email)
            auth.encrypted_refresh_token = encrypted
        await db.commit()

        return RedirectResponse(f"{integrations_url}?calendar_connected=1")
    except HTTPException as e:
        return RedirectResponse(f"{integrations_url}?calendar_error={e.detail}")
    except Exception:
        logger.exception("Google Calendar callback failed")
        return RedirectResponse(f"{integrations_url}?calendar_error=Something+went+wrong+connecting+your+calendar")


@router.get("/google/status", response_model=CalendarStatusResponse)
async def google_status(
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    result = await db.execute(select(OrgCalendarAuth).where(OrgCalendarAuth.organization_id == org.id))
    auth = result.scalar_one_or_none()
    if auth is None:
        return CalendarStatusResponse(connected=False)
    return CalendarStatusResponse(connected=True, google_email=auth.google_email, connected_at=auth.connected_at)


@router.delete("/google/disconnect")
async def google_disconnect(
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    result = await db.execute(select(OrgCalendarAuth).where(OrgCalendarAuth.organization_id == org.id))
    auth = result.scalar_one_or_none()
    if auth is not None:
        await db.delete(auth)
        await db.commit()
    return {"connected": False}


# ---------------------------------------------------------------------------
# Scheduling (org proposes, student confirms)
# ---------------------------------------------------------------------------

@router.post("/interviews/{application_id}/propose", response_model=ScheduledInterviewResponse)
async def propose_slots(
    application_id: uuid.UUID,
    body: ProposeSlotsRequest,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)

    application = (await db.execute(select(Application).where(Application.id == application_id))).scalar_one_or_none()
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    internship = (await db.execute(select(Internship).where(Internship.id == application.internship_id))).scalar_one_or_none()
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=403, detail="This application does not belong to your organization")

    auth = await _require_org_calendar(org.id, db)
    access_token = await _get_valid_access_token(auth)

    # Check proposed slots against the org's own freebusy so we never send
    # a candidate a time the org is already booked for something else.
    time_min = min(s.start for s in body.slots)
    time_max = max(s.end for s in body.slots)
    busy = await gcal.get_busy_intervals(access_token, time_min, time_max)
    busy_intervals = [
        (datetime.fromisoformat(b["start"].replace("Z", "+00:00")), datetime.fromisoformat(b["end"].replace("Z", "+00:00")))
        for b in busy
    ]

    conflicting = []
    for slot in body.slots:
        s_start = slot.start if slot.start.tzinfo else slot.start.replace(tzinfo=timezone.utc)
        s_end = slot.end if slot.end.tzinfo else slot.end.replace(tzinfo=timezone.utc)
        if any(_intervals_overlap(s_start, s_end, b_start, b_end) for b_start, b_end in busy_intervals):
            conflicting.append(slot.start.isoformat())
    if conflicting:
        raise HTTPException(
            status_code=409,
            detail=f"These slots conflict with your existing calendar events, pick different times: {conflicting}",
        )

    result = await db.execute(select(ScheduledInterview).where(ScheduledInterview.application_id == application_id))
    row = result.scalar_one_or_none()
    slots_json = [{"start": s.start.isoformat(), "end": s.end.isoformat()} for s in body.slots]
    if row is None:
        row = ScheduledInterview(
            application_id=application_id,
            organization_id=org.id,
            student_id=application.student_id,
            internship_id=internship.id,
            proposed_slots=slots_json,
            duration_minutes=body.duration_minutes,
            status=ScheduledInterviewStatus.PROPOSED,
        )
        db.add(row)
    else:
        # Re-proposing (e.g. student didn't like the times) resets any prior selection.
        row.proposed_slots = slots_json
        row.duration_minutes = body.duration_minutes
        row.selected_slot = None
        row.status = ScheduledInterviewStatus.PROPOSED
    await db.commit()
    await db.refresh(row)
    return await _enrich(row, db)


@router.post("/interviews/{scheduled_interview_id}/select-slot", response_model=ScheduledInterviewResponse)
async def select_slot(
    scheduled_interview_id: uuid.UUID,
    body: SelectSlotRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    student = await _get_own_student(user["user_id"], db)

    row = (await db.execute(select(ScheduledInterview).where(ScheduledInterview.id == scheduled_interview_id))).scalar_one_or_none()
    if row is None or row.student_id != student.id:
        raise HTTPException(status_code=404, detail="Scheduled interview not found")
    if row.status != ScheduledInterviewStatus.PROPOSED:
        raise HTTPException(status_code=400, detail=f"This interview is already {row.status.value}")
    if body.slot_index >= len(row.proposed_slots):
        raise HTTPException(status_code=400, detail="Invalid slot_index")

    slot = row.proposed_slots[body.slot_index]
    start = datetime.fromisoformat(slot["start"])
    end = datetime.fromisoformat(slot["end"])

    auth = await _require_org_calendar(row.organization_id, db)
    access_token = await _get_valid_access_token(auth)

    internship = (await db.execute(select(Internship).where(Internship.id == row.internship_id))).scalar_one_or_none()
    org = (await db.execute(select(Organization).where(Organization.id == row.organization_id))).scalar_one_or_none()
    student_email = await _get_user_email(student.user_id, db)
    org_email = await _get_user_email(org.user_id, db) if org else auth.google_email

    event = await gcal.create_event_with_meet(
        access_token=access_token,
        summary=f"Interview: {student.full_name} — {internship.title if internship else 'Internship'}",
        description=f"NexYuva human interview, scheduled via Smart Scheduling.\n"
                     f"Candidate: {student.full_name}\nRole: {internship.title if internship else ''}",
        start=start,
        end=end,
        attendee_emails=[e for e in {student_email, org_email} if e],
    )

    row.selected_slot = slot
    row.status = ScheduledInterviewStatus.CONFIRMED
    row.google_event_id = event.get("id")
    row.meet_link = event.get("hangoutLink")
    row.confirmed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return await _enrich(row, db)


@router.post("/interviews/{scheduled_interview_id}/cancel", response_model=ScheduledInterviewResponse)
async def cancel_interview(
    scheduled_interview_id: uuid.UUID,
    user: dict = Depends(require_role("organization", "student")),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(select(ScheduledInterview).where(ScheduledInterview.id == scheduled_interview_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Scheduled interview not found")

    if user["role"] == "organization":
        org = await _get_own_org(user["user_id"], db)
        if row.organization_id != org.id:
            raise HTTPException(status_code=403, detail="Not your interview")
    else:
        student = await _get_own_student(user["user_id"], db)
        if row.student_id != student.id:
            raise HTTPException(status_code=403, detail="Not your interview")

    if row.status == ScheduledInterviewStatus.CONFIRMED and row.google_event_id:
        result = await db.execute(select(OrgCalendarAuth).where(OrgCalendarAuth.organization_id == row.organization_id))
        auth = result.scalar_one_or_none()
        if auth is not None:
            access_token = await _get_valid_access_token(auth)
            await gcal.delete_event(access_token, row.google_event_id)

    row.status = ScheduledInterviewStatus.CANCELLED
    row.cancelled_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return await _enrich(row, db)


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------

@router.get("/interviews/mine", response_model=list[ScheduledInterviewResponse])
async def list_my_interviews(
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    student = await _get_own_student(user["user_id"], db)
    rows = (await db.execute(
        select(ScheduledInterview).where(ScheduledInterview.student_id == student.id)
        .order_by(ScheduledInterview.created_at.desc())
    )).scalars().all()
    return [await _enrich(r, db) for r in rows]


@router.get("/interviews", response_model=list[ScheduledInterviewResponse])
async def list_org_interviews(
    internship_id: uuid.UUID | None = None,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    stmt = select(ScheduledInterview).where(ScheduledInterview.organization_id == org.id)
    if internship_id is not None:
        stmt = stmt.where(ScheduledInterview.internship_id == internship_id)
    rows = (await db.execute(stmt.order_by(ScheduledInterview.created_at.desc()))).scalars().all()
    return [await _enrich(r, db) for r in rows]
