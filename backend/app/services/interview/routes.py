import logging
import random
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.interview_ai import (
    check_frame_for_concerns,
    compute_interview_final_score,
    compute_interview_integrity_score,
    determine_interview_pass,
    grade_answer,
)
from app.core.database import get_db
from app.core.models import (
    Application,
    Badge,
    Internship,
    InterviewAttempt,
    InterviewStatus,
    StudentProfile,
)
from app.core.rate_limit import limiter
from app.core.security import require_role
from app.services.interview.schemas import (
    FrameCheckRequest,
    FrameCheckResponse,
    IntegrityFlagRequest,
    InterviewQuestionPublic,
    InterviewResultResponse,
    StartInterviewResponse,
    SubmitInterviewAnswerRequest,
    SubmitInterviewAnswerResponse,
)

router = APIRouter(prefix="/api/v1/students/applications", tags=["interviews"])
logger = logging.getLogger("nexyuva.interviews")

QUESTIONS_PER_INTERVIEW = 10


async def _get_own_profile(user_id: str, db: AsyncSession) -> StudentProfile:
    result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id))
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return profile


async def _get_own_application(application_id: uuid.UUID, profile_id: uuid.UUID, db: AsyncSession) -> Application:
    app_row = await db.get(Application, application_id)
    if app_row is None or app_row.student_id != profile_id:
        raise HTTPException(status_code=404, detail="Application not found")
    return app_row


async def _get_own_attempt(application_id: uuid.UUID, profile_id: uuid.UUID, db: AsyncSession) -> InterviewAttempt:
    result = await db.execute(
        select(InterviewAttempt).where(InterviewAttempt.application_id == application_id)
    )
    attempt = result.scalar_one_or_none()
    if attempt is None or attempt.student_id != profile_id:
        raise HTTPException(status_code=404, detail="Interview not started for this application")
    return attempt


