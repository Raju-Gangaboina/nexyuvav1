"""
Screening Agent (Module 2 of NexYuva AI Hiring Suite): candidate fit judgment.

Deliberately small. Design history below explains why -- read it before adding fields
back, because most of the obvious additions have already been tried and cut.

What this module does NOT do, and why:
  - No skill-by-skill table, no strengths/gaps list, no "matched/missing" restatement
    in any form. The deterministic Compatibility layer (recommendation_engine.
    compute_hybrid_score, surfaced on the candidate card) already shows exactly which
    required skills the candidate has and lacks. Every attempt to give this module its
    own version of that -- a "gaps" list, then a merged requirements[] table with
    evidence text -- ended up either contradicting the deterministic result (real bug,
    happened in production) or just re-displaying the identical three skill names a
    second or third time on the same screen with no new information (confirmed live:
    a candidate missing Angular+TypeScript saw that fact restated 3 times -- top card,
    a "requirements" table, and again in prose under "concerns"). A recruiter who
    already read "Missing: Angular, TypeScript" once does not need to read it two more
    times in different fonts. This module must never re-render skill possession.
  - No split numeric sub-scores (technical_readiness/role_alignment/project_relevance
    out of 10 each). Tried, reverted: a single small LLM producing three scores off the
    same resume text just produces three numbers that track each other -- manufactured
    precision, not real differentiated signal.
  - No separate button, panel, or loading ceremony in the UI. A recruiter should not
    have to click into a bordered "AI Screening Agent Report" section to get a short
    fit judgment -- that framing overpromises ("Module 2", its own score badge, its own
    spinner) relative to what it actually delivers (a couple of sentences). The UI
    layer folds this module's output inline into the existing candidate card instead.
  - next_action / next_action_label are computed by _classify_next_action() below, NOT
    the LLM -- deterministic rule based on missing_ratio (fraction of required_skills
    confirmed missing, computed by the caller from the same matcher as the Compatibility
    card) + overall_confidence:
        missing_ratio == 0                 -> advance  ("Strong Match")
        missing_ratio >= 0.8                -> reject   ("Not a Fit")
        0.5 < missing_ratio < 0.8            -> review   ("Weak Match — Review Recommended")
        missing_ratio <= 0.5                 -> review   ("Review Recommended" / "... — Low Confidence")
    "reject" is always advisory -- a label for the recruiter to act on via a button
    click, never an automatic status change. The bar for it is intentionally high
    (80%+ of required skills confirmed missing) because a tool should very rarely be
    the one closing a door on a candidate.

What this module DOES still add, that the deterministic layer structurally cannot:
  fit_score, next_action_label, and a single short rationale sentence drawn from resume
  text (depth/quality signal, not skill possession) -- e.g. distinguishing "built
  multiple production apps with X" from "X listed once, no project shown", which a
  boolean matched/missing flag can never say. If a future case shows even this isn't
  earning its keep for clear-cut candidates, the next cut is to stop calling the LLM
  at all for cases where missing_ratio is 0 or >=0.8 (the deterministic classification
  already speaks for itself there) and only spend the call on genuine borderline cases.

Pipeline position: Stage 1 of the post-application pipeline.
    Candidate Applies -> AI Screening (this module) -> Aptitude -> Voice Screening ->
    AI Interview -> Scheduling -> Human Interview
This is architectural sequencing only -- no orchestrator wires these stages together yet,
and this module is not triggered automatically on application. It is invoked on-demand today
(company dashboard button -> POST .../candidates/{id}/screen). Downstream action buttons
(e.g. "Move to Aptitude") should render as disabled/"Coming soon" in the UI until an
orchestrator actually exists -- next_action is a recommendation surfaced today, not a wired
pipeline transition.

Edge case & production safety rules:
  1. Scanned/missing resume text -> flags `needs_manual_review = True`.
  2. Resume text > 3500 chars -> truncated to keep token usage & latency bounded.
  3. 2-tier JSON parse retry -> if Groq returns invalid JSON, retries once with a stricter reminder.
  4. Local fallback -> if LLM calls fail twice or GROQ_API_KEY is unset, falls back to deterministic skill-overlap scoring.
  5. Score clamping -> fitScore is strictly clamped to [0, 100] server-side.
"""
import json
import logging
import re
from typing import Any

from app.ai.groq_client import post_chat_completion
from app.core.config import settings

logger = logging.getLogger("nexyuva.screening")


def _clean_json_text(raw_text: str) -> str:
    """Strips markdown code blocks (```json ... ```) and leading/trailing whitespace."""
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _truncate_clean(text: str, max_chars: int = 220) -> str:
    """Truncates to max_chars without cutting mid-word/mid-sentence.

    A blind text[:max_chars] slice chops the LLM's rationale off wherever the
    character count happens to land, producing visibly broken output like
    '...reduce overall confidence in th'. This backs off to the last sentence
    boundary if one exists in range, otherwise the last word boundary.
    """
    text = text.strip()
    if len(text) <= max_chars:
        return text
    window = text[:max_chars]
    last_sentence_end = max(window.rfind(". "), window.rfind("! "), window.rfind("? "))
    if last_sentence_end > max_chars * 0.4:
        return window[: last_sentence_end + 1].strip()
    last_space = window.rfind(" ")
    if last_space > max_chars * 0.4:
        return window[:last_space].strip() + "…"
    return window.strip() + "…"


