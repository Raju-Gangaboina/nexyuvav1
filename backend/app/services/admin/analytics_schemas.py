from pydantic import BaseModel


class DomainCount(BaseModel):
    domain: str
    count: int


class LocationCount(BaseModel):
    location: str
    count: int


class SentimentBreakdown(BaseModel):
    positive: int
    neutral: int
    negative: int


class MinistryDashboard(BaseModel):
    total_students: int
    total_organizations: int
    total_verified_organizations: int
    total_internships: int
    total_applications: int
    total_completions: int
    match_success_rate: float  # completions / (accepted+completed), i.e. how often an accepted match finishes
    popular_domains: list[DomainCount]
    regional_trends: list[LocationCount]
    feedback_sentiment: SentimentBreakdown
    average_github_score: float | None
