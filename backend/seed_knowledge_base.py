"""
One-time (re-runnable) seed script for the chatbot's RAG knowledge base
(app/core/models.py::KnowledgeBaseSnippet). Closes the TODO logged in
Memory.md: retrieve_context() had a real pgvector query pattern but nothing
to query against.

Content scope, deliberately: platform mechanics this app actually
implements (recommendations, resume parsing, assessments/badges,
applications, ATS check, interviews) plus general, non-controversial
career-guidance advice a student might ask an open-ended question about.
Does NOT invent specific real-world PM Internship Scheme policy figures
(stipend amounts, eligibility cutoffs, official duration) that would need
to be sourced from the actual government scheme documentation to be
honest -- those belong in the FAQ layer or a real cited source if/when
that's added, not fabricated here as if authoritative.

Run with: venv\\Scripts\\python.exe seed_knowledge_base.py
Safe to re-run: clears and re-inserts rather than duplicating.
"""
import asyncio
import logging

from sqlalchemy import delete, text

from app.ai.embeddings import embed_text
from app.core.database import AsyncSessionLocal, engine
from app.core.models import KnowledgeBaseSnippet

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_kb")

SNIPPETS: list[tuple[str, str]] = [
    (
        "recommendation_ranking",
        "Internship recommendations are ranked using a hybrid score: a "
        "content-based semantic similarity between your profile (skills, "
        "academic background, bio) and each internship's requirements, "
        "combined with a skill-overlap score and, once enough students have "
        "used the platform, a collaborative-filtering signal from students "
        "with similar profiles. Recommendations refresh whenever you update "
        "your profile or resume, since the underlying embedding changes.",
    ),
    (
        "why_low_match_score",
        "A low match score usually means either a skill gap (compare your "
        "profile skills against the internship's required_skills list -- "
        "the Skill Gap Analysis section on the internship page shows this "
        "directly) or a thin profile -- an empty bio, missing academic "
        "background, or no resume uploaded gives the semantic similarity "
        "model very little to work with. Filling in your profile fully, not "
        "just your skills list, generally raises match quality.",
    ),
    (
        "cold_start_new_student",
        "If you just signed up and have no applications yet, recommendations "
        "rely more heavily on the content-based (skills/profile) signal than "
        "the collaborative one, since there's no interaction history yet for "
        "the collaborative filter to use. Recommendations tend to sharpen up "
        "after your first few applications as the system learns more about "
        "what you actually engage with.",
    ),
    (
        "resume_parsing_accuracy",
        "Resume parsing extracts skills by matching your resume text against "
        "a curated skills taxonomy, plus a semantic pass for skills phrased "
        "differently than the taxonomy's exact wording. It works best on "
        "single-column, text-based PDF or DOCX resumes -- scanned images or "
        "heavily designed multi-column layouts can cause skills to be missed. "
        "You can always add or correct skills manually after upload; manual "
        "edits are never overwritten by a later re-parse.",
    ),
    (
        "ats_check_explained",
        "The ATS Check on Live Internships runs two layers: a deterministic "
        "check of real, documented parsing behaviors from ATS platforms like "
        "Workday, Greenhouse, iCIMS, and Oracle Taleo (file format, section "
        "headers, layout, contact info placement, bullet structure, "
        "quantified results), plus an optional AI-generated review that "
        "quotes specific lines from your resume with concrete issues. It "
        "doesn't claim to replicate any company's actual private scoring "
        "algorithm -- those aren't public -- only their documented parsing "
        "behavior.",
    ),
    (
        "assessment_and_badges",
        "Badges are earned by passing a proctored skill assessment for a "
        "specific domain (found under 'Take Assessment' on your Profile "
        "page). Assessments adapt in difficulty based on your answers and "
        "are proctored -- integrity flags are logged during the attempt. A "
        "badge is a portable signal of verified skill, separate from a "
        "completion certificate, which instead confirms you finished a "
        "specific internship.",
    ),
    (
        "certificate_vs_badge",
        "A certificate confirms you completed a specific internship -- it's "
        "issued by the organization once they mark your application as "
        "completed, and appears on your Profile under that application. A "
        "badge confirms you passed a skill assessment (or a proctored "
        "interview) for a domain, independent of any specific internship. "
        "You can hold badges without ever having completed an internship in "
        "that domain, and vice versa.",
    ),
    (
        "application_status_meaning",
        "Application statuses move through: Applied (submitted, awaiting "
        "review) -> Shortlisted (the organization has flagged you for "
        "further consideration, e.g. an interview) -> Accepted or Rejected "
        "-> Completed (only reachable from Accepted, once the internship "
        "period ends and the organization confirms completion, which is "
        "also what triggers certificate issuance).",
    ),
    (
        "proctored_interview_process",
        "Some internships include a proctored video interview after you're "
        "shortlisted: you're asked a set of questions sampled from the "
        "organization's own question bank, your answers are recorded, and "
        "an AI grades each answer for quality and cross-checks it against "
        "your resume for consistency. Integrity flags (e.g. a second person "
        "or phone detected on camera) are logged and shown to the "
        "organization alongside your score, not used to silently fail you.",
    ),
    (
        "github_profile_benefit",
        "Linking your GitHub username (Profile page, under 'Social "
        "Profile') lets the platform factor your public repository activity "
        "into your profile score -- consistent commit history and real "
        "projects strengthen your profile signal beyond what a resume alone "
        "shows. Only public activity is used; nothing private is accessed.",
    ),
    (
        "improving_weak_resume_signal",
        "If your profile or ATS check keeps flagging weak signal, the "
        "highest-leverage fixes are usually: replace passive phrasing "
        "('responsible for', 'helped with') with ownership verbs ('built', "
        "'led', 'shipped'), add at least one quantified result per role "
        "(a percentage, a count, a time saved), and make sure section "
        "headers use conventional wording ('Experience', 'Education', "
        "'Skills') rather than creative alternatives, since field-based "
        "parsers key off exactly that wording.",
    ),
    (
        "internship_sectors",
        "Internships on the platform can be posted by both private "
        "companies and, where applicable, public-sector or government-"
        "linked organizations -- the 'sector' field on each listing "
        "indicates which. Verification (via GST/incorporation/MSME "
        "documents, reviewed by an admin) is required before any "
        "organization -- private or public-sector -- can post, so a live "
        "listing means the organization has already passed that check.",
    ),
    (
        "choosing_between_offers",
        "When comparing multiple internship offers, it's usually worth "
        "weighing skill-relevance to your target career path over stipend "
        "alone for an early-career internship -- the Skill Gap Analysis on "
        "each listing shows concretely which skills you'd gain versus "
        "already have. A remote or hybrid role removes relocation cost but "
        "can mean less direct mentorship than an on-site role; that "
        "trade-off is personal and worth weighing against how much "
        "structured guidance you want at this stage.",
    ),
    (
        "career_path_general_advice",
        "If you're unsure which domain to target, the Career Path guidance "
        "on the platform maps your current skills and interests to one of "
        "the recognized domains (Backend Engineer, Frontend Engineer, "
        "Full-Stack Engineer, Data Analyst, ML Engineer, DevOps Engineer, "
        "Product/Project Analyst). It's meant as a starting signal, not a "
        "verdict -- trying a Skill Gap Analysis against a couple of "
        "different domains' internships is a concrete way to see which gap "
        "feels most closeable to you right now.",
    ),
]


async def seed() -> None:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))  # fail fast if DB unreachable
        await conn.commit()

    async with AsyncSessionLocal() as session:
        await session.execute(delete(KnowledgeBaseSnippet))
        inserted = 0
        skipped = []
        for topic, content in SNIPPETS:
            vector = embed_text(content)
            if vector is None:
                skipped.append(topic)
                continue
            session.add(KnowledgeBaseSnippet(topic=topic, content=content, embedding=vector))
            inserted += 1
        await session.commit()

    logger.info("Inserted %d snippets", inserted)
    if skipped:
        logger.warning("Skipped %d snippets (embedding failed): %s", len(skipped), skipped)


if __name__ == "__main__":
    asyncio.run(seed())
