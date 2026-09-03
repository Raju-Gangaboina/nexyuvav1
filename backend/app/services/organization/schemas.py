import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.models import ApplicationStatus, WorkMode


class ScreeningResponse(BaseModel):
    """Module 2 (Screening Agent): small fit judgment, folded inline into the candidate card.

    Deliberately minimal -- no skill table, no strengths/gaps list, no split sub-scores.
    The Compatibility layer (SourcedCandidateItem.matched_skills/missing_skills) is the
    only place skill possession is shown; this model must never restate it. See
    screening_agent.py module docstring for the full reasoning and history.
    """
    student_id: uuid.UUID
    internship_id: uuid.UUID
    fit_score: int
    overall_confidence: str
    rationale: str
    needs_manual_review: bool
    next_action: str
    next_action_label: str
    screened_at: datetime



class SkillConfidenceItem(BaseModel):
    skill: str
    confidence: int
    evidence: list[str]


class RecommendationConfidenceItem(BaseModel):
    level: str  # High | Medium | Low
    profile_completeness: int
    verified_skills_count: int
    github_connected: bool
    assessment_completed: bool


class ScoreBreakdownItem(BaseModel):
    skill_match: int           # 0 - 100 (Weight: 40%)
    project_relevance: int     # 0 - 100 (Weight: 25%)
    education_match: int       # 0 - 100 (Weight: 10%)
    resume_similarity: int     # 0 - 100 (Weight: 10%)
    verified_skills: int       # 0 - 100 (Weight: 10%)
    location_preference: int   # 0 - 100 (Weight: 5%)
    overall_score: int         # Computed weighted sum (0 - 100%)


class SourcedCandidateItem(BaseModel):
    """
    One ranked candidate from the Sourcing Agent (GET
    /internships/{id}/sourcing). Deliberately a distinct shape from
    ApplicationResponse — a sourced candidate has not necessarily applied at
    all; `already_applied`/`application_status` are what let the frontend
    tell "already in your pipeline" apart from "a strong match you haven't
    seen yet", which is the actual point of proactive sourcing versus just
    re-showing the applicants list.
    """

    student_id: uuid.UUID
    full_name: str
    college: str | None = None
    degree: str | None = None
    branch: str | None = None
    year: int | None = None
    cgpa: float | None = None
    location: str | None = None
    skills: list[str] = []
    resume_score: int
    github_username: str | None = None
    github_score: float | None = None
    linkedin_verified: bool = False

    final_score: float
    content_based_score: float | None = None
    skill_overlap_score: float
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    explanation: str

    # Present only for matched_skills (not the candidate's full skill list) --
    # see app/ai/skill_confidence.py module docstring.
    skill_confidence: list[SkillConfidenceItem] = []
    recommendation_confidence: RecommendationConfidenceItem
    score_breakdown: ScoreBreakdownItem | None = None

    already_applied: bool = False
    application_status: str | None = None

    # True only when this candidate PASSED the Stand-Out interview for THIS
    # specific internship (joined via interview_attempts.internship_id at
    # the query site) -- not just any badge they hold from another posting
    # in the same domain. This is the signal that should actually make a
    # candidate stand out to the company, distinct from the "Earn a Badge"
    # CTA shown to students who haven't attempted it yet.
    stand_out_badge: bool = False

    # True only when this candidate earned the Aptitude Check badge for THIS
    # specific internship (AptitudeAttempt.badge_awarded, joined via
    # internship_id at the query site) -- same per-posting scoping
    # rationale as stand_out_badge above.
    has_aptitude_badge: bool = False

    # Best completed attempt's raw score / percentile for THIS internship,
    # regardless of pass/fail -- lets the company see "78%, 91st percentile"
    # instead of just a yes/no badge. None if the candidate never completed
    # an attempt for this posting.
    aptitude_score: float | None = None
    aptitude_percentile: float | None = None

    # Present only for the top few candidates per request — see
    # app/ai/sourcing_pitch.py docstring for why this is deliberately bounded.
    ai_pitch: str | None = None


class UpdateApplicationStatusRequest(BaseModel):
    status: ApplicationStatus


class InternshipCreate(BaseModel):
    title: str
    domain: str
    required_skills: list[str]
    description: str
    duration_weeks: int
    stipend: int | None = None
    location: str
    work_mode: WorkMode
    responsibilities: str | None = None
    eligibility: str | None = None
    perks: list[str] | None = None
    cgpa_cutoff: float | None = None
    sector: str = "Private"
    # Module 1 gap-closure fields -- all optional, recruiter can leave unset
    preferred_skills: list[str] | None = None
    required_degree: str | None = None
    min_graduation_year: int | None = None
    max_graduation_year: int | None = None
    keywords: list[str] | None = None
    aptitude_check_enabled: bool = True
    aptitude_difficulty: str = "hard"

class InternshipResponse(BaseModel):
    id: uuid.UUID
    title: str
    domain: str
    required_skills: list[str]
    description: str
    duration_weeks: int
    stipend: int | None
    location: str
    work_mode: WorkMode
    is_active: bool
    responsibilities: str | None = None
    eligibility: str | None = None
    perks: list[str] | None = None
    cgpa_cutoff: float | None = None
    sector: str = "Private"
    preferred_skills: list[str] | None = None
    required_degree: str | None = None
    min_graduation_year: int | None = None
    max_graduation_year: int | None = None
    keywords: list[str] | None = None
    aptitude_check_enabled: bool = False
    aptitude_difficulty: str = "hard"

    class Config:
        from_attributes = True


class WebhookConfigUpdate(BaseModel):
    webhook_url: str | None = None
    webhook_ats: str | None = None
    webhook_enabled: bool | None = None


