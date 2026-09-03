import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.career_path import predict_career_path
from app.ai.competency import calculate_competency_dimensions
from app.ai.collaborative_filtering import (
    generate_synthetic_interactions,
    item_item_similarity,
    collaborative_score as cf_score_fn,
)
from app.ai.recommendation_engine import (
    RecommendationWeights,
    compute_hybrid_score,
    content_similarity,
    rank_recommendations,
)
from app.ai.skill_gap import analyze_skill_gap
from app.core.cache import get_json, set_json
from app.core.database import get_db
from app.core.models import Internship, Organization, StudentProfile
from app.core.security import require_role
from app.services.recommendation.schemas import (
    CareerPathPrediction,
    CompetencyDimensions,
    RecommendationItem,
    SkillGapResult,
)

router = APIRouter(prefix="/api/v1/recommendations", tags=["recommendations"])
logger = logging.getLogger("nexyuva.recommendations")

# Short TTL cache for data that barely changes between requests but was
# previously being re-fetched from Neon on every single /me call, adding
# ~0.6s per query x multiple queries to every page load. See Architecture.md
# notes in cache.py — this is a speed optimization, not a hard dependency;
# if Redis is unreachable these helpers just fall through to the DB.
_INTERNSHIPS_CACHE_KEY = "cache:internships:active"
_STUDENTS_CACHE_KEY = "cache:students:all"
_ORGS_CACHE_KEY = "cache:orgs:all"
_CACHE_TTL_SECONDS = 45


async def _get_own_profile(user_id: str, db: AsyncSession) -> StudentProfile:
    result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id))
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return profile


async def _get_active_internships_cached(db: AsyncSession) -> list[dict]:
    """Returns plain-dict rows (cache-friendly) for all active internships."""
    cached = await get_json(_INTERNSHIPS_CACHE_KEY)
    if cached is not None:
        return cached

    result = await db.execute(select(Internship).where(Internship.is_active.is_(True)))
    internships = result.scalars().all()
    rows = [
        {
            "id": str(i.id),
            "title": i.title,
            "organization_id": str(i.organization_id),
            "domain": i.domain,
            "location": i.location,
            "work_mode": i.work_mode.value,
            "duration_weeks": i.duration_weeks,
            "stipend": i.stipend,
            "required_skills": i.required_skills or [],
            "requirement_embedding": i.requirement_embedding,
            # C1 dashboard-card fields (d8a1f4b62c93) — previously dropped
            # here even after the model/migration added them, since this
            # cache projection wasn't updated to select them.
            "description": i.description,
            "responsibilities": i.responsibilities,
            "eligibility": i.eligibility,
            "perks": i.perks or [],
            "cgpa_cutoff": i.cgpa_cutoff,
            "sector": i.sector,
            "aptitude_check_enabled": i.aptitude_check_enabled,
        }
        for i in internships
    ]
    await set_json(_INTERNSHIPS_CACHE_KEY, rows, ttl_seconds=_CACHE_TTL_SECONDS)
    return rows


async def _get_all_students_cached(db: AsyncSession) -> list[dict]:
    cached = await get_json(_STUDENTS_CACHE_KEY)
    if cached is not None:
        return cached

    result = await db.execute(select(StudentProfile))
    students = result.scalars().all()
    rows = [{"id": str(s.id), "skills": s.skills or []} for s in students]
    await set_json(_STUDENTS_CACHE_KEY, rows, ttl_seconds=_CACHE_TTL_SECONDS)
    return rows


async def _get_org_names_cached(db: AsyncSession) -> dict[str, str]:
    cached = await get_json(_ORGS_CACHE_KEY)
    if cached is not None:
        return cached

    result = await db.execute(select(Organization))
    org_name_by_id = {str(o.id): o.name for o in result.scalars().all()}
    await set_json(_ORGS_CACHE_KEY, org_name_by_id, ttl_seconds=_CACHE_TTL_SECONDS)
    return org_name_by_id


