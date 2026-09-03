"""
Shared models live here because auth/roles cut across every service module.
Service-specific models (e.g. Application, Certificate) live inside their
own services/<n>/models.py per Architecture.md's modular monolith layout.
"""
import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, String, Text, JSON
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

EMBEDDING_DIM = 384  # matches all-MiniLM-L6-v2 output


class UserRole(str, enum.Enum):
    STUDENT = "student"
    ORGANIZATION = "organization"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reset_token_expires: Mapped[datetime | None] = mapped_column(nullable=True)

    student_profile: Mapped["StudentProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    organization: Mapped["Organization | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)

    full_name: Mapped[str] = mapped_column(String(255))
    academic_background: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_preference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Academic details shown on the student profile page (previously only
    # ever stored client-side in localStorage, so they reset to defaults on
    # any new device/browser or cleared storage — now persisted server-side.
    degree: Mapped[str | None] = mapped_column(String(255), nullable=True)
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    year: Mapped[int | None] = mapped_column(nullable=True)
    cgpa: Mapped[float | None] = mapped_column(nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Profile photo — stored as a relative URL under /uploads/avatars/,
    # served statically (see app/main.py StaticFiles mount). Null until the
    # student uploads one; frontend falls back to initials.
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Raw extracted skill list (from resume parsing, §Phase2) — human-readable
    # Raw extracted skill list (from resume parsing, §Phase2) - human-readable
    skills: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)

    # Structured project entries extracted at resume-upload time (see
    # app/ai/resume_parser.py's extract_projects) -- each dict shaped like
    # {"title": str, "tech_stack": list[str], "description": str}.
    # Previously this data was parsed correctly but only ever returned to
    # the browser once, in the upload response, then discarded -- nothing
    # persisted it, so it was unusable by anything running later (e.g. the
    # Sourcing Agent's skill-confidence scoring, which needs "this skill
    # appears in N of the candidate's real projects" as an evidence signal,
    # not just a resume mention). Persisting it here is what makes that
    # evidence available after the upload request ends.
    projects: Mapped[list[dict] | None] = mapped_column(JSON, default=list)

    # Certification titles extracted from the resume's CERTIFICATIONS/
    # CERTIFICATES section at upload time (see
    # app/ai/resume_parser.py's extract_certifications) -- raw one-line
    # entries (e.g. "AWS Certified Cloud Practitioner - Amazon, 2023"), not
    # a structured issuer/date breakdown, since real resumes format this
    # section too inconsistently to reliably split into separate fields.
    # Plain string array (like skills/tools below), not JSON like projects,
    # since there's no nested structure to preserve here.
    certifications: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)

    # Structured internship/work-experience entries extracted at
    # resume-upload time (see app/ai/resume_parser.py's extract_experience)
    # -- each dict shaped like {"title": str, "description": str}. Same gap
    # as projects had before it was persisted: extract_experience already
    # parsed this correctly but the result was only ever returned once in
    # the upload response and then discarded, so it was invisible to Skill
    # Confidence scoring (a skill named in a real internship's description
    # is real evidence, distinct from a project or a bare resume skill-list
    # mention -- see app/ai/skill_confidence.py). JSON (not a plain string
    # array like certifications) since each entry keeps title/description
    # separate, same reasoning as projects.
    internship_history: Mapped[list[dict] | None] = mapped_column(JSON, default=list)

    # Previously only ever lived in browser localStorage (lib/userContext.ts)
    # so it reset on any new device/browser or cleared storage, and was
    # invisible to any other part of the system (recommendation engine,
    # admin views, etc). Persisted server-side now like every other field.
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    college: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tools: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)
    preferred_domains: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)
    preferred_locations: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)
    preferred_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    min_stipend: Mapped[int | None] = mapped_column(nullable=True)

    # Resume file reference (stored path, not the binary — keep DB light)
    resume_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Social graph intelligence (Phase 3)
    github_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_score: Mapped[float | None] = mapped_column(nullable=True)
    linkedin_verified: Mapped[bool] = mapped_column(default=False)
    linkedin_headline: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Embedding of the combined profile text — used for content-based matching
    # against internship embeddings via pgvector cosine distance (Phase 4)
    profile_embedding: Mapped[list[float] | None] = mapped_column(
        Vector(EMBEDDING_DIM), nullable=True
    )

    # Module 10 — Anti-Spam student invitation preferences
    allow_invitations: Mapped[bool] = mapped_column(default=True)
    max_weekly_invites: Mapped[int] = mapped_column(default=10)

    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User"] = relationship(back_populates="student_profile")

    @property
    def resume_score(self) -> int:
        """
        M5 audit fix -- previously the frontend hardcoded resumeScore: 0
        with no backend concept of this at all (see
        nexyuva_supplemental_audit.docx). A derived property (like
        is_verified above) rather than a stored column: it's always
        computed fresh from whatever's actually on the profile right now,
        so there's no separate write path that could drift out of sync
        with skills/resume_path/github_score/etc. See
        app/ai/resume_parser.py's compute_profile_completeness_score for
        the weighting. Imported lazily to avoid a circular import
        (resume_parser -> app.ai.embeddings -> ... doesn't import models,
        but models importing resume_parser at module load time would still
        pull in spaCy/sentence-transformers just to define this model).
        """
        from app.ai.resume_parser import compute_profile_completeness_score

        return compute_profile_completeness_score(self)


