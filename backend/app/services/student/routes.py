import logging
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.ats_analyzer import analyze_resume_ats
from app.ai.chatbot import answer_question
from app.ai.embeddings import build_student_profile_text, embed_text
from app.ai.github_agent import GitHubRateLimitError, compute_github_score, fetch_public_profile
from app.ai.resume_parser import extract_text, parse_resume
from app.ai.sentiment_analysis import analyze_feedback_sentiment
from app.core.database import get_db
from app.core.event_bus import publish
from app.core.models import (
    Application,
    ApplicationStatus,
    Feedback,
    Internship,
    Organization,
    Report,
    ReportReason,
    ReportTargetType,
    StudentProfile,
    User,
)
from app.core.rate_limit import limiter
from app.core.security import require_role
from app.services.student.application_schemas import (
    ApplicationResponse,
    ApplyRequest,
)
from app.services.student.chatbot_schemas import ChatAnswerResponse, ChatQuestionRequest
from app.services.student.feedback_schemas import SubmitFeedbackRequest, SubmitFeedbackResponse
from app.services.student.schemas import (
    ATSAnalysisResponse,
    GitHubSyncRequest,
    ResumeParseResponse,
    StudentProfileResponse,
    StudentProfileUpdate,
)

router = APIRouter(prefix="/api/v1/students", tags=["students"])
logger = logging.getLogger("nexyuva.student")

RESUME_UPLOAD_DIR = Path("uploads/resumes")
RESUME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_RESUME_TYPES = {".pdf", ".docx"}
MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024  # 5MB

AVATAR_UPLOAD_DIR = Path("uploads/avatars")
AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_AVATAR_TYPES = {".jpg", ".jpeg", ".png", ".webp"}
MAX_AVATAR_SIZE_BYTES = 3 * 1024 * 1024  # 3MB
_AVATAR_MAGIC_BYTES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".webp": (b"RIFF",),  # followed by size + "WEBP"; RIFF prefix is enough here
}

# Magic-byte signatures for the two allowed resume types (H4 fix — extension
# alone is spoofable; this mirrors the check added to verification-document
# upload).
_RESUME_MAGIC_BYTES = {
    ".pdf": (b"%PDF-",),
    ".docx": (b"PK\x03\x04",),  # docx is a zip archive
}


async def _get_own_profile(user_id: str, db: AsyncSession) -> StudentProfile:
    result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id))
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return profile


def _profile_response(profile: StudentProfile, email: str) -> dict:
    """
    StudentProfileResponse includes `email`, which lives on User, not
    StudentProfile - this merges the two instead of adding an email
    column that would just duplicate users.email.
    """
    return {
        "email": email,
        "avatar_url": profile.avatar_url,
        "full_name": profile.full_name,
        "academic_background": profile.academic_background,
        "location": profile.location,
        "location_preference": profile.location_preference,
        "skills": profile.skills or [],
        "resume_path": profile.resume_path,
        "resume_score": profile.resume_score,
        "github_username": profile.github_username,
        "github_score": profile.github_score,
        "linkedin_verified": profile.linkedin_verified,
        "linkedin_headline": profile.linkedin_headline,
        "degree": profile.degree,
        "branch": profile.branch,
        "year": profile.year,
        "cgpa": profile.cgpa,
        "linkedin_url": profile.linkedin_url,
        "bio": profile.bio,
        "college": profile.college,
        "tools": profile.tools or [],
        "preferred_domains": profile.preferred_domains or [],
        "preferred_locations": profile.preferred_locations or [],
        "preferred_mode": profile.preferred_mode,
        "min_stipend": profile.min_stipend,
        "projects": profile.projects or [],
        "certifications": profile.certifications or [],
        "internship_history": profile.internship_history or [],
    }


@router.get("/me", response_model=StudentProfileResponse)
async def get_my_profile(
    user: dict = Depends(require_role("student")), db: AsyncSession = Depends(get_db)
):
    profile = await _get_own_profile(user["user_id"], db)
    user_row = await db.get(User, uuid.UUID(user["user_id"]))
    return _profile_response(profile, user_row.email)


