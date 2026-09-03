import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.assessment_engine import (
    compute_final_score,
    compute_integrity_score,
    determine_pass,
    grade_answer,
    load_question_bank,
    pick_first_question,
    pick_next_question,
    resolve_domain_slug,
)
from app.core.database import get_db
from app.core.models import AssessmentAttempt, AssessmentStatus, Badge, StudentProfile
from app.core.security import require_role
from app.services.assessment.schemas import (
    BadgeResponse,
    IntegrityFlagRequest,
    QuestionPublic,
    StartAssessmentRequest,
    StartAssessmentResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
)

router = APIRouter(prefix="/api/v1/assessments", tags=["assessments"])
logger = logging.getLogger("nexyuva.assessments")


async def _get_own_profile(user_id: str, db: AsyncSession) -> StudentProfile:
    result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id))
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return profile


async def _get_own_attempt(
    attempt_id: uuid.UUID, profile_id: uuid.UUID, db: AsyncSession
) -> AssessmentAttempt:
    attempt = await db.get(AssessmentAttempt, attempt_id)
    if attempt is None or attempt.student_id != profile_id:
        raise HTTPException(status_code=404, detail="Assessment attempt not found")
    return attempt


@router.post("/start", response_model=StartAssessmentResponse, status_code=201)
async def start_assessment(
    payload: StartAssessmentRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)

    try:
        bank = load_question_bank(payload.domain)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # H3 fix: store the canonical resolved slug, not whatever raw string the
    # client sent — so "Data Science", "data analyst", and "data_analyst"
    # all produce attempts/badges under the same domain value instead of
    # fragmenting a student's badge history across spelling variants.
    canonical_domain = resolve_domain_slug(payload.domain) or payload.domain

    first_question = pick_first_question(bank)

    attempt = AssessmentAttempt(
        student_id=profile.id,
        domain=canonical_domain,
        current_difficulty=first_question["difficulty"],
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    return StartAssessmentResponse(
        attempt_id=attempt.id,
        domain=attempt.domain,
        question=QuestionPublic(**first_question),
    )


@router.post("/{attempt_id}/answer", response_model=SubmitAnswerResponse)
async def submit_answer(
    attempt_id: uuid.UUID,
    payload: SubmitAnswerRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(attempt_id, profile.id, db)

    if attempt.status != AssessmentStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This assessment attempt has already ended")

    bank = load_question_bank(attempt.domain)

    if payload.question_id in attempt.answered_question_ids:
        raise HTTPException(status_code=400, detail="This question was already answered")

    try:
        was_correct = grade_answer(bank, payload.question_id, payload.selected_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    answered_question = next(q for q in bank if q["id"] == payload.question_id)
    difficulty = answered_question["difficulty"]

    # SQLAlchemy doesn't track in-place mutation of JSON columns reliably —
    # reassign the whole list rather than .append(), or the change silently
    # won't persist on commit
    attempt.answers = attempt.answers + [
        {"question_id": payload.question_id, "difficulty": difficulty, "correct": was_correct}
    ]
    attempt.answered_question_ids = attempt.answered_question_ids + [payload.question_id]
    attempt.current_difficulty = difficulty

    next_question = pick_next_question(
        bank, attempt.answered_question_ids, was_correct, difficulty
    )

    # End condition: bank exhausted, or a reasonable max question count hit —
    # 6 questions is enough to reach "hard" tier from "easy" with headroom,
    # without dragging every attempt out to exhaust a small curated bank
    MAX_QUESTIONS = 6
    should_end = next_question is None or len(attempt.answers) >= MAX_QUESTIONS

    if not should_end:
        await db.commit()
        await db.refresh(attempt)
        return SubmitAnswerResponse(
            was_correct=was_correct,
            attempt_status="in_progress",
            next_question=QuestionPublic(**next_question),
        )

    # Finalize the attempt
    final_score = compute_final_score(attempt.answers)
    integrity_score = compute_integrity_score(attempt.integrity_flags)
    passed = determine_pass(final_score, integrity_score)

    attempt.final_score = final_score
    attempt.integrity_score = integrity_score
    attempt.passed = passed
    attempt.status = AssessmentStatus.COMPLETED
    attempt.completed_at = datetime.utcnow()

    badge_awarded = False
    if passed:
        # Don't award a duplicate badge for the same domain if one already exists
        existing = await db.execute(
            select(Badge).where(Badge.student_id == profile.id, Badge.domain == attempt.domain)
        )
        if existing.scalar_one_or_none() is None:
            db.add(Badge(student_id=profile.id, domain=attempt.domain, attempt_id=attempt.id))
            badge_awarded = True

    await db.commit()
    await db.refresh(attempt)

    return SubmitAnswerResponse(
        was_correct=was_correct,
        attempt_status="completed",
        next_question=None,
        final_score=final_score,
        integrity_score=integrity_score,
        passed=passed,
        badge_awarded=badge_awarded,
    )


@router.post("/{attempt_id}/integrity-flag", status_code=204)
async def report_integrity_flag(
    attempt_id: uuid.UUID,
    payload: IntegrityFlagRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the client-side proctoring JS whenever it detects a concerning
    event (no face, face turned away, tab blur, etc.) — see Architecture.md
    §12. Aggregated into the attempt's integrity_flags list; the actual
    penalty is computed once at completion, not flag-by-flag here, so the
    student never sees a running integrity score during the test itself
    (avoids turning it into a game of "how much can I get away with").
    """
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(attempt_id, profile.id, db)

    if attempt.status != AssessmentStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This assessment attempt has already ended")

    # Build a genuinely NEW list object — SQLAlchemy's plain JSON column type
    # only detects a change when the assigned object is a different one, not
    # when the same list reference is mutated in place and reassigned to
    # itself. (Mirrors the fix already present in interview/routes.py.)
    flags = [dict(f) for f in attempt.integrity_flags]
    existing_flag = next((f for f in flags if f["flag_type"] == payload.flag_type), None)
    if existing_flag:
        existing_flag["count"] += payload.count
        attempt.integrity_flags = flags
    else:
        attempt.integrity_flags = flags + [
            {"flag_type": payload.flag_type, "count": payload.count}
        ]

    await db.commit()


@router.get("/me/badges", response_model=list[BadgeResponse])
async def list_my_badges(
    user: dict = Depends(require_role("student")), db: AsyncSession = Depends(get_db)
):
    profile = await _get_own_profile(user["user_id"], db)
    result = await db.execute(select(Badge).where(Badge.student_id == profile.id))
    badges = result.scalars().all()
    return [
        BadgeResponse(domain=b.domain, awarded_at=b.awarded_at.isoformat()) for b in badges
    ]
