"""
Ministry/Admin Analytics Dashboard (PRD §4, Architecture.md §10). Real SQL
aggregations against the actual database — no mock data, no hardcoded
demo numbers. Every field in MinistryDashboard is computed from a live
query at request time.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.models import (
    Application,
    ApplicationStatus,
    Feedback,
    Internship,
    Organization,
    StudentProfile,
)
from app.core.security import require_role
from app.services.admin.analytics_schemas import (
    DomainCount,
    LocationCount,
    MinistryDashboard,
    SentimentBreakdown,
)

router = APIRouter(prefix="/api/v1/admin/analytics", tags=["admin-analytics"])


@router.get("/dashboard", response_model=MinistryDashboard)
async def get_ministry_dashboard(
    user: dict = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)
):
    total_students = (await db.execute(select(func.count(StudentProfile.id)))).scalar_one()
    total_organizations = (await db.execute(select(func.count(Organization.id)))).scalar_one()
    total_verified_organizations = (
        await db.execute(select(func.count(Organization.id)).where(Organization.is_verified.is_(True)))
    ).scalar_one()
    total_internships = (await db.execute(select(func.count(Internship.id)))).scalar_one()
    total_applications = (await db.execute(select(func.count(Application.id)))).scalar_one()
    total_completions = (
        await db.execute(
            select(func.count(Application.id)).where(Application.status == ApplicationStatus.COMPLETED)
        )
    ).scalar_one()

    # Match success rate = of everyone who got ACCEPTED-or-further, how many
    # actually COMPLETED — a real measure of whether matches translate into
    # finished internships, not just accepted applications
    accepted_or_further = (
        await db.execute(
            select(func.count(Application.id)).where(
                Application.status.in_(
                    [ApplicationStatus.ACCEPTED, ApplicationStatus.COMPLETED]
                )
            )
        )
    ).scalar_one()
    match_success_rate = (
        round(total_completions / accepted_or_further, 3) if accepted_or_further > 0 else 0.0
    )

    domain_result = await db.execute(
        select(Internship.domain, func.count(Internship.id))
        .group_by(Internship.domain)
        .order_by(func.count(Internship.id).desc())
    )
    popular_domains = [DomainCount(domain=d, count=c) for d, c in domain_result.all()]

    location_result = await db.execute(
        select(StudentProfile.location, func.count(StudentProfile.id))
        .where(StudentProfile.location.is_not(None))
        .group_by(StudentProfile.location)
        .order_by(func.count(StudentProfile.id).desc())
    )
    regional_trends = [LocationCount(location=loc, count=c) for loc, c in location_result.all()]

    sentiment_result = await db.execute(
        select(Feedback.sentiment_label, func.count(Feedback.id)).group_by(Feedback.sentiment_label)
    )
    sentiment_counts = {label: count for label, count in sentiment_result.all()}
    feedback_sentiment = SentimentBreakdown(
        positive=sentiment_counts.get("positive", 0),
        neutral=sentiment_counts.get("neutral", 0),
        negative=sentiment_counts.get("negative", 0),
    )

    avg_github_result = await db.execute(
        select(func.avg(StudentProfile.github_score)).where(StudentProfile.github_score.is_not(None))
    )
    avg_github_score = avg_github_result.scalar_one()

    return MinistryDashboard(
        total_students=total_students,
        total_organizations=total_organizations,
        total_verified_organizations=total_verified_organizations,
        total_internships=total_internships,
        total_applications=total_applications,
        total_completions=total_completions,
        match_success_rate=match_success_rate,
        popular_domains=popular_domains,
        regional_trends=regional_trends,
        feedback_sentiment=feedback_sentiment,
        average_github_score=round(avg_github_score, 1) if avg_github_score is not None else None,
    )
