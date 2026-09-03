import asyncio
import uuid
from datetime import datetime
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.models import AptitudeAttempt, AptitudeStatus, StudentProfile

MOCK_EMAIL = "mock.passed.student@nexyuva.test"
INTERNSHIP_IDS = [
    "c17c7bc4-528e-4198-988f-0974495e0781",
    "44e0b637-24c3-436f-8c52-9a33c0878bdc",
]


async def main():
    async with AsyncSessionLocal() as db:
        from app.core.models import User
        res = await db.execute(select(User).where(User.email == MOCK_EMAIL))
        user = res.scalar_one_or_none()
        if user is None:
            print("Mock user not found — run seed_mock_passed_student.py first.")
            return
        res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))
        profile = res.scalar_one()

        for iid in INTERNSHIP_IDS:
            internship_id = uuid.UUID(iid)
            res = await db.execute(
                select(AptitudeAttempt).where(
                    AptitudeAttempt.student_id == profile.id,
                    AptitudeAttempt.internship_id == internship_id,
                )
            )
            attempt = res.scalar_one_or_none()
            if attempt is None:
                attempt = AptitudeAttempt(
                    id=uuid.uuid4(),
                    student_id=profile.id,
                    internship_id=internship_id,
                    status=AptitudeStatus.COMPLETED,
                    questions=[],
                    answers=[],
                    integrity_flags=[],
                    raw_score=88.0,
                    percentile=92.0,
                    integrity_score=100.0,
                    badge_awarded=True,
                    started_at=datetime.utcnow(),
                    completed_at=datetime.utcnow(),
                )
                db.add(attempt)
            else:
                attempt.status = AptitudeStatus.COMPLETED
                attempt.raw_score = 88.0
                attempt.percentile = 92.0
                attempt.integrity_score = 100.0
                attempt.badge_awarded = True
                attempt.completed_at = datetime.utcnow()
            print(f"Aptitude badge set for internship {iid}")

        await db.commit()
        print("Done.")


asyncio.run(main())
