"""
Canonical domain / career-path labels (Architecture.md §7, §12).

Single source of truth so internship postings, the assessment engine, and
analytics don't each grow their own independent notion of what "Data
Analyst" or "ML Engineer" means. Before this existed, the assessment engine
had started building its own alias list in isolation — exactly the kind of
duplication that lets "Data Science" resolve correctly in one place and
silently fail to match in another. Anything that needs to recognize or
normalize a domain string should import from here rather than hand-rolling
another synonym list.

CANONICAL_DOMAINS mirrors app/ai/career_path.py's TRAINING_DATA class labels
exactly. Kept as a manually-synced duplicate rather than an import from
career_path.py, specifically to avoid pulling scikit-learn/joblib into
every module that just wants domain string normalization (e.g. the
internship-posting route, which has nothing else to do with the ML stack).
"""

CANONICAL_DOMAINS: list[str] = [
    "Backend Engineer",
    "Frontend Engineer",
    "Full-Stack Engineer",
    "Data Analyst",
    "ML Engineer",
    "DevOps Engineer",
    "Product/Project Analyst",
]

# Normalized (lowercased, whitespace-collapsed) free-text spelling -> the
# canonical label it should be stored/grouped/matched as.
DOMAIN_ALIASES: dict[str, str] = {
    # Backend Engineer
    "backend engineer": "Backend Engineer", "backend": "Backend Engineer",
    "backend developer": "Backend Engineer", "python developer": "Backend Engineer",
    "python": "Backend Engineer", "java backend": "Backend Engineer",
    "server side": "Backend Engineer", "server-side": "Backend Engineer",
    "server side developer": "Backend Engineer",
    # Frontend Engineer
    "frontend engineer": "Frontend Engineer", "frontend": "Frontend Engineer",
    "frontend developer": "Frontend Engineer", "react developer": "Frontend Engineer",
    "ui developer": "Frontend Engineer", "front-end": "Frontend Engineer",
    "front end": "Frontend Engineer", "front end developer": "Frontend Engineer",
    # Full-Stack Engineer
    "full-stack engineer": "Full-Stack Engineer", "full stack engineer": "Full-Stack Engineer",
    "fullstack engineer": "Full-Stack Engineer", "full stack developer": "Full-Stack Engineer",
    "full-stack developer": "Full-Stack Engineer", "fullstack developer": "Full-Stack Engineer",
    "fullstack": "Full-Stack Engineer", "full stack": "Full-Stack Engineer",
    "full-stack": "Full-Stack Engineer",
    # Data Analyst
    "data analyst": "Data Analyst", "data analytics": "Data Analyst",
    "data science": "Data Analyst", "data scientist": "Data Analyst",
    "business analyst": "Data Analyst", "business intelligence": "Data Analyst",
    "bi analyst": "Data Analyst",
    # ML Engineer
    "ml engineer": "ML Engineer", "machine learning engineer": "ML Engineer",
    "machine learning": "ML Engineer", "ai engineer": "ML Engineer",
    "artificial intelligence": "ML Engineer", "deep learning": "ML Engineer",
    "ai/ml": "ML Engineer", "ai ml": "ML Engineer",
    # DevOps Engineer
    "devops engineer": "DevOps Engineer", "devops": "DevOps Engineer",
    "site reliability engineer": "DevOps Engineer", "sre": "DevOps Engineer",
    "cloud engineer": "DevOps Engineer", "infrastructure engineer": "DevOps Engineer",
    "platform engineer": "DevOps Engineer",
    # Product/Project Analyst
    "product/project analyst": "Product/Project Analyst",
    "product analyst": "Product/Project Analyst", "project analyst": "Product/Project Analyst",
    "product manager": "Product/Project Analyst", "project manager": "Product/Project Analyst",
    "product management": "Product/Project Analyst", "project management": "Product/Project Analyst",
    "product/project management": "Product/Project Analyst",
}


def normalize_key(raw: str) -> str:
    """Lowercase + collapse whitespace so 'Data   Science', 'data science',
    and 'DATA SCIENCE' all hit the same alias-map key. Public (not
    underscore-prefixed) since other modules — e.g. assessment_engine's
    direct-slug fallback match — need this same normalization, not just
    the alias lookup built on top of it."""
    return " ".join(raw.strip().lower().split())


def normalize_domain_label(raw: str) -> str:
    """
    Resolves free-text domain input to one of CANONICAL_DOMAINS when it's a
    recognized synonym (case/whitespace-insensitive). Anything not
    recognized is passed through unchanged (just trimmed) rather than
    force-mapped into one of the 7 buckets -- a genuinely different domain
    an org might post (e.g. "Marketing", "UI/UX Design") shouldn't be
    silently coerced into the nearest known label.
    """
    if not raw:
        return raw
    key = normalize_key(raw)
    return DOMAIN_ALIASES.get(key, raw.strip())