class OrgVerificationStatus(str, enum.Enum):
    """
    Company verification workflow state. Distinct from `is_verified`
    (kept for backward compatibility — existing routes like post_internship
    already gate on it) which is just a derived boolean that mirrors
    `verification_status == APPROVED`.

    PENDING is what the Trust & Safety design doc calls UNDER_REVIEW — the
    name is kept as-is (rather than renamed + migrated) since the MVP
    verification flow already shipped against it. ACTION_REQUIRED and
    SUSPENDED were added for the Trust & Safety Control Center (see
    ADMIN_TRUST_SAFETY_MEMO.md) so admin has a real state machine instead
    of collapsing every non-approval outcome into REJECTED.
    """
    UNSUBMITTED = "unsubmitted"  # registered, no document uploaded yet
    PENDING = "pending"  # document uploaded, awaiting admin review (aka UNDER_REVIEW)
    ACTION_REQUIRED = "action_required"  # admin asked for more info; org must resubmit
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"  # was approved, then suspended for cause; can be reinstated


class VerificationRiskLevel(str, enum.Enum):
    """
    Deterministic, explainable risk signal computed from plain rules (see
    app/services/admin/risk.py) -- not an AI/ML score. Purely a queue-
    prioritization aid for admins; never used to auto-approve or
    auto-reject a case.
    """
    LOW = "low"
    REVIEW = "review"
    HIGH = "high"


class DocumentType(str, enum.Enum):
    INCORPORATION_CERTIFICATE = "incorporation_certificate"
    PAN_CARD = "pan_card"
    GST_CERTIFICATE = "gst_certificate"
    MSME_CERTIFICATE = "msme_certificate"
    OTHER = "other"


class DocumentReviewStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class ModerationStatus(str, enum.Enum):
    """
    Per-listing job-quality moderation (ADMIN_TRUST_SAFETY_MEMO.md Phase 3)
    -- independent of Organization.verification_status. A verified,
    trustworthy company can still post a bad or misleading listing, so
    this is checked per-Internship rather than inherited from the org.
    UNREVIEWED is the default for every new posting (opt-out review, not
    opt-in) so nothing skips the queue silently.
    """
    UNREVIEWED = "unreviewed"
    APPROVED = "approved"
    FLAGGED = "flagged"   # admin found a specific quality issue, listing stays live pending fix
    REMOVED = "removed"   # admin pulled the listing from public view


class ReportTargetType(str, enum.Enum):
    INTERNSHIP = "internship"
    ORGANIZATION = "organization"


