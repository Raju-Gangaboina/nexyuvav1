"""
Sourcing Agent: Skill Confidence + Recommendation Confidence.

Two distinct signals, both built entirely from evidence NexYuva already has
on file per candidate — no new data collection, no LLM judgment call (per
Rules.md's local-first-scoring principle, the same one recommendation_engine
already follows: an LLM never decides a score, only explains one).

1. Skill Confidence (per matched skill): how much real evidence backs up a
   candidate actually having a skill, beyond it just being a word in their
   profile.skills list. Six independent, additively-weighted signals:
     - Resume-confirmed (20 pts): the skill was extracted via exact
       taxonomy match against the candidate's uploaded resume (see
       app/ai/resume_parser.py's SKILL_TAXONOMY) — not a manual free-text
       claim with no backing document.
     - Project evidence (15 pts): the skill appears in the tech_stack of at
       least one of the candidate's own resume-extracted projects (see
       StudentProfile.projects, app/core/models.py) — a concrete build, not
       just a skill-list mention. This is the signal flagged as missing in
       an earlier design pass ('project data isn't persisted anywhere') —
       now that it's persisted at upload time, it's a real, honest evidence
       source rather than a fabricated one.
     - GitHub evidence (20 pts): the skill maps to a real programming
       language, and that language shows up with actual byte count in the
       candidate's GitHub repos (cached data only — see
       app/ai/github_agent.py's get_cached_languages docstring for why this
       never triggers a live API call from inside a sourcing request).
     - Verified-assessment evidence (15 pts): the candidate holds a Badge
       (passed a proctored skill assessment, see
       app/services/assessment/routes.py) in a domain whose question bank
       actually tests this skill.
     - Certification evidence (15 pts): the skill name appears in one of
       the candidate's resume-extracted certification titles (see
       StudentProfile.certifications, app/core/models.py) — e.g. an "AWS
       Certified Cloud Practitioner" entry backing an "aws" skill. A case-
       insensitive substring match against the raw certification title,
       same reliability class as the other regex-extracted signals here —
       not fabricated issuer/date verification, since resumes don't
       reliably provide anything more structured to check against.
     - Internship-history evidence (15 pts): the skill name appears in one
       of the candidate's resume-extracted internship/experience entries
       (see StudentProfile.internship_history, app/core/models.py) — a
       skill actually used on the job, not just claimed. Case-insensitive
       substring match against the entry's title + description combined,
       same reliability class as certification matching above. This was
       previously the clearest remaining gap in this module: extract_experience
       had parsed internship data correctly since early on, but nothing
       persisted it past the upload response, so a candidate's real work
       history contributed zero evidence to their own skill confidence —
       an honest capability the scoring was quietly leaving on the table,
       not a fabricated one being added now.
   These six sum to exactly 100 when all are present — a skill with only
   a resume mention caps at 20, which is the honest point: self-reported
   (even taxonomy-confirmed) is real evidence, just not verified evidence.
   The three previously-100-summing signals (resume/GitHub/certification)
   were each trimmed by 5pts to make room, rather than leaving the total
   over 100 or discounting internship evidence to an arbitrary remainder —
   keeps every signal's weight a legible, round number.

2. Recommendation Confidence (per candidate, not per skill): how much to
   trust the recommendation itself, independent of the match score —
   derived from profile completeness (StudentProfile.resume_score, already
   computed by resume_parser.compute_profile_completeness_score), so a
   thin, mostly-empty profile that happens to score well on paper is
   flagged as lower-confidence rather than presented with the same
   authority as a fully-fleshed-out one.
"""

# Canonical taxonomy skill name (app/ai/resume_parser.py's SKILL_TAXONOMY
# keys) -> the language name GitHub's languages API reports. Only
# "language"-category skills map here; frameworks/tools/soft-skills have no
# GitHub-language equivalent and simply get no GitHub evidence contribution,
# which is the honest default (not a fabricated one).
SKILL_TO_GITHUB_LANGUAGE: dict[str, str] = {
    "python": "Python",
    "java": "Java",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "c++": "C++",
    "c": "C",
    "c#": "C#",
    "go": "Go",
    "rust": "Rust",
    "php": "PHP",
    "ruby": "Ruby",
    "kotlin": "Kotlin",
    "swift": "Swift",
    "dart": "Dart",
    "scala": "Scala",
    "html": "HTML",
    "css": "CSS",
}

