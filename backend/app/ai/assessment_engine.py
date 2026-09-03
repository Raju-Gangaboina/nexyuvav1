"""
Skill Verification & Proctored Assessment Engine (Architecture.md §12).

Adaptive sequencing is simple rule-based logic, not ML — correct answer bumps
difficulty up, wrong answer holds/drops it. This is server-authoritative: the
correct_index is never sent to the client, and difficulty selection happens
here, not in browser JS, so a student can't manipulate their own difficulty
curve by inspecting client-side code.

Integrity scoring is a separate, additive signal from proctoring events the
frontend reports (face detection, tab visibility) — see Architecture.md §12
for why this stays client-side-detection + server-side-scoring rather than
uploading video.
"""
import json
import logging
import random
from pathlib import Path

from app.core.domains import normalize_domain_label, normalize_key

logger = logging.getLogger("nexyuva.assessment_engine")

QUESTION_BANK_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "question_banks"

DIFFICULTY_ORDER = ["easy", "medium", "hard"]

# H3 fix: the assessment domain was previously matched to a question-bank
# filename with a raw, case/space-sensitive equality check — "Data Science"
# would never resolve to data_analyst.json even though it's clearly the same
# domain. Domain synonym recognition now lives in app/core/domains.py (the
# single shared source of truth also used when an org posts an internship),
# so this module only owns the mapping from a *canonical* domain label to
# its question-bank slug, not the synonym list itself — avoids the two
# layers drifting out of sync with each other over time.
SLUG_BY_CANONICAL_DOMAIN: dict[str, str] = {
    "Backend Engineer": "python_dev",
    "Frontend Engineer": "frontend_dev",
    "Full-Stack Engineer": "fullstack_dev",
    "Data Analyst": "data_analyst",
    "ML Engineer": "ml_engineer",
    "DevOps Engineer": "devops",
    "Product/Project Analyst": "product_analyst",
}


def available_domains() -> list[str]:
    """Question-bank slugs that actually have a file on disk right now —
    the single source of truth for what a student can start today, so a
    stale SLUG_BY_CANONICAL_DOMAIN entry can never claim coverage that
    doesn't exist."""
    if not QUESTION_BANK_DIR.exists():
        return []
    return sorted(p.stem for p in QUESTION_BANK_DIR.glob("*.json"))


def resolve_domain_slug(raw_domain: str) -> str | None:
    """
    Maps free-text/career-path domain input to a question-bank slug via the
    shared canonical-domain normalizer. Returns None if the domain isn't
    recognized at all (distinct from "recognized but no bank built yet" —
    callers use available_domains() to tell those two cases apart and give
    the student/org a clear message either way instead of a bare,
    unexplained 404).
    """
    canonical = normalize_domain_label(raw_domain)
    if canonical in SLUG_BY_CANONICAL_DOMAIN:
        return SLUG_BY_CANONICAL_DOMAIN[canonical]
    # Also accept an exact slug match directly (e.g. domain already stored
    # as "python_dev") even if it doesn't resolve through the canonical map.
    slug_guess = normalize_key(raw_domain).replace(" ", "_")
    if slug_guess in available_domains():
        return slug_guess
    return None

# Integrity flag penalty weights and per-type caps — tuned to penalize
# sustained/repeated problems more than a single blip, BUT with per-type
# caps rather than one global cap, after testing showed a global 40-point
# cap let 3x multiple_faces_detected (a strong, low-false-positive signal
# of another person present) land at exactly the 60-point pass threshold.
# Ambiguous/false-positive-prone signals (brief no-face, posture shifts,
# tab switches) stay lightly capped; unambiguous signals don't get capped
# low enough to survive.
INTEGRITY_PENALTIES = {
    "no_face_detected": 5,
    "face_turned_away": 4,
    "multiple_faces_detected": 25,
    "tab_blur": 8,
    "copy_paste_attempt": 3,
}
INTEGRITY_PENALTY_CAPS = {
    "no_face_detected": 30,
    "face_turned_away": 25,
    "multiple_faces_detected": 100,  # effectively uncapped — this is the clearest cheating signal
    "tab_blur": 30,
    "copy_paste_attempt": 20,
}
DEFAULT_PENALTY_CAP = 30


def load_question_bank(domain: str) -> list[dict]:
    """
    H3 fix: previously did a raw f"{domain}.json" lookup, so any spelling/
    case/spacing variance that didn't exactly match a filename ("Data
    Science" vs data_analyst.json) 404'd even though the domain was clearly
    supported. Now resolves through resolve_domain_slug() first.

    Raises ValueError in two distinct cases the route layer should message
    differently:
      - domain not recognized at all (typo, or a domain nothing maps to)
      - domain recognized (resolves to a slug) but no bank file exists for
        it yet — a real content gap, not a bad request
    """
    slug = resolve_domain_slug(domain)
    if slug is None:
        raise ValueError(
            f"'{domain}' isn't a recognized assessment domain. "
            f"Available domains: {', '.join(available_domains()) or 'none configured'}"
        )
    path = QUESTION_BANK_DIR / f"{slug}.json"
    if not path.exists():
        # Recognized domain, but content hasn't been built for it yet — a
        # DOMAIN_ALIASES entry pointing at a slug with no file is exactly
        # the "fails loudly" case the module docstring above promises.
        raise ValueError(
            f"Assessment for '{domain}' isn't available yet. "
            f"Available domains: {', '.join(available_domains()) or 'none configured'}"
        )
    with path.open() as f:
        return json.load(f)


