import uuid

from pydantic import BaseModel


class RecommendationItem(BaseModel):
    internship_id: uuid.UUID
    organization_id: uuid.UUID
    title: str
    organization_name: str
    domain: str
    location: str
    work_mode: str
    duration_weeks: int
    stipend: int | None
    final_score: float
    content_based_score: float | None
    skill_overlap_score: float
    collaborative_score: float | None
    matched_skills: list[str]
    required_skills: list[str] = []
    explanation: str
    description: str | None = None
    responsibilities: str | None = None
    eligibility: str | None = None
    perks: list[str] | None = None
    cgpa_cutoff: float | None = None
    sector: str = "Private"
    aptitude_check_enabled: bool = False


class CareerPathPrediction(BaseModel):
    predicted_path: str
    confidence: float
    all_paths_ranked: list[dict]
    top_contributing_skills: list[dict]
    skills_not_recognized: list[str]


class SkillGapResult(BaseModel):
    target: str
    match_percentage: float
    matched_skills: list[str]
    missing_skills: list[str]
    additional_skills_you_have: list[str]


class CompetencyDimensions(BaseModel):
    academic_excellence: int
    technical_expertise: int
    project_maturity: int
    professional_experience: int
    innovation: int
    leadership: int
    communication: int
    career_readiness: int
