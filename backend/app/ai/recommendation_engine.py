"""
Hybrid Recommendation Engine (Architecture.md §4/§7, PRD §4). Combines three
signals, each independently explainable — that per-signal breakdown IS the
XAI output, not a separate black-box-explainer bolted on afterward:

  1. Content-based: cosine similarity between student profile embedding and
     internship requirement embedding (pgvector, computed at the DB layer)
  2. Skill overlap: direct set-overlap ratio — always available even when
     embeddings are missing (e.g. Hugging Face unreachable), so this is the
     dependable fallback signal, not content-based
  3. Collaborative filtering: synthetic-seeded until real interaction data
     accumulates (see collaborative_filtering.py) — weighted lowest by
     default per the noise observed in testing with small item counts

Weights are configurable and renormalize across whichever signals are
actually available for a given (student, internship) pair, rather than
silently treating a missing signal as zero (which would unfairly punish
students whose embedding failed to generate).

This module is shared by both directions of matching: student-facing
recommendations (internship for a student — services/recommendation/routes.py)
and company-facing Sourcing (candidates for an internship —
services/organization/routes.py's /internships/{id}/sourcing). Both call the
same compute_hybrid_score/content_similarity so the two surfaces can never
silently drift into different definitions of "match."
"""
from dataclasses import dataclass, field


def content_similarity(vec_a: list[float] | None, vec_b: list[float] | None) -> float | None:
    """
    Cosine similarity between two embedding vectors, or None if either is
    missing. Both profile_embedding and requirement_embedding are already
    L2-normalized at write time (embed_text's normalize_embeddings=True), so
    a plain dot product would also work — computing the full cosine formula
    is one extra safeguard if that normalization assumption ever changes.

    Extracted as a shared helper (previously an inline closure duplicated in
    services/recommendation/routes.py) so every caller — student-facing
    recommendations and company-facing Sourcing alike — uses exactly one
    definition of content similarity.
    """
    if vec_a is None or vec_b is None:
        return None
    import numpy as np

    va, vb = np.array(vec_a), np.array(vec_b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return None
    return float(np.dot(va, vb) / denom)


@dataclass
class RecommendationWeights:
    content_based: float = 0.5
    skill_overlap: float = 0.35
    collaborative: float = 0.15


@dataclass
class ScoreBreakdown:
    internship_id: str
    final_score: float
    content_based_score: float | None
    skill_overlap_score: float
    collaborative_score: float | None
    matched_skills: list[str]
    explanation: str = field(default="")

    def __post_init__(self):
        self.explanation = self._build_explanation()

    def _build_explanation(self) -> str:
        parts = []
        if self.content_based_score is not None:
            parts.append(f"{round(self.content_based_score * 100)}% semantic profile match")
        if self.matched_skills:
            skill_preview = ", ".join(self.matched_skills[:3])
            parts.append(f"shared skills ({skill_preview})")
        if self.collaborative_score is not None and self.collaborative_score > 0:
            parts.append(f"{round(self.collaborative_score * 100)}% similar-student affinity")
        if not parts:
            return "Limited signal available for this match yet."
        return f"{round(self.final_score * 100)}% match — " + "; ".join(parts)


def compute_skill_overlap(student_skills: list[str], required_skills: list[str]) -> float:
    if not required_skills:
        return 0.0
    student_set = {s.strip().lower() for s in student_skills}
    required_set = {s.strip().lower() for s in required_skills}
    return len(student_set & required_set) / len(required_set)


def compute_hybrid_score(
    internship_id: str,
    student_skills: list[str],
    required_skills: list[str],
    content_based_score: float | None,
    collaborative_score: float | None,
    weights: RecommendationWeights = RecommendationWeights(),
) -> ScoreBreakdown:
    """
    Renormalizes weights across whatever signals are actually present.
    E.g. if content_based_score is None (embedding failed), the skill_overlap
    and collaborative weights are scaled up proportionally rather than the
    missing signal being treated as a 0 that drags the score down unfairly.
    """
    skill_overlap_score = compute_skill_overlap(student_skills, required_skills)
    # Case-insensitive match, but preserve the required_skills entry's original casing
    # for display (so "TypeScript" shows as typed by the recruiter, not lowercased).
    student_lower = {s.strip().lower() for s in student_skills}
    matched_skills = sorted(
        req for req in required_skills if req.strip().lower() in student_lower
    )

    available = {"skill_overlap": (skill_overlap_score, weights.skill_overlap)}
    if content_based_score is not None:
        available["content_based"] = (content_based_score, weights.content_based)
    if collaborative_score is not None and collaborative_score > 0:
        available["collaborative"] = (collaborative_score, weights.collaborative)

    total_weight = sum(w for _, w in available.values())
    final_score = (
        sum(score * w for score, w in available.values()) / total_weight
        if total_weight > 0
        else 0.0
    )

    return ScoreBreakdown(
        internship_id=internship_id,
        final_score=round(final_score, 3),
        content_based_score=round(content_based_score, 3) if content_based_score is not None else None,
        skill_overlap_score=round(skill_overlap_score, 3),
        collaborative_score=collaborative_score,
        matched_skills=matched_skills,
    )


def rank_recommendations(breakdowns: list[ScoreBreakdown], top_k: int = 20) -> list[ScoreBreakdown]:
    return sorted(breakdowns, key=lambda b: -b.final_score)[:top_k]