class WebhookConfigResponse(BaseModel):
    webhook_url: str | None
    webhook_ats: str | None
    webhook_enabled: bool


# ---------------------------------------------------------------------------
# Module 6 — Smart Bulk AI Invitation schemas
# ---------------------------------------------------------------------------

class BulkInviteRequest(BaseModel):
    """Body for POST /internships/{id}/bulk-invite."""
    threshold: float          # 0–100 compatibility score cut-off
    student_ids: list[uuid.UUID] | None = None  # Optional manual override list


class BulkInvitePreviewResponse(BaseModel):
    """
    Read-only preview: how many candidates will be invited vs skipped.
    Zero DB writes — called on threshold change to power the live counter UI.
    """
    threshold: float
    candidates_found: int          # Total above threshold
    already_invited: int           # Duplicate — would be skipped
    cooldown_skipped: int          # Cooldown active after rejection
    opted_out_skipped: int         # Student opted out of invites
    daily_quota_remaining: int     # Daily org outreach quota remaining
    net_to_invite: int             # Total net to invite after anti-spam checks
    estimated_response_rate: float # 0–100 %, historical average apply rate
    estimated_processing_seconds: int
    quality_warning: str | None = None  # AI quality guidance for recruiter


class BulkInviteResponse(BaseModel):
    """Result of an actual bulk invite send."""
    invited_count: int
    skipped_duplicates: int
    skipped_cooldown: int
    skipped_opt_out: int
    skipped_daily_limit: int
    processing_time_ms: int
    internship_id: uuid.UUID


class OutreachHealthResponse(BaseModel):
    """Module 10: Recruiter AI Outreach Quality Monitoring."""
    organization_id: uuid.UUID
    total_invitations_sent: int
    total_invitations_accepted: int
    acceptance_rate: float
    quality_status: str             # "HEALTHY" | "NEEDS_IMPROVEMENT" | "POOR_CONVERSION_WARN"
    quality_recommendation: str
    recommended_threshold: float
    daily_outreach_limit: int
    invites_sent_today: int
    daily_invites_remaining: int


class NotificationItem(BaseModel):
    """Student-facing in-app notification."""
    id: uuid.UUID
    title: str
    body: str
    action_url: str | None
    is_read: bool
    created_at: datetime
    internship_id: uuid.UUID
    organization_id: uuid.UUID

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Interview Agent (5.4) — company-facing review dashboard.
#
# The doc's "already built vs. new" table for this agent names exactly one
# net-new piece: a company-facing review view (transcript + flagged-frame
# timeline). Everything else (webcam capture, MediaPipe/Gemini frame checks,
# Groq-graded question flow, session persistence) already existed on the
# student side (app/services/interview/routes.py) -- this is purely a read
# view over that same InterviewAttempt data, scoped to the org that owns the
# posting. No new tables, no new writes.
# ---------------------------------------------------------------------------

class InterviewQuestionDetail(BaseModel):
    """One graded Q&A pair from the transcript."""
    question: str
    answer: str | None = None
    score: float | None = None
    notes: str | None = None
    resume_consistent: bool | None = None


class IntegrityFlagDetail(BaseModel):
    """
    Proctoring signal for a single flag type during an interview attempt.
    `count` is the aggregate total; `timestamps` (added after the initial
    aggregated-only version) is the chronological list of when each
    occurrence was recorded, so the org dashboard can render an actual
    flagged-event timeline instead of just a bare count. Attempts recorded
    before this field existed will have an empty timestamps list.
    """
    flag_type: str
    count: int
    timestamps: list[str] = []


class InterviewReviewResponse(BaseModel):
    """
    Full interview detail for one application, as seen by the company that
    posted the internship. Doc calls for "transcript + flagged-frame
    timeline" -- this returns the full graded transcript plus the
    aggregated integrity-flag breakdown (see IntegrityFlagDetail docstring
    for the one documented scope gap vs. a literal per-frame timeline).
    """
    application_id: uuid.UUID
    student_id: uuid.UUID
    candidate_name: str
    internship_id: uuid.UUID
    internship_title: str

    status: str
    final_score: float | None
    integrity_score: float | None
    passed: bool | None
    badge_awarded: bool

    questions: list[InterviewQuestionDetail]
    integrity_flags: list[IntegrityFlagDetail]

    started_at: datetime
    completed_at: datetime | None


class ApplicantInterviewSummary(BaseModel):
    """
    One row in the company's applicant list (GET .../applications) --
    unchanged shape from what list_applicants already returned, just
    formalized into a schema instead of an ad-hoc dict so the frontend has
    a typed contract to build the dashboard's list view against.
    """
    status: str
    final_score: float | None
    integrity_score: float | None
    passed: bool | None


class ApplicantAptitudeSummary(BaseModel):
    """
    Mirrors ApplicantInterviewSummary but for the Aptitude Check -- the
    company-side piece that was previously missing entirely from the
    applicant list (has_aptitude_badge only ever reached the Sourcing/
    Discover tab, never the plain Applicants list or a per-candidate
    detail view). Reflects this student's BEST completed attempt for this
    internship, since MAX_ATTEMPTS_PER_INTERNSHIP (aptitude/routes.py)
    allows up to 2.
    """
    attempts_used: int
    status: str  # "not_started" | "in_progress" | "completed"
    raw_score: float | None
    percentile: float | None
    integrity_score: float | None
    passed: bool | None
    badge_awarded: bool


class ApplicantListItem(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    candidate_name: str
    status: str
    applied_at: datetime
    interview: ApplicantInterviewSummary | None = None
    aptitude: ApplicantAptitudeSummary | None = None



class AptitudeCheckConfig(BaseModel):
    aptitude_check_enabled: bool
    aptitude_difficulty: str | None = None