class ReportReason(str, enum.Enum):
    FAKE_LISTING = "fake_listing"
    UNPAID_OR_UNDERPAID = "unpaid_or_underpaid"
    MISLEADING_DESCRIPTION = "misleading_description"
    SUSPICIOUS_COMPANY = "suspicious_company"
    HARASSMENT = "harassment"
    SCAM_OR_FRAUD = "scam_or_fraud"
    OTHER = "other"


class ReportStatus(str, enum.Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    DISMISSED = "dismissed"
    ACTION_TAKEN = "action_taken"


class Report(Base):
    """
    Student-filed report against an internship listing or an organization
    (ADMIN_TRUST_SAFETY_MEMO.md Phase 4). Deliberately separate from
    AdminAuditLog (which records admin *decisions*, not incoming signals)
    -- a Report is the raw complaint; resolving one writes its own
    AdminAuditLog entry (entity_type="report") same as every other admin
    action, so both the report's own status and the global audit trail
    stay consistent.
    """
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    target_type: Mapped[ReportTargetType] = mapped_column(SAEnum(ReportTargetType))
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    reason: Mapped[ReportReason] = mapped_column(SAEnum(ReportReason))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[ReportStatus] = mapped_column(SAEnum(ReportStatus), default=ReportStatus.OPEN)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class VerificationDocument(Base):
    """
    One typed, independently-reviewable document for a company's
    verification case. Replaces the old single verification_doc_path/
    verification_doc_name pair on Organization (kept there for backward
    compat -- treat it as the legacy/primary document) with support for
    the multiple documents a real case needs (incorporation cert, PAN, GST,
    MSME...), each with its own review trail.
    """
    __tablename__ = "verification_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    doc_type: Mapped[DocumentType] = mapped_column(SAEnum(DocumentType))
    file_path: Mapped[str] = mapped_column(String(500))
    file_name: Mapped[str] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    status: Mapped[DocumentReviewStatus] = mapped_column(
        SAEnum(DocumentReviewStatus), default=DocumentReviewStatus.PENDING
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AdminAuditLog(Base):
    """
    Immutable record of every admin decision on a verification case.
    Written from inside each admin/routes.py endpoint (not bolted on
    after) so nothing can change org.verification_status without leaving
    a trail -- protects both NexYuva and the admin team per the Trust &
    Safety design doc's audit-log requirement.
    """
    __tablename__ = "admin_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    admin_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(64))  # e.g. "approve_organization"
    entity_type: Mapped[str] = mapped_column(String(64))  # e.g. "organization", "document"
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    previous_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    new_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)

    name: Mapped[str] = mapped_column(String(255))
    is_verified: Mapped[bool] = mapped_column(default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Verification document workflow: a company self-registers, uploads a
    # GST certificate / incorporation certificate / MSME registration, and
    # stays locked out of the dashboard (see /company route gate on the
    # frontend) until a Ministry/Admin reviewer approves it via
    # POST /api/v1/admin/organizations/{id}/verify or .../reject.
    verification_status: Mapped[OrgVerificationStatus] = mapped_column(
        SAEnum(OrgVerificationStatus), default=OrgVerificationStatus.UNSUBMITTED
    )
    verification_doc_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verification_doc_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_submitted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    verification_reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Trust & Safety Control Center fields (ADMIN_TRUST_SAFETY_MEMO.md
    # Phase 1). Legal/registration identity + representative fields the
    # design doc calls for, filled in by the org via PATCH
    # /organizations/me/verification-profile before submitting for review. ---
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cin: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Corporate Identity Number, where applicable
    pan: Mapped[str | None] = mapped_column(String(16), nullable=True)
    official_website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)

    representative_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    representative_designation: Mapped[str | None] = mapped_column(String(120), nullable=True)
    representative_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Plain booleans an admin sets today (see case-review endpoint) — no
    # automated OTP flow wired yet (see memo Phase 2). Deliberately not
    # inferred silently: a representative isn't "verified" just because a
    # field is non-empty.
    representative_email_verified: Mapped[bool] = mapped_column(default=False)
    representative_phone_verified: Mapped[bool] = mapped_column(default=False)

    # Deterministic, explainable risk signal (app/services/admin/risk.py) —
    # recomputed whenever the case changes materially (submission, doc
    # review), stored so the queue can filter/sort on it without
    # recomputing per-request for every org.
    risk_level: Mapped[VerificationRiskLevel] = mapped_column(
        SAEnum(VerificationRiskLevel), default=VerificationRiskLevel.REVIEW
    )
    risk_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set when an admin uses "Request Information" — shown back to the org
    # so they know what's missing before resubmitting.
    action_required_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    verification_documents: Mapped[list["VerificationDocument"]] = relationship(
        "VerificationDocument",
        primaryjoin="Organization.id == VerificationDocument.organization_id",
        foreign_keys="VerificationDocument.organization_id",
        viewonly=True,
    )

    # ATS webhook settings (Company > Integrations page) - previously only
    # ever saved to browser localStorage, so it reset per-device and a
    # company had no way to see their own configured webhook from a
    # different machine or after clearing browser storage.
    webhook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    webhook_ats: Mapped[str | None] = mapped_column(String(100), nullable=True)
    webhook_enabled: Mapped[bool] = mapped_column(default=False)

    # Module 10 — Anti-Spam recruiter daily outreach limit
    daily_outreach_limit: Mapped[int] = mapped_column(default=500)

    user: Mapped["User"] = relationship(back_populates="organization")
    internships: Mapped[list["Internship"]] = relationship(back_populates="organization")


class ApplicationStatus(str, enum.Enum):
    APPLIED = "applied"
    SHORTLISTED = "shortlisted"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    COMPLETED = "completed"
    WITHDRAWN = "withdrawn"


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"))
    internship_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internships.id"))
    status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(ApplicationStatus), default=ApplicationStatus.APPLIED
    )
    # True when seeded synthetically for cold-start CF — never mixed silently
    # with real interactions in any reported/demoed number (Rules.md honesty
    # requirement: synthetic data must be documented, not hidden)
    is_synthetic: Mapped[bool] = mapped_column(default=False)
    applied_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    certificate_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # How many times the student has withdrawn from this internship - re-apply
    # is allowed once (see student/routes.py apply_to_internship), blocked on
    # a second withdraw to stop apply/withdraw spam on the same internship.
    withdrawal_count: Mapped[int] = mapped_column(default=0)


class WorkMode(str, enum.Enum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ON_SITE = "on_site"


class AssessmentStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class AssessmentAttempt(Base):
    __tablename__ = "assessment_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"))
    domain: Mapped[str] = mapped_column(String(255))
    status: Mapped[AssessmentStatus] = mapped_column(
        SAEnum(AssessmentStatus), default=AssessmentStatus.IN_PROGRESS
    )

    # Answer log — list of {"question_id", "difficulty", "correct"}
    answers: Mapped[list[dict]] = mapped_column(JSON, default=list)
    answered_question_ids: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    current_difficulty: Mapped[str] = mapped_column(String(20), default="easy")

    # Integrity flags reported by the client during the attempt — aggregated
    # as {"flag_type": str, "count": int} entries, never raw video
    integrity_flags: Mapped[list[dict]] = mapped_column(JSON, default=list)

    final_score: Mapped[float | None] = mapped_column(nullable=True)
    integrity_score: Mapped[float | None] = mapped_column(nullable=True)
    passed: Mapped[bool | None] = mapped_column(nullable=True)

    started_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)


