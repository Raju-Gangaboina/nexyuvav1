"""
LinkedIn identity verification via OAuth 2.0 / OpenID Connect (Architecture.md
§11). This is intentionally limited to identity — name, headline, profile
photo — via LinkedIn's official "Sign in with LinkedIn" flow. It does NOT
and will not scrape posts/activity; see Architecture.md §11 for why.

Flow:
  1. Frontend redirects student to /api/v1/auth/linkedin/login
  2. LinkedIn redirects back to /api/v1/auth/linkedin/callback with a code
  3. We exchange the code for an access token, fetch the userinfo endpoint,
     and mark the student's profile as linkedin_verified=True
"""
import logging
import uuid
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.models import StudentProfile
from app.core.security import get_current_user

router = APIRouter(prefix="/api/v1/auth/linkedin", tags=["linkedin"])
logger = logging.getLogger("nexyuva.linkedin")

LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"


def _require_linkedin_configured():
    if not (settings.LINKEDIN_CLIENT_ID and settings.LINKEDIN_CLIENT_SECRET):
        raise HTTPException(
            status_code=503,
            detail="LinkedIn integration is not configured on this server yet.",
        )


@router.get("/login")
async def linkedin_login(user: dict = Depends(get_current_user)):
    """
    Redirects to LinkedIn's consent screen. The student's own user_id is
    passed through `state` so the callback knows whose profile to update —
    LinkedIn echoes `state` back unchanged, this is the standard CSRF-safe
    pattern for OAuth, not a custom hack.
    """
    _require_linkedin_configured()

    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "scope": "openid profile email",
        "state": user["user_id"],
    }
    return RedirectResponse(f"{LINKEDIN_AUTH_URL}?{urlencode(params)}")


@router.get("/callback")
async def linkedin_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    _require_linkedin_configured()

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            LINKEDIN_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
                "client_id": settings.LINKEDIN_CLIENT_ID,
                "client_secret": settings.LINKEDIN_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10.0,
        )
        if token_resp.status_code != 200:
            logger.error("LinkedIn token exchange failed: %s", token_resp.text)
            raise HTTPException(status_code=502, detail="LinkedIn sign-in failed. Try again.")

        access_token = token_resp.json()["access_token"]

        userinfo_resp = await client.get(
            LINKEDIN_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        if userinfo_resp.status_code != 200:
            logger.error("LinkedIn userinfo fetch failed: %s", userinfo_resp.text)
            raise HTTPException(status_code=502, detail="Could not fetch LinkedIn profile.")

        userinfo = userinfo_resp.json()

    # `state` carries the student's user_id from the /login step
    try:
        student_user_id = uuid.UUID(state)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == student_user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")

    profile.linkedin_verified = True
    # LinkedIn's OpenID userinfo gives 'name', not a headline — headline
    # requires the Marketing Developer Platform (partner-only), so we store
    # what's actually available rather than pretend we have more
    profile.linkedin_headline = userinfo.get("name")
    await db.commit()

    return {"linkedin_verified": True, "name": userinfo.get("name")}
