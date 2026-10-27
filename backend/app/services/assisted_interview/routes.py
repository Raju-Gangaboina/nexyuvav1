"""
Module 5.6 — Assisted Human Interview.

Org-only feature: a company interviewer runs a live human interview and
gets private AI-suggested follow-up questions in a sidebar the candidate
never sees. Distinct from:
  - 5.4 InterviewAttempt — the AI *is* the interviewer there (student-facing,
    proctored, scored).
  - 5.5 ScheduledInterview — schedules the meeting; this module runs during it.

Design Rule (Architecture.md §5.6): the AI never talks to the candidate and
never makes a pass/fail call. Enforced structurally — there is no scoring
field anywhere on AssistedInterviewSession/AssistedInterviewTurn, no
candidate-facing endpoint here, and suggest_followups() validates its own
output (see app/ai/assisted_interview_ai.py) so a leaked verdict/score
can't surface as a "suggestion" even if Groq ever returned one.

State machine (deliberately strict — CREATED, or rather ACTIVE, is entered
atomically by /start, so there's no separate CREATED state to race on):
  ACTIVE  -> /exchange, /transcribe, /suggestions/accept all allowed
  ENDED   -> read-only; every mutating endpoint 400s except /end itself,
             which is idempotent (calling it again on an already-ENDED
             session just returns the current state, no error, no
             double-set of ended_at).
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.assisted_interview_ai import (
    MAX_TEXT_LEN,
    MAX_TURNS_PER_SESSION,
    ROLLING_CONTEXT_TURNS,
    suggest_followups,
    transcribe_audio,
)
from app.core.database import get_db
from app.core.models import (
    Application,
    AptitudeAttempt,
    AptitudeStatus,
    AssistedInterviewSession,
    AssistedInterviewStatus,
    AssistedInterviewTurn,
    Internship,
    Organization,
    StudentProfile,
)
from app.core.rate_limit import limiter
from app.core.security import require_role
from app.services.assisted_interview.schemas import (
    AcceptSuggestionRequest,
    AddNoteRequest,
    AssistedInterviewSessionResponse,
    CandidateBriefAptitude,
    CandidateBriefResponse,
    COVERAGE_AREAS,
    CoverageAreaOut,
    ExchangeRequest,
    ExchangeResponse,
    NoteOut,
    StartAssistedInterviewResponse,
    SubmitScorecardRequest,
    SuggestionOut,
    TranscribeResponse,
    TurnResponse,
    UpdateCoverageRequest,
    VALID_COVERAGE_KEYS,
    VALID_DECISIONS,
)

router = APIRouter(prefix="/api/v1/assisted-interview", tags=["assisted-interview"])
logger = logging.getLogger("nexyuva.assisted_interview")


async def _get_own_org(user_id: str, db: AsyncSession) -> Organization:
    result = await db.execute(select(Organization).where(Organization.user_id == uuid.UUID(user_id)))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _get_own_session(session_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> AssistedInterviewSession:
    session = await db.get(AssistedInterviewSession, session_id)
    if session is None or session.organization_id != org_id:
        # Deliberately identical 404 whether the session doesn't exist or
        # belongs to a different org — never leak "this ID exists but isn't
        # yours" to another company (cross-org enumeration).
        raise HTTPException(status_code=404, detail="Assisted interview session not found")
    return session


def _turn_to_response(turn: AssistedInterviewTurn) -> TurnResponse:
    return TurnResponse(
        id=turn.id,
        sequence=turn.sequence,
        speaker=turn.speaker,
        text=turn.text,
        ai_suggestions=[SuggestionOut(**s) for s in (turn.ai_suggestions or [])],
        accepted_suggestion_id=turn.accepted_suggestion_id,
        created_at=turn.created_at,
    )


async def _enrich(session: AssistedInterviewSession, db: AsyncSession) -> AssistedInterviewSessionResponse:
    internship = await db.get(Internship, session.internship_id)
    student = await db.get(StudentProfile, session.student_id)
    turns_result = await db.execute(
        select(AssistedInterviewTurn)
        .where(AssistedInterviewTurn.session_id == session.id)
        .order_by(AssistedInterviewTurn.sequence)
    )
    turns = turns_result.scalars().all()
    # Built field-by-field rather than AssistedInterviewSessionResponse.model_validate(session):
    # the schema's `turns` field would otherwise make Pydantic read session.turns directly during
    # validation — a lazy relationship — which triggers an implicit lazy-load outside any async
    # context and blows up with MissingGreenlet. Fetching turns explicitly above and passing them
    # in here sidesteps the lazy attribute entirely.
    return AssistedInterviewSessionResponse(
        id=session.id,
        application_id=session.application_id,
        status=session.status.value,
        turns=[_turn_to_response(t) for t in turns],
        started_at=session.started_at,
        ended_at=session.ended_at,
        internship_title=internship.title if internship else None,
        student_name=student.full_name if student else None,
        coverage=session.coverage or {},
        notes=[NoteOut(**n) for n in (session.notes or [])],
        technical_knowledge=session.technical_knowledge,
        problem_solving=session.problem_solving,
        communication=session.communication,
        project_understanding=session.project_understanding,
        role_specific_notes=session.role_specific_notes,
        decision=session.decision,
        scorecard_submitted_at=session.scorecard_submitted_at,
    )


@router.get("/{application_id}/brief", response_model=CandidateBriefResponse)
async def get_candidate_brief(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Priority 1 (spec 5.6) -- interviewer briefing shown before/during the
    session. Pure read rollup of data other agents already computed (5.2
    compatibility score, Aptitude Check) -- nothing here is recomputed or
    AI-generated, and there is no assisted-interview-specific storage for
    any of it.
    """
    org = await _get_own_org(user["user_id"], db)

    application = await db.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    internship = await db.get(Internship, application.internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=403, detail="This application does not belong to your organization")

    student = await db.get(StudentProfile, application.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Candidate profile not found")

    aptitude_result = await db.execute(
        select(AptitudeAttempt).where(
            AptitudeAttempt.internship_id == internship.id,
            AptitudeAttempt.student_id == student.id,
        )
    )
    attempts = aptitude_result.scalars().all()
    aptitude_brief: CandidateBriefAptitude | None = None
    completed = [a for a in attempts if a.status == AptitudeStatus.COMPLETED]
    in_progress = [a for a in attempts if a.status == AptitudeStatus.IN_PROGRESS]
    if completed:
        best = max(completed, key=lambda a: a.raw_score or 0)
        aptitude_brief = CandidateBriefAptitude(
            status="completed", raw_score=best.raw_score, percentile=best.percentile,
            badge_awarded=bool(best.badge_awarded),
        )
    elif in_progress:
        aptitude_brief = CandidateBriefAptitude(
            status="in_progress", raw_score=None, percentile=None, badge_awarded=False,
        )

    # Top 3 projects only -- this is a briefing, not the full profile page.
    top_projects = (student.projects or [])[:3]

    return CandidateBriefResponse(
        candidate_name=student.full_name,
        avatar_url=student.avatar_url,
        role_title=internship.title,
        skills=student.skills or [],
        top_projects=[{"title": p.get("title", ""), "tech_stack": p.get("tech_stack", [])} for p in top_projects],
        compatibility_score=application.compatibility_score,
        aptitude=aptitude_brief,
    )


@router.post("/{application_id}/start", response_model=StartAssistedInterviewResponse, status_code=201)
async def start_session(
    application_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)

    application = await db.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    internship = await db.get(Internship, application.internship_id)
    if internship is None or internship.organization_id != org.id:
        raise HTTPException(status_code=403, detail="This application does not belong to your organization")

    existing = await db.execute(
        select(AssistedInterviewSession).where(
            AssistedInterviewSession.application_id == application_id,
            AssistedInterviewSession.status == AssistedInterviewStatus.ACTIVE,
        )
    )
    active = existing.scalar_one_or_none()
    if active is not None:
        # Idempotent-ish: re-calling start while one is already active hands
        # back the existing session instead of erroring or creating a
        # second concurrent one for the same application.
        return StartAssistedInterviewResponse(session_id=active.id, status=active.status.value)

    session = AssistedInterviewSession(
        application_id=application_id,
        organization_id=org.id,
        student_id=application.student_id,
        internship_id=internship.id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return StartAssistedInterviewResponse(session_id=session.id, status=session.status.value)


@router.post("/{session_id}/transcribe", response_model=TranscribeResponse)
@limiter.limit("60/minute")
async def transcribe(
    request: Request,
    session_id: uuid.UUID,
    audio: UploadFile = File(...),
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Optional helper: turns one mic-audio chunk into text. Purely a
    convenience for an interviewer whose client captures audio — a
    typed-notes interviewer can skip this and post straight to /exchange.
    """
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)
    if session.status != AssistedInterviewStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="This session has already ended")

    audio_bytes = await audio.read()
    text = await transcribe_audio(audio_bytes, filename=audio.filename or "chunk.webm")
    return TranscribeResponse(text=text)


@router.post("/{session_id}/exchange", response_model=ExchangeResponse)
async def add_exchange(
    session_id: uuid.UUID,
    payload: ExchangeRequest,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)

    if session.status != AssistedInterviewStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="This session has already ended")
    if payload.speaker not in ("interviewer", "candidate"):
        raise HTTPException(status_code=400, detail="speaker must be 'interviewer' or 'candidate'")
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(status_code=400, detail=f"text exceeds {MAX_TEXT_LEN} characters")

    # Server-assigned sequence, not client-supplied — count of existing
    # turns for this session, so ordering can't be spoofed by a retried or
    # out-of-order request (a version-conflict-style race is still possible
    # under real concurrency; acceptable here since one org interviewer
    # drives one session at a time in practice).
    count_result = await db.execute(
        select(func.count()).select_from(AssistedInterviewTurn).where(AssistedInterviewTurn.session_id == session.id)
    )
    sequence = count_result.scalar_one()
    if sequence >= MAX_TURNS_PER_SESSION:
        raise HTTPException(status_code=400, detail="This session has reached its maximum turn count")

    turn = AssistedInterviewTurn(
        session_id=session.id,
        sequence=sequence,
        speaker=payload.speaker,
        text=text,
    )

    suggestions: list[dict] = []
    if payload.speaker == "candidate":
        internship = await db.get(Internship, session.internship_id)
        recent_result = await db.execute(
            select(AssistedInterviewTurn)
            .where(AssistedInterviewTurn.session_id == session.id)
            .order_by(AssistedInterviewTurn.sequence.desc())
            .limit(ROLLING_CONTEXT_TURNS - 1)
        )
        recent_turns = list(reversed(recent_result.scalars().all()))
        rolling_context = [{"speaker": t.speaker, "text": t.text} for t in recent_turns] + [
            {"speaker": "candidate", "text": text}
        ]
        suggestions = await suggest_followups(
            role_title=internship.title if internship else "the role",
            required_skills=(internship.required_skills if internship else []) or [],
            rolling_context=rolling_context,
        )
        turn.ai_suggestions = suggestions

    db.add(turn)
    await db.commit()
    await db.refresh(turn)

    return ExchangeResponse(
        turn_id=turn.id,
        sequence=turn.sequence,
        suggestions=[SuggestionOut(**s) for s in suggestions],
    )


@router.post("/{session_id}/suggestions/accept", status_code=204)
async def accept_suggestion(
    session_id: uuid.UUID,
    payload: AcceptSuggestionRequest,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Records that the interviewer chose to ask one of the suggested
    follow-ups — pure metadata. Never rewrites the AI's suggested text, and
    never writes into the transcript itself: the interviewer still asks it
    live and it lands as its own turn via a normal /exchange call. This
    keeps "AI suggested X" and "interviewer then asked Y" as two separate,
    non-overwritable facts (Y may differ from X if the interviewer edited
    it, and that's fine — this endpoint only records *which* suggestion
    prompted it, not the exact wording used).

    Idempotent: accepting the same suggestion_id twice is a no-op the
    second time, not an error — safe for a retried request.
    """
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)  # 404s cross-org

    turn = await db.get(AssistedInterviewTurn, payload.turn_id)
    if turn is None or turn.session_id != session.id:
        raise HTTPException(status_code=404, detail="Turn not found in this session")
    if turn.speaker != "candidate":
        raise HTTPException(status_code=400, detail="Suggestions only exist on candidate turns")
    if turn.accepted_suggestion_id == payload.suggestion_id:
        return  # already recorded — idempotent no-op
    valid_ids = {s["id"] for s in (turn.ai_suggestions or [])}
    if payload.suggestion_id not in valid_ids:
        raise HTTPException(status_code=404, detail="No such suggestion on this turn")

    turn.accepted_suggestion_id = payload.suggestion_id
    await db.commit()


@router.post("/{session_id}/notes", response_model=NoteOut, status_code=201)
async def add_note(
    session_id: uuid.UUID,
    payload: AddNoteRequest,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Priority 5 (spec 5.6) -- private interviewer notes/evidence markers
    taken during the live interview. Human-authored only: there is no code
    path, AI or otherwise, that writes into this list except this
    endpoint. Allowed on an ENDED session too (an interviewer jotting a
    note while filling out the scorecard afterward is fine) -- only the
    live-interview mutations (/exchange, /transcribe, /suggestions/accept)
    are blocked post-end.
    """
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(status_code=400, detail=f"text exceeds {MAX_TEXT_LEN} characters")

    note = {
        "id": str(uuid.uuid4()),
        "text": text,
        "is_evidence": bool(payload.is_evidence),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Reassign (not .append) -- JSON columns need a new object identity for
    # SQLAlchemy's change-tracking to pick up the mutation on an existing row.
    session.notes = [*(session.notes or []), note]
    await db.commit()
    return NoteOut(**note)


@router.get("/{session_id}/coverage", response_model=list[CoverageAreaOut])
async def get_coverage(
    session_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)
    covered = session.coverage or {}
    return [CoverageAreaOut(key=k, label=label, covered=bool(covered.get(k))) for k, label in COVERAGE_AREAS]


@router.patch("/{session_id}/coverage", response_model=list[CoverageAreaOut])
async def update_coverage(
    session_id: uuid.UUID,
    payload: UpdateCoverageRequest,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Priority 4 (spec 5.6) -- plain interviewer-toggled checklist, never
    AI-inferred. Partial update: only keys present in the request body are
    changed, so the frontend can PATCH a single toggle at a time without
    resending the whole checklist state.
    """
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)

    unknown = set(payload.areas.keys()) - VALID_COVERAGE_KEYS
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown coverage area(s): {', '.join(sorted(unknown))}")

    merged = {**(session.coverage or {}), **payload.areas}
    session.coverage = merged
    await db.commit()
    return [CoverageAreaOut(key=k, label=label, covered=bool(merged.get(k))) for k, label in COVERAGE_AREAS]


@router.post("/{session_id}/scorecard", response_model=AssistedInterviewSessionResponse)
async def submit_scorecard(
    session_id: uuid.UUID,
    payload: SubmitScorecardRequest,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """
    Priority 5 (spec 5.6) -- the ONLY place any score, rating, or hiring
    decision can ever be written for an assisted interview. This is an
    interviewer-only, human-filled form; nothing in app/ai/ calls this
    endpoint or writes to these columns any other way. Can be called
    multiple times (the interviewer revising their scorecard before
    finalizing) -- each call overwrites the previous values and bumps
    scorecard_submitted_at.

    Allowed on an ACTIVE session too (not just ENDED) -- an interviewer
    filling this in doesn't need to have clicked "End Interview" first,
    though in practice it'll almost always happen after.
    """
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)

    for field_name in ("technical_knowledge", "problem_solving", "communication", "project_understanding"):
        value = getattr(payload, field_name)
        if value is not None and not (1 <= value <= 5):
            raise HTTPException(status_code=400, detail=f"{field_name} must be between 1 and 5")
    if payload.decision is not None and payload.decision not in VALID_DECISIONS:
        raise HTTPException(status_code=400, detail=f"decision must be one of: {', '.join(sorted(VALID_DECISIONS))}")

    session.technical_knowledge = payload.technical_knowledge
    session.problem_solving = payload.problem_solving
    session.communication = payload.communication
    session.project_understanding = payload.project_understanding
    session.role_specific_notes = payload.role_specific_notes
    session.decision = payload.decision
    session.scorecard_submitted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)
    return await _enrich(session, db)


@router.post("/{session_id}/end", response_model=AssistedInterviewSessionResponse)
async def end_session(
    session_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """Idempotent — ending an already-ENDED session just returns its
    current state rather than erroring or overwriting ended_at."""
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)

    if session.status == AssistedInterviewStatus.ACTIVE:
        session.status = AssistedInterviewStatus.ENDED
        session.ended_at = datetime.utcnow()
        await db.commit()
        await db.refresh(session)
    return await _enrich(session, db)


@router.get("/{session_id}", response_model=AssistedInterviewSessionResponse)
async def get_session(
    session_id: uuid.UUID,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_own_org(user["user_id"], db)
    session = await _get_own_session(session_id, org.id, db)
    return await _enrich(session, db)


@router.get("", response_model=list[AssistedInterviewSessionResponse])
async def list_sessions(
    internship_id: uuid.UUID | None = None,
    user: dict = Depends(require_role("organization")),
    db: AsyncSession = Depends(get_db),
):
    """Company-facing review list — same comparability intent as the
    AI-led interview dashboard (spec step 4: 'both modes are comparable in
    the review dashboard')."""
    org = await _get_own_org(user["user_id"], db)
    stmt = select(AssistedInterviewSession).where(AssistedInterviewSession.organization_id == org.id)
    if internship_id is not None:
        stmt = stmt.where(AssistedInterviewSession.internship_id == internship_id)
    rows = (await db.execute(stmt.order_by(AssistedInterviewSession.started_at.desc()))).scalars().all()
    return [await _enrich(r, db) for r in rows]