@router.get("/me", response_model=list[RecommendationItem])
async def get_my_recommendations(
    top_k: int = Query(default=10, le=20),
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    student_skills = profile.skills or []

    internship_rows = await _get_active_internships_cached(db)
    if not internship_rows:
        return []

    # Content-based: cosine similarity computed here in Python rather than a
    # separate pgvector query, since we already have both vectors loaded and
    # this keeps the scoring logic (and its graceful-degradation behavior)
    # in one place instead of split across SQL and Python.
    # Collaborative filtering: bootstrapped synthetic signal across the
    # current student pool. Recomputing this per-request is fine at contest
    # scale (dozens of students); at real scale this belongs in a scheduled
    # batch job, not inline in the request path — noted in Architecture.md
    # if/when that becomes necessary.
    all_students = await _get_all_students_cached(db)
    student_ids = [s["id"] for s in all_students]
    student_skill_sets = {s["id"]: set(s["skills"]) for s in all_students}
    internship_ids = [i["id"] for i in internship_rows]
    internship_skill_sets = {i["id"]: set(i["required_skills"]) for i in internship_rows}

    cf_matrix = generate_synthetic_interactions(
        student_ids, student_skill_sets, internship_ids, internship_skill_sets
    )
    cf_similarity = item_item_similarity(cf_matrix)
    my_index = student_ids.index(str(profile.id)) if str(profile.id) in student_ids else None

    breakdowns = []
    for j, internship in enumerate(internship_rows):
        content_score = content_similarity(profile.profile_embedding, internship["requirement_embedding"])

        collab_score = None
        if my_index is not None:
            collab_score = cf_score_fn(my_index, j, cf_matrix, cf_similarity)

        breakdown = compute_hybrid_score(
            internship_id=internship["id"],
            student_skills=student_skills,
            required_skills=internship["required_skills"],
            content_based_score=content_score,
            collaborative_score=collab_score,
            weights=RecommendationWeights(),
        )
        breakdowns.append((breakdown, internship))

    ranked = rank_recommendations([b for b, _ in breakdowns], top_k=top_k)
    internship_by_id = {i["id"]: i for _, i in breakdowns}

    org_name_by_id = await _get_org_names_cached(db)

    items = []
    for b in ranked:
        internship = internship_by_id[b.internship_id]
        items.append(
            RecommendationItem(
                internship_id=internship["id"],
                organization_id=internship["organization_id"],
                title=internship["title"],
                organization_name=org_name_by_id.get(internship["organization_id"], "Unknown"),
                domain=internship["domain"],
                location=internship["location"],
                work_mode=internship["work_mode"],
                duration_weeks=internship["duration_weeks"],
                stipend=internship["stipend"],
                final_score=b.final_score,
                content_based_score=b.content_based_score,
                skill_overlap_score=b.skill_overlap_score,
                collaborative_score=b.collaborative_score,
                matched_skills=b.matched_skills,
                required_skills=internship.get("required_skills") or [],
                explanation=b.explanation,
                description=internship.get("description"),
                responsibilities=internship.get("responsibilities"),
                eligibility=internship.get("eligibility"),
                perks=internship.get("perks") or [],
                cgpa_cutoff=internship.get("cgpa_cutoff"),
                sector=internship.get("sector") or "Private",
                aptitude_check_enabled=internship.get("aptitude_check_enabled") or False,
            )
        )
    return items


@router.get("/competency", response_model=CompetencyDimensions)
async def get_my_competency_dimensions(
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    # No FastAPI equivalent existed before this (audit C1/C2 dashboard-repoint
    # finding) — the 8-dimension profile was Node/JSON-only. Real DB row in,
    # ported calculation (app/ai/competency.py) out.
    profile = await _get_own_profile(user["user_id"], db)
    return CompetencyDimensions(**calculate_competency_dimensions(profile))


@router.get("/career-path", response_model=CareerPathPrediction)
async def get_career_path_prediction(
    user: dict = Depends(require_role("student")), db: AsyncSession = Depends(get_db)
):
    profile = await _get_own_profile(user["user_id"], db)
    try:
        result = predict_career_path(profile.skills or [])
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="Career path model not trained yet. Contact an admin to run training.",
        )
    return CareerPathPrediction(**result)


@router.get("/skill-gap", response_model=SkillGapResult)
async def get_skill_gap(
    target_path: str | None = Query(default=None),
    internship_id: uuid.UUID | None = Query(default=None),
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    if target_path is None and internship_id is None:
        raise HTTPException(
            status_code=400, detail="Provide either target_path or internship_id"
        )

    profile = await _get_own_profile(user["user_id"], db)
    target_skills = None

    if internship_id is not None:
        internship = await db.get(Internship, internship_id)
        if internship is None:
            raise HTTPException(status_code=404, detail="Internship not found")
        target_skills = internship.required_skills

    try:
        result = analyze_skill_gap(
            student_skills=profile.skills or [],
            target_skills=target_skills,
            target_path=target_path,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SkillGapResult(**result)
