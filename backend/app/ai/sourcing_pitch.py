"""
Sourcing Agent (organization-facing): AI recruiter pitch & resume analysis generator.

Analyzes candidate profile data, extracted resume text, and matched skills against
an internship position using Groq LLM. Produces a natural, human-readable recruiter
explanation.
"""
import logging

from app.ai.groq_client import groq_chat
from app.core.config import settings

logger = logging.getLogger("nexyuva.sourcing")


def generate_clean_fallback_explanation(
    candidate_name: str,
    matched_skills: list[str],
    missing_skills: list[str],
    internship_title: str,
) -> str:
    """Generates a clean, natural fallback explanation without internal formula jargon."""
    if matched_skills:
        skills_str = ", ".join(matched_skills[:4])
        exp = f"{candidate_name} demonstrates strong alignment for the {internship_title} role with key skills in {skills_str}."
        if missing_skills:
            exp += f" Skill to verify: {missing_skills[0]}."
        return exp
    return f"{candidate_name}'s academic background aligns with the {internship_title} internship position."


async def generate_recruiter_pitch(
    candidate_name: str,
    candidate_skills: list[str],
    matched_skills: list[str],
    missing_skills: list[str],
    internship_title: str,
    resume_text: str | None = None,
    degree: str | None = None,
    college: str | None = None,
) -> str:
    """Uses Groq to analyze extracted resume words and profile skills against job requirements,
    returning a natural, professional AI explanation for recruiters."""
    fallback = generate_clean_fallback_explanation(
        candidate_name, matched_skills, missing_skills, internship_title
    )

    if not settings.GROQ_API_KEY:
        return fallback

    truncated_resume = (resume_text or "").strip()[:1500] if resume_text else "No detailed text excerpt available."

    system_prompt = (
        "You are an expert technical recruiting analyst. Given a candidate's background, "
        "extracted resume text, and matched/missing skills for a specific internship posting, "
        "write 1 to 2 clear, professional sentences (max 45 words) explaining why this candidate "
        "is a fit for the recruiter. Focus on their real skills, projects, and background. "
        "NEVER output formula fragments, percentage numbers, or obscure mathematical labels."
    )
    user_prompt = (
        f"INTERNSHIP POSITION: {internship_title}\n"
        f"CANDIDATE NAME: {candidate_name}\n"
        f"DEGREE: {degree or 'N/A'}, COLLEGE: {college or 'N/A'}\n"
        f"MATCHED SKILLS: {', '.join(matched_skills) or 'None'}\n"
        f"MISSING SKILLS: {', '.join(missing_skills) or 'None'}\n"
        f"ALL CANDIDATE SKILLS: {', '.join(candidate_skills) or 'None'}\n"
        f"EXTRACTED RESUME TEXT: {truncated_resume}"
    )

    # reasoning_effort=None preserves this call's original behavior (it
    # never set the field) now that it goes through the shared client.
    content = await groq_chat(
        system_prompt, user_prompt, max_tokens=90, temperature=0.3, reasoning_effort=None, timeout=12.0,
    )
    if content and len(content.strip()) > 10:
        return content.strip()

    return fallback
