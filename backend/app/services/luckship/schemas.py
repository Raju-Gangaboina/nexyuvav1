from pydantic import BaseModel


class LuckshipOpportunity(BaseModel):
    source: str
    external_id: str
    title: str
    company: str
    location: str | None
    remote: bool
    url: str
    match_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    prep_estimate: str
    posted_at: str | None = None
    explanation: str


class LuckshipHuntResult(BaseModel):
    opportunities: list[LuckshipOpportunity]
    queries_used: list[str]
    sources_checked: list[str]
    stale_cache: bool = False
