"""
Module 5.7 — Voice Screen.

Async, ONE-WAY voice interview: no live human or AI interviewer. The
candidate is presented with a fixed set of role-specific questions (drawn
from the company's existing interview_question_bank — see
app/core/models.py's Module 5.7 comment) and records an unattended voice
answer to each.

Doc flags this as "highest complexity, build last" (AI_HIRING_SUITE_PROGRESS.md).
Two Groq calls, each with its own httpx.AsyncClient (this codebase's
per-agent pattern — no shared client):

  - transcribe_answer(): reuses the exact same Whisper pipeline as
    app/ai/assisted_interview_ai.py's transcribe_audio() (same model,
    temperature=0/language=en params, and hallucination-filtering list) —
    imported directly rather than duplicated, per that module's own
    docstring instruction that 5.7 should reuse it rather than re-implement
    it.
  - score_answer(): a Groq chat call scoped to one question/answer pair,
    same shape as app/ai/interview_ai.py's grade_answer() (structured JSON
    output, validated before trusting it — no raw model output reaches the
    client unvalidated).

Every AI-generated field that could reach the client (notes) is
type-checked, length-capped, and stripped of anything that looks like a
leaked hire/reject verdict — this endpoint exposes a numeric score (that IS
its job, same as 5.4's per-question score), but the free-text `notes`
field is not the place for the model to smuggle in a hiring
recommendation, so the same verdict-leak filter used in 5.6 is applied
here too.
"""
import logging
import re

from app.ai.assisted_interview_ai import transcribe_audio  # reuse, don't duplicate (see docstring)
from app.ai.groq_client import extract_json as _extract_json
from app.ai.groq_client import groq_chat
from app.core.config import settings

logger = logging.getLogger("nexyuva.voice_screen")

# --- Hard caps (spec requirement: don't let an unbounded client request
# balloon cost/latency) ---
MAX_AUDIO_BYTES = 10 * 1024 * 1024      # 10MB per answer recording, same cap as 5.6's /transcribe
QUESTIONS_PER_VOICE_SCREEN = 5          # capped well below 5.4's 10 — recording+uploading audio
                                         # per question is a heavier candidate ask than typing
MAX_NOTES_LEN = 500                     # length cap on the AI's free-text notes before it reaches the client

# Same verdict-leak filter as app/ai/assisted_interview_ai.py — applied to
# the AI's `notes` field only, never to the candidate's own transcript, so
# it only ever blocks the model from smuggling a hire/reject recommendation
# into what is supposed to be a short scoring rationale.
_VERDICT_LEAK_PATTERN = re.compile(
    r"\b(reject|hire|pass(?:ed)?|fail(?:ed)?|recommend(?:ation)?|"
    r"should (?:not )?(?:hire|advance|proceed)|do(?:es)? not qualify|not a good fit)\b",
    re.IGNORECASE,
)


async def transcribe_answer(audio_bytes: bytes, filename: str = "answer.webm") -> str | None:
    """
    Thin wrapper over app/ai/assisted_interview_ai.py's transcribe_audio()
    — same Whisper pipeline, per that module's docstring instruction that
    5.7 should reuse it rather than duplicate the Groq Whisper call,
    temperature=0/language=en params, and hallucination filtering. Adds
    this module's own MAX_AUDIO_BYTES check up front so a voice-screen
    answer is bounded independently of whatever cap 5.6 happens to use.
    """
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        logger.warning("Voice screen answer exceeds %d bytes — refusing to transcribe", MAX_AUDIO_BYTES)
        return None
    return await transcribe_audio(audio_bytes, filename=filename)


def _validate_score_result(parsed) -> dict:
    """
    Structured-output validation, not trust-the-model: score must be a
    number clamped to [0, 100]; notes must be a short string with any
    verdict-leak phrase stripped out (see module docstring) and length-
    capped before it can ever reach the client.
    """
    if not isinstance(parsed, dict) or "score" not in parsed:
        return {"score": 0.0, "notes": "Auto-scoring unavailable; manual review recommended."}

    try:
        score = float(parsed.get("score", 0))
    except (TypeError, ValueError):
        score = 0.0
    score = max(0.0, min(100.0, score))

    notes = str(parsed.get("notes", "")).strip()
    if _VERDICT_LEAK_PATTERN.search(notes):
        logger.warning("Discarding voice-screen notes that look like a leaked verdict: %r", notes)
        notes = ""
    notes = notes[:MAX_NOTES_LEN]

    return {"score": score, "notes": notes}


async def score_answer(question: str, transcript: str | None) -> dict:
    """
    Scores one voice-screen answer from its transcript. Mirrors
    app/ai/interview_ai.py's grade_answer() in shape and scoring
    philosophy (score primarily on correctness; a short-but-correct
    answer should still score well) but simpler — no resume cross-check,
    since a voice screen is an early, standalone gate rather than the
    resume-consistency check 5.4 performs. Returns a safe neutral fallback
    (never raises) on any failure, so one bad Groq call can't corrupt or
    block the rest of the candidate's session.
    """
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured — voice screen answer left unscored")
        return {"score": 0.0, "notes": "Auto-scoring unavailable; manual review recommended."}

    if not transcript or not transcript.strip():
        return {"score": 0.0, "notes": "No audio answer was captured for this question."}

    system_prompt = (
        "You are scoring one transcribed spoken answer from an async, "
        "unattended voice-screen interview (the candidate recorded this "
        "alone, with no interviewer present, so allow for natural spoken-"
        "language phrasing, filler words, and minor transcription "
        "artifacts — don't penalize for those). Score PRIMARILY on whether "
        "the answer is factually correct and relevant to the question: a "
        "short but correct answer should score high (80-100) even without "
        "much elaboration. Score low (below 50) only if the answer is "
        "wrong, irrelevant, incoherent, or effectively a non-answer (e.g. "
        "'I don't know', silence, or off-topic rambling). Never include a "
        "hire/reject recommendation, a pass/fail verdict, or any judgment "
        "about whether the candidate should advance — your notes are a "
        "one-sentence factual observation about the answer's content only. "
        'Return ONLY JSON: {"score": <0-100 number>, "notes": "<one short sentence>"}'
    )
    user_prompt = f"Question: {question}\nCandidate's transcribed spoken answer: {transcript}"

    content = await groq_chat(system_prompt, user_prompt, max_tokens=300, temperature=0.3, timeout=25.0)
    parsed = _extract_json(content) if content else None
    return _validate_score_result(parsed)


def compute_voice_screen_final_score(questions: list[dict]) -> float:
    """Mirrors interview_ai.py's compute_interview_final_score exactly."""
    scores = [q["score"] for q in questions if q.get("score") is not None]
    return round(sum(scores) / len(scores), 1) if scores else 0.0


def determine_voice_screen_pass(score: float) -> bool:
    """No integrity score input (no proctoring in an async, unattended
    voice screen) — pass/fail is purely the averaged answer score, at the
    same 65.0 bar app/ai/interview_ai.py uses for its interview score."""
    return score >= 65.0
