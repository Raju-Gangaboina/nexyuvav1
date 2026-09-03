"""
AI Career Guidance Chatbot (PRD §4, Architecture.md §6 RAG chapter).
Two-tier design:
  1. Rule-based FAQ routing — fast, free, deterministic, covers the common
     questions every student asks. Fully testable, no network needed.
  2. RAG fallback for open-ended questions the FAQ router doesn't match:
     retrieve relevant context via pgvector similarity, then generate a
     grounded answer with Groq (free tier).

STATUS (updated 2026-08-01): both tiers are now real and verified live.
Groq generation was confirmed reachable earlier this session (see
Memory.md). retrieve_context() now runs a real pgvector cosine-distance
query against knowledge_base_snippets, seeded via seed_knowledge_base.py
(14 topics covering platform mechanics + general career-guidance advice —
see that file for the honest scope note on what content was and wasn't
included). Previously this function always returned [] because the table
didn't exist yet; that gap is closed.
"""
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.models import KnowledgeBaseSnippet

logger = logging.getLogger("nexyuva.chatbot")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# Rule-based FAQ bank: (required_keywords_any_order, answer). Each entry
# matches if ALL keyword groups are present anywhere in the question,
# regardless of order — an earlier version used strict-order regexes
# (e.g. "certificate.*get") that failed on real phrasings like "how do I
# GET a CERTIFICATE" where the words appear in the opposite order. Found
# by testing against realistic questions, not assumed to work from writing.
FAQ_RULES: list[tuple[list[str], str]] = [
    (["apply"],
     "Find an internship on your Recommendations page and click 'Apply' — "
     "your profile details are used to auto-fill the application."),
    (["match", "score"],
     "Your match score combines your skill overlap with the internship's "
     "requirements, a semantic similarity score from your profile, and "
     "signals from similar students. Tap any recommendation to see exactly "
     "which skills contributed to the score."),
    (["match", "percentage"],
     "Your match score combines your skill overlap with the internship's "
     "requirements, a semantic similarity score from your profile, and "
     "signals from similar students. Tap any recommendation to see exactly "
     "which skills contributed to the score."),
    (["resume"],
     "Go to your Profile page and use the 'Upload Resume' button. We "
     "automatically extract your skills from it — you can also edit them "
     "manually afterward."),
    (["certificate"],
     "Certificates are issued once an organization marks your internship as "
     "completed. You'll get an email, and it'll appear on your Profile page "
     "under that application."),
    (["badge"],
     "Badges come from passing a proctored skill assessment for a specific "
     "domain — look for the 'Take Assessment' option on your Profile page."),
    (["github"],
     "Go to your Profile page and enter your GitHub username under 'Social "
     "Profile' — we'll pull your public repo activity to strengthen your "
     "profile score."),
    (["skill", "missing"],
     "Check the Skill Gap Analysis section on any internship or career path "
     "page — it shows exactly which skills you're missing and which you "
     "already have."),
    (["skill", "gap"],
     "Check the Skill Gap Analysis section on any internship or career path "
     "page — it shows exactly which skills you're missing and which you "
     "already have."),
]


def match_faq(question: str) -> str | None:
    """Returns a canned answer if every keyword in a rule's group appears
    somewhere in the question (any order), else None (caller falls back
    to RAG). Simple substring checks, not regex — deliberately avoids
    reintroducing the word-order fragility found during testing."""
    q = question.lower().strip()
    for keywords, answer in FAQ_RULES:
        if all(kw in q for kw in keywords):
            return answer
    return None


async def retrieve_context(
    question_embedding: list[float] | None, db: AsyncSession | None, top_k: int = 3
) -> list[str]:
    """
    Retrieves the top-k most relevant knowledge-base snippets via pgvector
    cosine distance (`<=>` operator from the pgvector SQLAlchemy Vector
    type's `.cosine_distance()`). Returns an empty list (not an error) if
    the embedding or db session is unavailable, or if the query itself
    fails — the RAG generation step then falls back to an ungrounded
    answer with a caveat, per the graceful-degradation pattern used
    throughout this codebase (Rules.md §3).
    """
    if question_embedding is None or db is None:
        return []
    try:
        stmt = (
            select(KnowledgeBaseSnippet)
            .order_by(KnowledgeBaseSnippet.embedding.cosine_distance(question_embedding))
            .limit(top_k)
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return [row.content for row in rows]
    except Exception:
        logger.exception("Knowledge-base retrieval failed — falling back to ungrounded RAG")
        return []


async def generate_rag_answer(question: str, context_snippets: list[str]) -> str:
    """
    Calls Groq for a grounded answer. Degrades to a clear, honest fallback
    message (not a fabricated answer) if Groq isn't configured or the call
    fails — never silently returns nothing or a raw error to the student.
    """
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured — chatbot RAG fallback unavailable")
        return (
            "I don't have an answer for that specific question yet. Please "
            "check the FAQ section or contact support — this is a newer "
            "feature still being connected."
        )

    context_block = "\n".join(f"- {c}" for c in context_snippets) if context_snippets else ""
    system_prompt = (
        "You are NexYuva's career guidance assistant for students on India's "
        "PM Internship Scheme platform. Answer concisely and only using the "
        "provided context where given. If you're unsure, say so honestly "
        "rather than guessing."
    )
    user_prompt = (
        f"Context:\n{context_block}\n\nQuestion: {question}" if context_block else question
    )

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GROQ_API_URL,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": settings.GROQ_MODEL,  # llama-3.1-8b-instant was decommissioned 2026-08-16
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 300,
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except Exception:
        logger.exception("Groq generation failed")
        return (
            "I'm having trouble answering that right now. Please try again "
            "shortly or check the FAQ section."
        )


async def answer_question(
    question: str, question_embedding: list[float] | None = None, db: AsyncSession | None = None
) -> dict:
    """Main entry point: FAQ first, RAG fallback second."""
    faq_answer = match_faq(question)
    if faq_answer is not None:
        return {"answer": faq_answer, "source": "faq"}

    context = await retrieve_context(question_embedding, db)
    answer = await generate_rag_answer(question, context)
    return {"answer": answer, "source": "rag" if context else "rag_ungrounded"}
