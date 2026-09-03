"""
Skill Gap Analysis (PRD §4). Deterministic set-difference against either a
specific internship's required_skills, or a target career path's typical
skill cluster (derived from the same TRAINING_DATA used by career_path.py,
so the two features stay consistent with each other).
"""
from app.ai.career_path import TRAINING_DATA


def _typical_skills_for_path(target_path: str) -> set[str]:
    """Union of skills seen across all training examples for a given path —
    a simple but honest proxy for 'what this role typically needs', derived
    from the same curated data the classifier trains on rather than a
    separately-invented list that could drift out of sync."""
    skills: set[str] = set()
    for example_skills, label in TRAINING_DATA:
        if label == target_path:
            skills.update(example_skills)
    return skills


def analyze_skill_gap(
    student_skills: list[str],
    target_skills: list[str] | None = None,
    target_path: str | None = None,
) -> dict:
    """
    Provide either target_skills (e.g. a specific internship's required_skills)
    or target_path (e.g. "ML Engineer") — not both required, but at least one.

    HARDENING NOTE: found via testing that an unrecognized target_path (e.g.
    a typo, or a path not in TRAINING_DATA) silently returned an empty
    target-skill set — which produced a misleading "0 missing skills, 0%
    match" result that looks like a clean report rather than an error.
    Fixed to validate target_path against known paths and raise a clear
    ValueError instead, so the caller (route layer) can return an honest
    404/400 rather than data that looks valid but isn't.
    """
    if target_skills is None and target_path is None:
        raise ValueError("Provide either target_skills or target_path")

    if target_path is not None and target_skills is None:
        known_paths = {label for _, label in TRAINING_DATA}
        if target_path not in known_paths:
            raise ValueError(
                f"Unknown target_path '{target_path}'. Known paths: "
                f"{sorted(known_paths)}"
            )

    student_set = set(student_skills)
    target_set = set(target_skills) if target_skills else _typical_skills_for_path(target_path)

    matched = sorted(student_set & target_set)
    missing = sorted(target_set - student_set)
    extra = sorted(student_set - target_set)

    match_percentage = round(len(matched) / len(target_set) * 100, 1) if target_set else 0.0

    return {
        "target": target_path or "custom requirement set",
        "match_percentage": match_percentage,
        "matched_skills": matched,
        "missing_skills": missing,
        "additional_skills_you_have": extra,
    }