class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"))
    domain: Mapped[str] = mapped_column(String(255))
    attempt_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assessment_attempts.id"), nullable=True)
    interview_attempt_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("interview_attempts.id"), nullable=True)
    aptitude_attempt_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("aptitude_attempts.id"), nullable=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g. "Stand Out - Backend Intern @ Infosys"
    awarded_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class AptitudeStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class AptitudeAttempt(Base):
    """
    Per-internship, Groq-generated aptitude/reasoning check — the third,
    newest verification signal, distinct from AssessmentAttempt (domain-
    general, fixed curated question bank, "Take Assessment" on the student
    Profile page) and InterviewAttempt (live, webcam-proctored, per-
    application). See app/ai/aptitude_engine.py module docstring and
    NexYuva_Aptitude_Check_Design_Doc.docx for the full design rationale:
    optional, per-internship, percentile-scored (not a fixed cutoff, since
    questions are freshly generated per attempt so difficulty isn't
    perfectly stable attempt-to-attempt), browser-integrity checks only
    (tab-blur/copy-paste/fullscreen-exit) rather than webcam proctoring —
    deliberately kept lightweight so it scales to a large applicant pool.
    """
    __tablename__ = "aptitude_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"))
    internship_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internships.id"))
    status: Mapped[AptitudeStatus] = mapped_column(
        SAEnum(AptitudeStatus), default=AptitudeStatus.IN_PROGRESS
    )

    # The Groq-generated question bank for THIS attempt, correct_index
    # included — server-side only, never serialized back to the client
    # (mirrors AssessmentAttempt's question-bank secrecy pattern).
    questions: Mapped[list[dict]] = mapped_column(JSON, default=list)
    # {"question_id": str, "correct": bool}
    answers: Mapped[list[dict]] = mapped_column(JSON, default=list)
    # {"flag_type": str, "count": int} — tab_blur / copy_paste_attempt /
    # fullscreen_exit only, no face/webcam flags (see design doc §3.6)
    integrity_flags: Mapped[list[dict]] = mapped_column(JSON, default=list)

    raw_score: Mapped[float | None] = mapped_column(nullable=True)
    # Percentile within all completed attempts for this SAME internship —
    # computed at completion time, not stored as a running/live value, so
    # it reflects the pool as it existed when this student finished.
    percentile: Mapped[float | None] = mapped_column(nullable=True)
    integrity_score: Mapped[float | None] = mapped_column(nullable=True)
    badge_awarded: Mapped[bool | None] = mapped_column(nullable=True)

    started_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)


