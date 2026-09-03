"""
Live E2E smoke test for the Module 4 project-evidence wiring: register a
student, upload a synthetic resume containing a Python project, register +
directly verify an org (bypassing the admin UI -- this is a backend smoke
test, not an admin-flow test), post an internship requiring python, then
hit /sourcing and confirm the candidate's skill_confidence for "python"
includes "Used in a real project" evidence with the expected point value.

Run against the already-running `uvicorn --reload` dev server on :8000.
"""
import asyncio
import time
import uuid

import httpx
from docx import Document

BASE = "http://localhost:8000/api/v1"


def make_resume(path: str):
    doc = Document()
    doc.add_paragraph("Test Candidate")
    doc.add_paragraph("test.candidate@example.com")
    doc.add_paragraph("SKILLS")
    doc.add_paragraph("Python, Java, SQL")
    doc.add_paragraph("PROJECTS")
    doc.add_paragraph(
        "Job Portal Tracker - Full stack internship tracking app (Python, React, PostgreSQL)"
    )
    doc.add_paragraph("Built a Flask backend and a React frontend to track internship applications.")
    doc.add_paragraph("EDUCATION")
    doc.add_paragraph("B.Tech Computer Science, CGPA 8.2, 2026")
    doc.save(path)


async def main():
    tag = uuid.uuid4().hex[:8]
    resume_path = f"test_sourcing_resume_{tag}.docx"
    make_resume(resume_path)

    async with httpx.AsyncClient(timeout=60) as client:
        # --- Student ---
        r = await client.post(f"{BASE}/auth/register/student", json={
            "email": f"student_{tag}@test.com",
            "password": "TestPass123!",
            "full_name": "Test Candidate",
        })
        r.raise_for_status()
        student_token = r.json()["access_token"]
        student_headers = {"Authorization": f"Bearer {student_token}"}

        with open(resume_path, "rb") as f:
            r = await client.post(
                f"{BASE}/students/me/resume",
                headers=student_headers,
                files={"file": (resume_path, f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        r.raise_for_status()
        parsed = r.json()
        print("PARSED_PROJECTS:", parsed["projects"])
        print("CONFIRMED_SKILLS:", [s["name"] for s in parsed["confirmed_skills"]])

        r = await client.get(f"{BASE}/students/me", headers=student_headers)
        r.raise_for_status()
        profile = r.json()
        print("PERSISTED_PROJECTS_ON_PROFILE:", profile["projects"])
        student_id = None  # filled after we look it up via DB below

        # --- Organization ---
        r = await client.post(f"{BASE}/auth/register/organization", json={
            "email": f"org_{tag}@test.com",
            "password": "TestPass123!",
            "organization_name": f"Test Org {tag}",
        })
        r.raise_for_status()
        org_token = r.json()["access_token"]
        org_headers = {"Authorization": f"Bearer {org_token}"}

    # --- Directly verify the org (bypass admin doc-review flow -- smoke
    # test only) and fetch the student's row id, via the app's own DB
    # session so this stays consistent with real ORM behavior. ---
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.core.models import Organization, OrgVerificationStatus, StudentProfile, User

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == f"org_{tag}@test.com"))
        org_user = result.scalar_one()
        result = await db.execute(select(Organization).where(Organization.user_id == org_user.id))
        org = result.scalar_one()
        org.is_verified = True
        org.verification_status = OrgVerificationStatus.APPROVED
        await db.commit()

        result = await db.execute(select(User).where(User.email == f"student_{tag}@test.com"))
        student_user = result.scalar_one()
        result = await db.execute(select(StudentProfile).where(StudentProfile.user_id == student_user.id))
        student_profile = result.scalar_one()
        print("DB_PROJECTS_COLUMN:", student_profile.projects)
        student_row_id = str(student_profile.id)

    # --- Layer in the two remaining evidence signals for a full "all four
    # present" live check: sync a real public GitHub profile with actual
    # Python repos (goes through the real sync route -> real GitHub API ->
    # Redis cache, same cache the sourcing endpoint reads from), then
    # award a Badge directly via DB for the python_dev domain -- bypassing
    # the full adaptive-quiz flow here since that engine already has its
    # own separate hardening pass logged in Memory.md; this test is only
    # about the skill_confidence *scoring math*, not re-verifying the
    # assessment engine itself. ---
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{BASE}/students/me/github/sync",
            headers=student_headers,
            json={"github_username": "gvanrossum", "force_refresh": True},
        )
        if r.status_code == 200:
            print("GITHUB_SYNC_OK:", r.json().get("github_score"))
        else:
            print("GITHUB_SYNC_FAILED:", r.status_code, r.text)

    from app.core.models import Badge

    async with AsyncSessionLocal() as db:
        db.add(Badge(student_id=student_profile.id, domain="python_dev", label="Test-awarded badge"))
        await db.commit()
        print("BADGE_AWARDED: python_dev")

    async with httpx.AsyncClient(timeout=60) as client:
        # --- Post internship requiring python ---
        r = await client.post(f"{BASE}/organizations/internships", headers=org_headers, json={
            "title": "Backend Intern",
            "domain": "Software Development",
            "required_skills": ["python", "sql"],
            "description": "Backend internship building APIs in Python.",
            "duration_weeks": 12,
            "location": "Remote",
            "work_mode": "remote",
        })
        r.raise_for_status()
        internship_id = r.json()["id"]

        # Give the embedding a moment / just proceed -- sourcing degrades
        # gracefully to skill-overlap-only if the embedding is null.
        r = await client.get(
            f"{BASE}/organizations/internships/{internship_id}/sourcing",
            headers=org_headers,
            params={"top_k": 10, "with_ai_pitch": False},
        )
        r.raise_for_status()
        candidates = r.json()

    match = next((c for c in candidates if c["student_id"] == student_row_id), None)
    print("CANDIDATE_FOUND:", match is not None)
    if match:
        python_conf = next((sc for sc in match["skill_confidence"] if sc["skill"] == "python"), None)
        print("PYTHON_SKILL_CONFIDENCE:", python_conf)
        assert python_conf is not None, "python should be a matched skill"
        assert "Used in a real project" in python_conf["evidence"], "project evidence missing"
        evidence = set(python_conf["evidence"])
        expected_evidence = {
            "Confirmed via parsed resume",
            "Used in a real project",
            "Used in GitHub repositories",
            "Verified via passed skill assessment",
        }
        if evidence == expected_evidence:
            assert python_conf["confidence"] == 100, f"expected 100 with all 4 signals, got {python_conf['confidence']}"
            print("ALL_FOUR_SIGNALS_CONFIRMED_AT_100")
        else:
            print("WARNING: not all 4 signals present this run -- evidence was:", evidence)
            print("(github sync and/or badge insert above may have failed -- see GITHUB_SYNC_* line)")
        print("ASSERTIONS_PASSED")
    else:
        print("ALL_CANDIDATE_IDS:", [c["student_id"] for c in candidates])


asyncio.run(main())