@router.patch("/me", response_model=StudentProfileResponse)
async def update_my_profile(
    payload: StudentProfileUpdate,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(profile, field, value)

    # Regenerate embedding whenever the fields that feed it change — mirrors
    # the same embed-on-write approach used for internship posting, so a
    # student's profile is never left with a stale or null embedding after
    # a real update (see Memory.md decision log for why this isn't Phase 4-only).
    if "skills" in updates or "academic_background" in updates:
        embedding_text = build_student_profile_text(
            profile.full_name, profile.academic_background, profile.skills or []
        )
        profile.profile_embedding = embed_text(embedding_text)  # None on failure — fine

    await db.commit()
    await db.refresh(profile)

    # M1 fix: publish profile.updated now that a real subscriber exists
    # (notification/subscribers.py). Only fires for updates that touch
    # skills/academic_background, same condition as the embedding
    # regeneration above, so this doesn't email the student over every
    # minor field edit.
    if "skills" in updates or "academic_background" in updates:
        await publish(
            "profile.updated",
            {
                "student_email_user_id": user["user_id"],
                "student_id": str(profile.id),
                "updated_fields": list(updates.keys()),
            },
        )

    user_row = await db.get(User, uuid.UUID(user["user_id"]))
    return _profile_response(profile, user_row.email)


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Profile photo upload. Mirrors the resume upload's H4 hardening
    (extension allow-list + size cap + magic-byte content verification --
    an attacker could otherwise rename a script to profile.png and rely on
    extension-only checks). Stored under uploads/avatars/{user_id}{suffix}
    and served statically from /uploads (see app/main.py StaticFiles
    mount) rather than through an authenticated route, since a profile
    photo isn't sensitive and recruiters/orgs viewing a student's profile
    need to load it without a bearer token.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {ALLOWED_AVATAR_TYPES}",
        )

    raw = await file.read()
    if len(raw) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Avatar image exceeds 3MB limit")
    if not any(raw.startswith(sig) for sig in _AVATAR_MAGIC_BYTES[suffix]):
        raise HTTPException(
            status_code=400,
            detail="File content doesn't match its extension -- upload a genuine image.",
        )

    profile = await _get_own_profile(user["user_id"], db)

    # Clean up any previous avatar file (different extension than the new
    # upload would otherwise leak orphaned files under uploads/avatars/).
    for existing_suffix in ALLOWED_AVATAR_TYPES:
        stale = AVATAR_UPLOAD_DIR / f"{user['user_id']}{existing_suffix}"
        if stale.exists():
            stale.unlink()

    dest_path = AVATAR_UPLOAD_DIR / f"{user['user_id']}{suffix}"
    with dest_path.open("wb") as f:
        f.write(raw)

    # Cache-busting query param so the browser doesn't keep serving a
    # stale cached image after a re-upload at the same URL/filename.
    profile.avatar_url = f"/uploads/avatars/{user['user_id']}{suffix}?v={int(datetime.utcnow().timestamp())}"
    await db.commit()

    return {"avatar_url": profile.avatar_url}


