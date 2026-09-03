"""
AI Interview module — question-bank parsing, answer grading with resume
cross-check (Groq), and webcam frame concern-detection (Gemini vision).
Degrades gracefully per Rules.md 3 if either key is missing.
"""
import asyncio
import json
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("nexyuva.interview_ai")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = settings.GROQ_MODEL  # centralized in app/core/config.py; llama-3.1-8b-instant was decommissioned 2026-08-16
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent"
)

# Groq's free/on-demand tier enforces a tokens-per-minute budget (confirmed
# live: 6000 TPM measured on the previous model, llama-3.1-8b-instant, before
# its 2026-08-16 decommission -- re-verify this figure for GROQ_MODEL) that a
# handful of calls in quick
# succession can genuinely exhaust -- this is not a broken integration, it's
# an expected 429 under normal multi-student use. Previously any single 429
# was swallowed straight to None with no retry, surfacing as a hard "service
# unavailable" to the caller even though the budget frees up within ~1-2s.
# Bounded (3 retries, short waits) so a persistently-down Groq still fails
# fast rather than hanging the request.
_MAX_RATE_LIMIT_RETRIES = 3

# GROQ_MODEL (openai/gpt-oss-20b) is a reasoning model: it spends part of
# max_tokens on a hidden chain-of-thought before writing the actual answer,
# and defaults to reasoning_effort="medium" if unset. Diagnosed live
# 2026-09-03: at "medium" the reasoning alone regularly ate the whole
# max_tokens budget on the 12-question Aptitude Check prompt, returning a
# 200 with an EMPTY content field (generate_questions then correctly
# treats that as unparseable and returns None -> the 503 "temporarily
# unavailable" the frontend was showing) -- and the reasoning tokens still
# count against the TPM budget, so the same call is also what was
# triggering repeated 429s. Interview grading (max_tokens=200) hits the
# identical failure mode, just surfacing as a silent "manual review
# recommended" fallback instead of a visible error. "low" cuts reasoning
# token usage sharply for these straightforward extraction/grading tasks,
# which fixes both the empty-content case and eases the TPM pressure.
GROQ_REASONING_EFFORT = "low"


async def _groq_chat(system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str | None:
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured")
        return None
    for attempt in range(_MAX_RATE_LIMIT_RETRIES + 1):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    GROQ_API_URL,
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                    json={
                        "model": GROQ_MODEL,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "max_tokens": max_tokens,
                        "temperature": 0.3,
                        "reasoning_effort": GROQ_REASONING_EFFORT,
                    },
                    timeout=25.0,
                )
                if resp.status_code == 429 and attempt < _MAX_RATE_LIMIT_RETRIES:
                    # Groq's error body includes its own suggested wait time
                    # (e.g. "Please try again in 1.3s") -- prefer that over a
                    # fixed guess, falling back to a short default if it's
                    # ever missing/unparseable.
                    wait_seconds = 2.0
                    try:
                        detail = resp.json().get("error", {}).get("message", "")
                        import re
                        match = re.search(r"try again in ([\d.]+)s", detail)
                        if match:
                            wait_seconds = min(float(match.group(1)) + 0.2, 8.0)
                    except Exception:
                        pass
                    logger.warning(
                        "Groq rate-limited (attempt %d/%d) -- retrying in %.1fs",
                        attempt + 1, _MAX_RATE_LIMIT_RETRIES, wait_seconds,
                    )
                    await asyncio.sleep(wait_seconds)
                    continue
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
                if not content:
                    # Reasoning model returned a 200 but wrote nothing to
                    # `content` (all of max_tokens went to reasoning before
                    # it got to the answer). Treat exactly like a failed
                    # call so callers fall back cleanly instead of trying
                    # to JSON-parse an empty string.
                    logger.warning("Groq returned empty content (reasoning likely exhausted max_tokens)")
                    return None
                return content
        except Exception:
            logger.exception("Groq call failed")
            return None
    return None


def _extract_json(text: str):
    """Groq sometimes wraps JSON in prose/fences — pull out the first {..} or [..] block."""
    if not text:
        return None
    text = text.strip()
    for fence in ("```json", "```"):
        if text.startswith(fence):
            text = text[len(fence):]
    text = text.strip("` \n")
    start_chars = "[{"
    for i, ch in enumerate(text):
        if ch in start_chars:
            try:
                return json.loads(text[i:])
            except json.JSONDecodeError:
                continue
    return None


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
