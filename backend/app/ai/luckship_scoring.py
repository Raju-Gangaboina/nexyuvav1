"""
Luckship scoring: turns a RawOpportunity (luckship_sources.py) into a ranked,
explainable match against one student's profile.

Deliberately reuses two pieces that already exist rather than inventing a
parallel scoring system:
  - SKILL_TAXONOMY from resume_parser.py, so an external posting's free-text
    description gets tagged with the SAME canonical skill vocabulary the
    student's own profile.skills was extracted with. Without this, "React.js"
    in a job description and "react" on the student's profile would never
    match as the same skill.
  - compute_skill_overlap from recommendation_engine.py, the same function
    NexYuva's own internal internship-matching (services/recommendation)
    uses, so "match %" means the same thing everywhere in the product.

External opportunities have no requirement_embedding and no interaction
history, so unlike the hybrid internal engine, Luckship's score is skill
overlap only -- deliberately simple over deliberately impressive-looking.
A "prep estimate" is derived from the missing-skill count, since students
explicitly want to know how much work stands between them and applying.
"""
import re
from dataclasses import dataclass, field

from app.ai.recommendation_engine import compute_skill_overlap
from app.ai.resume_parser import SKILL_TAXONOMY
from app.ai.luckship_sources import RawOpportunity

# variant -> canonical skill name, built once at import time
_VARIANT_TO_CANONICAL: dict[str, str] = {}
for canonical, meta in SKILL_TAXONOMY.items():
    for variant in meta["variants"]:
        _VARIANT_TO_CANONICAL[variant.lower()] = canonical

# Longest variants first so "node.js" matches before a shorter overlapping
# token could steal the match.
_SORTED_VARIANTS = sorted(_VARIANT_TO_CANONICAL.keys(), key=len, reverse=True)


def extract_canonical_skills(text: str) -> set[str]:
    """Plain regex word-boundary tagging -- no spaCy pipeline needed for
    external postings, this only has to be good enough to drive overlap
    scoring, not to be an audited source-of-truth extraction like the
    resume parser's confirmed-skills pass."""
    if not text:
        return set()
    lowered = text.lower()
    found: set[str] = set()
    for variant in _SORTED_VARIANTS:
        # \b doesn't work cleanly for variants containing punctuation like
        # "c++" or "node.js", so fall back to plain substring for those.
        if re.search(r"[^a-z0-9]", variant):
            if variant in lowered:
                found.add(_VARIANT_TO_CANONICAL[variant])
        elif re.search(rf"\b{re.escape(variant)}\b", lowered):
            found.add(_VARIANT_TO_CANONICAL[variant])
    return found


def estimate_prep_effort(missing_skill_count: int) -> str:
    """Deterministic, no LLM -- students want a fast signal, not a guess
    dressed up as precision."""
    if missing_skill_count == 0:
        return "Ready to apply now"
    if missing_skill_count <= 1:
        return "~1 skill to brush up — a few days"
    if missing_skill_count <= 3:
        return "A few skills to cover — 1-2 weeks"
    return "Significant gap — treat as a stretch opportunity"


@dataclass
class LuckshipMatch:
    source: str
    external_id: str
    title: str
    company: str
    location: str | None
    remote: bool
    url: str
    match_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    prep_estimate: str
    posted_at: str | None = None
    explanation: str = field(default="")


def score_opportunity(student_skills: list[str], opp: RawOpportunity) -> LuckshipMatch:
    posting_text = f"{opp.title}\n{opp.description}\n{' '.join(opp.tags)}"
    posting_skills = extract_canonical_skills(posting_text)

    # tags from the source (e.g. Remotive's own category tags) often ARE
    # already skill-shaped but outside the taxonomy (e.g. "javascript" as a
    # tag is fine, but a source-specific tag like "full-time" isn't a
    # skill) -- only keep tags that also resolved through the taxonomy pass
    # above, so posting_skills stays a clean skill set, not a mixed bag.
    required_skills = sorted(posting_skills)

    overlap_score = compute_skill_overlap(student_skills, required_skills)

    student_lower = {s.strip().lower() for s in student_skills}
    matched = sorted(s for s in required_skills if s.lower() in student_lower)
    missing = sorted(s for s in required_skills if s.lower() not in student_lower)

    return LuckshipMatch(
        source=opp.source,
        external_id=opp.external_id,
        title=opp.title,
        company=opp.company,
        location=opp.location,
        remote=opp.remote,
        url=opp.url,
        match_score=round(overlap_score, 3),
        matched_skills=matched,
        missing_skills=missing,
        prep_estimate=estimate_prep_effort(len(missing)),
        posted_at=opp.posted_at,
    )


def rank_matches(matches: list[LuckshipMatch], top_k: int = 20) -> list[LuckshipMatch]:
    # Opportunities with zero taxonomy-recognized skills in their text still
    # deserve a place in the pool (skill overlap of 0.0 isn't "bad", it's
    # "no signal") -- but they should rank behind ones we could actually
    # score, so sort by (has_any_required_skill, score) rather than score
    # alone.
    return sorted(
        matches,
        key=lambda m: (bool(m.matched_skills or m.missing_skills), m.match_score),
        reverse=True,
    )[:top_k]
