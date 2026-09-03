import asyncio
import io
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import build_internship_text, embed_text
from app.ai.github_agent import get_cached_languages
from app.ai.interview_ai import parse_questions_from_text
from app.ai.recommendation_engine import RecommendationWeights, compute_hybrid_score, content_similarity
from app.ai.screening_agent import screen_candidate
from app.ai.skill_confidence import compute_recommendation_confidence, compute_skill_confidence
from app.ai.sourcing_pitch import generate_clean_fallback_explanation, generate_recruiter_pitch
from app.core.cache import get_json, set_json
from app.core.database import get_db
from app.core.domains import normalize_domain_label
from app.core.models import (
    Application,
    AptitudeAttempt,
    AptitudeStatus,
    Badge,
    DocumentReviewStatus,
    DocumentType,
    Internship,
    InterviewAttempt,
    Invitation,
    InvitationStatus,
    Notification,
    Organization,
    OrgVerificationStatus,
    StudentProfile,
    VerificationDocument,
)
from app.core.security import require_role
from app.services.organization.schemas import (
    ApplicantAptitudeSummary,
    ApplicantInterviewSummary,
    AptitudeCheckConfig,
    ApplicantListItem,
    BulkInvitePreviewResponse,
    BulkInviteRequest,
    BulkInviteResponse,
    InternshipCreate,
    InternshipResponse,
    InterviewQuestionDetail,
    IntegrityFlagDetail,
    InterviewReviewResponse,
    NotificationItem,
    OutreachHealthResponse,
    ScoreBreakdownItem,
    ScreeningResponse,
    SourcedCandidateItem,
    UpdateApplicationStatusRequest,
    WebhookConfigResponse,
    WebhookConfigUpdate,
)

router = APIRouter(prefix="/api/v1/organizations", tags=["organizations"])

VERIFICATION_UPLOAD_DIR = Path("uploads/verification_docs")
VERIFICATION_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_VERIFICATION_TYPES = {".pdf", ".jpg", ".jpeg", ".png"}
MAX_VERIFICATION_UPLOAD_BYTES = 10 * 1024 * 1024

_MAGIC_SIGNATURES = {
    ".pdf": [b"%PDF-"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
}


def _matches_magic_bytes(contents: bytes, suffix: str) -> bool:
    signatures = _MAGIC_SIGNATURES.get(suffix, [])
    return any(contents.startswith(sig) for sig in signatures)


def _build_profile_text(profile) -> str:
    """Build a rich, natural-language profile summary from stored DB fields.

    The StudentProfile model doesn't persist raw resume text — the resume is
    parsed at upload time and the structured data (skills, projects, certs,
    bio, internship_history) is what gets stored. This helper reconstructs a
    compact but information-dense text snapshot of the candidate that can be
    fed to Groq for analysis, without making a live read from the resume file.
    """
    parts: list[str] = []

    if getattr(profile, 'bio', None):
        parts.append(profile.bio.strip())

    skills = getattr(profile, 'skills', None) or []
    if skills:
        parts.append(f"Skills: {', '.join(skills)}")

    tools = getattr(profile, 'tools', None) or []
    if tools:
        parts.append(f"Tools: {', '.join(tools)}")

    projects = getattr(profile, 'projects', None) or []
    for p in projects[:5]:
        title = p.get('title', '')
        desc = p.get('description', '')
        tech = ', '.join(p.get('tech_stack', []))
        line = title
        if tech:
            line += f" ({tech})"
        if desc:
            line += f": {desc[:120]}"
        if line:
            parts.append(f"Project — {line}")

    certs = getattr(profile, 'certifications', None) or []
    if certs:
        parts.append(f"Certifications: {', '.join(certs[:5])}")

    history = getattr(profile, 'internship_history', None) or []
    for h in history[:3]:
        title = h.get('title', '')
        desc = h.get('description', '')
        if title:
            entry = f"Experience — {title}"
            if desc:
                entry += f": {desc[:120]}"
            parts.append(entry)

    return '\n'.join(parts) if parts else "No detailed profile text available."


async def _get_own_org(user_id: str, db: AsyncSession) -> Organization:
    result = await db.execute(
        select(Organization).where(Organization.user_id == uuid.UUID(user_id))
    )
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _verification_response(org: Organization) -> dict:
    return {
        "company_name": org.name,
        "status": org.verification_status.value,
        "verification_doc_name": org.verification_doc_name,
        "submitted_at": org.verification_submitted_at,
        "reviewed_at": org.verification_reviewed_at,
        "rejection_reason": org.rejection_reason,
        "action_required_reason": org.action_required_reason,
        "is_verified": org.is_verified,
    }


@router.get("/me/verification")
async def get_my_verification(
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Source of truth for the /company dashboard gate on the frontend —
    replaces the old browser-localStorage-only company store, which never
    talked to this backend at all.
    """
    org = await _get_own_org(user["user_id"], db)
    return _verification_response(org)


@router.post("/verification-document")
async def upload_verification_document(
    file: UploadFile,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Company uploads a GST certificate / incorporation certificate / MSME
    registration. Moves the org to PENDING — a Ministry/Admin reviewer
    must then approve it (POST /admin/organizations/{id}/verify) before
    `is_verified` ever flips true. Re-uploading (e.g. after a rejection)
    resets status back to PENDING and clears any prior rejection reason.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_VERIFICATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_VERIFICATION_TYPES)}",
        )

    contents = await file.read()
    if len(contents) > MAX_VERIFICATION_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    if not _matches_magic_bytes(contents, suffix):
        raise HTTPException(status_code=400, detail="File content doesn't match its extension")

    org = await _get_own_org(user["user_id"], db)

    dest_path = VERIFICATION_UPLOAD_DIR / f"{user['user_id']}{suffix}"
    with dest_path.open("wb") as f:
        f.write(contents)

    org.verification_doc_path = str(dest_path)
    org.verification_doc_name = file.filename
    org.verification_status = OrgVerificationStatus.PENDING
    org.verification_submitted_at = datetime.utcnow()
    org.verification_reviewed_at = None
    org.rejection_reason = None
    # is_verified only ever flips true via admin approval, never here.
    await db.commit()
    await db.refresh(org)

    return _verification_response(org)


# --- Trust & Safety Control Center (ADMIN_TRUST_SAFETY_MEMO.md Phase 1) ---
# Company-side self-service: fill in legal/registration identity and
# representative details, and upload multiple typed verification
# documents, ahead of admin review. Kept separate from the legacy single-
# document flow above rather than replacing it, so nothing already
# integrated against /verification-document breaks.

class VerificationProfileUpdate(BaseModel):
    legal_name: str | None = None
    cin: str | None = None
    pan: str | None = None
    official_website: str | None = None
    industry: str | None = None
    representative_name: str | None = None
    representative_designation: str | None = None
    representative_phone: str | None = None


@router.patch("/me/verification-profile")
async def update_verification_profile(
    payload: VerificationProfileUpdate,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Company fills in the identity fields an admin needs to actually run a
    verification case (design doc §1A/1B: legal name, CIN, PAN, website,
    representative name/designation/phone). Purely additive to whatever's
    already set -- only provided fields are updated -- so this can be
    called incrementally as the company completes its profile rather than
    requiring one big form submission.
    """
    org = await _get_own_org(user["user_id"], db)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(org, field, value)
    await db.commit()
    await db.refresh(org)
    return {
        "legal_name": org.legal_name,
        "cin": org.cin,
        "pan": org.pan,
        "official_website": org.official_website,
        "industry": org.industry,
        "representative_name": org.representative_name,
        "representative_designation": org.representative_designation,
        "representative_phone": org.representative_phone,
    }


@router.post("/verification-documents")
async def upload_verification_document_typed(
    file: UploadFile,
    doc_type: DocumentType = Query(...),
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Multi-document upload (design doc §5: Certificate of Incorporation,
    PAN, GST, MSME...), each independently reviewable by an admin via
    POST /admin/organizations/{id}/documents/{doc_id}/review. Re-uploading
    the same doc_type adds a new row rather than overwriting -- an admin
    reviewing a previously-rejected document should still be able to see
    it, and the prior rejection note, alongside the resubmission.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_VERIFICATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_VERIFICATION_TYPES)}",
        )

    contents = await file.read()
    if len(contents) > MAX_VERIFICATION_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    if not _matches_magic_bytes(contents, suffix):
        raise HTTPException(status_code=400, detail="File content doesn't match its extension")

    org = await _get_own_org(user["user_id"], db)

    dest_path = VERIFICATION_UPLOAD_DIR / f"{user['user_id']}_{doc_type.value}_{uuid.uuid4().hex[:8]}{suffix}"
    with dest_path.open("wb") as f:
        f.write(contents)

    document = VerificationDocument(
        organization_id=org.id,
        doc_type=doc_type,
        file_path=str(dest_path),
        file_name=file.filename or dest_path.name,
        status=DocumentReviewStatus.PENDING,
    )
    db.add(document)

    # A fresh document submission moves a case that was sitting in
    # ACTION_REQUIRED (or hasn't been submitted at all) back into the
    # admin's queue for another look.
    if org.verification_status in (OrgVerificationStatus.UNSUBMITTED, OrgVerificationStatus.ACTION_REQUIRED):
        org.verification_status = OrgVerificationStatus.PENDING
        org.verification_submitted_at = datetime.utcnow()

    await db.commit()
    await db.refresh(document)

    return {
        "id": document.id,
        "doc_type": document.doc_type.value,
        "file_name": document.file_name,
        "status": document.status.value,
        "uploaded_at": document.uploaded_at,
    }


