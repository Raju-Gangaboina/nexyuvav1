"""
NexYuva backend entrypoint. A modular monolith: each services/<name> module
owns its own router, models, and schemas, mounted here under /api/v1/<name>.
See Architecture.md for the full service-boundary rationale.
"""
import logging

from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.auth_routes import router as auth_router
from app.core.oauth_linkedin import router as linkedin_router
from app.core.config import settings
from app.core.rate_limit import limiter
from app.services.student.routes import router as student_router
from app.services.organization.routes import router as organization_router
from app.services.admin.routes import router as admin_router
from app.services.recommendation.routes import router as recommendation_router
from app.services.assessment.routes import router as assessment_router
from app.services.aptitude.routes import router as aptitude_router
from app.services.interview.routes import router as interview_router
from app.services.certificate.routes import router as certificate_router
from app.services.admin.analytics_routes import router as analytics_router
from app.services.lookup.routes import router as lookup_router
from app.services.luckship.routes import router as luckship_router
from app.services.scheduling.routes import router as scheduling_router
from app.services.assisted_interview.routes import router as assisted_interview_router
from app.services.voice_screen.routes import router as voice_screen_router, org_router as voice_screen_org_router
from app.services.notification.subscribers import register_notification_subscribers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nexyuva")

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    # NOTE: allow_origins=["*"] together with allow_credentials=True is an
    # invalid combination per the CORS spec. Starlette's CORSMiddleware only
    # echoes back the real request Origin (instead of literally "*") on
    # preflight OPTIONS requests and on simple/actual requests that carry a
    # Cookie header -- everything else (e.g. a Bearer-token GET with no
    # cookie, which is how this app authenticates) gets a literal "*" for
    # Access-Control-Allow-Origin alongside Access-Control-Allow-Credentials:
    # true, and browsers reject that combo outright ("No
    # 'Access-Control-Allow-Origin' header is present"). Using an explicit
    # origin allowlist avoids the wildcard path entirely so every response
    # (preflight or not) echoes back a real, spec-legal origin.
    allow_origins=_DEV_ORIGINS if settings.ENV == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Never let a raw stack trace reach the frontend (Rules.md §3)."""
    logger.exception("Unhandled error on %s %s", request.method, request.url)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


app.include_router(auth_router)
app.include_router(linkedin_router)
app.include_router(student_router)
app.include_router(organization_router)
app.include_router(admin_router)
app.include_router(recommendation_router)
app.include_router(assessment_router)
app.include_router(aptitude_router)
app.include_router(interview_router)
app.include_router(certificate_router)
app.include_router(analytics_router)
app.include_router(lookup_router)
app.include_router(luckship_router)
app.include_router(scheduling_router)
app.include_router(assisted_interview_router)
app.include_router(voice_screen_router)
app.include_router(voice_screen_org_router)

# Serves uploaded avatars (and anything else future-uploaded here) directly
# from disk -- no auth needed to view a public profile photo. Directory is
# created up front so this doesn't 404 on a fresh checkout before any
# student has uploaded anything (StaticFiles errors at startup if the
# mount path doesn't exist yet).
_uploads_dir = Path("uploads")
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")


@app.on_event("startup")
async def start_notification_consumers():
    await register_notification_subscribers()


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
