import asyncio
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.models import StudentProfile, User

MOCK_EMAIL = "mock.passed.student@nexyuva.test"


async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == MOCK_EMAIL))
        user = res.scalar_one_or_none()
        if user is None:
            print("Mock user not found.")
            return
        res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))
        profile = res.scalar_one()

        profile.bio = "Frontend developer focused on building responsive, accessible web apps with React and Angular."
        profile.resume_path = "uploads/mock_passed_student_resume.pdf"
        profile.linkedin_url = "https://linkedin.com/in/mock-passed-student"

        await db.commit()
        print(f"degree={profile.degree} branch={profile.branch} cgpa={profile.cgpa} year={profile.year}")
        print("Updated bio, resume_path, linkedin_url for High confidence.")


asyncio.run(main())
