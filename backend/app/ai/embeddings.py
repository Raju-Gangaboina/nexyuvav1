"""
Thin wrapper around sentence-transformers. Pulled forward from Phase 4 because
internship posting (Phase 2) and student profile updates both need to write a
real embedding immediately — leaving requirement_embedding/profile_embedding
null until Phase 4 would mean silently shipping half-working rows, which
Rules.md §4 forbids (no placeholder functions without an explicit TODO flag).

Full hybrid recommendation scoring (content-based + collaborative + XAI
breakdown) is still Phase 4 — this module only produces the raw vector.
"""
import logging

from sentence_transformers import SentenceTransformer

from app.core.config import settings

logger = logging.getLogger("nexyuva.embeddings")

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
    return _model


def embed_batch(texts: list[str]) -> list[list[float]] | None:
    """Batch variant of embed_text — one model.encode() call for many strings
    instead of N separate calls. Added for the resume parser's semantic
    skill-matching pass (app/ai/resume_parser.py), which needs to compare
    every resume sentence against every taxonomy skill and would otherwise
    reload/re-invoke the model per string. Shares the same lazily-loaded
    singleton model as embed_text, so this doesn't add a second model in
    memory. Returns None on failure, same graceful-degradation contract as
    embed_text — callers must fall back (e.g. skip semantic suggestions,
    keep only exact taxonomy matches) rather than let this crash a request."""
    try:
        model = _get_model()
        vectors = model.encode(texts, normalize_embeddings=True)
        return vectors.tolist()
    except Exception:
        logger.exception("Batch embedding generation failed")
        return None


def embed_text(text: str) -> list[float] | None:
    """Returns None on failure instead of raising — callers must degrade
    gracefully (e.g. skip vector search, fall back to keyword filtering)
    per Rules.md §3 rather than let an embedding failure crash the request."""
    try:
        model = _get_model()
        vector = model.encode(text, normalize_embeddings=True)
        return vector.tolist()
    except Exception:
        logger.exception("Embedding generation failed")
        return None


def build_internship_text(title: str, description: str, required_skills: list[str]) -> str:
    return f"{title}. Required skills: {', '.join(required_skills)}. {description}"


def build_student_profile_text(
    full_name: str,
    academic_background: str | None,
    skills: list[str],
) -> str:
    parts = [f"Skills: {', '.join(skills)}" if skills else ""]
    if academic_background:
        parts.append(f"Background: {academic_background}")
    return ". ".join(p for p in parts if p)
