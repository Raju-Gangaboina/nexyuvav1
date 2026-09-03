"""
Luckship Agent (student-facing): explains WHY an external opportunity was
surfaced, in the student's voice rather than a recruiter's.

Mirrors app/ai/sourcing_pitch.py's pattern exactly (same Groq endpoint,
same centralized GROQ_MODEL, same deterministic-fallback-first shape) --
that module explains a candidate TO a recruiter; this one explains an
opportunity TO the student. Keeping the two symmetric is intentional: it's
the same underlying idea (turn a skill-overlap breakdown into plain
language) pointed in the opposite direction, matching the "company-side
NexYuva finds candidates, Luckship finds opportunities" framing.
"""
import logging
import httpx

from app.core.config import settings

logger = logging.getLogger("nexyuva.luckship")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = settings.GROQ_MODEL


def generate_fallback_explanation(
    title: str,
    company: str,
    matched_skills: list[str],
    missing_skills: list[str],
    match_score: float,
) -> str:
    pct = round(match_score * 100)
    if matched_skills:
        skills_str = ", ".join(matched_skills[:4])
        exp = f"You match {pct}% of what {company} is asking for on {title}, including {skills_str}."
        if missing_skills:
            exp += f" Worth brushing up on {missing_skills[0]} before applying."
        return exp
    if match_score == 0 and not missing_skills:
        return f"{title} at {company} didn't have enough listed skills to score confidently -- worth a manual look."
    return f"{title} at {company} could be a stretch fit -- your profile doesn't overlap much with what's listed yet."


async def generate_student_explanation(
    student_name: str,
    student_skills: list[str],
    title: str,
    company: str,
    matched_skills: list[str],
    missing_skills: list[str],
    match_score: float,
    description: str | None = None,
) -> str:
    fallback = generate_fallback_explanation(title, company, matched_skills, missing_skills, match_score)

    if not settings.GROQ_API_KEY:
        return fallback

    truncated_desc = (description or "").strip()[:1200] if description else "No description available."

    system_prompt = (
        "You are Luckship, an AI that hunts external internships and jobs for a student and "
        "explains, in second person and an encouraging but honest tone, why a specific opportunity "
        "is or isn't a good match. Write 1 to 2 sentences (max 45 words). Mention concrete matched "
        "skills and at most one missing skill to focus on. Never invent skills not given to you. "
        "NEVER output raw percentages formulas or scoring jargon -- speak plainly."
    )
    user_prompt = (
        f"OPPORTUNITY: {title} at {company}\n"
        f"MATCH SCORE: {round(match_score * 100)}%\n"
        f"STUDENT'S SKILLS: {', '.join(student_skills) or 'None listed'}\n"
        f"MATCHED SKILLS: {', '.join(matched_skills) or 'None'}\n"
        f"MISSING SKILLS: {', '.join(missing_skills) or 'None'}\n"
        f"OPPORTUNITY DESCRIPTION EXCERPT: {truncated_desc}"
    )

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
                    "temperature": 0.3,
                    "max_tokens": 90,
                },
                timeout=12.0,
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            if content and len(content.strip()) > 10:
                return content.strip()
    except Exception:
        logger.exception("Luckship explanation generation failed for %s @ %s", title, company)

    return fallback
