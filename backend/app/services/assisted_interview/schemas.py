import uuid
from datetime import datetime

from pydantic import BaseModel

# Fixed topic checklist for the interviewer coverage tracker (spec 5.6
# Priority 4). Deliberately a small, fixed set rather than
# internship-specific or AI-generated -- "a simple interviewer aid, not an
# AI score". Keys are what the session's `coverage` dict is keyed by;
# labels are what the frontend displays.
COVERAGE_AREAS: list[tuple[str, str]] = [
    ("projects", "Projects"),
    ("technical_fundamentals", "Technical Fundamentals"),
    ("problem_solving", "Problem Solving"),
    ("role_specific", "Role-Specific Skills"),
    ("communication", "Communication / Behavioral"),
    ("motivation", "Role Motivation"),
]
VALID_COVERAGE_KEYS = {key for key, _ in COVERAGE_AREAS}

VALID_DECISIONS = {"strong_yes", "yes", "maybe", "no"}


class StartAssistedInterviewResponse(BaseModel):
    session_id: uuid.UUID
    status: str


class ExchangeRequest(BaseModel):
    """
    One turn of the live interview, already-transcribed text. The
    interviewer's client is expected to call /transcribe first if it's
    capturing audio, then post the resulting text here — kept as two
    separate calls so a typed-notes interviewer can skip transcription
    entirely (spec 5.6 step 1: "mic (or typed notes)").
    """
    speaker: str  # "interviewer" | "candidate"
    text: str


class SuggestionOut(BaseModel):
    id: str
    question: str


class ExchangeResponse(BaseModel):
    turn_id: uuid.UUID
    sequence: int
    suggestions: list[SuggestionOut] = []  # only populated when speaker == "candidate"


class TranscribeResponse(BaseModel):
    text: str | None


class AcceptSuggestionRequest(BaseModel):
    turn_id: uuid.UUID  # the candidate turn that carries the suggestion
    suggestion_id: str  # e.g. "s1" — must be one of that turn's ai_suggestions


class TurnResponse(BaseModel):
    id: uuid.UUID
    sequence: int
    speaker: str
    text: str
    ai_suggestions: list[SuggestionOut] = []
    accepted_suggestion_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NoteOut(BaseModel):
    id: str
    text: str
    is_evidence: bool
    created_at: datetime


class AssistedInterviewSessionResponse(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    status: str
    turns: list[TurnResponse] = []
    started_at: datetime
    ended_at: datetime | None

    # Enrichment for the review dashboard (matches the AI-led interview
    # dashboard's shape so both modes are comparable, per spec step 4)
    student_name: str | None = None
    internship_title: str | None = None

    # V1.1 additions -- interviewer-authored only, never AI-written (see
    # models.py's AssistedInterviewSession docstring for why each of these
    # exists as a nullable/optional field rather than something computed).
    coverage: dict[str, bool] = {}
    notes: list[NoteOut] = []
    technical_knowledge: int | None = None
    problem_solving: int | None = None
    communication: int | None = None
    project_understanding: int | None = None
    role_specific_notes: str | None = None
    decision: str | None = None
    scorecard_submitted_at: datetime | None = None

    model_config = {"from_attributes": True}


class AddNoteRequest(BaseModel):
    text: str
    is_evidence: bool = False


class UpdateCoverageRequest(BaseModel):
    """Partial update -- only the keys present are changed; other areas'
    covered state is left as-is. Keys must be one of VALID_COVERAGE_KEYS."""
    areas: dict[str, bool]


class CoverageAreaOut(BaseModel):
    key: str
    label: str
    covered: bool


class SubmitScorecardRequest(BaseModel):
    technical_knowledge: int | None = None  # 1-5
    problem_solving: int | None = None  # 1-5
    communication: int | None = None  # 1-5
    project_understanding: int | None = None  # 1-5
    role_specific_notes: str | None = None
    decision: str | None = None  # strong_yes|yes|maybe|no


class CandidateBriefAptitude(BaseModel):
    status: str
    raw_score: float | None
    percentile: float | None
    badge_awarded: bool


class CandidateBriefResponse(BaseModel):
    """
    Priority 1 (spec 5.6) -- a concise interviewer briefing, deliberately
    NOT a full re-hydration of the student profile page. Reuses data
    already computed by other agents (5.2 AI Screening's compatibility
    score, the Aptitude Check) rather than recomputing anything -- this
    endpoint is a read-only rollup.
    """
    candidate_name: str
    avatar_url: str | None
    role_title: str
    skills: list[str]
    top_projects: list[dict]  # up to 3, each {"title": str, "tech_stack": list[str]}
    compatibility_score: float | None
    aptitude: CandidateBriefAptitude | None