@router.post("/{application_id}/interview/start", response_model=StartInterviewResponse, status_code=201)
async def start_interview(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    application = await _get_own_application(application_id, profile.id, db)

    existing = await db.execute(
        select(InterviewAttempt).where(InterviewAttempt.application_id == application_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Interview already started for this application")

    internship = await db.get(Internship, application.internship_id)
    if internship is None:
        raise HTTPException(status_code=404, detail="Internship not found")

    bank = internship.interview_question_bank or []
    if len(bank) < 1:
        raise HTTPException(
            status_code=400,
            detail="This company hasn't uploaded interview questions for this internship yet",
        )

    sample_size = min(QUESTIONS_PER_INTERVIEW, len(bank))
    selected = random.sample(bank, sample_size)

    attempt = InterviewAttempt(
        application_id=application_id,
        student_id=profile.id,
        internship_id=internship.id,
        questions=[{"question": q, "answer": None, "score": None, "notes": None, "resume_consistent": None} for q in selected],
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    return StartInterviewResponse(
        attempt_id=attempt.id,
        questions=[InterviewQuestionPublic(index=i, question=q["question"]) for i, q in enumerate(attempt.questions)],
    )


@router.post("/{application_id}/interview/answer", response_model=SubmitInterviewAnswerResponse)
async def submit_answer(
    application_id: uuid.UUID,
    payload: SubmitInterviewAnswerRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(application_id, profile.id, db)

    if attempt.status != InterviewStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This interview has already ended")

    questions = attempt.questions
    if payload.question_index < 0 or payload.question_index >= len(questions):
        raise HTTPException(status_code=400, detail="Invalid question index")
    if questions[payload.question_index]["answer"] is not None:
        raise HTTPException(status_code=400, detail="This question was already answered")

    grading = await grade_answer(
        question=questions[payload.question_index]["question"],
        answer=payload.answer,
        resume_skills=profile.skills or [],
        academic_background=profile.academic_background,
    )

    # Build a genuinely NEW list (not an in-place mutation of the same list
    # object) — SQLAlchemy's plain JSON column type only detects a change
    # when the assigned object is a different one, not when the same list
    # reference is mutated and reassigned to itself.
    new_questions = [dict(q) for q in questions]
    new_questions[payload.question_index] = {
        "question": questions[payload.question_index]["question"],
        "answer": payload.answer,
        "score": grading["score"],
        "notes": grading["notes"],
        "resume_consistent": grading["resume_consistent"],
    }
    attempt.questions = new_questions

    all_answered = all(q["answer"] is not None for q in attempt.questions)

    if not all_answered:
        await db.commit()
        return SubmitInterviewAnswerResponse(graded=True, all_answered=False)

    # Finalize
    final_score = compute_interview_final_score(attempt.questions)
    integrity_score = compute_interview_integrity_score(attempt.integrity_flags)
    passed = determine_interview_pass(final_score, integrity_score)

    attempt.final_score = final_score
    attempt.integrity_score = integrity_score
    attempt.passed = passed
    attempt.status = InterviewStatus.COMPLETED
    attempt.completed_at = datetime.utcnow()

    # L3 fix: explicit duplicate-badge guard, mirroring the assessment
    # routes, instead of relying implicitly on the one-time IN_PROGRESS ->
    # COMPLETED transition to prevent double-award.
    badge_awarded = False
    if passed:
        existing_badge = await db.execute(
            select(Badge).where(Badge.interview_attempt_id == attempt.id)
        )
        if existing_badge.scalar_one_or_none() is None:
            internship = await db.get(Internship, attempt.internship_id)
            db.add(Badge(
                student_id=profile.id,
                domain=internship.domain if internship else "General",
                interview_attempt_id=attempt.id,
                label=f"Stand Out - {internship.title}" if internship else "Stand Out Interview",
            ))
        badge_awarded = True

    await db.commit()

    return SubmitInterviewAnswerResponse(
        graded=True,
        all_answered=True,
        final_score=final_score,
        integrity_score=integrity_score,
        passed=passed,
        badge_awarded=badge_awarded,
    )


@router.post("/{application_id}/interview/integrity-flag", status_code=204)
async def report_integrity_flag(
    application_id: uuid.UUID,
    payload: IntegrityFlagRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(application_id, profile.id, db)

    if attempt.status != InterviewStatus.IN_PROGRESS:
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    flags = [dict(f) for f in attempt.integrity_flags]
    existing_flag = next((f for f in flags if f["flag_type"] == payload.flag_type), None)
    if existing_flag:
        existing_flag["count"] += payload.count
        existing_flag.setdefault("timestamps", []).append(now_iso)
        attempt.integrity_flags = flags
    else:
        attempt.integrity_flags = flags + [
            {"flag_type": payload.flag_type, "count": payload.count, "timestamps": [now_iso]}
        ]

    await db.commit()


@router.post("/{application_id}/interview/frame-check", response_model=FrameCheckResponse)
@limiter.limit("20/minute")
async def frame_check(
    request: Request,
    application_id: uuid.UUID,
    payload: FrameCheckRequest,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """H1 fix: rate-limited (20/minute) — this calls the quota-limited
    Gemini API on a shared server-side credential per video frame."""
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(application_id, profile.id, db)

    result = await check_frame_for_concerns(payload.image_base64)

    if attempt.status == InterviewStatus.IN_PROGRESS:
        now_iso = datetime.now(timezone.utc).isoformat()
        flags = [dict(f) for f in attempt.integrity_flags]
        new_flag_types = []
        if result["phone_detected"]:
            new_flag_types.append("phone_detected")
        if result["multiple_people"]:
            new_flag_types.append("multiple_faces_detected")
        if result["no_person"]:
            new_flag_types.append("no_face_detected")

        for flag_type in new_flag_types:
            existing_flag = next((f for f in flags if f["flag_type"] == flag_type), None)
            if existing_flag:
                existing_flag["count"] += 1
                existing_flag.setdefault("timestamps", []).append(now_iso)
            else:
                flags.append({"flag_type": flag_type, "count": 1, "timestamps": [now_iso]})
        attempt.integrity_flags = flags
        await db.commit()

    return FrameCheckResponse(**result)


@router.get("/{application_id}/interview/result", response_model=InterviewResultResponse)
async def get_interview_result(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(application_id, profile.id, db)

    badge_result = await db.execute(select(Badge).where(Badge.interview_attempt_id == attempt.id))
    badge_awarded = badge_result.scalar_one_or_none() is not None

    return InterviewResultResponse(
        status=attempt.status.value,
        final_score=attempt.final_score,
        integrity_score=attempt.integrity_score,
        passed=attempt.passed,
        badge_awarded=badge_awarded,
        questions=attempt.questions,
        integrity_flags=attempt.integrity_flags,
    )
