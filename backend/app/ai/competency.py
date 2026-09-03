"""
8-Dimension Digital Competency Profile Engine — Python port of the reference
logic in backend-node/src/aiEngine.ts (calculateCompetencyDimensions).
Ported here so the FastAPI/Postgres pipeline that now powers the dashboard
(see C2 audit fix) has a real backend for this metric — previously it only
ever existed in the Node/JSON duplicate.
"""
from app.core.models import StudentProfile


def calculate_competency_dimensions(profile: StudentProfile) -> dict:
    cgpa = profile.cgpa or 0.0
    skills = profile.skills or []
    skills_lower = [s.lower() for s in skills]
    skill_count = len(skills)

    has_github = bool(profile.github_username and len(profile.github_username) > 5)
    has_linkedin = bool(profile.linkedin_url and len(profile.linkedin_url) > 5)
    bio_length = len(profile.bio) if profile.bio else 0
    year = profile.year or 0

    cgpa_score = min(max((cgpa / 10) * 100, 40), 100)
    tech_score = min(skill_count * 9, 95)
    project_score = min(60 + (25 if has_github else 0) + min(skill_count * 2, 15), 98)
    prof_exp_score = min(
        50 + (20 if has_linkedin else 0) + (15 if year >= 3 else 5) + (10 if cgpa > 8 else 0), 95
    )
    innovation_score = min(
        55 + (20 if ("machine learning" in skills_lower or "ai" in skills_lower) else 10)
        + (15 if has_github else 0),
        95,
    )
    leadership_score = min(
        60 + (25 if ("leadership" in skills_lower or "project management" in skills_lower) else 10),
        92,
    )
    comm_score = min(50 + min(bio_length / 3, 25) + (20 if "communication" in skills_lower else 5), 95)
    readiness_score = round(
        (cgpa_score * 0.25) + (tech_score * 0.3) + (project_score * 0.25) + (comm_score * 0.2)
    )

    return {
        "academic_excellence": round(cgpa_score),
        "technical_expertise": round(tech_score),
        "project_maturity": round(project_score),
        "professional_experience": round(prof_exp_score),
        "innovation": round(innovation_score),
        "leadership": round(leadership_score),
        "communication": round(comm_score),
        "career_readiness": round(readiness_score),
    }
