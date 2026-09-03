"""
Thin httpx wrapper around Google's OAuth2 + Calendar v3 REST APIs — no
google-api-python-client dependency, matching this codebase's existing
pattern of calling OAuth providers directly over HTTP (see
app/core/oauth_linkedin.py).

Used by services/scheduling for Module 5.5 (Smart Scheduling):
  1. Org connects their Google Calendar (OAuth consent, offline access so
     we get a refresh_token we can use indefinitely).
  2. When proposing/confirming an interview slot, we check the org's
     freebusy window and, on confirmation, create a real Calendar event
     with a Google Meet link and invite both the org and the student.
"""
import logging
from datetime import datetime

import httpx
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger("nexyuva.google_calendar")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
CALENDAR_FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy"
CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

SCOPES = "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy"


def require_google_configured():
    if not (settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET
            and settings.GOOGLE_OAUTH_REDIRECT_URI):
        raise HTTPException(
            status_code=503,
            detail="Smart Scheduling is not configured on this server yet (missing Google OAuth settings).",
        )


def build_consent_url(state: str) -> str:
    from urllib.parse import urlencode

    params = {
        "response_type": "code",
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "access_type": "offline",   # required to get a refresh_token
        "prompt": "consent",        # force a refresh_token even on re-auth
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> dict:
    """Returns Google's token response: access_token, refresh_token, expires_in, etc."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            },
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.error("Google token exchange failed: %s", resp.text)
            raise HTTPException(status_code=502, detail="Google Calendar sign-in failed. Try again.")
        return resp.json()


async def fetch_userinfo(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.error("Google userinfo fetch failed: %s", resp.text)
            raise HTTPException(status_code=502, detail="Could not fetch Google account info.")
        return resp.json()


async def refresh_access_token(refresh_token: str) -> str:
    """Exchanges a stored refresh_token for a short-lived access_token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            },
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.error("Google token refresh failed: %s", resp.text)
            raise HTTPException(
                status_code=502,
                detail="Google Calendar connection has expired or been revoked — the org needs to reconnect.",
            )
        return resp.json()["access_token"]


async def get_busy_intervals(access_token: str, time_min: datetime, time_max: datetime) -> list[dict]:
    """Returns [{"start": iso, "end": iso}, ...] busy blocks on the org's primary calendar."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            CALENDAR_FREEBUSY_URL,
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "timeMin": time_min.isoformat() + "Z" if time_min.tzinfo is None else time_min.isoformat(),
                "timeMax": time_max.isoformat() + "Z" if time_max.tzinfo is None else time_max.isoformat(),
                "items": [{"id": "primary"}],
            },
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.error("Google freebusy query failed: %s", resp.text)
            raise HTTPException(status_code=502, detail="Could not check calendar availability.")
        data = resp.json()
        return data.get("calendars", {}).get("primary", {}).get("busy", [])


async def create_event_with_meet(
    access_token: str,
    summary: str,
    description: str,
    start: datetime,
    end: datetime,
    attendee_emails: list[str],
) -> dict:
    """
    Creates a Calendar event with a Google Meet link (conferenceData) and
    invites both parties. Returns the created event JSON (id, htmlLink,
    hangoutLink, etc).
    """
    import uuid as _uuid

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CALENDAR_EVENTS_URL}?conferenceDataVersion=1&sendUpdates=all",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "summary": summary,
                "description": description,
                "start": {"dateTime": start.isoformat()},
                "end": {"dateTime": end.isoformat()},
                "attendees": [{"email": e} for e in attendee_emails],
                "conferenceData": {
                    "createRequest": {
                        "requestId": str(_uuid.uuid4()),
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                },
            },
            timeout=10.0,
        )
        if resp.status_code not in (200, 201):
            logger.error("Google event creation failed: %s", resp.text)
            raise HTTPException(status_code=502, detail="Could not create the calendar event.")
        return resp.json()


async def delete_event(access_token: str, event_id: str) -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{CALENDAR_EVENTS_URL}/{event_id}?sendUpdates=all",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        # 410 Gone means it was already deleted on Google's side — not an error for us.
        if resp.status_code not in (200, 204, 410):
            logger.error("Google event deletion failed: %s", resp.text)
            raise HTTPException(status_code=502, detail="Could not cancel the calendar event.")