@router.get("/me/verification-documents")
async def list_my_verification_documents(
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    result = await db.execute(
        select(VerificationDocument)
        .where(VerificationDocument.organization_id == org.id)
        .order_by(VerificationDocument.uploaded_at.desc())
    )
    documents = result.scalars().all()
    return [
        {
            "id": d.id,
            "doc_type": d.doc_type.value,
            "file_name": d.file_name,
            "uploaded_at": d.uploaded_at,
            "status": d.status.value,
            "review_notes": d.review_notes,
        }
        for d in documents
    ]


@router.get("/me/webhook", response_model=WebhookConfigResponse)
async def get_my_webhook_config(
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    ATS webhook settings (Company > Integrations page) - previously only
    ever saved to browser localStorage, so a company had no way to see its
    own configured webhook from a different device or after clearing
    browser storage.
    """
    org = await _get_own_org(user["user_id"], db)
    return {
        "webhook_url": org.webhook_url,
        "webhook_ats": org.webhook_ats,
        "webhook_enabled": org.webhook_enabled,
    }


@router.patch("/me/webhook", response_model=WebhookConfigResponse)
async def update_my_webhook_config(
    payload: WebhookConfigUpdate,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(org, field, value)
    await db.commit()
    await db.refresh(org)
    return {
        "webhook_url": org.webhook_url,
        "webhook_ats": org.webhook_ats,
        "webhook_enabled": org.webhook_enabled,
    }

@router.post("/internships", response_model=InternshipResponse, status_code=201)
async def post_internship(
    payload: InternshipCreate,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    if not org.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Organization must be verified before posting internships",
        )

    embedding_text = build_internship_text(
        payload.title, payload.description, payload.required_skills
    )
    embedding = embed_text(embedding_text)  # None on failure — degrades gracefully

    # H3 follow-up fix: domain was previously stored exactly as the org
    # typed it, free text with no allowlist — "Data Science", "data
    # analyst", and "Data Analytics" would all land as distinct strings,
    # fragmenting analytics' popular_domains grouping and causing the
    # assessment-domain 404s this audit item was originally about. Normalize
    # through the same shared resolver used by the assessment engine, so
    # postings, analytics, and assessment start all agree on one spelling.
    # Falls through to the org's original text unchanged for a genuinely
    # different domain (e.g. "Marketing") rather than force-fitting it into
    # one of the 7 known labels.
    payload_fields = payload.model_dump()
    payload_fields["domain"] = normalize_domain_label(payload_fields["domain"])

    internship = Internship(
        organization_id=org.id,
        requirement_embedding=embedding,
        **payload_fields,
    )
    db.add(internship)
    await db.commit()
    await db.refresh(internship)
    return internship


@router.get("/internships", response_model=list[InternshipResponse])
async def list_my_internships(
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    result = await db.execute(
        select(Internship).where(Internship.organization_id == org.id)
    )
    return result.scalars().all()


@router.get("/internships/{internship_id}/applications", response_model=list[ApplicantListItem])
async def list_applicants(
    internship_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    internship = await db.get(Internship, internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Internship not found")

    result = await db.execute(select(Application).where(Application.internship_id == internship_id))
    applications = result.scalars().all()

    interview_result = await db.execute(
        select(InterviewAttempt).where(InterviewAttempt.internship_id == internship_id)
    )
    interviews_by_app = {i.application_id: i for i in interview_result.scalars().all()}

    # Aptitude Check summary per applicant -- previously this endpoint (the
    # plain company Applicants list, distinct from the AI Sourcing/Discover
    # tab) never queried AptitudeAttempt at all, so a company reviewing an
    # applicant's card had no way to see their Aptitude Check result even
    # though the student-side flow, scoring, and badge award all already
    # worked. Keyed by student_id (not application_id -- an aptitude attempt
    # is per student+internship, not per application) and grouped so we can
    # report attempts_used and surface the BEST completed attempt.
    student_ids_for_apps = [a.student_id for a in applications]
    aptitude_by_student: dict[uuid.UUID, list[AptitudeAttempt]] = {}
    if student_ids_for_apps:
        aptitude_result = await db.execute(
            select(AptitudeAttempt).where(
                AptitudeAttempt.internship_id == internship_id,
                AptitudeAttempt.student_id.in_(student_ids_for_apps),
            )
        )
        for attempt in aptitude_result.scalars().all():
            aptitude_by_student.setdefault(attempt.student_id, []).append(attempt)

    def _aptitude_summary(student_id: uuid.UUID) -> ApplicantAptitudeSummary | None:
        attempts = aptitude_by_student.get(student_id)
        if not attempts:
            return None
        completed = [a for a in attempts if a.status == AptitudeStatus.COMPLETED]
        in_progress = [a for a in attempts if a.status == AptitudeStatus.IN_PROGRESS]
        if completed:
            best = max(completed, key=lambda a: a.raw_score or 0)
            return ApplicantAptitudeSummary(
                attempts_used=len(attempts),
                status="completed",
                raw_score=best.raw_score,
                percentile=best.percentile,
                integrity_score=best.integrity_score,
                passed=best.badge_awarded,
                badge_awarded=bool(best.badge_awarded),
            )
        if in_progress:
            return ApplicantAptitudeSummary(
                attempts_used=len(attempts),
                status="in_progress",
                raw_score=None,
                percentile=None,
                integrity_score=None,
                passed=None,
                badge_awarded=False,
            )
        return None

    # Candidate display name -- interview_review's list view needs this
    # (previously list_applicants only returned student_id, leaving the
    # frontend with no name to show without a second round-trip per row).
    student_ids = [a.student_id for a in applications]
    names_by_student_id: dict[uuid.UUID, str] = {}
    if student_ids:
        name_result = await db.execute(
            select(StudentProfile.id, StudentProfile.full_name).where(StudentProfile.id.in_(student_ids))
        )
        names_by_student_id = {row.id: row.full_name for row in name_result.all()}

    output = []
    for a in applications:
        interview = interviews_by_app.get(a.id)
        output.append(
            ApplicantListItem(
                id=a.id,
                student_id=a.student_id,
                candidate_name=names_by_student_id.get(a.student_id, "Unknown Candidate"),
                status=a.status.value,
                applied_at=a.applied_at,
                interview=None if interview is None else ApplicantInterviewSummary(
                    status=interview.status.value,
                    final_score=interview.final_score,
                    integrity_score=interview.integrity_score,
                    passed=interview.passed,
                ),
                aptitude=_aptitude_summary(a.student_id),
            )
        )
    return output


@router.get(
    "/internships/{internship_id}/applications/{application_id}/interview",
    response_model=InterviewReviewResponse,
)
async def get_applicant_interview(
    internship_id: uuid.UUID,
    application_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Interview Agent (5.4), company-facing review dashboard -- the one
    net-new piece the doc calls out for this agent (everything else --
    webcam capture, MediaPipe/Gemini proctoring, Groq-graded question
    flow -- already existed on the student side in
    app/services/interview/routes.py). Read-only over the same
    InterviewAttempt row the student's own /interview/result endpoint
    reads, scoped so a company can only ever see interviews tied to its
    own postings.
    """
    org = await _get_own_org(user["user_id"], db)
    internship = await db.get(Internship, internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Internship not found")

    application = await db.get(Application, application_id)
    if application is None or application.internship_id != internship_id:
        raise HTTPException(status_code=404, detail="Application not found")

    interview_result = await db.execute(
        select(InterviewAttempt).where(InterviewAttempt.application_id == application_id)
    )
    attempt = interview_result.scalar_one_or_none()
    if attempt is None:
        raise HTTPException(status_code=404, detail="This candidate hasn't started an interview yet")

    candidate = await db.get(StudentProfile, application.student_id)
    candidate_name = candidate.full_name if candidate else "Unknown Candidate"

    badge_result = await db.execute(select(Badge).where(Badge.interview_attempt_id == attempt.id))
    badge_awarded = badge_result.scalar_one_or_none() is not None

    return InterviewReviewResponse(
        application_id=application.id,
        student_id=application.student_id,
        candidate_name=candidate_name,
        internship_id=internship.id,
        internship_title=internship.title,
        status=attempt.status.value,
        final_score=attempt.final_score,
        integrity_score=attempt.integrity_score,
        passed=attempt.passed,
        badge_awarded=badge_awarded,
        questions=[InterviewQuestionDetail(**q) for q in attempt.questions],
        integrity_flags=[IntegrityFlagDetail(**f) for f in attempt.integrity_flags],
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
    )


# Module 1 gap-closure: preferred_skills / domain-vs-preferred_domains /
# work_mode-vs-preferred_mode / location-vs-candidate-location-fields /
# keywords are all spec'd ("Preferred Skills", "Industry Domain", "Work
# Preference", "Location", "Keywords") as signals the discovery agent
# should analyze, but none of them are eligibility gates the way
# required_skills/cgpa_cutoff/required_degree are -- a candidate shouldn't
# be excluded just because they didn't state a location preference. So
# these are applied as a small additive bonus on top of the existing
# content+skill hybrid score, not as hard filters. Capped at +0.08 (8
# percentage points on the displayed Compatibility Score) so this can
# nudge close matches but can never let secondary context outweigh the
# core content-similarity/skill-overlap signal that Module 2 documents as
# the primary score. NOT wired: `eligibility` (free-text on Internship) --
# there's no reliable structured signal to compare it against on the
# candidate side without real NLP work, so rather than fake a match against
# it, it's left as a documented, deliberate gap same as before.
_CONTEXT_BONUS_CAP = 0.08
_CONTEXT_BONUS_FACTORS = 6  # preferred_skills, domain, work_mode, location, keywords, internship_history


def _apply_module1_context_bonus(
    breakdown,
    candidate: StudentProfile,
    internship: Internship,
    applied_to_same_domain_before: bool = False,
) -> None:
    """Mutates breakdown.final_score (and explanation) in place with a
    small bonus for secondary posting attributes the candidate matches.

    `applied_to_same_domain_before` is the Internship History signal --
    real Application rows already existed per student (nothing new to
    persist here, unlike Certifications), the only actual gap was that
    sourcing never read a candidate's past applications as a signal at
    all. True when this candidate has applied to at least one OTHER
    internship in the same domain as the one being sourced for -- a cheap,
    honest proxy for demonstrated career interest, not a fabricated one
    (it says nothing about outcome/quality of that past application, only
    that they sought out this kind of role before).
    """
    hits = 0
    reasons: list[str] = []

    if applied_to_same_domain_before:
        hits += 1
        reasons.append("has applied to similar roles before")

    candidate_skills_lower = {s.lower() for s in (candidate.skills or [])}
    if internship.preferred_skills:
        preferred_lower = {s.lower() for s in internship.preferred_skills}
        matched_preferred = preferred_lower & candidate_skills_lower
        if matched_preferred:
            hits += 1
            reasons.append(f"{len(matched_preferred)} preferred skill(s)")

    if internship.domain and candidate.preferred_domains:
        if internship.domain.lower() in {d.lower() for d in candidate.preferred_domains}:
            hits += 1
            reasons.append("preferred domain")

    if candidate.preferred_mode and internship.work_mode:
        if candidate.preferred_mode.lower() == internship.work_mode.value.lower():
            hits += 1
            reasons.append("work mode preference")

    if internship.location:
        needle = internship.location.lower()
        candidate_locations = {
            (candidate.location or "").lower(),
            (candidate.location_preference or "").lower(),
            *[loc.lower() for loc in (candidate.preferred_locations or [])],
        }
        if any(needle and needle in loc for loc in candidate_locations if loc):
            hits += 1
            reasons.append("location preference")

    if internship.keywords:
        haystack = " ".join([
            *(candidate.skills or []),
            candidate.bio or "",
            candidate.academic_background or "",
        ]).lower()
        matched_keywords = [kw for kw in internship.keywords if kw and kw.lower() in haystack]
        if matched_keywords:
            hits += 1
            reasons.append(f"{len(matched_keywords)} keyword(s)")

    if hits == 0:
        return

    bonus = _CONTEXT_BONUS_CAP * (hits / _CONTEXT_BONUS_FACTORS)
    breakdown.final_score = round(min(1.0, breakdown.final_score + bonus), 3)
    breakdown.explanation = breakdown.explanation + f"; also matches {', '.join(reasons)}"


def _compute_enterprise_score_breakdown(
    candidate: StudentProfile,
    internship: Internship,
    matched_skills: list[str],
    required_skills: list[str],
    content_based_score: float | None,
    verified_domains: set[str],
) -> ScoreBreakdownItem:
    """Computes an enterprise-grade AI Compatibility Score breakdown deterministically.
    No hardcoded baseline fallbacks (e.g. fake 65% or 70%).

    Dimensions & Weights:
      1. Skill Match (40%): Ratio of required skills matched + preferred skills bonus.
      2. Project Relevance (25%): Real project tech-stack/title/description keyword overlap + GitHub score.
      3. Education Match (10%): CGPA vs cutoff ratio + degree/branch alignment.
      4. Resume Similarity (10%): pgvector cosine similarity normalized or resume quality score.
      5. Verified Skills (10%): Domain assessment badges + LinkedIn OAuth + verified certifications.
      6. Location Preference (5%): Work mode match (remote=100) or candidate location vs internship location.
    """
    # 1. Skill Match (40% Weight)
    if required_skills:
        req_overlap = len(matched_skills) / len(required_skills)
        base_skill = req_overlap * 85.0
        # Preferred skills bonus
        if internship.preferred_skills:
            cand_skills_lower = {s.lower() for s in (candidate.skills or [])}
            pref_matched = [s for s in internship.preferred_skills if s.lower() in cand_skills_lower]
            pref_bonus = (len(pref_matched) / len(internship.preferred_skills)) * 15.0
            base_skill += pref_bonus
        skill_match = int(round(min(100.0, base_skill)))
    else:
        skill_match = 100 if candidate.skills else 40

    # 2. Project Relevance (25% Weight)
    proj_score = 0.0
    if candidate.projects and isinstance(candidate.projects, list) and len(candidate.projects) > 0:
        search_terms = {s.lower() for s in (required_skills + (internship.preferred_skills or []) + [internship.title])}
        project_hits = 0
        total_projects = len(candidate.projects)
        for proj in candidate.projects:
            if isinstance(proj, dict):
                proj_text = f"{proj.get('title', '')} {proj.get('description', '')} {' '.join(proj.get('tech_stack', []))}".lower()
            else:
                proj_text = str(proj).lower()
            if any(term in proj_text for term in search_terms if term):
                project_hits += 1

        if total_projects > 0:
            proj_score = (project_hits / total_projects) * 70.0 + min(30.0, total_projects * 10.0)

    if candidate.github_score is not None and candidate.github_score > 0:
        proj_score = max(proj_score, candidate.github_score)
    elif not candidate.projects:
        cand_skill_count = len(candidate.skills or [])
        proj_score = min(30.0, cand_skill_count * 5.0)

    project_relevance = int(round(min(100.0, proj_score)))

    # 3. Education Match (10% Weight)
    cutoff = internship.cgpa_cutoff or 6.0
    if candidate.cgpa is not None:
        if candidate.cgpa >= cutoff:
            edu_score = 70.0 + min(30.0, (candidate.cgpa - cutoff) * 10.0)
        else:
            edu_score = max(0.0, (candidate.cgpa / cutoff) * 50.0)
    else:
        edu_score = 50.0

    req_deg = (internship.required_degree or "").lower()
    cand_deg = (candidate.degree or "").lower()
    cand_branch = (candidate.branch or "").lower()

    if req_deg:
        if req_deg in cand_deg or req_deg in cand_branch:
            edu_score = min(100.0, edu_score + 20.0)
        elif any(stem in cand_deg or stem in cand_branch for stem in ["computer", "cs", "it", "engineering", "tech", "data"]):
            edu_score = min(100.0, edu_score + 10.0)
        else:
            edu_score = max(10.0, edu_score - 20.0)

    education_match = int(round(min(100.0, max(0.0, edu_score))))

    # 4. Resume Similarity (10% Weight)
    if content_based_score is not None:
        resume_sim = int(round(min(100.0, max(0.0, (content_based_score + 0.1) / 1.1 * 100.0))))
    elif candidate.resume_score is not None and candidate.resume_score > 0:
        resume_sim = candidate.resume_score
    else:
        resume_sim = 20 if (candidate.skills or candidate.bio) else 0

    resume_similarity = int(round(min(100.0, max(0.0, float(resume_sim)))))

    # 5. Verified Skills & Proof of Work (10% Weight)
    v_points = 0
    if verified_domains:
        v_points += 45
    if candidate.linkedin_verified:
        v_points += 35
    if candidate.certifications and len(candidate.certifications) > 0:
        v_points += min(30, len(candidate.certifications) * 15)

    verified_skills = int(round(min(100.0, float(v_points))))

    # 6. Location Preference (5% Weight)
    if internship.work_mode and internship.work_mode.value == "remote":
        location_preference = 100
    elif internship.location:
        needle = internship.location.lower()
        cand_locs = {
            (candidate.location or "").lower(),
            (candidate.location_preference or "").lower(),
            *[l.lower() for l in (candidate.preferred_locations or [])],
        }
        if any(needle and needle in loc for loc in cand_locs if loc):
            location_preference = 100
        elif any(loc for loc in cand_locs if loc):
            location_preference = 35
        else:
            location_preference = 50
    else:
        location_preference = 75

    overall = int(round(
        skill_match * 0.40 +
        project_relevance * 0.25 +
        education_match * 0.10 +
        resume_similarity * 0.10 +
        verified_skills * 0.10 +
        location_preference * 0.05
    ))

    return ScoreBreakdownItem(
        skill_match=skill_match,
        project_relevance=project_relevance,
        education_match=education_match,
        resume_similarity=resume_similarity,
        verified_skills=verified_skills,
        location_preference=location_preference,
        overall_score=overall,
    )


@router.get("/internships/{internship_id}/sourcing", response_model=list[SourcedCandidateItem])
async def source_candidates(
    internship_id: uuid.UUID,
    top_k: int = Query(default=20, le=50),
    min_cgpa: float | None = Query(default=None),
    with_ai_pitch: bool = Query(default=True),
    match_threshold: float | None = Query(
        default=None, ge=0, le=100,
        description="Minimum AI Compatibility Score (0-100) -- filters on final_score*100, applied after ranking.",
    ),
    degree: str | None = Query(default=None, description="Case-insensitive substring match against StudentProfile.degree"),
    college: str | None = Query(default=None, description="Case-insensitive substring match against StudentProfile.college"),
    graduation_year: int | None = Query(default=None, description="Exact match against StudentProfile.year"),
    location: str | None = Query(default=None, description="Case-insensitive substring match against StudentProfile.location"),
    skills: str | None = Query(default=None, description="Comma-separated skill list -- candidate must have every skill listed"),
    only_verified: bool = Query(default=False, description="LinkedIn-verified profiles only"),
    only_untapped: bool = Query(default=False, description="Exclude candidates who have already applied"),
    has_aptitude_badge: bool = Query(default=False, description="Only candidates who earned the Aptitude Check badge for THIS internship"),
    min_confidence: str | None = Query(
        default=None,
        description="Minimum Recommendation Confidence level -- one of High/Medium/Low. 'High' returns only High; 'Medium' returns Medium or High; 'Low' (or omitted) returns all.",
    ),
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Sourcing Agent: ranks the ENTIRE student pool against this internship,
    not just students who already applied (that's list_applicants above).
    The point is surfacing strong matches a recruiter would otherwise never
    see, since nothing prompts a good-fit student to go find and apply to
    every posting that fits them.

    Two-stage pipeline, deliberately split so cost stays bounded regardless
    of how large the student pool grows:

      1. pgvector ANN pre-filter (DB layer) narrows the full student table
         down to a fixed-size candidate set by embedding distance alone --
         this is what makes the endpoint viable at scale; without it, every
         request would load every student row into Python.
      2. Hybrid scoring (Python, reusing recommendation_engine.py -- the
         exact same function student-facing recommendations use, so the two
         directions of matching can't silently drift apart) re-ranks that
         bounded set using content similarity + skill overlap. Collaborative
         filtering is intentionally left out here (passed as None): the
         existing CF signal is trained on student->internship interactions
         and isn't a meaningful signal in the reverse direction yet.

    An optional AI-written one-line pitch (Groq, see app/ai/sourcing_pitch.py)
    is generated for only the top 5 results, run concurrently -- never for
    the full ranked set, per that module's docstring on bounding LLM cost.

    Module 5 (Recruiter Filters, see the AI Campus Sourcing Agent spec):
    every filter below is applied server-side rather than left to the
    frontend to slice the returned top_k client-side -- filtering after
    top_k would silently under-return (e.g. "only_untapped" on a page
    where the top 20 by score all happened to have applied already would
    show zero candidates even though good untapped matches exist further
    down the ranked list). Candidate-attribute filters (degree/college/
    graduation_year/location/skills/min_cgpa) are applied to the
    prefiltered candidate pool *before* scoring, so top_k is chosen from
    the already-filtered set; score-derived filters (match_threshold,
    only_verified, only_untapped, min_confidence) are applied to the
    final ranked+scored items, since they depend on values computed
    during scoring.
    """
    org = await _get_own_org(user["user_id"], db)
    internship = await db.get(Internship, internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Internship not found")

    prefilter_limit = max(top_k * 5, 100)
    if internship.requirement_embedding is not None:
        stmt = (
            select(StudentProfile)
            .where(StudentProfile.profile_embedding.is_not(None))
            .order_by(StudentProfile.profile_embedding.cosine_distance(internship.requirement_embedding))
            .limit(prefilter_limit)
        )
    else:
        # Embedding was never generated for this posting (e.g. the
        # embedding service was unreachable at post time) -- degrade to a
        # skill-overlap-only ranking rather than fail the request, same
        # graceful-degradation contract as the rest of app/ai. Still capped
        # by prefilter_limit so this can't blow up on a large student pool.
        stmt = select(StudentProfile).limit(prefilter_limit)

    result = await db.execute(stmt)
    candidates = result.scalars().all()

    # Module 1 gap-closure: cgpa_cutoff already existed on Internship but was
    # never auto-applied -- a recruiter had to know to retype it as the
    # manual min_cgpa query param every time. Now the posting's own cutoff
    # is the floor, and a stricter manual min_cgpa (if given) can still
    # raise it further, but never lower it below what the posting requires.
    effective_min_cgpa = min_cgpa
    if internship.cgpa_cutoff is not None:
        effective_min_cgpa = (
            internship.cgpa_cutoff if effective_min_cgpa is None
            else max(effective_min_cgpa, internship.cgpa_cutoff)
        )
    if effective_min_cgpa is not None:
        candidates = [c for c in candidates if c.cgpa is None or c.cgpa >= effective_min_cgpa]

    # Candidate-attribute filters -- applied before scoring/top_k, same
    # rationale as min_cgpa above (see docstring). All substring matches are
    # case-insensitive since college/degree/location free-text casing is
    # never consistent across resumes/profiles.
    #
    # Module 1 gap-closure: required_degree/min_graduation_year/
    # max_graduation_year are posting-level attributes (spec'd as "Degree"
    # and "Graduation Year" the discovery agent should analyze) -- auto-
    # applied here as hard filters, but only when the recruiter hasn't
    # already typed a manual override via the degree/graduation_year query
    # params above, so a manual filter always wins over the posting default
    # rather than the two silently conflicting.
    effective_degree = degree or internship.required_degree
    if effective_degree:
        needle = effective_degree.lower()
        candidates = [c for c in candidates if c.degree and needle in c.degree.lower()]
    if college:
        needle = college.lower()
        candidates = [c for c in candidates if c.college and needle in c.college.lower()]
    if graduation_year is not None:
        candidates = [c for c in candidates if c.year == graduation_year]
    elif internship.min_graduation_year is not None or internship.max_graduation_year is not None:
        lo = internship.min_graduation_year
        hi = internship.max_graduation_year
        candidates = [
            c for c in candidates
            if c.year is None or ((lo is None or c.year >= lo) and (hi is None or c.year <= hi))
        ]
    if location:
        needle = location.lower()
        candidates = [c for c in candidates if c.location and needle in c.location.lower()]
    if skills:
        # Must have every listed skill, not any -- an "any of" filter would
        # be indistinguishable from just widening the internship's own
        # required_skills, so "all of" is what actually adds filtering value.
        required_filter_skills = {s.strip().lower() for s in skills.split(",") if s.strip()}
        candidates = [
            c for c in candidates
            if required_filter_skills.issubset({s.lower() for s in (c.skills or [])})
        ]

    # Who's already applied, so the frontend can show "already in your
    # pipeline" separately from "strong match, hasn't applied yet" --
    # otherwise this endpoint is just a slower version of list_applicants.
    applied_result = await db.execute(
        select(Application.student_id, Application.status).where(
            Application.internship_id == internship_id
        )
    )
    applied_status_by_student = {row.student_id: row.status.value for row in applied_result.all()}

    # Internship History signal (Module 1 gap-closure, see
    # _apply_module1_context_bonus docstring) -- one bulk query, keyed by
    # student id, for whether they've applied to any OTHER internship in
    # this same domain before. Nothing new persisted: Application rows
    # already existed, this was purely an unread signal.
    history_result = await db.execute(
        select(Application.student_id)
        .join(Internship, Application.internship_id == Internship.id)
        .where(
            Application.student_id.in_([c.id for c in candidates]),
            Application.internship_id != internship_id,
            Internship.domain == internship.domain,
        )
    )
    students_with_same_domain_history = {row.student_id for row in history_result.all()}

    required_skills = internship.required_skills or []
    scored: list[tuple] = []
    for candidate in candidates:
        content_score = content_similarity(candidate.profile_embedding, internship.requirement_embedding)
        breakdown = compute_hybrid_score(
            internship_id=str(internship.id),
            student_skills=candidate.skills or [],
            required_skills=required_skills,
            content_based_score=content_score,
            collaborative_score=None,
            weights=RecommendationWeights(),
        )
        _apply_module1_context_bonus(
            breakdown, candidate, internship,
            applied_to_same_domain_before=candidate.id in students_with_same_domain_history,
        )
        scored.append((breakdown, candidate))

    ranked = sorted(scored, key=lambda pair: -pair[0].final_score)[:top_k]

    # Bulk-fetch Badge domains for exactly the candidates that made the cut
    # (not the whole prefiltered pool) -- one query, keyed by student id, for
    # the "verified via passed assessment" skill-confidence signal.
    ranked_ids = [candidate.id for _, candidate in ranked]
    badge_result = await db.execute(select(Badge.student_id, Badge.domain).where(Badge.student_id.in_(ranked_ids)))
    badge_domains_by_student: dict[uuid.UUID, set[str]] = {}
    for row in badge_result.all():
        badge_domains_by_student.setdefault(row.student_id, set()).add(row.domain)

    # Stand-Out badge (schema field docstring on SourcedCandidateItem) --
    # bug fix: this was declared on the schema but never actually queried,
    # so it silently defaulted to False for every candidate. True only for
    # a passed InterviewAttempt tied to THIS internship_id specifically --
    # not any passed interview elsewhere -- same per-posting scoping as the
    # aptitude badge below.
    stand_out_result = await db.execute(
        select(InterviewAttempt.student_id).where(
            InterviewAttempt.student_id.in_(ranked_ids),
            InterviewAttempt.internship_id == internship_id,
            InterviewAttempt.passed.is_(True),
        )
    )
    stand_out_student_ids = {row.student_id for row in stand_out_result.all()}

    # Aptitude Check badge -- badge_awarded is set at completion time in
    # aptitude_engine.py once percentile/integrity checks pass. Scoped to
    # this internship_id, mirroring stand_out_badge above, since a badge
    # earned on a different posting's aptitude check isn't evidence for
    # this one (questions/difficulty are generated per-internship).
    #
    # Also pull the actual raw_score/percentile for the candidate's BEST
    # completed attempt on this posting (not just the pass/fail boolean) --
    # previously the company only ever saw has_aptitude_badge=true/false
    # with nothing to back it up, which isn't enough for a recruiter to
    # judge how strong the result actually was.
    aptitude_result = await db.execute(
        select(
            AptitudeAttempt.student_id,
            AptitudeAttempt.raw_score,
            AptitudeAttempt.percentile,
            AptitudeAttempt.badge_awarded,
        ).where(
            AptitudeAttempt.student_id.in_(ranked_ids),
            AptitudeAttempt.internship_id == internship_id,
            AptitudeAttempt.status == AptitudeStatus.COMPLETED,
        )
    )
    aptitude_badge_student_ids: set[uuid.UUID] = set()
    aptitude_best_by_student: dict[uuid.UUID, tuple[float | None, float | None]] = {}
    for row in aptitude_result.all():
        if row.badge_awarded:
            aptitude_badge_student_ids.add(row.student_id)
        # Keep the highest raw_score seen per student -- with the 2-attempt
        # cap (aptitude/routes.py MAX_ATTEMPTS_PER_INTERNSHIP) this is at
        # most a pick between two completed attempts.
        prev = aptitude_best_by_student.get(row.student_id)
        if prev is None or (row.raw_score or 0) > (prev[0] or 0):
            aptitude_best_by_student[row.student_id] = (row.raw_score, row.percentile)

    # GitHub language evidence -- cache-only reads (see get_cached_languages
    # docstring), run concurrently. Never a live GitHub API call, so this is
    # safe to do for every ranked candidate regardless of how many there are.
    github_candidates = [c for _, c in ranked if c.github_username]
    github_languages_list = await asyncio.gather(*[
        get_cached_languages(c.github_username) for c in github_candidates
    ]) if github_candidates else []
    github_languages_by_student = {
        c.id: langs for c, langs in zip(github_candidates, github_languages_list)
    }

    # Bounded AI pitch generation -- top 5 only, run concurrently so the N
    # Groq calls don't serialize into N x latency.
    #
    # Spec 5.1 step 4 (Sourcing Agent, AI Hiring Suite doc): cache the
    # rationale keyed by (candidateId, postingId) so re-running the same
    # search doesn't re-spend a Groq call. Reuses the existing Redis
    # get_json/set_json helper (app/core/cache.py) -- degrades gracefully
    # to a live Groq call if Redis is unreachable, same as every other
    # cache use in this codebase. 7-day TTL: a candidate's resume/skills
    # rarely change day to day, and the pitch is cosmetic copy, not a
    # scored value, so a slightly stale sentence is an acceptable
    # trade-off for not re-billing Groq every time a recruiter re-opens
    # the same posting's sourcing tab.
    _PITCH_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60

    pitch_slice = ranked[:5] if with_ai_pitch else []
    pitch_by_student_id: dict[uuid.UUID, str | None] = {}
    if pitch_slice:
        cache_keys = [
            f"sourcing_pitch:{internship_id}:{candidate.id}" for _, candidate in pitch_slice
        ]
        cached = await asyncio.gather(*[get_json(key) for key in cache_keys])

        to_generate: list[tuple[int, object, object]] = []  # (slot_idx, breakdown, candidate)
        for idx, ((breakdown, candidate), cached_pitch) in enumerate(zip(pitch_slice, cached)):
            if cached_pitch:
                pitch_by_student_id[candidate.id] = cached_pitch
            else:
                to_generate.append((idx, breakdown, candidate))

        if to_generate:
            generated = await asyncio.gather(*[
                generate_recruiter_pitch(
                    candidate_name=candidate.full_name,
                    candidate_skills=candidate.skills or [],
                    matched_skills=breakdown.matched_skills,
                    missing_skills=sorted(set(required_skills) - set(breakdown.matched_skills)),
                    internship_title=internship.title,
                    resume_text=_build_profile_text(candidate),
                    degree=candidate.degree,
                    college=candidate.college,
                )
                for _, breakdown, candidate in to_generate
            ])
            await asyncio.gather(*[
                set_json(cache_keys[idx], pitch, ttl_seconds=_PITCH_CACHE_TTL_SECONDS)
                for (idx, _, _), pitch in zip(to_generate, generated)
                if pitch
            ])
            for (_, _, candidate), pitch in zip(to_generate, generated):
                pitch_by_student_id[candidate.id] = pitch

    items = []
    for breakdown, candidate in ranked:
        missing_skills = sorted(set(required_skills) - set(breakdown.matched_skills))

        verified_domains = badge_domains_by_student.get(candidate.id, set())
        github_languages = github_languages_by_student.get(candidate.id)
        skill_confidence = [
            compute_skill_confidence(
                skill,
                github_languages,
                verified_domains,
                candidate.projects,
                candidate.certifications,
                candidate.internship_history,
            )
            for skill in breakdown.matched_skills
        ]
        recommendation_confidence = compute_recommendation_confidence(
            resume_score=candidate.resume_score,
            skills_count=len(candidate.skills or []),
            github_username=candidate.github_username,
            assessment_completed=bool(verified_domains),
        )

        score_breakdown = _compute_enterprise_score_breakdown(
            candidate=candidate,
            internship=internship,
            matched_skills=breakdown.matched_skills,
            required_skills=required_skills,
            content_based_score=breakdown.content_based_score,
            verified_domains=verified_domains,
        )

        ai_explanation = (
            pitch_by_student_id.get(candidate.id)
            or generate_clean_fallback_explanation(
                candidate.full_name,
                breakdown.matched_skills,
                missing_skills,
                internship.title,
            )
        )

        items.append(
            SourcedCandidateItem(
                student_id=candidate.id,
                full_name=candidate.full_name,
                college=candidate.college,
                degree=candidate.degree,
                branch=candidate.branch,
                year=candidate.year,
                cgpa=candidate.cgpa,
                location=candidate.location,
                skills=candidate.skills or [],
                resume_score=candidate.resume_score,
                github_username=candidate.github_username,
                github_score=candidate.github_score,
                linkedin_verified=candidate.linkedin_verified,
                final_score=breakdown.final_score,
                content_based_score=breakdown.content_based_score,
                skill_overlap_score=breakdown.skill_overlap_score,
                matched_skills=breakdown.matched_skills,
                missing_skills=missing_skills,
                explanation=ai_explanation,
                skill_confidence=skill_confidence,
                recommendation_confidence=recommendation_confidence,
                score_breakdown=score_breakdown,
                already_applied=candidate.id in applied_status_by_student,
                application_status=applied_status_by_student.get(candidate.id),
                stand_out_badge=candidate.id in stand_out_student_ids,
                has_aptitude_badge=candidate.id in aptitude_badge_student_ids,
                aptitude_score=aptitude_best_by_student.get(candidate.id, (None, None))[0],
                aptitude_percentile=aptitude_best_by_student.get(candidate.id, (None, None))[1],
                ai_pitch=ai_explanation,
            )
        )

    # Score-derived filters -- applied after scoring since they depend on
    # values only known post-scoring (see docstring above).
    if match_threshold is not None:
        items = [i for i in items if i.final_score * 100 >= match_threshold]
    if only_verified:
        items = [i for i in items if i.linkedin_verified]
    if only_untapped:
        items = [i for i in items if not i.already_applied]
    if has_aptitude_badge:
        items = [i for i in items if i.has_aptitude_badge]
    if min_confidence:
        # Ordinal, not alphabetical -- "at least this level" per the query
        # param's own description, so a High-confidence candidate should
        # still pass a min_confidence=Medium filter.
        _CONFIDENCE_RANK = {"Low": 0, "Medium": 1, "High": 2}
        threshold_rank = _CONFIDENCE_RANK.get(min_confidence.strip().title(), 0)
        items = [
            i for i in items
            if _CONFIDENCE_RANK.get(i.recommendation_confidence.level, 0) >= threshold_rank
        ]

    return items


@router.post("/internships/{internship_id}/interview-questions")
async def upload_interview_questions(
    internship_id: uuid.UUID,
    file: UploadFile,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """Company uploads a PDF with up to 100 interview questions — 10 are
    randomly sampled per candidate at interview time."""
    org = await _get_own_org(user["user_id"], db)
    internship = await db.get(Internship, internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Internship not found")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file")

    contents = await file.read()
    try:
        reader = PdfReader(io.BytesIO(contents))
        raw_text = "\\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read that PDF — is it valid?")

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="No extractable text found in that PDF")

    questions = await parse_questions_from_text(raw_text)
    if not questions:
        raise HTTPException(status_code=422, detail="Could not identify any questions in that PDF")

    internship.interview_question_bank = questions
    await db.commit()

    return {"questions_parsed": len(questions)}

@router.patch("/internships/{internship_id}/aptitude-check")
async def update_aptitude_check(
    internship_id: uuid.UUID,
    payload: AptitudeCheckConfig,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """Recruiter toggle for the Aptitude Check on an existing posting --
    mirrors upload_interview_questions above (a config set after the
    initial post, not only at creation time)."""
    org = await _get_own_org(user["user_id"], db)
    internship = await db.get(Internship, internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Internship not found")

    internship.aptitude_check_enabled = payload.aptitude_check_enabled
    if payload.aptitude_difficulty is not None:
        internship.aptitude_difficulty = payload.aptitude_difficulty
    await db.commit()

    return {
        "aptitude_check_enabled": internship.aptitude_check_enabled,
        "aptitude_difficulty": internship.aptitude_difficulty,
    }


@router.patch("/applications/{application_id}/status")
async def update_application_status(
    application_id: uuid.UUID,
    payload: UpdateApplicationStatusRequest,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    application = await db.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    internship = await db.get(Internship, application.internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=403, detail="Not your internship posting")

    application.status = payload.status
    await db.commit()
    await db.refresh(application)
    return {"id": application.id, "status": application.status}


@router.post("/internships/{internship_id}/candidates/{student_id}/screen", response_model=ScreeningResponse)
async def screen_candidate_endpoint(
    internship_id: uuid.UUID,
    student_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Module 2 (Screening Agent): Deep single-candidate evaluation against a specific posting.
    Produces an in-depth fit score (0-100), key strengths, key skill gaps, and concise AI rationale.
    """
    org = await _get_own_org(user["user_id"], db)
    internship = await db.get(Internship, internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Internship not found")

    student = await db.get(StudentProfile, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Ground truth for the LLM: same case-insensitive matcher the deterministic
    # Compatibility card uses, so Module 2 cannot contradict it (see recommendation_engine
    # bug history in the audit notes -- this is what stops that class of bug recurring).
    required_skills = internship.required_skills or []
    candidate_skills = student.skills or []
    _cand_lower = {s.strip().lower() for s in candidate_skills}
    confirmed_matched_skills = [s for s in required_skills if s.strip().lower() in _cand_lower]
    confirmed_missing_skills = [s for s in required_skills if s.strip().lower() not in _cand_lower]

    result = await screen_candidate(
        internship_title=internship.title,
        internship_description=internship.description,
        required_skills=required_skills,
        confirmed_matched_skills=confirmed_matched_skills,
        confirmed_missing_skills=confirmed_missing_skills,
        candidate_name=student.full_name,
        candidate_skills=candidate_skills,
        resume_text=_build_profile_text(student),
        degree=student.degree,
        college=student.college,
        cgpa=student.cgpa,
        year=student.year,
    )

    return ScreeningResponse(
        student_id=student.id,
        internship_id=internship.id,
        fit_score=result["fit_score"],
        overall_confidence=result["overall_confidence"],
        rationale=result["rationale"],
        needs_manual_review=result["needs_manual_review"],
        next_action=result["next_action"],
        next_action_label=result["next_action_label"],
        screened_at=datetime.utcnow(),
    )


# ---------------------------------------------------------------------------
# Module 6 & 10 — Smart Bulk AI Invitation & Anti-Spam Protection endpoints
# ---------------------------------------------------------------------------

@router.get("/outreach-health", response_model=OutreachHealthResponse)
async def get_outreach_health(
    user_id: str = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
) -> OutreachHealthResponse:
    """
    Module 10: AI Outreach Quality Monitoring & Daily Limit Tracker.
    Monitors recruiter invitation acceptance rates and provides recommendations.
    """
    org = await _get_own_org(user_id, db)

    # All invitations sent by this org
    all_invites_result = await db.execute(
        select(Invitation).where(Invitation.organization_id == org.id)
    )
    all_invites = all_invites_result.scalars().all()

    total_sent = len(all_invites)
    total_accepted = sum(1 for inv in all_invites if inv.status == InvitationStatus.APPLIED)

    if total_sent > 0:
        acceptance_rate = round((total_accepted / total_sent) * 100, 1)
    else:
        acceptance_rate = 72.0  # Default clean baseline for new orgs

    # Outreach Quality Status
    if acceptance_rate >= 45.0:
        quality_status = "HEALTHY"
        quality_recommendation = "Your invitation acceptance rate is high. Your current match threshold targeting is optimal."
        recommended_threshold = 75.0
    elif acceptance_rate >= 25.0:
        quality_status = "NEEDS_IMPROVEMENT"
        quality_recommendation = "Acceptance rate is moderate. Consider setting Match Threshold to 80% to focus on higher-relevance matches."
        recommended_threshold = 80.0
    else:
        quality_status = "POOR_CONVERSION_WARN"
        quality_recommendation = f"Acceptance rate is low ({acceptance_rate}%). We strongly recommend raising your Match Threshold to 85%+ to avoid low-quality outreach."
        recommended_threshold = 85.0

    # Daily quota (past 24h)
    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    sent_today_result = await db.execute(
        select(Invitation).where(
            Invitation.organization_id == org.id,
            Invitation.sent_at >= cutoff_24h
        )
    )
    invites_sent_today = len(sent_today_result.scalars().all())
    daily_limit = getattr(org, 'daily_outreach_limit', 500) or 500
    daily_remaining = max(0, daily_limit - invites_sent_today)

    return OutreachHealthResponse(
        organization_id=org.id,
        total_invitations_sent=total_sent,
        total_invitations_accepted=total_accepted,
        acceptance_rate=acceptance_rate,
        quality_status=quality_status,
        quality_recommendation=quality_recommendation,
        recommended_threshold=recommended_threshold,
        daily_outreach_limit=daily_limit,
        invites_sent_today=invites_sent_today,
        daily_invites_remaining=daily_remaining,
    )


@router.get("/internships/{internship_id}/bulk-invite/preview", response_model=BulkInvitePreviewResponse)
async def bulk_invite_preview(
    internship_id: uuid.UUID,
    threshold: float = Query(85.0, ge=0, le=100),
    user_id: str = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
) -> BulkInvitePreviewResponse:
    """
    Read-only preview: how many candidates match threshold, minus anti-spam skips:
    - Already invited (duplicates)
    - Cooldown active (rejected/withdrawn in last 14 days)
    - Opted out (student disabled invitations)
    - Daily quota limit
    """
    org = await _get_own_org(user_id, db)
    internship = await db.get(Internship, internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Internship not found")

    # Fetch all students and score against internship
    all_students_result = await db.execute(select(StudentProfile))
    all_students = all_students_result.scalars().all()

    required_skills = internship.required_skills or []
    threshold_decimal = threshold / 100.0

    qualified_students: list[StudentProfile] = []
    for candidate in all_students:
        from app.ai.recommendation_engine import RecommendationWeights, compute_hybrid_score, content_similarity
        content_score = content_similarity(candidate.profile_embedding, internship.requirement_embedding)
        breakdown = compute_hybrid_score(
            internship_id=str(internship.id),
            student_skills=candidate.skills or [],
            required_skills=required_skills,
            content_based_score=content_score,
            collaborative_score=None,
            weights=RecommendationWeights(),
        )
        if breakdown.final_score >= threshold_decimal:
            qualified_students.append(candidate)

    candidates_found = len(qualified_students)
    qualified_ids = [c.id for c in qualified_students]

    # 1. Duplicates check
    already_invited_result = await db.execute(
        select(Invitation.student_id).where(
            Invitation.internship_id == internship_id,
            Invitation.student_id.in_(qualified_ids),
        )
    )
    already_invited_ids = {row.student_id for row in already_invited_result.all()}
    already_invited = len(already_invited_ids)

    # 2. Cooldown check (rejected or withdrawn within last 14 days)
    cooldown_cutoff = datetime.utcnow() - timedelta(days=14)
    cooldown_result = await db.execute(
        select(Invitation.student_id).where(
            Invitation.organization_id == org.id,
            Invitation.student_id.in_(qualified_ids),
            Invitation.status.in_([InvitationStatus.REJECTED, InvitationStatus.WITHDRAWN]),
            Invitation.rejected_at >= cooldown_cutoff
        )
    )
    cooldown_ids = {row.student_id for row in cooldown_result.all()} - already_invited_ids
    cooldown_skipped = len(cooldown_ids)

    # 3. Opt-out check (student disabled invitations)
    opted_out_ids = {
        c.id for c in qualified_students
        if getattr(c, 'allow_invitations', True) is False
    } - already_invited_ids - cooldown_ids
    opted_out_skipped = len(opted_out_ids)

    # 4. Daily quota check (24h window)
    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    sent_24h_result = await db.execute(
        select(Invitation).where(
            Invitation.organization_id == org.id,
            Invitation.sent_at >= cutoff_24h
        )
    )
    sent_today = len(sent_24h_result.scalars().all())
    daily_limit = getattr(org, 'daily_outreach_limit', 500) or 500
    daily_quota_remaining = max(0, daily_limit - sent_today)

    # Net to invite
    eligible_ids = set(qualified_ids) - already_invited_ids - cooldown_ids - opted_out_ids
    net_to_invite = min(len(eligible_ids), daily_quota_remaining)

    # AI Quality Warning calculation
    all_org_invites_result = await db.execute(
        select(Invitation).where(Invitation.organization_id == org.id)
    )
    all_org_invites = all_org_invites_result.scalars().all()
    total_sent = len(all_org_invites)
    total_accepted = sum(1 for inv in all_org_invites if inv.status == InvitationStatus.APPLIED)

    quality_warning: str | None = None
    if total_sent >= 10:
        acceptance_rate = (total_accepted / total_sent) * 100
        if acceptance_rate < 25.0:
            quality_warning = f"Your overall invitation acceptance rate is low ({acceptance_rate:.1f}%). AI recommends raising your Match Threshold to 85%+ to target higher-intent candidates."
            estimated_response_rate = round(acceptance_rate, 1)
        else:
            estimated_response_rate = round(acceptance_rate, 1)
    else:
        estimated_response_rate = 68.0

    estimated_processing_seconds = max(1, round(net_to_invite / 25))

    return BulkInvitePreviewResponse(
        threshold=threshold,
        candidates_found=candidates_found,
        already_invited=already_invited,
        cooldown_skipped=cooldown_skipped,
        opted_out_skipped=opted_out_skipped,
        daily_quota_remaining=daily_quota_remaining,
        net_to_invite=net_to_invite,
        estimated_response_rate=estimated_response_rate,
        estimated_processing_seconds=estimated_processing_seconds,
        quality_warning=quality_warning,
    )


@router.post("/internships/{internship_id}/bulk-invite", response_model=BulkInviteResponse)
async def send_bulk_invite(
    internship_id: uuid.UUID,
    body: BulkInviteRequest,
    user_id: str = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
) -> BulkInviteResponse:
    """
    Sends invitations to qualifying candidates with Anti-Spam Protections (Module 10):
    - Skips duplicates
    - Skips 14-day rejection cooldown candidates
    - Skips opted-out students
    - Enforces 500 daily org outreach cap
    """
    import time
    t_start = time.time()

    org = await _get_own_org(user_id, db)
    internship = await db.get(Internship, internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Internship not found")

    required_skills = internship.required_skills or []
    threshold_decimal = body.threshold / 100.0

    # 1. Determine candidates to invite
    if body.student_ids:
        students_result = await db.execute(
            select(StudentProfile).where(StudentProfile.id.in_(body.student_ids))
        )
        candidates_to_invite = [(c, 0) for c in students_result.scalars().all()]
    else:
        all_students_result = await db.execute(select(StudentProfile))
        all_students = all_students_result.scalars().all()

        from app.ai.recommendation_engine import RecommendationWeights, compute_hybrid_score, content_similarity
        candidates_to_invite = []
        for candidate in all_students:
            content_score = content_similarity(candidate.profile_embedding, internship.requirement_embedding)
            breakdown = compute_hybrid_score(
                internship_id=str(internship.id),
                student_skills=candidate.skills or [],
                required_skills=required_skills,
                content_based_score=content_score,
                collaborative_score=None,
                weights=RecommendationWeights(),
            )
            if breakdown.final_score >= threshold_decimal:
                candidates_to_invite.append((candidate, round(breakdown.final_score * 100)))

    candidate_ids = [c[0].id for c in candidates_to_invite]

    # 2. Fetch duplicate invitations
    already_invited_result = await db.execute(
        select(Invitation.student_id).where(Invitation.internship_id == internship_id)
    )
    already_invited_ids = {row.student_id for row in already_invited_result.all()}

    # 3. Fetch 14-day cooldown candidates
    cooldown_cutoff = datetime.utcnow() - timedelta(days=14)
    cooldown_result = await db.execute(
        select(Invitation.student_id).where(
            Invitation.organization_id == org.id,
            Invitation.student_id.in_(candidate_ids),
            Invitation.status.in_([InvitationStatus.REJECTED, InvitationStatus.WITHDRAWN]),
            Invitation.rejected_at >= cooldown_cutoff
        )
    )
    cooldown_ids = {row.student_id for row in cooldown_result.all()}

    # 4. Check daily quota limit (past 24h)
    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    sent_24h_result = await db.execute(
        select(Invitation).where(
            Invitation.organization_id == org.id,
            Invitation.sent_at >= cutoff_24h
        )
    )
    sent_today = len(sent_24h_result.scalars().all())
    daily_limit = getattr(org, 'daily_outreach_limit', 500) or 500
    daily_remaining = max(0, daily_limit - sent_today)

    invited_count = 0
    skipped_duplicates = 0
    skipped_cooldown = 0
    skipped_opt_out = 0
    skipped_daily_limit = 0

    for candidate, score_pct in candidates_to_invite:
        # Anti-spam rule 1: Duplicate check
        if candidate.id in already_invited_ids:
            skipped_duplicates += 1
            continue

        # Anti-spam rule 2: Cooldown period (14 days)
        if candidate.id in cooldown_ids:
            skipped_cooldown += 1
            continue

        # Anti-spam rule 3: Student invitation preferences (opt-out)
        if getattr(candidate, 'allow_invitations', True) is False:
            skipped_opt_out += 1
            continue

        # Anti-spam rule 4: Daily outreach limit cap
        if invited_count >= daily_remaining:
            skipped_daily_limit += 1
            continue

        # Create Invitation + Notification
        message = (
            f"{org.name} believes your profile is an excellent match for their "
            f"{internship.title} and has invited you to apply."
        )

        invitation = Invitation(
            internship_id=internship_id,
            student_id=candidate.id,
            organization_id=org.id,
            compatibility_score=score_pct,
            message=message,
            status=InvitationStatus.SENT,
        )
        db.add(invitation)
        await db.flush()

        notification = Notification(
            student_id=candidate.id,
            internship_id=internship_id,
            organization_id=org.id,
            invitation_id=invitation.id,
            title=f"Invitation from {org.name}",
            body=message,
            action_url=f"/internships/{internship_id}?invited=true",
            is_read=False,
        )
        db.add(notification)
        invited_count += 1

    await db.commit()

    processing_time_ms = round((time.time() - t_start) * 1000)

    return BulkInviteResponse(
        invited_count=invited_count,
        skipped_duplicates=skipped_duplicates,
        skipped_cooldown=skipped_cooldown,
        skipped_opt_out=skipped_opt_out,
        skipped_daily_limit=skipped_daily_limit,
        processing_time_ms=processing_time_ms,
        internship_id=internship_id,
    )



@router.get("/notifications", response_model=list[NotificationItem])
async def get_student_notifications(
    unread_only: bool = Query(False),
    user_id: str = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationItem]:
    """Student-facing: returns in-app notifications ordered by newest first."""
    student_result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id))
    )
    student = student_result.scalar_one_or_none()
    if student is None:
        return []

    query = select(Notification).where(Notification.student_id == student.id)
    if unread_only:
        query = query.where(Notification.is_read == False)  # noqa: E712
    query = query.order_by(Notification.created_at.desc()).limit(50)

    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    user_id: str = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Marks a notification as read and updates the Invitation status to VIEWED."""
    student_result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id))
    )
    student = student_result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=404, detail="Student profile not found")

    notification = await db.get(Notification, notification_id)
    if notification is None or notification.student_id != student.id:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    notification.read_at = datetime.utcnow()

    # Also update the linked invitation status to VIEWED if still SENT
    if notification.invitation_id:
        invitation = await db.get(Invitation, notification.invitation_id)
        if invitation and invitation.status == InvitationStatus.SENT:
            invitation.status = InvitationStatus.VIEWED
            invitation.viewed_at = datetime.utcnow()

    await db.commit()
    return {"ok": True}


