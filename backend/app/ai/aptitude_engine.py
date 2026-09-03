"""
Aptitude Check engine — Groq-generated, per-internship reasoning quiz.

See app/core/models.py::AptitudeAttempt docstring and
NexYuva_Aptitude_Check_Design_Doc.docx for the full design rationale.

Distinct from app/ai/assessment_engine.py (domain-general, fixed curated
question bank, "Take Assessment" on the student Profile page): this module
generates a FRESH 12-question set per attempt via Groq, scoped to one
specific internship's domain/difficulty, and is scored by percentile
against that internship's other completed attempts rather than a fixed
cutoff (see design doc §3.4 for why a fixed threshold isn't fair across
freshly-generated question sets of slightly varying difficulty).

Reuses the same Groq-call + JSON-extraction pattern as app/ai/interview_ai.py
rather than standing up new HTTP-call infrastructure.
"""
import logging

from app.ai.interview_ai import _extract_json, _groq_chat

logger = logging.getLogger("nexyuva.aptitude_engine")

QUESTION_COUNT = 12
SECONDS_PER_QUESTION = 40  # mid-point of the design doc's 30-45s window

# Fix Plan Sec3, Option 3: per-question timer stays the anti-cheat primary,
# this is only a backstop against client-side stalls (frozen tab, slow
# re-render) letting the sum of per-question timers silently run long.
# 12 * 40s = 8 min theoretical sum; this gives a ~2 min buffer above that.
OVERALL_ATTEMPT_SECONDS = 720  # 12 minutes — single whole-test timer now (no more per-question countdown); students can move freely between questions and change answers until time runs out or they submit.

# Fix Plan Sec2, Option D: cold-start fix for the percentile/badge bug (a
# 9.1% raw score got a "100th percentile" badge because it was the only
# completed attempt in the pool). Two independent gates:
#  1. Minimum pool size - percentile is meaningless with too few attempts.
#  2. Absolute raw-score floor per difficulty - protects against a lucky/
#     bad-faith low scorer even once the pool is large enough.
MIN_POOL_SIZE_FOR_BADGE = 5  # tune per expected applicant volume
MIN_RAW_SCORE_BY_DIFFICULTY = {
    "easy": 50.0,
    "medium": 40.0,
    "hard": 30.0,
}
DEFAULT_MIN_RAW_SCORE = 40.0  # fallback if difficulty string doesn't match a known tier

# Design doc §3.6: browser-integrity only, no webcam/face flags here —
# deliberately lighter-weight than assessment_engine's/interview_ai's
# penalty tables so this stays fast enough to scale to a large pool.
APTITUDE_INTEGRITY_PENALTIES = {
    "tab_blur": 10,
    "copy_paste_attempt": 5,
    "fullscreen_exit": 15,
}
APTITUDE_INTEGRITY_CAPS = {
    "tab_blur": 40,
    "copy_paste_attempt": 20,
    "fullscreen_exit": 60,
}
DEFAULT_PENALTY_CAP = 30


async def generate_questions(domain: str, difficulty: str, count: int = QUESTION_COUNT) -> list[dict] | None:
    """
    Generates a fresh set of genuine aptitude/reasoning questions via Groq
    (logical reasoning, quantitative, pattern-based, multi-step) —
    deliberately NOT factual-recall, per design doc §3.2: a reasoning
    question needs to be understood and adapted even if looked up, which
    the per-question timer doesn't comfortably allow.

    Returns None (never a partial/malformed list) if Groq is unavailable or
    the response can't be parsed, so the caller can fail the attempt
    creation cleanly rather than serve a broken quiz — this is one place
    where "degrade gracefully" means "don't start the attempt at all"
    rather than "serve fewer/fake questions," since a short-count aptitude
    test would silently break the percentile comparison against attempts
    that got the full 12.

    Each returned question dict: {"id", "question", "options" (4 strings),
    "correct_index"}. correct_index is server-side only — never sent to
    the client (mirrors assessment_engine.py's _public_question pattern).
    """
    system_prompt = (
        "You write aptitude/reasoning test questions in the style of campus "
        "placement aptitude rounds (logical reasoning, quantitative "
        "reasoning, pattern recognition, multi-step problems). Questions "
        "must NOT be simple factual recall — they must require the reader "
        "to actually work through a step, since answers are timed. "
        f"Write exactly {count} questions for a candidate applying to a "
        f"'{domain}' role, at '{difficulty}' difficulty. "
        "Return ONLY a JSON array, nothing else, of objects shaped exactly "
        'like {"question": "...", "options": ["...", "...", "...", "..."], '
        '"correct_index": <0-3>}. Each question needs exactly 4 options and '
        "exactly one correct_index."
    )
    user_prompt = f"Generate {count} {difficulty}-difficulty aptitude questions for a {domain} internship applicant."

    result = await _groq_chat(system_prompt, user_prompt, max_tokens=3000)
    parsed = _extract_json(result) if result else None
    if not isinstance(parsed, list):
        logger.warning("Aptitude question generation failed or unparseable")
        return None

    questions = []
    for i, q in enumerate(parsed[:count]):
        try:
            options = [str(o) for o in q["options"]]
            correct_index = int(q["correct_index"])
            if len(options) != 4 or not (0 <= correct_index <= 3):
                continue
            questions.append({
                "id": f"q{i}",
                "question": str(q["question"]),
                "options": options,
                "correct_index": correct_index,
            })
        except (KeyError, TypeError, ValueError):
            continue

    if len(questions) < count:
        logger.warning(
            "Aptitude generation returned %d/%d usable questions", len(questions), count
        )
        return None

    return questions


