"""
One-off CLI to create a mock student who has passed a proctored interview,
so the "Stand Out" badge can be verified on the company candidates page.

Creates: User (STUDENT) -> StudentProfile -> Application (COMPLETED) against
a real existing Internship -> InterviewAttempt (COMPLETED, passed=True) ->
Badge row referencing that interview attempt.

Usage (from backend/, with the venv active):
    python seed_mock_passed_student.py
    python seed_mock_passed_student.py <internship_id>
"""
import asyncio
import sys
import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.models import (
    User, UserRole, StudentProfile,
    Internship, Organization,
    Application, ApplicationStatus,
    InterviewAttempt, InterviewStatus,
    Badge,
)
from app.core.security import hash_password

MOCK_EMAIL = "mock.passed.student@nexyuva.test"
MOCK_PASSWORD = "MockPass123!"


async def seed(internship_id: str | None) -> None:
    async with AsyncSessionLocal() as db:
        # Pick target internship: given id, or first real (non-empty-domain) one
        if internship_id:
            internship = await db.get(Internship, uuid.UUID(internship_id))
            if internship is None:
                print(f"No internship with id {internship_id}")
                return
        else:
            res = await db.execute(select(Internship).limit(1))
            internship = res.scalars().first()
            if internship is None:
                print("No internships exist in the DB — pass one manually or create one first.")
                return

        org = await db.get(Organization, internship.organization_id)

        # Reuse if already seeded (idempotent — safe to re-run)
        existing = await db.execute(select(User).where(User.email == MOCK_EMAIL))
        user = existing.scalar_one_or_none()
        if user is None:
            user = User(
                id=uuid.uuid4(),
                email=MOCK_EMAIL,
                hashed_password=hash_password(MOCK_PASSWORD),
                role=UserRole.STUDENT,
            )
            db.add(user)
            await db.flush()

            profile = StudentProfile(
                id=uuid.uuid4(),
                user_id=user.id,
                full_name="Mock Passed Student",
                academic_background="B.Tech Computer Science",
                location="Hyderabad",
                degree="B.Tech",
                branch="CSE",
                year=3,
                cgpa=8.4,
                skills=["Python", "React", "SQL"],
            )
            db.add(profile)
            await db.flush()
        else:
            res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))
            profile = res.scalar_one()

        # Application — completed, so it doesn't look "in progress"
        res = await db.execute(
            select(Application).where(
                Application.student_id == profile.id,
                Application.internship_id == internship.id,
            )
        )
        application = res.scalar_one_or_none()
        if application is None:
            application = Application(
                id=uuid.uuid4(),
                student_id=profile.id,
                internship_id=internship.id,
                status=ApplicationStatus.COMPLETED,
                applied_at=datetime.utcnow(),
            )
            db.add(application)
            await db.flush()
        else:
            application.status = ApplicationStatus.COMPLETED

        # Interview attempt — completed + passed
        res = await db.execute(
            select(InterviewAttempt).where(InterviewAttempt.application_id == application.id)
        )
        attempt = res.scalar_one_or_none()
        if attempt is None:
            attempt = InterviewAttempt(
                id=uuid.uuid4(),
                application_id=application.id,
                student_id=profile.id,
                internship_id=internship.id,
                status=InterviewStatus.COMPLETED,
                questions=[
                    {
                        "question": "Explain the difference between a list and a tuple in Python.",
                        "answer": "Lists are mutable, tuples are immutable.",
                        "score": 90,
                        "notes": "Correct and concise.",
                        "resume_consistent": True,
                    }
                ],
                integrity_flags=[],
                final_score=88.0,
                integrity_score=100.0,
                passed=True,
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
            )
            db.add(attempt)
            await db.flush()
        else:
            attempt.status = InterviewStatus.COMPLETED
            attempt.final_score = 88.0
            attempt.integrity_score = 100.0
            attempt.passed = True
            attempt.completed_at = datetime.utcnow()

        # Badge — what the candidates page reads to show "Stand Out"
        res = await db.execute(
            select(Badge).where(Badge.interview_attempt_id == attempt.id)
        )
        badge = res.scalar_one_or_none()
        if badge is None:
            badge = Badge(
                id=uuid.uuid4(),
                student_id=profile.id,
                domain=internship.domain,
                interview_attempt_id=attempt.id,
                label=f"Stand Out - {internship.title} @ {org.name if org else 'Company'}",
                awarded_at=datetime.utcnow(),
            )
            db.add(badge)

        await db.commit()

        print("Seeded mock passed student:")
        print(f"  login email:    {MOCK_EMAIL}")
        print(f"  login password: {MOCK_PASSWORD}")
        print(f"  student_id:     {profile.id}")
        print(f"  internship:     {internship.title} ({internship.domain}) @ {org.name if org else '?'}")
        print(f"  internship_id:  {internship.id}")
        print(f"  application_id: {application.id}")
        print(f"  interview passed: True, final_score=88.0")
        print(f"  badge label: {badge.label}")


if __name__ == "__main__":
    internship_arg = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(seed(internship_arg))
