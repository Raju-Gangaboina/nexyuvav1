from pydantic import BaseModel


class StudentProfileUpdate(BaseModel):
    full_name: str | None = None
    academic_background: str | None = None
    location: str | None = None
    location_preference: str | None = None
    skills: list[str] | None = None
    github_username: str | None = None
    degree: str | None = None
    branch: str | None = None
    year: int | None = None
    cgpa: float | None = None
    linkedin_url: str | None = None
    bio: str | None = None
    college: str | None = None
    tools: list[str] | None = None
    preferred_domains: list[str] | None = None
    preferred_locations: list[str] | None = None
    preferred_mode: str | None = None
    min_stipend: int | None = None


class StudentProfileResponse(BaseModel):
    full_name: str
    email: str
    avatar_url: str | None = None
    academic_background: str | None
    location: str | None
    location_preference: str | None
    skills: list[str]
    resume_path: str | None
    resume_score: int
    github_username: str | None
    github_score: float | None
    linkedin_verified: bool
    linkedin_headline: str | None
    degree: str | None
    branch: str | None
    year: int | None
    cgpa: float | None
    linkedin_url: str | None
    bio: str | None
    college: str | None
    tools: list[str]
    preferred_domains: list[str]
    preferred_locations: list[str]
    preferred_mode: str | None
    min_stipend: int | None
    # Persisted at resume-upload time (see StudentProfile.projects docstring
    # in app/core/models.py) -- reuses ResumeParseResponse's ResumeProjectItem
    # shape rather than a duplicate schema, since it's the same data.
    projects: list["ResumeProjectItem"] = []
    # Persisted at resume-upload time (see StudentProfile.certifications
    # docstring in app/core/models.py) -- raw one-line entries, not a
    # structured schema, since the source resume text doesn't reliably
    # support splitting into issuer/date fields.
    certifications: list[str] = []
    # Persisted at resume-upload time (see StudentProfile.internship_history
    # docstring in app/core/models.py) -- reuses ResumeParseResponse's
    # ResumeExperienceItem shape rather than a duplicate schema, since it's
    # the same data.
    internship_history: list["ResumeExperienceItem"] = []

    class Config:
        from_attributes = True


class GitHubSyncRequest(BaseModel):
    github_username: str
    # H2 fix: lets a student force a live GitHub fetch instead of getting
    # served the cached profile (up to 1hr stale) — e.g. after they just
    # pushed new commits and want their score to reflect that now. Still
    # subject to the 5/hour rate limit below, so this can't be used to
    # bypass the shared-quota protection, only to skip the cache.
    force_refresh: bool = False


class ConfirmedSkillItem(BaseModel):
    name: str
    category: str


class SuggestedSkillItem(BaseModel):
    name: str
    category: str
    confidence: float
    matched_text: str


class ResumeLinksItem(BaseModel):
    github_username: str | None
    linkedin_url: str | None
    email: str | None
    phone: str | None


class ResumeEducationItem(BaseModel):
    degree: str | None
    branch: str | None
    cgpa: float | None
    year: int | None
    college: str | None = None
    college_location: str | None = None
    college_verified: bool = False


class ResumeProjectItem(BaseModel):
    title: str
    tech_stack: list[str]
    description: str


class ResumeExperienceItem(BaseModel):
    title: str
    description: str


class ResumeParseResponse(BaseModel):
    confirmed_skills: list[ConfirmedSkillItem]
    suggested_skills: list[SuggestedSkillItem]
    academic_background_guess: str | None
    raw_sections_found: list[str]
    # Previously parsed by app/ai/resume_parser.py but never declared here —
    # FastAPI/Pydantic silently drops any key passed into a response model
    # that isn't a declared field, so links/education/projects/experience
    # were being extracted correctly and then thrown away before reaching
    # the frontend. Declaring them here is what actually surfaces them.
    links: ResumeLinksItem
    education: ResumeEducationItem
    projects: list[ResumeProjectItem]
    experience: list[ResumeExperienceItem]
    certifications: list[str]


class ATSCheckItem(BaseModel):
    id: str
    status: str  # "pass" | "warn" | "fail"
    label: str
    detail: str
    platforms: list[str]


class ATSGenuineMistake(BaseModel):
    issue: str
    quote: str
    why_it_matters: str
    fix: str


class ATSFrameworkNote(BaseModel):
    platform: str
    note: str


class ATSKeywordGap(BaseModel):
    matched: list[str]
    missing: list[str]


class ATSAnalysisResponse(BaseModel):
    """app/ai/ats_analyzer.py output, surfaced as-is -- see that module's
    docstring for what each field means and which real ATS platforms each
    check maps to."""
    overall_score: int
    category_scores: dict[str, int]
    checks: list[ATSCheckItem]
    genuine_mistakes: list[ATSGenuineMistake]
    ai_reviewed: bool
    framework_notes: list[ATSFrameworkNote]
    keyword_gap: ATSKeywordGap | None