class Internship(Base):
    __tablename__ = "internships"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))

    title: Mapped[str] = mapped_column(String(255))
    domain: Mapped[str] = mapped_column(String(255))
    required_skills: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    description: Mapped[str] = mapped_column(Text)

    # Module 1 gap-closure fields (AI Campus Sourcing Agent spec listed these
    # as internship attributes the discovery agent should analyze; previously
    # only required_skills/domain/description/location/work_mode actually
    # existed on this model, so "Preferred Skills", "Degree", "Graduation
    # Year", and "Keywords" were spec'd but had nowhere to be stored -- see
    # Memory.md's Module 1 honesty audit. All nullable/empty-default so
    # every existing posting keeps working unchanged with these unset.
    preferred_skills: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)
    required_degree: Mapped[str | None] = mapped_column(String(255), nullable=True)
    min_graduation_year: Mapped[int | None] = mapped_column(nullable=True)
    max_graduation_year: Mapped[int | None] = mapped_column(nullable=True)
    keywords: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)

    duration_weeks: Mapped[int] = mapped_column()
    stipend: Mapped[int | None] = mapped_column(nullable=True)
    location: Mapped[str] = mapped_column(String(255))
    work_mode: Mapped[WorkMode] = mapped_column(SAEnum(WorkMode))

    # Dashboard-facing fields (C1 audit finding) — previously only ever
    # existed in the Node/JSON store, never in Postgres, so the FastAPI
    # recommendation response silently dropped them for the real pipeline.
    responsibilities: Mapped[str | None] = mapped_column(Text, nullable=True)
    eligibility: Mapped[str | None] = mapped_column(Text, nullable=True)
    perks: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)
    cgpa_cutoff: Mapped[float | None] = mapped_column(nullable=True)
    sector: Mapped[str] = mapped_column(String(100), default="Private")

    # Embedding of title + description + required_skills text — the other
    # half of the cosine-similarity pair used in Phase 4
    requirement_embedding: Mapped[list[float] | None] = mapped_column(
        Vector(EMBEDDING_DIM), nullable=True
    )

    # Up to 100 raw interview questions the company uploaded as a PDF —
    # 10 are randomly sampled per candidate interview attempt
    interview_question_bank: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    # Aptitude Check (see AptitudeAttempt / app/ai/aptitude_engine.py) —
    # recruiter opts this posting in, same on/off pattern as the existing
    # "Enable AI Stand-Out Interview" toggle on post-internship. On by
    # default (changed 2026-09-03 -- opt-out beats opt-in for a feature
    # candidates never see unless it's on) so every new posting gets it
    # unless a recruiter explicitly disables it via the Candidates page
    # toggle. aptitude_difficulty steers Groq's question generation for this
    # specific role rather than using one global difficulty everywhere.
    aptitude_check_enabled: Mapped[bool] = mapped_column(default=True)
    aptitude_difficulty: Mapped[str] = mapped_column(String(20), default="hard")

    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Job-quality moderation (ADMIN_TRUST_SAFETY_MEMO.md Phase 3) -- separate
    # from is_active (which the company itself toggles to open/close a
    # posting) and separate from the organization's own verification status.
    moderation_status: Mapped[ModerationStatus] = mapped_column(
        SAEnum(ModerationStatus), default=ModerationStatus.UNREVIEWED
    )
    moderation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    moderated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    moderated_at: Mapped[datetime | None] = mapped_column(nullable=True)

    organization: Mapped["Organization"] = relationship(back_populates="internships")


class InterviewStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class InterviewAttempt(Base):
    """
    Per-internship-application proctored video interview — see
    Architecture.md addendum. Distinct from AssessmentAttempt (which is a
    generic domain quiz): this is tied to one specific application, uses
    the company's own question bank, and answers are graded by an LLM
    (Groq) that also cross-checks the answer against the candidate's
    resume for consistency, not just a fixed correct_index.
    """
    __tablename__ = "interview_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"))
    internship_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internships.id"))

    status: Mapped[InterviewStatus] = mapped_column(
        SAEnum(InterviewStatus), default=InterviewStatus.IN_PROGRESS
    )

    # Each entry: {"question": str, "answer": str|None, "score": float|None,
    # "notes": str|None, "resume_consistent": bool|None}
    questions: Mapped[list[dict]] = mapped_column(JSON, default=list)

    # Same aggregation pattern as AssessmentAttempt.integrity_flags, plus
    # a "phone_detected" flag type from periodic Gemini vision frame checks
    integrity_flags: Mapped[list[dict]] = mapped_column(JSON, default=list)

    final_score: Mapped[float | None] = mapped_column(nullable=True)
    integrity_score: Mapped[float | None] = mapped_column(nullable=True)
    passed: Mapped[bool | None] = mapped_column(nullable=True)

    started_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)


class OrgCalendarAuth(Base):
    """
    Module 5.5 (Smart Scheduling) — one row per organization that has
    connected their Google Calendar via OAuth (offline access). We only
    ever store the encrypted refresh_token; access_tokens are short-lived
    and fetched on demand (see app/core/google_calendar.py), never
    persisted. Encrypted with app/core/crypto.py (Fernet), never stored
    or logged in plaintext.
    """
    __tablename__ = "org_calendar_auth"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), unique=True
    )
    google_email: Mapped[str] = mapped_column(String(255))
    encrypted_refresh_token: Mapped[str] = mapped_column(Text)
    connected_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)


class ScheduledInterviewStatus(str, enum.Enum):
    PROPOSED = "proposed"     # org sent candidate slots, awaiting student pick
    CONFIRMED = "confirmed"   # student picked a slot, Google Calendar event created
    CANCELLED = "cancelled"


class ScheduledInterview(Base):
    """
    Module 5.5 (Smart Scheduling) — human-interview scheduling coordination
    layer sitting on top of Google Calendar. Distinct from InterviewAttempt
    (5.4, the AI-led proctored interview): this schedules a real human
    interview slot and creates an actual Calendar event with a Meet link
    once the candidate confirms a time. One row per application that has
    been sent scheduling slots.
    """
    __tablename__ = "scheduled_interviews"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id"), unique=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"))
    internship_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internships.id"))

    status: Mapped[ScheduledInterviewStatus] = mapped_column(
        SAEnum(ScheduledInterviewStatus), default=ScheduledInterviewStatus.PROPOSED
    )

    # Org-proposed candidate slots, checked against the org's own freebusy
    # at proposal time: [{"start": iso8601, "end": iso8601}, ...]
    proposed_slots: Mapped[list[dict]] = mapped_column(JSON, default=list)
    # The single slot the student picked, once confirmed
    selected_slot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    duration_minutes: Mapped[int] = mapped_column(default=30)

    # Set once the event actually exists on the org's Google Calendar
    google_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meet_link: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(nullable=True)