@router.post("/me/resume", response_model=ResumeParseResponse)
async def upload_resume(
    file: UploadFile,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_RESUME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {ALLOWED_RESUME_TYPES}",
        )

    # H4 fix: enforce a size cap (DoS via oversized uploads) and verify the
    # actual file content via magic bytes, not just the trusted extension.
    raw = await file.read()
    if len(raw) > MAX_RESUME_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Resume file exceeds 5MB limit")
    if not any(raw.startswith(sig) for sig in _RESUME_MAGIC_BYTES[suffix]):
        raise HTTPException(
            status_code=400,
            detail="File content doesn't match its extension — upload a genuine PDF or DOCX.",
        )

    profile = await _get_own_profile(user["user_id"], db)

    dest_path = RESUME_UPLOAD_DIR / f"{user['user_id']}{suffix}"
    with dest_path.open("wb") as f:
        f.write(raw)

    try:
        parsed = parse_resume(str(dest_path))
    except Exception:
        # Graceful degradation per Rules.md §3 — resume is saved, but parsing
        # failure doesn't crash the request. Student can still fill skills manually.
        logger.exception("Resume parsing failed for user %s", user["user_id"])
        raise HTTPException(
            status_code=422,
            detail="Could not parse resume automatically. Please enter your "
            "skills manually in your profile.",
        )

    # Only CONFIRMED skills (exact taxonomy matches) get auto-merged into the
    # profile — suggested_skills are a semantic "maybe" from embeddings, not
    # a fact, so the student has to explicitly add one (via PATCH /me skills)
    # before it lands in their profile. See app/ai/resume_parser.py docstring.
    confirmed_names = [s["name"] for s in parsed["confirmed_skills"]]
    existing = set(profile.skills or [])
    profile.skills = sorted(existing | set(confirmed_names))
    profile.resume_path = str(dest_path)
    # Persist structured project entries (see StudentProfile.projects
    # docstring, app/core/models.py) -- always overwritten with the latest
    # resume's parse, unlike skills/education below, since projects aren't
    # manually editable anywhere and should simply reflect the most recent
    # upload rather than accumulate stale entries from an older resume.
    profile.projects = parsed["projects"]
    # Same always-overwrite treatment as projects above (see docstring) --
    # certifications aren't manually editable anywhere either, so they
    # should simply reflect the most recent resume upload.
    profile.certifications = parsed["certifications"]
    # Same always-overwrite treatment as projects/certifications above --
    # internship history isn't manually editable anywhere either, so it
    # should simply reflect the most recent resume upload.
    profile.internship_history = parsed["experience"]
    if parsed["academic_background_guess"] and not profile.academic_background:
        profile.academic_background = parsed["academic_background_guess"]

    # Deterministic regex extractions (links + structured education) are the
    # same reliability class as confirmed_skills — see app/ai/resume_parser.py
    # module docstring — so they're safe to auto-fill the same way. Found via
    # direct testing that these were being parsed correctly but never
    # actually written to the profile, even though the columns exist on
    # StudentProfile — only skills/academic_background were ever persisted
    # here. Never overwrites a value the student already set (a resume
    # upload shouldn't clobber a manual edit), only fills in what's
    # currently empty.
    links = parsed["links"]
    if links["github_username"] and not profile.github_username:
        profile.github_username = links["github_username"]
    if links["linkedin_url"] and not profile.linkedin_url:
        profile.linkedin_url = links["linkedin_url"]

    education = parsed["education"]
    if education["degree"] and not profile.degree:
        profile.degree = education["degree"]
    if education["branch"] and not profile.branch:
        profile.branch = education["branch"]
    if education["cgpa"] is not None and profile.cgpa is None:
        profile.cgpa = education["cgpa"]
    if education["year"] is not None and profile.year is None:
        profile.year = education["year"]
    # College/location are only auto-filled when verified against the
    # self-hosted AISHE dataset (app/ai/resume_parser.py's _match_college) —
    # an unverified raw extraction is shown to the student to confirm via
    # the "Add education" flow instead of being silently written, since a
    # resume-formatting artifact could otherwise land in a profile field
    # unreviewed.
    if education.get("college_verified") and education.get("college") and not profile.college:
        profile.college = education["college"]
    if education.get("college_verified") and education.get("college_location") and not profile.location:
        profile.location = education["college_location"]

    embedding_text = build_student_profile_text(
        profile.full_name, profile.academic_background, profile.skills or []
    )
    profile.profile_embedding = embed_text(embedding_text)  # None on failure — fine

    await db.commit()

    # M1 fix: publish resume.uploaded now that a real subscriber exists
    # (notification/subscribers.py) -- previously published with zero
    # listeners.
    await publish(
        "resume.uploaded",
        {
            "student_email_user_id": user["user_id"],
            "student_id": str(profile.id),
            "skills_detected_count": len(confirmed_names),
        },
    )

    return ResumeParseResponse(**parsed)


