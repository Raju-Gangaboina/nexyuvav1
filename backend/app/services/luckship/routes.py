"""
Luckship: student-side AI opportunity hunter (Architecture.md addendum).

Company-side NexYuva (services/recommendation, app/ai/sourcing_pitch.py)
finds candidates for a posting on NexYuva itself. Luckship is the mirror
image: it goes OUTSIDE NexYuva to public job/internship sources, hunts for
opportunities that match one student's real profile, ranks and explains
them, and stops short of auto-applying -- the student always reviews and
submits.

Pipeline per request:
  1. Build search queries from the student's own profile (preferred_domains
     first, top skills as fallback -- Rules.md-style graceful degradation:
     a profile with neither still gets a generic query rather than an error)
  2. Hunt external sources (app/ai/luckship_sources.py)
  3. Score every result against the student's skills (app/ai/luckship_scoring.py)
  4. Generate a plain-language explanation for the top results only
     (app/ai/luckship_explain.py) -- capped to keep Groq calls bounded per
     request the same way sourcing_pitch.py is only called per-candidate,
     not per-internship-per-candidate
  5. Cache the ranked result in Redis per-student for a few minutes so
     repeated dashboard loads don't re-hit external APIs and Groq every time
"""
import logging
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.luckship_explain import generate_student_explanation
from app.ai.luckship_scoring import rank_matches, score_opportunity
from app.ai.luckship_sources import SOURCES, hunt_external_opportunities
from app.core.cache import get_json, set_json
from app.core.database import get_db
from app.core.models import StudentProfile
from app.core.security import require_role
from app.services.luckship.schemas import LuckshipHuntResult, LuckshipOpportunity

router = APIRouter(prefix="/api/v1/luckship", tags=["luckship"])
logger = logging.getLogger("nexyuva.luckship")

# Longer TTL than the recommendation cache (45s) -- external API calls and
# Groq calls are much more expensive than a DB read, and a job market
# doesn't meaningfully change minute to minute the way an internal
# internship list can right after an admin edits it.
_CACHE_TTL_SECONDS = 600
_EXPLAIN_TOP_N = 8  # only the top N results get an LLM explanation per hunt


def _build_queries(profile: StudentProfile) -> list[str]:
    queries: list[str] = []
    if profile.preferred_domains:
        queries.extend(profile.preferred_domains[:3])
    if profile.skills:
        # Top skills as a combined query catches roles that don't map
        # cleanly to a single "domain" word (e.g. "python fastapi" as one
        # search term surfaces backend-flavored postings a bare "backend"
        # domain search might miss).
        top_skills = profile.skills[:4]
        if top_skills:
            queries.append(" ".join(top_skills))
    if not queries:
        # Cold-start profile (no domains, no skills yet) -- still return
        # something rather than an empty hunt with no explanation why.
        queries.append("internship")
    return queries


@router.get("/hunt", response_model=LuckshipHuntResult)
async def hunt_opportunities(
    top_k: int = Query(default=15, le=30),
    refresh: bool = Query(default=False, description="Bypass cache and re-hunt now"),
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user["user_id"]))
    )
    profile = result.scalar_one_or_none()

    student_skills: list[str] = (profile.skills if profile else None) or []
    student_name = profile.full_name if profile else "there"

    cache_key = f"cache:luckship:{user['user_id']}:{top_k}"
    if not refresh:
        cached = await get_json(cache_key)
        if cached is not None:
            cached["stale_cache"] = False
            return LuckshipHuntResult(**cached)

    queries = _build_queries(profile) if profile else ["internship"]
    raw_pool = await hunt_external_opportunities(queries)

    # Scoring runs per-opportunity against arbitrary external API data --
    # one malformed item from any source (e.g. an unexpected field shape)
    # should not take down the whole hunt for every other source's results.
    # Mirrors the same graceful-degradation rule hunt_external_opportunities
    # already applies at the fetch level.
    scored = []
    for opp in raw_pool:
        try:
            scored.append(score_opportunity(student_skills, opp))
        except Exception:
            logger.exception("Scoring failed for %s:%s -- dropping from results", opp.source, opp.external_id)
    ranked = rank_matches(scored, top_k=top_k)

    # Explanation generation is the expensive step (Groq round-trip), so it
    # only runs for what the student will actually see near the top -- the
    # rest still get a deterministic fallback explanation, never a blank one.
    for i, match in enumerate(ranked):
        if i < _EXPLAIN_TOP_N:
            match.explanation = await generate_student_explanation(
                student_name=student_name,
                student_skills=student_skills,
                title=match.title,
                company=match.company,
                matched_skills=match.matched_skills,
                missing_skills=match.missing_skills,
                match_score=match.match_score,
            )
        else:
            from app.ai.luckship_explain import generate_fallback_explanation

            match.explanation = generate_fallback_explanation(
                match.title, match.company, match.matched_skills, match.missing_skills, match.match_score
            )

    payload = LuckshipHuntResult(
        opportunities=[
            LuckshipOpportunity(
                source=m.source,
                external_id=m.external_id,
                title=m.title,
                company=m.company,
                location=m.location,
                remote=m.remote,
                url=m.url,
                match_score=m.match_score,
                matched_skills=m.matched_skills,
                missing_skills=m.missing_skills,
                prep_estimate=m.prep_estimate,
                posted_at=m.posted_at,
                explanation=m.explanation,
            )
            for m in ranked
        ],
        queries_used=queries,
        sources_checked=[name for name, _ in SOURCES],
        stale_cache=False,
    )

    await set_json(cache_key, payload.model_dump(), ttl_seconds=_CACHE_TTL_SECONDS)
    return payload
