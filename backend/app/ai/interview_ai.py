"""
AI Interview module — question-bank parsing, answer grading with resume
cross-check (Groq), and webcam frame concern-detection (Gemini vision).
Degrades gracefully per Rules.md 3 if either key is missing.

Groq call mechanics (URL, retry-with-backoff, empty-content handling) now
live in app/ai/groq_client.py (bug-audit item #8) rather than here --
_groq_chat/_extract_json below are kept as thin aliases so this module's
own call sites (and aptitude_engine.py, which imports them from here)
don't need to change.
"""
import logging

import httpx

from app.ai.groq_client import extract_json as _extract_json
from app.ai.groq_client import groq_chat as _groq_chat
from app.core.config import settings

logger = logging.getLogger("nexyuva.interview_ai")

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent"
)


async def parse_questions_from_text(raw_text: str, max_questions: int = 100) -> list[str]:
    """Turns a messy PDF text dump into a clean list of interview questions."""
    raw_text = raw_text[:15000]  # keep prompt bounded for a 100-question PDF
    system_prompt = (
        "You extract interview questions from raw, possibly messy text "
        "(numbering, headers, page breaks). Return ONLY a JSON array of "
        "question strings, nothing else. Skip section headers, page numbers, "
        f"and non-question lines. Return at most {max_questions} questions."
    )
    result = await _groq_chat(system_prompt, raw_text, max_tokens=4000)
    parsed = _extract_json(result) if result else None
    if isinstance(parsed, list):
        questions = [str(q).strip() for q in parsed if str(q).strip()]
        return questions[:max_questions]

    # Fallback: naive line-based split if Groq is unavailable/unparseable —
    # never block the company's upload just because the LLM step failed
    logger.warning("Falling back to naive line-split question parsing")
    lines = [l.strip(" \t-.0123456789)") for l in raw_text.splitlines()]
    questions = [l for l in lines if len(l) > 15 and "?" in l]
    return questions[:max_questions]


async def grade_answer(
    question: str, answer: str, resume_skills: list[str], academic_background: str | None
) -> dict:
    """
    Grades one interview answer AND flags whether it's consistent with the
    candidate's parsed resume — the core "catch resume lies" mechanism.
    """
    resume_context = (
        f"Candidate's resume lists these skills: {', '.join(resume_skills) or 'none extracted'}. "
        f"Academic background: {academic_background or 'unknown'}."
    )
    system_prompt = (
        "You are grading a candidate's spoken/typed interview answer. "
        "Score PRIMARILY on whether the answer is factually correct: a short "
        "but fully correct answer should score high (80-100), even if it "
        "lacks elaboration or examples - do not dock significant points just "
        "for brevity. Only score low (below 50) if the answer is factually "
        "wrong, contradicts itself, or is missing/irrelevant. A correct "
        "answer with little detail should still clearly outscore an "
        "incorrect or confused one. Depth/examples can nudge an already-"
        "correct answer a few points higher, but should never be the main "
        "reason for a low score. Also judge whether the answer's apparent "
        "skill level is CONSISTENT with what their resume claims (e.g. "
        "resume lists 'Python expert' but answer shows no real understanding "
        "of a basic Python question -> inconsistent). "
        "Return ONLY JSON: "
        '{"score": <0-100 number>, "notes": "<one sentence>", "resume_consistent": <true|false>}'
    )
    user_prompt = f"{resume_context}\n\nQuestion: {question}\nCandidate's answer: {answer or '(no answer given)'}"

    result = await _groq_chat(system_prompt, user_prompt, max_tokens=300)
    parsed = _extract_json(result) if result else None
    if isinstance(parsed, dict) and "score" in parsed:
        return {
            "score": float(parsed.get("score", 0)),
            "notes": str(parsed.get("notes", "")),
            "resume_consistent": bool(parsed.get("resume_consistent", True)),
        }

    logger.warning("Groq grading unavailable/unparseable — using neutral fallback score")
    return {"score": 50.0, "notes": "Auto-grading unavailable; manual review recommended.", "resume_consistent": True}


async def check_frame_for_concerns(image_b64: str) -> dict:
    """
    Sends one webcam frame (JPEG base64, no data URI prefix) to Gemini
    vision to check for a phone in frame or a second person — signals that
    MediaPipe FaceMesh alone can't reliably catch. Called periodically
    (not per-frame) from the client. Returns all-clear on any failure
    rather than penalizing the candidate for our own API hiccup.
    """
    clear = {"phone_detected": False, "multiple_people": False, "no_person": False}
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not configured — skipping frame check")
        return clear

    prompt = (
        "Look at this webcam frame from a student taking a proctored job "
        "interview. Answer ONLY with JSON: "
        '{"phone_detected": <true|false>, "multiple_people": <true|false>, "no_person": <true|false>}. '
        "phone_detected = a mobile phone is visible anywhere in frame. "
        "multiple_people = more than one person visible. "
        "no_person = no person visible at all."
    )
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}",
                json={
                    "contents": [{
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
                        ]
                    }],
                    "generationConfig": {"temperature": 0.0, "maxOutputTokens": 100},
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = _extract_json(text)
            if isinstance(parsed, dict):
                return {
                    "phone_detected": bool(parsed.get("phone_detected", False)),
                    "multiple_people": bool(parsed.get("multiple_people", False)),
                    "no_person": bool(parsed.get("no_person", False)),
                }
    except Exception:
        logger.exception("Gemini frame check failed")
    return clear


# --- Scoring (mirrors app/ai/assessment_engine.py's pattern, extended with phone_detected) ---

INTERVIEW_INTEGRITY_PENALTIES = {
    "no_face_detected": 5,
    "face_turned_away": 4,
    "multiple_faces_detected": 25,
    "tab_blur": 8,
    "copy_paste_attempt": 3,
    "phone_detected": 20,
}
INTERVIEW_INTEGRITY_CAPS = {
    "no_face_detected": 30,
    "face_turned_away": 25,
    "multiple_faces_detected": 100,
    "tab_blur": 30,
    "copy_paste_attempt": 20,
    "phone_detected": 80,
}
DEFAULT_CAP = 30


def compute_interview_final_score(questions: list[dict]) -> float:
    scores = [q["score"] for q in questions if q.get("score") is not None]
    return round(sum(scores) / len(scores), 1) if scores else 0.0


def compute_interview_integrity_score(flags: list[dict]) -> float:
    score = 100.0
    for flag in flags:
        flag_type = flag.get("flag_type")
        count = flag.get("count", 1)
        penalty = INTERVIEW_INTEGRITY_PENALTIES.get(flag_type, 0)
        cap = INTERVIEW_INTEGRITY_CAPS.get(flag_type, DEFAULT_CAP)
        score -= min(penalty * count, cap)
    return round(max(score, 0.0), 1)


def determine_interview_pass(score: float, integrity_score: float) -> bool:
    return score >= 65.0 and integrity_score >= 60.0
