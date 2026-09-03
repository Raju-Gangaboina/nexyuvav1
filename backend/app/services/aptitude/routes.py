import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.aptitude_engine import (
    QUESTION_COUNT,
    OVERALL_ATTEMPT_SECONDS,
    SECONDS_PER_QUESTION,
    compute_integrity_breakdown,
    compute_integrity_score,
    compute_percentile,
    compute_raw_score,
    determine_pass,
    MIN_POOL_SIZE_FOR_BADGE,
    generate_questions,
    grade_answer,
    public_question,
)
from app.core.database import get_db
from app.core.models import AptitudeAttempt, AptitudeStatus, Badge, Internship, StudentProfile
from app.core.security import require_role
from app.services.aptitude.schemas import (
    BadgeResponse,
    IntegrityFlagBreakdown,
    IntegrityFlagRequest,
    QuestionPublic,
    QuestionResult,
    StartAptitudeRequest,
    StartAptitudeResponse,
    SubmitAptitudeRequest,
    SubmitAptitudeResponse,
)

router = APIRouter(prefix="/api/v1/aptitude", tags=["aptitude"])
logger = logging.getLogger("nexyuva.aptitude")

# Temporary cap: at most this many Aptitude Check attempts per
# (student, internship) pair, regardless of pass/fail/abandoned status.
MAX_ATTEMPTS_PER_INTERNSHIP = 2


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
) -> AptitudeAttempt:
    attempt = await db.get(AptitudeAttempt, attempt_id)
    if attempt is None or attempt.student_id != profile_id:
        raise HTTPException(status_code=404, detail="Aptitude attempt not found")
    return attempt