def _public_question(q: dict) -> dict:
    """Strips the correct answer before sending to the client — never leak
    this over the wire, even transiently."""
    return {"id": q["id"], "difficulty": q["difficulty"], "question": q["question"], "options": q["options"]}


def pick_first_question(bank: list[dict]) -> dict:
    easy_questions = [q for q in bank if q["difficulty"] == "easy"]
    pool = easy_questions or bank
    return _public_question(random.choice(pool))


def pick_next_question(
    bank: list[dict], answered_ids: list[str], last_correct: bool, last_difficulty: str
) -> dict | None:
    """
    Adaptive rule: correct -> move up one difficulty tier; incorrect -> hold
    at the same tier (not down — one wrong answer shouldn't spiral the test
    to trivial difficulty, which would undermine the "hard questions for
    qualification" intent from the original request).
    Returns None when the bank is exhausted at the target tier and no
    fallback question remains — caller should end the test at that point.
    """
    current_idx = DIFFICULTY_ORDER.index(last_difficulty)
    if last_correct and current_idx < len(DIFFICULTY_ORDER) - 1:
        target_idx = current_idx + 1
    else:
        target_idx = current_idx

    target_difficulty = DIFFICULTY_ORDER[target_idx]
    candidates = [
        q for q in bank if q["difficulty"] == target_difficulty and q["id"] not in answered_ids
    ]

    if not candidates:
        # Fall back to any unanswered question at any difficulty rather than
        # end the test early just because one tier ran out
        candidates = [q for q in bank if q["id"] not in answered_ids]

    if not candidates:
        return None

    return _public_question(random.choice(candidates))


def grade_answer(bank: list[dict], question_id: str, selected_index: int) -> bool:
    question = next((q for q in bank if q["id"] == question_id), None)
    if question is None:
        raise ValueError(f"Unknown question id '{question_id}'")
    return question["correct_index"] == selected_index


def compute_final_score(answers: list[dict]) -> float:
    """
    answers: list of {"question_id": str, "difficulty": str, "correct": bool}
    Weighted by difficulty so a hard question correctly answered counts for
    more than an easy one — rewards actually reaching and clearing harder
    tiers, not just answering many easy questions.

    HARDENING NOTE: found via testing that an unrecognized difficulty label
    (a typo in a question bank JSON, or a future difficulty tier not yet
    added here) raised a raw KeyError, which would crash the entire
    "finish assessment" request with an unhandled 500 — the one place in
    this function that didn't follow Rules.md §3's graceful-degradation
    rule. Fixed to default unknown difficulties to weight 1 (same as
    "easy") with a logged warning, rather than crash a student's completed
    assessment over a data issue that isn't their fault.
    """
    weights = {"easy": 1, "medium": 2, "hard": 3}
    if not answers:
        return 0.0

    def _weight(difficulty: str) -> int:
        if difficulty not in weights:
            logger.warning(
                "Unrecognized difficulty '%s' in scored answer — defaulting "
                "to weight 1 instead of crashing the assessment.", difficulty,
            )
        return weights.get(difficulty, 1)

    earned = sum(_weight(a["difficulty"]) for a in answers if a["correct"])
    possible = sum(_weight(a["difficulty"]) for a in answers)
    return round(earned / possible * 100, 1) if possible > 0 else 0.0


def compute_integrity_score(flags: list[dict]) -> float:
    """
    flags: list of {"flag_type": str, "count": int} aggregated over the
    attempt. Returns 0-100, where 100 = no integrity concerns.
    """
    score = 100.0
    for flag in flags:
        flag_type = flag.get("flag_type")
        count = flag.get("count", 1)
        penalty_per_occurrence = INTEGRITY_PENALTIES.get(flag_type, 0)
        cap = INTEGRITY_PENALTY_CAPS.get(flag_type, DEFAULT_PENALTY_CAP)
        total_penalty = min(penalty_per_occurrence * count, cap)
        score -= total_penalty
    return round(max(score, 0.0), 1)


def determine_pass(score: float, integrity_score: float, score_threshold: float = 70.0, integrity_threshold: float = 60.0) -> bool:
    """Both thresholds must clear — a high score with heavy integrity flags
    doesn't earn a verified badge, per the original 'no copying allowed'
    requirement."""
    return score >= score_threshold and integrity_score >= integrity_threshold