def public_question(q: dict) -> dict:
    """Strips the correct answer before sending to the client."""
    return {"id": q["id"], "question": q["question"], "options": q["options"]}


def grade_answer(questions: list[dict], question_id: str, selected_index: int) -> bool:
    question = next((q for q in questions if q["id"] == question_id), None)
    if question is None:
        raise ValueError(f"Unknown question id '{question_id}'")
    return question["correct_index"] == selected_index


def compute_raw_score(answers: list[dict]) -> float:
    """answers: list of {"question_id": str, "correct": bool}. Unweighted
    percent-correct — unlike assessment_engine's difficulty-weighted score,
    every question here is generated at the same target difficulty, so
    there's no tier to weight between."""
    if not answers:
        return 0.0
    correct = sum(1 for a in answers if a["correct"])
    return round(correct / len(answers) * 100, 1)


def compute_integrity_score(flags: list[dict]) -> float:
    """flags: list of {"flag_type": str, "count": int}."""
    score = 100.0
    for flag in flags:
        flag_type = flag.get("flag_type")
        count = flag.get("count", 1)
        penalty = APTITUDE_INTEGRITY_PENALTIES.get(flag_type, 0)
        cap = APTITUDE_INTEGRITY_CAPS.get(flag_type, DEFAULT_PENALTY_CAP)
        score -= min(penalty * count, cap)
    return round(max(score, 0.0), 1)


def compute_integrity_breakdown(flags: list[dict]) -> list[dict]:
    """Same penalty/cap math as compute_integrity_score, but returns the
    per-flag-type detail (count + points actually deducted after the cap)
    instead of collapsing straight to one number -- lets the student result
    screen show *why* the integrity score is what it is."""
    breakdown = []
    for flag in flags:
        flag_type = flag.get("flag_type")
        count = flag.get("count", 1)
        penalty = APTITUDE_INTEGRITY_PENALTIES.get(flag_type, 0)
        cap = APTITUDE_INTEGRITY_CAPS.get(flag_type, DEFAULT_PENALTY_CAP)
        points_deducted = min(penalty * count, cap)
        breakdown.append({
            "flag_type": flag_type,
            "count": count,
            "points_deducted": float(points_deducted),
        })
    return breakdown


def compute_percentile(this_score: float, all_completed_scores: list[float]) -> float:
    """
    Percentile of this_score within all_completed_scores (INCLUDING this
    attempt's own score, since it's already a completed attempt in the pool
    by the time percentile is computed). Design doc §3.4: this self-
    corrects for attempt-to-attempt difficulty variance in freshly-
    generated question sets, rather than using a fixed score cutoff.
    """
    if not all_completed_scores:
        return 100.0
    below_or_equal = sum(1 for s in all_completed_scores if s <= this_score)
    return round(below_or_equal / len(all_completed_scores) * 100, 1)


def determine_pass(
    percentile: float,
    integrity_score: float,
    pool_size: int,
    raw_score: float,
    difficulty: str = "medium",
    percentile_threshold: float = 80.0,
    integrity_threshold: float = 60.0,
    min_pool_size: int = MIN_POOL_SIZE_FOR_BADGE,
) -> bool:
    """Fix Plan Sec2/Sec4, Option D (dual gate on top of the existing
    percentile+integrity gate):
      1. pool_size must clear min_pool_size - a percentile computed against
         too small a pool is not meaningful (this is the cold-start bug:
         pool of 1 always yields percentile 100.0 regardless of score).
      2. raw_score must clear the per-difficulty floor - protects against a
         lucky/bad-faith low scorer even once the pool is large enough
         (e.g. pool of 2, scores 50% and 20% -> 100th percentile off a
         pool of 2 is barely better than the original bug).
    Both gates are independent additions to the original percentile AND
    integrity check; all four conditions must hold for a badge.
    """
    if pool_size < min_pool_size:
        return False
    min_raw_score = MIN_RAW_SCORE_BY_DIFFICULTY.get(difficulty, DEFAULT_MIN_RAW_SCORE)
    if raw_score < min_raw_score:
        return False
    return percentile >= percentile_threshold and integrity_score >= integrity_threshold