# Assessment/Badge domain slug (app/ai/assessment_engine.py's
# SLUG_BY_CANONICAL_DOMAIN values — what's actually stored on
# AssessmentAttempt.domain / Badge.domain) -> the taxonomy skills that
# domain's real question bank tests. Built directly from each bank's actual
# questions (see data/question_banks/*.json), not guessed from the domain
# name — e.g. data_analyst's bank tests pandas/SQL/stats, not "data
# science" broadly. Domains with no bank file on disk yet (see
# assessment_engine.available_domains()) simply never appear in any
# candidate's Badge rows, so they're harmless to list here ahead of content
# being built.
DOMAIN_SLUG_TO_SKILLS: dict[str, set[str]] = {
    "python_dev": {"python"},
    "frontend_dev": {"javascript", "react", "html", "css"},
    "fullstack_dev": {"javascript", "react", "node.js", "sql"},
    "data_analyst": {"pandas", "sql", "data analysis"},
    "ml_engineer": {"python", "machine learning", "pandas", "numpy"},
    "devops": {"docker", "kubernetes", "linux", "ci/cd"},
    "product_analyst": {"project management", "agile"},
}

RESUME_EVIDENCE_POINTS = 20
PROJECT_EVIDENCE_POINTS = 15
GITHUB_EVIDENCE_POINTS = 20
ASSESSMENT_EVIDENCE_POINTS = 15
CERTIFICATION_EVIDENCE_POINTS = 15
INTERNSHIP_HISTORY_EVIDENCE_POINTS = 15


def compute_skill_confidence(
    skill: str,
    github_languages: dict[str, int] | None,
    verified_domains: set[str],
    projects: list[dict] | None = None,
    certifications: list[str] | None = None,
    internship_history: list[dict] | None = None,
) -> dict:
    """
    `skill` is assumed already resume-confirmed (caller only calls this for
    a candidate's matched_skills, which come from profile.skills — itself
    only ever populated by exact taxonomy matches or explicit student
    confirmation, see resume_parser.py module docstring). So the resume
    evidence point is unconditional here; this function's job is layering
    the three verification signals on top of it.

    `projects` is the candidate's StudentProfile.projects list (each entry
    shaped {"title", "tech_stack", "description"} — see resume_parser.py's
    extract_projects). Matching is case-insensitive exact string match
    against tech_stack entries, mirroring the taxonomy-key convention
    (lowercase) used everywhere else in this module — not a substring/fuzzy
    match, to avoid false positives like "java" matching "javascript".

    `internship_history` is the candidate's StudentProfile.internship_history
    list (each entry shaped {"title", "description"} — see
    resume_parser.py's extract_experience). Matching is a case-insensitive
    substring check against title+description combined, same reliability
    class as certification matching below — free-text internship
    descriptions don't support an exact-token match the way a structured
    tech_stack list does.
    """
    evidence: list[str] = ["Confirmed via parsed resume"]
    score = RESUME_EVIDENCE_POINTS

    if projects:
        for project in projects:
            tech_stack = {t.strip().lower() for t in (project.get("tech_stack") or [])}
            if skill in tech_stack:
                score += PROJECT_EVIDENCE_POINTS
                evidence.append("Used in a real project")
                break  # one project-evidence point max, regardless of how many projects use it

    github_language = SKILL_TO_GITHUB_LANGUAGE.get(skill)
    if github_language and github_languages and github_languages.get(github_language, 0) > 0:
        score += GITHUB_EVIDENCE_POINTS
        evidence.append("Used in GitHub repositories")

    for domain in verified_domains:
        if skill in DOMAIN_SLUG_TO_SKILLS.get(domain, set()):
            score += ASSESSMENT_EVIDENCE_POINTS
            evidence.append("Verified via passed skill assessment")
            break  # one assessment-evidence point max, regardless of how many domains match

    if certifications:
        for cert_title in certifications:
            if skill in cert_title.lower():
                score += CERTIFICATION_EVIDENCE_POINTS
                evidence.append("Backed by a listed certification")
                break  # one certification-evidence point max, regardless of how many certs match

    if internship_history:
        for entry in internship_history:
            combined = f"{entry.get('title', '')} {entry.get('description', '')}".lower()
            if skill in combined:
                score += INTERNSHIP_HISTORY_EVIDENCE_POINTS
                evidence.append("Used during a real internship")
                break  # one internship-evidence point max, regardless of how many entries match

    return {"skill": skill, "confidence": min(score, 100), "evidence": evidence}


def compute_recommendation_confidence(
    resume_score: int,
    skills_count: int,
    github_username: str | None,
    assessment_completed: bool,
) -> dict:
    """
    High/Medium/Low is derived from resume_score alone (it's already a
    0-100 composite of exactly these same completeness signals — see
    resume_parser.compute_profile_completeness_score) rather than
    recomputed from scratch here, so the two can't silently drift apart.
    The individual fields below are surfaced for display, not re-averaged
    into a second number.
    """
    if resume_score >= 75:
        level = "High"
    elif resume_score >= 45:
        level = "Medium"
    else:
        level = "Low"

    return {
        "level": level,
        "profile_completeness": resume_score,
        "verified_skills_count": skills_count,
        "github_connected": bool(github_username),
        "assessment_completed": assessment_completed,
    }