@router.get("/me/ats-analysis", response_model=ATSAnalysisResponse)
async def get_ats_analysis(
    internship_id: uuid.UUID | None = None,
    include_ai: bool = True,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Production ATS analyzer (nexyuva_supplemental_audit.docx M5 follow-up --
    see app/ai/ats_analyzer.py module docstring for the full design). Always
    runs the deterministic parseability/structure/content checks against the
    student's currently stored resume file; optionally also runs a literal
    keyword-gap check against one specific internship's required_skills when
    internship_id is passed -- this is what the "Check ATS Match" button on
    a Live Internship listing calls, so a student sees how their resume
    reads for THIS role specifically, not just in the abstract.

    include_ai=False skips the Groq qualitative pass (see ats_analyzer.py
    docstring on analyze_resume_ats) -- used by Live Internships to compute
    a cheap, instant score badge for every card in the list without firing
    one real LLM call per internship on every page load. The full
    Groq-reviewed breakdown still runs (include_ai defaults True) when a
    student clicks through for the real analysis, and on the Profile page's
    ATS Score tab.

    Deliberately GET, not tied to a request body -- nothing here is written,
    it's a read-only analysis of the resume already on file. Re-run after a
    fresh resume upload to see updated results.
    """
    profile = await _get_own_profile(user["user_id"], db)
    if not profile.resume_path:
        raise HTTPException(
            status_code=400,
            detail="Upload a resume first before running an ATS check.",
        )

    resume_file = Path(profile.resume_path)
    if not resume_file.exists():
        raise HTTPException(status_code=404, detail="Stored resume file is missing -- try re-uploading.")

    try:
        text = extract_text(str(resume_file))
    except Exception:
        logger.exception("ATS analysis: failed to extract resume text for %s", user["user_id"])
        raise HTTPException(
            status_code=422,
            detail="Could not read your resume file for ATS analysis.",
        )

    required_skills = None
    if internship_id is not None:
        internship = await db.get(Internship, internship_id)
        if internship is None:
            raise HTTPException(status_code=404, detail="Internship not found")
        required_skills = internship.required_skills or None

    return await analyze_resume_ats(
        text=text,
        resume_path=profile.resume_path,
        confirmed_skill_names=profile.skills or [],
        required_skills=required_skills,
        include_ai=include_ai,
    )


@router.post("/me/github/sync", response_model=StudentProfileResponse)
@limiter.limit("5/hour")
async def sync_github_profile(
    request: Request,
    payload: GitHubSyncRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetches real public GitHub data for the given username and computes a
    contribution score (Architecture.md §11). Never crashes the request on
    GitHub-side failures — rate limits and missing profiles both return a
    clear 4xx with a specific message, per Rules.md §3.

    H1 fix: rate-limited per-user/IP (5/hour) since each sync makes ~40+
    calls against the shared, unauthenticated GitHub quota (H2) — this at
    least stops one user from repeatedly burning the shared budget.

    H2 fix: fetch_public_profile now caches results in Redis for 1 hour, so
    a repeat sync within that window costs zero GitHub calls regardless of
    the rate limit above. Pass force_refresh=true in the request body to
    bypass the cache and force a live fetch (still subject to the 5/hour
    limit).
    """
    profile = await _get_own_profile(user["user_id"], db)

    try:
        github_data = await fetch_public_profile(
            payload.github_username, force_refresh=payload.force_refresh
        )
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("GitHub sync failed for %s", payload.github_username)
        raise HTTPException(
            status_code=502, detail="Could not reach GitHub right now. Try again shortly."
        )

    profile.github_username = payload.github_username
    profile.github_score = compute_github_score(github_data)

    await db.commit()
    await db.refresh(profile)
    # Bug fix: this previously returned the raw ORM `profile` object, which
    # StudentProfileResponse can't serialize on its own -- `email` lives on
    # User, not StudentProfile (see _profile_response's own docstring on
    # exactly this), so FastAPI's response validation raised a 500 on every
    # real call to this route, even though the DB write above had already
    # succeeded. Found live while extending test_sourcing_live.py to check
    # the skill-confidence GitHub-evidence signal end-to-end -- the sourcing
    # side picked up the committed github_username fine (it reads straight
    # from the DB), which is what masked this from being caught earlier by
    # anything checking sourcing output alone.
    user_row = await db.get(User, uuid.UUID(user["user_id"]))
    return _profile_response(profile, user_row.email)


@router.post("/me/applications", response_model=ApplicationResponse, status_code=201)
async def apply_to_internship(
    payload: ApplyRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """One-click apply (PRD §4) — auto-filled from the existing profile,
    no separate application form."""
    profile = await _get_own_profile(user["user_id"], db)

    internship = await db.get(Internship, payload.internship_id)
    if internship is None or not internship.is_active:
        raise HTTPException(status_code=404, detail="Internship not found")

    existing = await db.execute(
        select(Application).where(
            Application.student_id == profile.id,
            Application.internship_id == payload.internship_id,
        )
    )
    existing_application = existing.scalar_one_or_none()

    if existing_application is not None:
        if existing_application.status != ApplicationStatus.WITHDRAWN:
            raise HTTPException(status_code=400, detail="Already applied to this internship")
        # Re-apply after a withdraw is allowed exactly once (student.routes
        # withdraw_application increments withdrawal_count on every withdraw)
        # to let a genuine "applied by mistake" case fix itself, without
        # letting the same internship be apply/withdraw-spammed indefinitely.
        if existing_application.withdrawal_count >= 2:
            raise HTTPException(
                status_code=400,
                detail="You have already withdrawn from this internship and cannot re-apply again",
            )
        existing_application.status = ApplicationStatus.APPLIED
        existing_application.applied_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing_application)
        return existing_application

    application = Application(student_id=profile.id, internship_id=payload.internship_id)
    db.add(application)
    await db.commit()
    await db.refresh(application)
    return application


@router.get("/me/applications", response_model=list[ApplicationResponse])
async def list_my_applications(
    user: dict = Depends(require_role("student")), db: AsyncSession = Depends(get_db)
):
    profile = await _get_own_profile(user["user_id"], db)
    result = await db.execute(
        select(Application, Internship.title, Organization.name)
        .join(Internship, Application.internship_id == Internship.id)
        .join(Organization, Internship.organization_id == Organization.id)
        .where(Application.student_id == profile.id)
    )
    rows = result.all()
    responses = []
    for application, internship_title, organization_name in rows:
        item = ApplicationResponse.model_validate(application)
        item.internship_title = internship_title
        item.organization_name = organization_name
        responses.append(item)
    return responses


@router.get("/internships/{internship_id}")
async def get_internship_detail(
    internship_id: uuid.UUID,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Direct single-internship lookup by ID for the student-facing
    post-apply journey page (frontend: /student/application/[applicationId]).

    Distinct from GET /recommendations/me, which only returns the student's
    top_k ranked matches -- an internship a student already applied to (e.g.
    one they found via search, or one outside their top 10 match ranking)
    would silently be missing from that list, which previously made fields
    like aptitude_check_enabled look False even when the internship actually
    has it on. This route always finds it by ID regardless of ranking.
    """
    internship = await db.get(Internship, internship_id)
    if internship is None:
        raise HTTPException(status_code=404, detail="Internship not found")
    organization = await db.get(Organization, internship.organization_id)
    return {
        "internship_id": str(internship.id),
        "title": internship.title,
        "organization_name": organization.name if organization else "Unknown",
        "domain": internship.domain,
        "location": internship.location,
        "work_mode": internship.work_mode.value,
        "duration_weeks": internship.duration_weeks,
        "stipend": internship.stipend,
        "aptitude_check_enabled": internship.aptitude_check_enabled,
    }


@router.patch("/me/applications/{application_id}/withdraw", response_model=ApplicationResponse)
async def withdraw_application(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Student-initiated cancel for a mistaken/unwanted application (soft
    withdraw - row is kept so the company still sees it, but flips to
    WITHDRAWN so it drops out of their active pipeline and the student
    cannot re-apply to the same internship afterwards)."""
    profile = await _get_own_profile(user["user_id"], db)
    application = await db.get(Application, application_id)

    if application is None or application.student_id != profile.id:
        raise HTTPException(status_code=404, detail="Application not found")

    if application.status not in (ApplicationStatus.APPLIED, ApplicationStatus.SHORTLISTED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot withdraw an application that is already {application.status.value}",
        )

    application.status = ApplicationStatus.WITHDRAWN
    application.withdrawal_count += 1
    await db.commit()
    await db.refresh(application)
    return application


@router.get("/me/applications/{application_id}/certificate")
async def download_certificate(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Certificate download (PRD §4). Now checks ApplicationStatus.COMPLETED
    (added in Phase 6, see Memory.md) rather than the earlier ACCEPTED
    check this route used before a real completion signal existed — an
    org marks completion and issues the canonical certificate via
    POST /api/v1/certificates/issue, which stores one PDF and its cert ID;
    this route serves that stored file rather than regenerating a fresh PDF
    (with a different random certificate ID) on every download.
    """
    profile = await _get_own_profile(user["user_id"], db)
    application = await db.get(Application, application_id)

    if application is None or application.student_id != profile.id:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.status != ApplicationStatus.COMPLETED or not application.certificate_path:
        raise HTTPException(
            status_code=400,
            detail="Certificate is only available once your internship is marked completed.",
        )

    cert_path = Path(application.certificate_path)
    if not cert_path.exists():
        raise HTTPException(status_code=404, detail="Certificate file missing on disk")

    return FileResponse(cert_path, media_type="application/pdf", filename=cert_path.name)


@router.post("/me/applications/{application_id}/feedback", response_model=SubmitFeedbackResponse)
async def submit_feedback(
    application_id: uuid.UUID,
    payload: SubmitFeedbackRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Post-internship feedback (PRD §4). Only allowed once an application is
    COMPLETED — feedback before completion wouldn't be meaningful, and this
    also naturally prevents duplicate/premature submissions.
    """
    profile = await _get_own_profile(user["user_id"], db)
    application = await db.get(Application, application_id)

    if application is None or application.student_id != profile.id:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.status != ApplicationStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="Feedback can only be submitted for a completed internship.",
        )

    existing = await db.execute(
        select(Feedback).where(Feedback.application_id == application_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Feedback already submitted for this application")

    sentiment = analyze_feedback_sentiment(payload.feedback_text)

    feedback = Feedback(
        application_id=application_id,
        student_id=profile.id,
        internship_id=application.internship_id,
        feedback_text=payload.feedback_text,
        rating=payload.rating,
        sentiment_label=sentiment["label"],
        sentiment_compound_score=sentiment["compound_score"],
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)

    return SubmitFeedbackResponse(
        feedback_id=feedback.id,
        sentiment_label=feedback.sentiment_label,
        sentiment_compound_score=feedback.sentiment_compound_score,
    )


@router.post("/me/chat", response_model=ChatAnswerResponse)
async def ask_chatbot(
    payload: ChatQuestionRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Career guidance chatbot (PRD §4). FAQ-first, RAG fallback — see
    app/ai/chatbot.py docstring for current status. Updated 2026-08-01:
    now passes a real db session + question embedding so retrieve_context()
    can actually query the (now seeded) knowledge_base_snippets table
    instead of always short-circuiting to [].
    """
    question_embedding = embed_text(payload.question)
    result = await answer_question(payload.question, question_embedding=question_embedding, db=db)
    return ChatAnswerResponse(**result)


# ---------------------------------------------------------------------------
# Module 10 — Anti-Spam student invitation preferences
# ---------------------------------------------------------------------------

from pydantic import BaseModel as _BaseModel

class InvitationPreferencesRequest(_BaseModel):
    allow_invitations: bool = True
    max_weekly_invites: int = 10


class InvitationPreferencesResponse(_BaseModel):
    allow_invitations: bool
    max_weekly_invites: int


@router.patch("/me/invitation-preferences", response_model=InvitationPreferencesResponse)
async def update_invitation_preferences(
    body: InvitationPreferencesRequest,
    user_id: str = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Module 10: Lets students control whether they receive bulk invitations
    and how many per week they're willing to receive. Recruiter bulk-invite
    logic checks allow_invitations before sending, and platform monitors
    max_weekly_invites to prevent inbox flooding.
    """
    result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id))
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")

    profile.allow_invitations = body.allow_invitations
    profile.max_weekly_invites = max(1, min(50, body.max_weekly_invites))
    await db.commit()
    await db.refresh(profile)

    return InvitationPreferencesResponse(
        allow_invitations=profile.allow_invitations,
        max_weekly_invites=profile.max_weekly_invites,
    )


# --- Student reports (ADMIN_TRUST_SAFETY_MEMO.md Phase 4) --
# Student-filed complaint against a listing or a company. Deliberately a
# thin write -- the admin side (queue, investigate, dismiss, escalate) is
# in app/services/admin/routes.py and shares the same Report row. ---

class FileReportRequest(_BaseModel):
    target_type: ReportTargetType
    target_id: uuid.UUID
    reason: ReportReason
    details: str | None = None


class FileReportResponse(_BaseModel):
    id: uuid.UUID
    status: str
    created_at: datetime


@router.post("/reports", response_model=FileReportResponse)
async def file_report(
    payload: FileReportRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Report an internship listing or an organization for review. A
    verified company can still post a bad listing, and a legitimate
    listing can still belong to a suspicious company -- target_type keeps
    those two cases distinct for the admin queue."""
    if payload.target_type == ReportTargetType.INTERNSHIP:
        target = await db.get(Internship, payload.target_id)
    else:
        target = await db.get(Organization, payload.target_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Report target not found")

    report = Report(
        reporter_id=uuid.UUID(user["user_id"]),
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason,
        details=payload.details,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return FileReportResponse(id=report.id, status=report.status.value, created_at=report.created_at)


@router.get("/reports/mine")
async def my_reports(
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """So a student can see what happened to something they reported --
    without this, filing a report feels like shouting into a void."""
    result = await db.execute(
        select(Report)
        .where(Report.reporter_id == uuid.UUID(user["user_id"]))
        .order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()
    return [
        {
            "id": r.id,
            "target_type": r.target_type.value,
            "target_id": r.target_id,
            "reason": r.reason.value,
            "details": r.details,
            "status": r.status.value,
            "resolution_notes": r.resolution_notes,
            "created_at": r.created_at,
            "resolved_at": r.resolved_at,
        }
        for r in reports
    ]