def _score_to_band(ratio: float) -> str:
    """Maps a 0-1 ratio (skill overlap) to a coarse confidence label for the fallback path."""
    if ratio >= 0.75:
        return "High"
    if ratio >= 0.45:
        return "Medium"
    return "Low"


def _strip_if_restates_skills(rationale: str, required_skills: list[str]) -> str:
    """Server-side backstop for prompt non-compliance.

    The LLM is instructed not to name required skills in the rationale (that's the
    Compatibility card's job), but instruction-following isn't guaranteed on an 8B
    model -- confirmed live, it named skills anyway on a real test case. If the
    rationale mentions any required skill by name, it's restating the skill list
    rather than adding depth/quality signal, so it's replaced with a neutral default
    instead of shipping a near-duplicate of the top card.
    """
    lower = rationale.lower()
    if any(skill.strip().lower() in lower for skill in required_skills if skill.strip()):
        return "No additional notes beyond the skill match shown above."
    return rationale


def _classify_next_action(missing_count: int, required_count: int, overall_confidence: str) -> tuple[str, str]:
    """Deterministic recruiter recommendation. See module docstring for the full rule table.

    Never touches application_status or any DB state -- purely advisory.
    """
    if required_count == 0:
        return "advance", "Strong Match"

    missing_ratio = missing_count / required_count

    if missing_ratio == 0:
        return "advance", "Strong Match"
    if missing_ratio >= 0.8:
        return "reject", "Not a Fit"
    if missing_ratio > 0.5:
        return "review", "Weak Match — Review Recommended"
    if overall_confidence == "Low":
        return "review", "Review Recommended — Low Confidence"
    return "review", "Review Recommended"


def _compute_local_fallback_screening(
    required_skills: list[str],
    candidate_skills: list[str],
    cgpa: float | None,
    confirmed_matched_skills: list[str] | None = None,
    confirmed_missing_skills: list[str] | None = None,
) -> dict[str, Any]:
    """Fallback scoring when LLM is unavailable or fails twice."""
    matched = confirmed_matched_skills if confirmed_matched_skills is not None else [
        s for s in required_skills if s.lower() in {c.lower() for c in candidate_skills}
    ]
    missing = confirmed_missing_skills if confirmed_missing_skills is not None else [
        s for s in required_skills if s not in matched
    ]

    skill_ratio = len(matched) / len(required_skills) if required_skills else 0.8

    base_score = int(round(skill_ratio * 70 + 20))
    if cgpa and cgpa >= 7.5:
        base_score += 10

    fit_score = max(0, min(100, base_score))
    overall_confidence = _score_to_band(skill_ratio)

    rationale = (
        f"Candidate holds {len(matched)} of {len(required_skills)} required skills for this position."
    )

    next_action, next_action_label = _classify_next_action(len(missing), len(required_skills), overall_confidence)

    return {
        "fit_score": fit_score,
        "overall_confidence": overall_confidence,
        "rationale": rationale,
        "needs_manual_review": False,
        "next_action": next_action,
        "next_action_label": next_action_label,
    }


