"""
Notification Subscribers (Architecture.md §2/§6). Each subscriber is a
background asyncio task running a consumer loop against the real event bus
(app/core/event_bus.py) — reading with XREAD BLOCK, not polling on a timer.
Started once at FastAPI app startup, not at import time (needs a running
event loop, which doesn't exist yet at module import).

For contest scale (single server, modest event volume) one asyncio task per
event type is the right amount of infrastructure — a dedicated consumer
process/worker pool would be over-engineering here (Rules.md §5), and would
be the natural next step if this needed to scale beyond one server.
"""
import asyncio
import logging
import uuid

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.event_bus import read_new_events
from app.core.models import StudentProfile, User
from app.services.notification.email_sender import (
    render_certificate_issued_email,
    render_profile_updated_email,
    render_resume_processed_email,
    send_email,
)

logger = logging.getLogger("nexyuva.notification_subscribers")

_consumer_tasks: list[asyncio.Task] = []


async def _get_user_email(user_id: str) -> str | None:
    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id))
        return user.email if user else None


async def _certificate_issued_consumer():
    """Consumes 'certificate.issued' events and emails the student."""
    last_id = "$"  # only events from now on — this consumer's own lifetime
    while True:
        try:
            events = await read_new_events("certificate.issued", last_id=last_id, block_ms=5000)
            for event in events:
                last_id = event["id"]
                payload = event["payload"]
                email = await _get_user_email(payload["student_email_user_id"])
                if email is None:
                    logger.warning(
                        "certificate.issued event for unknown user_id %s",
                        payload["student_email_user_id"],
                    )
                    continue

                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(StudentProfile).where(
                            StudentProfile.id == uuid.UUID(payload["student_id"])
                        )
                    )
                    profile = result.scalar_one_or_none()
                    student_name = profile.full_name if profile else "Student"

                html = render_certificate_issued_email(
                    student_name, payload["internship_title"]
                )
                send_email(email, "Your NexYuva certificate is ready", html)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("certificate.issued consumer loop error — retrying")
            await asyncio.sleep(2)


async def _resume_uploaded_consumer():
    """Consumes 'resume.uploaded' events and emails the student a summary.

    M1 fix: this event used to be published with zero subscribers (dead
    event). Note the embedding regeneration itself already happens
    synchronously in the upload_resume route (it needs to be immediate for
    recommendations to work right away) -- this consumer only handles the
    separate, genuinely async-appropriate job of notifying the student.
    """
    last_id = "$"
    while True:
        try:
            events = await read_new_events("resume.uploaded", last_id=last_id, block_ms=5000)
            for event in events:
                last_id = event["id"]
                payload = event["payload"]
                email = await _get_user_email(payload["student_email_user_id"])
                if email is None:
                    logger.warning(
                        "resume.uploaded event for unknown user_id %s",
                        payload["student_email_user_id"],
                    )
                    continue

                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(StudentProfile).where(
                            StudentProfile.id == uuid.UUID(payload["student_id"])
                        )
                    )
                    profile = result.scalar_one_or_none()
                    student_name = profile.full_name if profile else "Student"

                html = render_resume_processed_email(
                    student_name, payload["skills_detected_count"]
                )
                send_email(email, "Your NexYuva resume has been processed", html)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("resume.uploaded consumer loop error -- retrying")
            await asyncio.sleep(2)


async def _profile_updated_consumer():
    """Consumes 'profile.updated' events and emails the student a summary.

    M1 fix: like resume.uploaded, this was previously published with zero
    subscribers. Only published for updates that touch skills/academic
    background (see student/routes.py) so this doesn't fire -- and email --
    on every minor field edit.
    """
    last_id = "$"
    while True:
        try:
            events = await read_new_events("profile.updated", last_id=last_id, block_ms=5000)
            for event in events:
                last_id = event["id"]
                payload = event["payload"]
                email = await _get_user_email(payload["student_email_user_id"])
                if email is None:
                    logger.warning(
                        "profile.updated event for unknown user_id %s",
                        payload["student_email_user_id"],
                    )
                    continue

                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(StudentProfile).where(
                            StudentProfile.id == uuid.UUID(payload["student_id"])
                        )
                    )
                    profile = result.scalar_one_or_none()
                    student_name = profile.full_name if profile else "Student"

                html = render_profile_updated_email(
                    student_name, payload["updated_fields"]
                )
                send_email(email, "Your NexYuva profile was updated", html)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("profile.updated consumer loop error -- retrying")
            await asyncio.sleep(2)


async def register_notification_subscribers():
    """Called once from FastAPI's startup event. Idempotent — safe to call
    more than once (e.g. under a test harness) without spawning duplicate
    consumers, since it checks for already-running tasks first."""
    global _consumer_tasks
    if _consumer_tasks:
        logger.info("Notification consumers already running, skipping re-registration")
        return

    _consumer_tasks.append(asyncio.create_task(_certificate_issued_consumer()))
    _consumer_tasks.append(asyncio.create_task(_resume_uploaded_consumer()))
    _consumer_tasks.append(asyncio.create_task(_profile_updated_consumer()))
    logger.info("Started %d notification consumer task(s)", len(_consumer_tasks))
