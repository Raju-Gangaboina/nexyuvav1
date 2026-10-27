"""
Module 5.7 — Voice Screen.

Async, ONE-WAY voice interview: no live human/AI interviewer, no webcam
proctoring. Student side mirrors app/services/interview/routes.py's
start/answer flow (same prefix family, /api/v1/students/applications/...)
but the answer step here is an audio upload -> transcribe -> score
pipeline instead of a typed answer -> grade pipeline. Company side mirrors
app/services/assisted_interview/routes.py's list/detail review endpoints.

State machine: IN_PROGRESS -> COMPLETED once every question has an answer.
No separate /end endpoint (unlike 5.6) — completion is implicit and
automatic the moment the last question is answered, same as 5.4.
"""
import logging
import random
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.voice_screen import (
    MAX_AUDIO_BYTES,
    QUESTIONS_PER_VOICE_SCREEN,
    compute_voice_screen_final_score,
    determine_voice_screen_pass,
    score_answer,
    transcribe_answer,
)
from app.core.database import get_db
from app.core.models import (
    Application,
    Internship,
    Organization,
    StudentProfile,
    VoiceScreenAttempt,
    VoiceScreenStatus,
)
from app.core.rate_limit import limiter
from app.core.security import require_role
from app.services.voice_screen.schemas import (
    StartVoiceScreenResponse,
    SubmitVoiceAnswerResponse,
    VoiceScreenQuestionPublic,
    VoiceScreenQuestionResult,
    VoiceScreenResultResponse,
)

router = APIRouter(prefix="/api/v1/students/applications", tags=["voice-screen"])
org_router = APIRouter(prefix="/api/v1/voice-screen", tags=["voice-screen"])
logger = logging.getLogger("nexyuva.voice_screen")


async def _get_own_profile(user_id: str, db: AsyncSession) -> StudentProfile:
    result = await db.execute(select(StudentProfile).where(StudentProfile.user_id == uuid.UUID(user_id)))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return profile


async def _get_own_application(application_id: uuid.UUID, profile_id: uuid.UUID, db: AsyncSession) -> Application:
    app_row = await db.get(Application, application_id)
    if app_row is None or app_row.student_id != profile_id:
        raise HTTPException(status_code=404, detail="Application not found")
    return app_row


async def _get_own_attempt(application_id: uuid.UUID, profile_id: uuid.UUID, db: AsyncSession) -> VoiceScreenAttempt:
    result = await db.execute(
        select(VoiceScreenAttempt).where(VoiceScreenAttempt.application_id == application_id)
    )
    attempt = result.scalar_one_or_none()
    if attempt is None or attempt.student_id != profile_id:
        raise HTTPException(status_code=404, detail="Voice screen not started for this application")
    return attempt


def _to_result_response(
    attempt: VoiceScreenAttempt, student_name: str | None = None, internship_title: str | None = None
) -> VoiceScreenResultResponse:
    return VoiceScreenResultResponse(
        attempt_id=attempt.id,
        application_id=attempt.application_id,
        status=attempt.status.value,
        questions=[
            VoiceScreenQuestionResult(
                question=q["question"], transcript=q.get("transcript"), score=q.get("score"), notes=q.get("notes")
            )
            for q in attempt.questions
        ],
        final_score=attempt.final_score,
        passed=attempt.passed,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        student_name=student_name,
        internship_title=internship_title,
    )


# --- Student-facing: record + submit ---------------------------------------