async def screen_candidate(
    internship_title: str,
    internship_description: str,
    required_skills: list[str],
    candidate_name: str,
    candidate_skills: list[str],
    confirmed_matched_skills: list[str] | None = None,
    confirmed_missing_skills: list[str] | None = None,
    resume_text: str | None = None,
    degree: str | None = None,
    college: str | None = None,
    cgpa: float | None = None,
    year: int | None = None,
) -> dict[str, Any]:
    """Performs candidate fit judgment against a specific job posting.

    confirmed_matched_skills / confirmed_missing_skills, when provided, are the
    deterministic Compatibility layer's own case-normalized result for this exact
    candidate+internship pair. They drive next_action (deterministic, see
    _classify_next_action) and are given to the LLM only as context it must not
    contradict in its rationale -- the LLM never re-lists or re-scores skills.
    """
    confirmed_matched_skills = confirmed_matched_skills or []
    confirmed_missing_skills = confirmed_missing_skills or (
        [s for s in required_skills if s not in confirmed_matched_skills]
        if confirmed_matched_skills else list(required_skills)
    )

    clean_resume = (resume_text or "").strip()
    word_count = len(clean_resume.split())

    needs_manual_review = False
    if word_count < 15 and not candidate_skills:
        needs_manual_review = True
        next_action, next_action_label = _classify_next_action(
            len(confirmed_missing_skills), len(required_skills), "Low"
        )
        return {
            "fit_score": 40,
            "overall_confidence": "Low",
            "rationale": "Resume text unavailable or unreadable — manual recruiter review needed.",
            "needs_manual_review": True,
            "next_action": next_action,
            "next_action_label": next_action_label,
        }
    elif word_count < 15:
        needs_manual_review = True

    if not settings.GROQ_API_KEY:
        res = _compute_local_fallback_screening(
            required_skills, candidate_skills, cgpa, confirmed_matched_skills, confirmed_missing_skills
        )
        res["needs_manual_review"] = needs_manual_review
        return res

    truncated_resume = clean_resume[:3500] if clean_resume else "No detailed resume text available."

    system_prompt = (
        "You are an expert technical hiring analyst. A separate deterministic system has already decided "
        "exactly which required skills this candidate has and lacks, and already tells the recruiter that -- "
        "do NOT repeat, restate, or re-score any skill by name anywhere in your output. Your only job is a "
        "short 1-sentence judgment using the resume text for something a skill checklist cannot show: depth or "
        "quality of experience (e.g. built multiple real projects vs. skill only listed once with no evidence), "
        "or a genuine red flag if one exists. If there is nothing beyond the skill list worth saying, say so "
        "briefly rather than inventing something. Output STRICT JSON only, matching this exact shape:\n"
        "{\n"
        '  "fitScore": number (integer 0-100),\n'
        '  "overallConfidence": string, one of "Low", "Medium", "High",\n'
        '  "rationale": string (ONE short sentence, max 30 words, about depth/quality/red-flags only -- '
        'must not name or restate which required skills are present or missing)\n'
        "}\n"
        "Do NOT include any markdown code blocks, conversational text, or preambles outside the JSON object."
    )

    matched_line = ', '.join(confirmed_matched_skills) if confirmed_matched_skills else 'None'
    missing_line = ', '.join(confirmed_missing_skills) if confirmed_missing_skills else 'None'

    user_prompt = (
        f"JOB POSTING:\n"
        f"Title: {internship_title}\n"
        f"Required Skills: {', '.join(required_skills) or 'General'}\n"
        f"Description: {internship_description[:800]}\n\n"
        f"CONFIRMED (deterministic, already shown to recruiter, do not restate):\n"
        f"Matched Skills: {matched_line}\n"
        f"Missing Skills: {missing_line}\n\n"
        f"CANDIDATE PROFILE:\n"
        f"Name: {candidate_name}\n"
        f"Degree: {degree or 'Not specified'}, College: {college or 'Not specified'}, CGPA: {cgpa or 'N/A'}, Year: {year or 'N/A'}\n"
        f"Skills: {', '.join(candidate_skills) or 'None listed'}\n"
        f"Resume Excerpt: {truncated_resume}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Two attempts, sharing/growing `messages` across them -- if the first
    # response isn't valid JSON, a corrective follow-up message is appended
    # and a second call made. This is a conversation-repair retry, distinct
    # from the shared client's own 429 rate-limit retry (post_chat_completion
    # handles that separately, underneath each of these two attempts).
    for attempt in range(2):
        try:
            data = await post_chat_completion(
                messages=messages,
                max_tokens=200,
                temperature=0.2,
                reasoning_effort=None,  # original call never set this
                timeout=15.0,
            )
            if data is None:
                raise RuntimeError("Groq call returned no result")
            raw_content = data["choices"][0]["message"]["content"]
            cleaned_text = _clean_json_text(raw_content)

            parsed = json.loads(cleaned_text)

            raw_score = parsed.get("fitScore", 70)
            if not isinstance(raw_score, (int, float)):
                raw_score = 70
            fit_score = max(0, min(100, int(round(raw_score))))

            rationale = _truncate_clean(str(parsed.get("rationale", ""))) or "No additional notes beyond the skill match above."
            rationale = _strip_if_restates_skills(rationale, required_skills)

            overall_confidence = parsed.get("overallConfidence")
            if overall_confidence not in ("Low", "Medium", "High"):
                overall_confidence = "Medium"

            next_action, next_action_label = _classify_next_action(
                len(confirmed_missing_skills), len(required_skills), overall_confidence
            )

            return {
                "fit_score": fit_score,
                "overall_confidence": overall_confidence,
                "rationale": rationale,
                "needs_manual_review": needs_manual_review,
                "next_action": next_action,
                "next_action_label": next_action_label,
            }
        except (json.JSONDecodeError, KeyError, Exception) as err:
            logger.warning("Screening Agent Groq attempt %d failed for %s: %s", attempt + 1, candidate_name, err)
            if attempt == 0:
                messages.append({
                    "role": "user",
                    "content": "Your previous response was not valid JSON. Return ONLY raw valid JSON matching "
                               "{\"fitScore\": int, \"overallConfidence\": string, \"rationale\": \"\"}. "
                               "No markdown fences."
                })

    res = _compute_local_fallback_screening(
        required_skills, candidate_skills, cgpa, confirmed_matched_skills, confirmed_missing_skills
    )
    res["needs_manual_review"] = needs_manual_review
    return res