class Feedback(Base):
    """
    Post-internship feedback (PRD §4 — feeds back into the model, and
    Architecture.md's sentiment analysis chapter). One row per completed
    application. `sentiment_label`/`sentiment_score` are computed once at
    submission time via VADER (app/ai/sentiment_analysis.py) and stored,
    rather than recomputed on every analytics query — cheap to store, and
    keeps the admin dashboard queries simple aggregations instead of
    re-running NLP on every request.
    """
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"))
    internship_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internships.id"))

    feedback_text: Mapped[str] = mapped_column(Text)
    rating: Mapped[int | None] = mapped_column(nullable=True)  # optional 1-5 star, separate from sentiment

    sentiment_label: Mapped[str] = mapped_column(String(20))
    sentiment_compound_score: Mapped[float] = mapped_column()

    submitted_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class KnowledgeBaseSnippet(Base):
    """
    RAG knowledge base for the career-guidance chatbot (app/ai/chatbot.py).
    Closes the TODO logged repeatedly in Memory.md: `retrieve_context()` was
    always wired for a real pgvector similarity query but had no table and
    no seed content to query against, so it silently returned [] regardless
    of whether Groq itself was reachable.

    One row per topical snippet (not per document) -- short, self-contained
    chunks retrieve and ground an LLM answer far better than large blocks,
    per standard RAG chunking practice. `embedding` is the same 384-dim
    all-MiniLM-L6-v2 vector space as profile_embedding/requirement_embedding
    above, so it shares the same embed_text() call in app/ai/embeddings.py --
    no separate embedding pipeline to maintain.
    """
    __tablename__ = "knowledge_base_snippets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    topic: Mapped[str] = mapped_column(String(255))  # short label, e.g. "pm_internship_stipend"
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Module 6 — Smart Bulk AI Invitation
# ---------------------------------------------------------------------------

class InvitationStatus(str, enum.Enum):
    SENT = "sent"
    VIEWED = "viewed"
    APPLIED = "applied"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class Invitation(Base):
    """
    One row per (internship, student) invite sent by a recruiter via the
    Smart Bulk AI Invitation panel (Module 6). The unique constraint on
    (internship_id, student_id) is the sole duplicate-prevention mechanism —
    the bulk-invite endpoint queries existing rows and skips any student_id
    already present, so the recruiter can safely re-run with a lower threshold
    without re-sending to students who were already invited.
    """
    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    internship_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internships.id"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))

    # Score at the time of invite — stored so historical analytics can report
    # "we invited everyone above 90%" without re-running the scoring pipeline.
    compatibility_score: Mapped[float] = mapped_column(default=0.0)

    # Personalised invite message generated for the student.
    message: Mapped[str] = mapped_column(Text, default="")

    status: Mapped[InvitationStatus] = mapped_column(
        SAEnum(InvitationStatus), default=InvitationStatus.SENT
    )

    sent_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    viewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(nullable=True)

    from sqlalchemy import UniqueConstraint
    __table_args__ = (
        UniqueConstraint("internship_id", "student_id", name="uq_invitation_internship_student"),
    )


class Notification(Base):
    """
    In-app notification shown to the student on their dashboard.
    Created alongside each Invitation row. The student can click it to open
    the internship page with a pre-filled application (via action_url).
    """
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    internship_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("internships.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    invitation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("invitations.id"), nullable=True
    )

    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)

    # Deep-link into the student internship detail + pre-fill the application.
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    is_read: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    read_at: Mapped[datetime | None] = mapped_column(nullable=True)