@router.post("/{application_id}/voice-screen/start", response_model=StartVoiceScreenResponse, status_code=201)
async def start_voice_screen(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    application = await _get_own_application(application_id, profile.id, db)

    existing = await db.execute(
        select(VoiceScreenAttempt).where(VoiceScreenAttempt.application_id == application_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Voice screen already started for this application")

    internship = await db.get(Internship, application.internship_id)
    if internship is None:
        raise HTTPException(status_code=404, detail="Internship not found")

    # Same company-uploaded question bank as 5.4's AI-led interview — see
    # app/core/models.py's Module 5.7 comment for why this doesn't
    # introduce a second, parallel bank/upload UI.
    bank = internship.interview_question_bank or []
    if len(bank) < 1:
        raise HTTPException(
            status_code=400,
            detail="This company hasn't uploaded interview questions for this internship yet",
        )

    sample_size = min(QUESTIONS_PER_VOICE_SCREEN, len(bank))
    selected = random.sample(bank, sample_size)

    attempt = VoiceScreenAttempt(
        application_id=application_id,
        student_id=profile.id,
        internship_id=internship.id,
        questions=[{"question": q, "transcript": None, "score": None, "notes": None, "answered": False} for q in selected],
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    return StartVoiceScreenResponse(
        attempt_id=attempt.id,
        questions=[VoiceScreenQuestionPublic(index=i, question=q["question"]) for i, q in enumerate(attempt.questions)],
    )


@router.post("/{application_id}/voice-screen/answer", response_model=SubmitVoiceAnswerResponse)
@limiter.limit("30/minute")
async def submit_voice_answer(
    request: Request,
    application_id: uuid.UUID,
    question_index: int,
    audio: UploadFile = File(...),
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(application_id, profile.id, db)

    if attempt.status != VoiceScreenStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This voice screen has already ended")

    questions = attempt.questions
    if question_index < 0 or question_index >= len(questions):
        raise HTTPException(status_code=400, detail="Invalid question index")
    if questions[question_index].get("answered"):
        raise HTTPException(status_code=400, detail="This question was already answered")

    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail=f"Audio exceeds the {MAX_AUDIO_BYTES} byte limit")

    transcript = await transcribe_answer(audio_bytes, filename=audio.filename or "answer.webm")
    grading = await score_answer(question=questions[question_index]["question"], transcript=transcript)

    # New list object (not an in-place mutation), same reasoning as
    # services/interview/routes.py's submit_answer — SQLAlchemy's plain
    # JSON column type only detects a change on reassignment.
    new_questions = [dict(q) for q in questions]
    new_questions[question_index] = {
        "question": questions[question_index]["question"],
        "transcript": transcript,
        "score": grading["score"],
        "notes": grading["notes"],
        "answered": True,
    }
    attempt.questions = new_questions

    # Use the explicit `answered` flag, not `transcript is not None` — a
    # legitimately-attempted answer can still have transcript=None (silent
    # audio, background noise Whisper can't parse, or a hallucination-
    # filtered result), and that must still count as answered so the
    # candidate isn't stuck re-submitting the same question forever and
    # the attempt can still reach COMPLETED.
    all_answered = all(q.get("answered") for q in attempt.questions)

    if not all_answered:
        await db.commit()
        return SubmitVoiceAnswerResponse(graded=True, transcript=transcript, all_answered=False)

    final_score = compute_voice_screen_final_score(attempt.questions)
    attempt.final_score = final_score
    attempt.passed = determine_voice_screen_pass(final_score)
    attempt.status = VoiceScreenStatus.COMPLETED
    attempt.completed_at = datetime.utcnow()
    await db.commit()

    return SubmitVoiceAnswerResponse(graded=True, transcript=transcript, all_answered=True)


@router.get("/{application_id}/voice-screen", response_model=VoiceScreenResultResponse)
async def get_own_voice_screen(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Student-facing status/result check. Deliberately returns per-question
    score/notes only once the attempt is COMPLETED (same no-live-score
    rule as /answer's response) — while IN_PROGRESS, `score`/`notes` on
    each question the candidate hasn't reached are still None, and even
    answered-but-not-yet-final questions' scores aren't hidden further
    since the whole point of "no live score" is not mid-attempt feedback,
    not post-hoc secrecy from the candidate about their own attempt.
    """
    profile = await _get_own_profile(user["user_id"], db)
    attempt = await _get_own_attempt(application_id, profile.id, db)
    return _to_result_response(attempt)


# --- Company-facing: review dashboard ---------------------------------------


async def _get_own_org(user_id: str, db: AsyncSession) -> Organization:
    result = await db.execute(select(Organization).where(Organization.user_id == uuid.UUID(user_id)))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@org_router.get("", response_model=list[VoiceScreenResultResponse])
async def list_voice_screens(
    internship_id: uuid.UUID | None = None,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """Company-facing review list — same comparability intent as the 5.4/5.6
    dashboards (spec: 'both modes are comparable in the review dashboard')."""
    org = await _get_own_org(user["user_id"], db)
    stmt = select(VoiceScreenAttempt).join(
        Internship, VoiceScreenAttempt.internship_id == Internship.id
    ).where(Internship.organization_id == org.id)
    if internship_id is not None:
        stmt = stmt.where(VoiceScreenAttempt.internship_id == internship_id)
    rows = (await db.execute(stmt.order_by(VoiceScreenAttempt.started_at.desc()))).scalars().all()

    results = []
    for attempt in rows:
        internship = await db.get(Internship, attempt.internship_id)
        student = await db.get(StudentProfile, attempt.student_id)
        results.append(_to_result_response(
            attempt,
            student_name=student.full_name if student else None,
            internship_title=internship.title if internship else None,
        ))
    return results


@org_router.get("/{attempt_id}", response_model=VoiceScreenResultResponse)
async def get_voice_screen(
    attempt_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    attempt = await db.get(VoiceScreenAttempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Voice screen attempt not found")
    internship = await db.get(Internship, attempt.internship_id)
    if internship is None or internship.organization_id != org.id:
        # Deliberately identical 404 whether the attempt doesn't exist or
        # belongs to a different org — never leak cross-org existence.
        raise HTTPException(status_code=404, detail="Voice screen attempt not found")
    student = await db.get(StudentProfile, attempt.student_id)
    return _to_result_response(attempt, student_name=student.full_name if student else None, internship_title=internship.title)