@router.post("/start", response_model=StartAptitudeResponse, status_code=201)
async def start_aptitude_check(
    payload: StartAptitudeRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)

    internship = await db.get(Internship, payload.internship_id)
    if internship is None:
        raise HTTPException(status_code=404, detail="Internship not found")
    if not internship.aptitude_check_enabled:
        raise HTTPException(
            status_code=400, detail="Aptitude Check isn't enabled for this internship"
        )

    existing_attempts_result = await db.execute(
        select(AptitudeAttempt.id).where(
            AptitudeAttempt.student_id == profile.id,
            AptitudeAttempt.internship_id == internship.id,
        )
    )
    attempts_taken = len(existing_attempts_result.all())
    if attempts_taken >= MAX_ATTEMPTS_PER_INTERNSHIP:
        raise HTTPException(
            status_code=400,
            detail=f"You've used all {MAX_ATTEMPTS_PER_INTERNSHIP} Aptitude Check attempts for this internship",
        )

    questions = await generate_questions(internship.domain, internship.aptitude_difficulty)
    if questions is None:
        # Design note (aptitude_engine.generate_questions docstring): a
        # partial/degraded question set would silently break the percentile
        # comparison against full-length attempts, so fail the start
        # request cleanly rather than begin a broken attempt.
        raise HTTPException(
            status_code=503,
            detail="Aptitude Check question generation is temporarily unavailable — please try again shortly.",
        )

    attempt = AptitudeAttempt(
        student_id=profile.id,
        internship_id=internship.id,
        questions=questions,
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    return StartAptitudeResponse(
        attempt_id=attempt.id,
        internship_id=internship.id,
        seconds_per_question=SECONDS_PER_QUESTION,
        overall_attempt_seconds=OVERALL_ATTEMPT_SECONDS,
        questions=[QuestionPublic(**public_question(q)) for q in questions],
    )


@router.post("/{attempt_id}/submit", response_model=SubmitAptitudeResponse)
async def submit_aptitude_check(
    attempt_id: uuid.UUID,
    payload: SubmitAptitudeRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(attempt_id, profile.id, db)

    if attempt.status != AptitudeStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This aptitude attempt has already ended")

    submitted = {a.question_id: a.selected_index for a in payload.answers}
    graded_answers = []
    for q in attempt.questions:
        qid = q["id"]
        if qid in submitted:
            selected_index = submitted[qid]
            try:
                was_correct = grade_answer(attempt.questions, qid, selected_index)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        else:
            # Fix: previously an unanswered/skipped question was silently
            # dropped from graded_answers entirely, which shrank the
            # denominator in compute_raw_score and artificially inflated
            # the score. Now every question in the attempt is graded, with
            # a skip always counted as incorrect.
            selected_index = None
            was_correct = False
        graded_answers.append({
            "question_id": qid,
            "correct": was_correct,
            "selected_index": selected_index,
        })

    attempt.answers = graded_answers
    raw_score = compute_raw_score(graded_answers)
    integrity_score = compute_integrity_score(attempt.integrity_flags)
    # Fetched early (not just in the passed-branch like before) because
    # determine_pass now needs the internship difficulty tier for the
    # per-difficulty raw-score floor (Fix Plan, Option D).
    internship = await db.get(Internship, attempt.internship_id)
    difficulty = internship.aptitude_difficulty if internship else "medium"

    # Percentile against every OTHER completed attempt for this same
    # internship, plus this one -- design doc 3.4: ranks against the actual
    # pool that took that actual test rather than a fixed cutoff.
    other_scores_result = await db.execute(
        select(AptitudeAttempt.raw_score).where(
            AptitudeAttempt.internship_id == attempt.internship_id,
            AptitudeAttempt.status == AptitudeStatus.COMPLETED,
            AptitudeAttempt.raw_score.is_not(None),
        )
    )
    other_scores = [s for (s,) in other_scores_result.all()]
    pool_size = len(other_scores)
    percentile = compute_percentile(raw_score, other_scores + [raw_score])
    # With too small a pool, percentile is not meaningful -- surface that
    # to the frontend distinctly from a genuine fail (Fix Plan, Option A).
    percentile_pending = pool_size < MIN_POOL_SIZE_FOR_BADGE
    passed = determine_pass(
        percentile,
        integrity_score,
        pool_size=pool_size,
        raw_score=raw_score,
        difficulty=difficulty,
    )

    attempt.raw_score = raw_score
    attempt.percentile = percentile
    attempt.integrity_score = integrity_score
    attempt.badge_awarded = passed
    attempt.status = AptitudeStatus.COMPLETED
    attempt.completed_at = datetime.utcnow()

    badge_awarded = False
    if passed:
        badge_label = f"Aptitude Check - {internship.title}" if internship else "Aptitude Check"
        # One aptitude badge per (student, internship) — don't duplicate on
        # a hypothetical re-attempt.
        existing = await db.execute(
            select(Badge).where(
                Badge.student_id == profile.id, Badge.aptitude_attempt_id.is_not(None),
                Badge.label == badge_label,
            )
        )
        if existing.scalar_one_or_none() is None:
            db.add(Badge(
                student_id=profile.id,
                domain=internship.domain if internship else "",
                aptitude_attempt_id=attempt.id,
                label=badge_label,
            ))
            badge_awarded = True

    await db.commit()
    await db.refresh(attempt)

    return SubmitAptitudeResponse(
        raw_score=raw_score,
        percentile=percentile,
        integrity_score=integrity_score,
        passed=passed,
        badge_awarded=badge_awarded,
        percentile_pending=percentile_pending,
        integrity_breakdown=[
            IntegrityFlagBreakdown(**b) for b in compute_integrity_breakdown(attempt.integrity_flags)
        ],
        question_results=[
            QuestionResult(
                question_id=a["question_id"],
                correct=a["correct"],
                selected_index=a["selected_index"],
                correct_index=next(q["correct_index"] for q in attempt.questions if q["id"] == a["question_id"]),
                options=next(q["options"] for q in attempt.questions if q["id"] == a["question_id"]),
                question=next(q["question"] for q in attempt.questions if q["id"] == a["question_id"]),
            )
            for a in graded_answers
        ],
    )


@router.post("/{attempt_id}/integrity-flag", status_code=204)
async def report_integrity_flag(
    attempt_id: uuid.UUID,
    payload: IntegrityFlagRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Mirrors app/services/assessment/routes.py's integrity-flag endpoint —
    same JSON-column reassignment-not-mutation fix applies here."""
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(attempt_id, profile.id, db)

    if attempt.status != AptitudeStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This aptitude attempt has already ended")

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
async def list_my_aptitude_badges(
    user: dict = Depends(require_role("student")), db: AsyncSession = Depends(get_db)
):
    profile = await _get_own_profile(user["user_id"], db)
    result = await db.execute(
        select(Badge).where(
            Badge.student_id == profile.id, Badge.aptitude_attempt_id.is_not(None)
        )
    )
    badges = result.scalars().all()
    return [
        BadgeResponse(domain=b.domain, awarded_at=b.awarded_at.isoformat()) for b in badges
    ]
