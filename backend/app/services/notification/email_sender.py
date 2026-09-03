"""
Email Notifications (PRD §4, Architecture.md §2/§6). Real SMTP send via
Python's stdlib smtplib — no third-party email API needed for a contest-
scale volume of emails. Degrades gracefully (logs, doesn't crash the
calling request) when SMTP isn't configured, matching the same honesty
pattern used for GitHub/LinkedIn/embeddings elsewhere in this codebase.

HONEST STATUS: this has never sent a real email — this sandbox has no SMTP
credentials configured and no reachable mail relay to test against (network
egress is restricted to the allowlisted domains in this environment, which
doesn't include any mail provider). The message-composition logic and
graceful-degradation path are tested below; actual delivery needs real SMTP
credentials (e.g. a free Gmail app password, SendGrid free tier, or
Mailtrap for a fully sandboxed test inbox) on your machine before demo day.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger("nexyuva.notifications")


def _smtp_configured() -> bool:
    return bool(
        getattr(settings, "SMTP_HOST", None)
        and getattr(settings, "SMTP_USER", None)
        and getattr(settings, "SMTP_PASSWORD", None)
    )


def send_email(to_email: str, subject: str, body_html: str) -> bool:
    """
    Returns True if sent, False if degraded (not configured or send failed).
    Never raises — callers (event handlers) should not have a notification
    failure break the triggering action (e.g. a resume upload succeeding
    should never fail just because the "email sent" step had a problem).
    """
    if not _smtp_configured():
        logger.warning(
            "SMTP not configured — email to %s ('%s') was not sent. "
            "Set SMTP_HOST/SMTP_USER/SMTP_PASSWORD in .env to enable.",
            to_email, subject,
        )
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = to_email
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT or 587, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False


def render_certificate_issued_email(student_name: str, internship_title: str) -> str:
    return f"""
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #0F4C81;">Congratulations, {student_name}!</h2>
      <p>Your completion certificate for <strong>{internship_title}</strong> is ready.
      You can download it from your NexYuva profile.</p>
    </div>
    """


def render_resume_processed_email(student_name: str, skills_detected_count: int) -> str:
    # M1 fix: real consumer for the previously-dead 'resume.uploaded' event.
    return f"""
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #0F4C81;">Resume processed, {student_name}!</h2>
      <p>We finished analyzing your resume and detected <strong>{skills_detected_count}
      skill(s)</strong> from it. Your profile has been updated with these -- check your
      NexYuva profile to review or add anything we missed.</p>
    </div>
    """


def render_profile_updated_email(student_name: str, updated_fields: list[str]) -> str:
    # M1 fix: real consumer for the previously-dead 'profile.updated' event.
    fields_str = ", ".join(updated_fields)
    return f"""
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #0F4C81;">Profile updated, {student_name}</h2>
      <p>Your NexYuva profile was just updated ({fields_str}). Your match
      recommendations will reflect this the next time you check your dashboard.</p>
    </div>
    """
